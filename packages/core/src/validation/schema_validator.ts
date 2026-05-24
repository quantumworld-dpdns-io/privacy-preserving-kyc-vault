export type JSONSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null'

export interface JSONSchema {
  $schema?: string
  $id?: string
  title?: string
  description?: string
  type?: JSONSchemaType | JSONSchemaType[]
  properties?: Record<string, JSONSchema>
  items?: JSONSchema | JSONSchema[]
  required?: string[]
  enum?: unknown[]
  const?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
  minimumProperties?: number
  maximumProperties?: number
  allOf?: JSONSchema[]
  anyOf?: JSONSchema[]
  oneOf?: JSONSchema[]
  not?: JSONSchema
  if?: JSONSchema
  then?: JSONSchema
  else?: JSONSchema
  definitions?: Record<string, JSONSchema>
  $ref?: string
  format?: string
  default?: unknown
  examples?: unknown[]
  [key: string]: unknown
}

export interface SchemaValidationResult {
  valid: boolean
  errors: SchemaValidationError[]
  warnings: string[]
}

export interface SchemaValidationError {
  path: string
  message: string
  code: string
  expected?: unknown
  received?: unknown
}

export class SchemaValidator {
  validate(data: unknown, schema: JSONSchema): SchemaValidationResult {
    const errors: SchemaValidationError[] = []
    const warnings: string[] = []

    this.validateSchemaStructure(schema, errors)

    if (errors.length > 0) {
      return { valid: false, errors, warnings }
    }

    this.validateValue(data, schema, '', errors)

    return { valid: errors.length === 0, errors, warnings }
  }

  private validateSchemaStructure(schema: JSONSchema, errors: SchemaValidationError[]): void {
    if (!schema || typeof schema !== 'object') {
      errors.push({
        path: '$',
        message: 'Schema must be a non-null object',
        code: 'INVALID_SCHEMA',
      })
    }
  }

  private validateValue(data: unknown, schema: JSONSchema, path: string, errors: SchemaValidationError[]): void {
    if (schema.$ref) {
      return
    }

    if (schema.type !== undefined) {
      if (Array.isArray(schema.type)) {
        const typeMatch = schema.type.some((t) => this.checkType(data, t))
        if (!typeMatch) {
          errors.push({
            path,
            message: `Expected type(s) ${schema.type.join(', ')}, received ${typeof data}`,
            code: 'TYPE_MISMATCH',
            expected: schema.type,
            received: typeof data,
          })
        }
      } else {
        if (!this.checkType(data, schema.type)) {
          errors.push({
            path,
            message: `Expected type ${schema.type}, received ${typeof data}`,
            code: 'TYPE_MISMATCH',
            expected: schema.type,
            received: typeof data,
          })
          return
        }
      }
    }

    if (schema.enum !== undefined && !schema.enum.includes(data)) {
      errors.push({
        path,
        message: `Value must be one of: ${JSON.stringify(schema.enum)}`,
        code: 'ENUM_MISMATCH',
        expected: schema.enum,
        received: data,
      })
    }

    if (schema.const !== undefined && data !== schema.const) {
      errors.push({
        path,
        message: `Value must equal ${JSON.stringify(schema.const)}`,
        code: 'CONST_MISMATCH',
        expected: schema.const,
        received: data,
      })
    }

    if (schema.type === 'string' || schema.type === undefined) {
      this.validateStringConstraints(data as string | undefined, schema, path, errors)
    }

    if (schema.type === 'number' || schema.type === 'integer' || schema.type === undefined) {
      this.validateNumberConstraints(data as number | undefined, schema, path, errors)
    }

    if (schema.type === 'array' || schema.type === undefined) {
      this.validateArrayConstraints(data, schema, path, errors)
    }

    if (schema.type === 'object' || schema.type === undefined) {
      this.validateObjectConstraints(data, schema, path, errors)
    }

    if (schema.allOf) {
      for (let i = 0; i < schema.allOf.length; i++) {
        this.validateValue(data, schema.allOf[i]!, `${path}/allOf/${i}`, errors)
      }
    }

    if (schema.anyOf) {
      const anyOfErrors: SchemaValidationError[][] = []
      for (let i = 0; i < schema.anyOf.length; i++) {
        const subErrors: SchemaValidationError[] = []
        this.validateValue(data, schema.anyOf[i]!, `${path}/anyOf/${i}`, subErrors)
        anyOfErrors.push(subErrors)
      }
      if (!anyOfErrors.some((e) => e.length === 0)) {
        errors.push({
          path: `${path}/anyOf`,
          message: 'Value must match at least one schema in anyOf',
          code: 'ANY_OF_FAILED',
        })
      }
    }

    if (schema.oneOf) {
      const oneOfResults = schema.oneOf.map((s, i) => {
        const subErrors: SchemaValidationError[] = []
        this.validateValue(data, s, `${path}/oneOf/${i}`, subErrors)
        return subErrors.length === 0
      })
      const matchCount = oneOfResults.filter(Boolean).length
      if (matchCount !== 1) {
        errors.push({
          path: `${path}/oneOf`,
          message: `Value must match exactly one schema in oneOf (matched ${matchCount})`,
          code: 'ONE_OF_FAILED',
        })
      }
    }

    if (schema.not) {
      const subErrors: SchemaValidationError[] = []
      this.validateValue(data, schema.not, `${path}/not`, subErrors)
      if (subErrors.length === 0) {
        errors.push({
          path: `${path}/not`,
          message: 'Value must not match the not schema',
          code: 'NOT_FAILED',
        })
      }
    }
  }

  private checkType(data: unknown, type: JSONSchemaType): boolean {
    switch (type) {
      case 'integer':
        return typeof data === 'number' && Number.isInteger(data)
      case 'number':
        return typeof data === 'number'
      case 'string':
        return typeof data === 'string'
      case 'boolean':
        return typeof data === 'boolean'
      case 'array':
        return Array.isArray(data)
      case 'object':
        return data !== null && typeof data === 'object' && !Array.isArray(data)
      case 'null':
        return data === null
    }
  }

  private validateStringConstraints(data: string | undefined, schema: JSONSchema, path: string, errors: SchemaValidationError[]): void {
    if (typeof data !== 'string') return

    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path,
        message: `String length ${data.length} is less than minimum ${schema.minLength}`,
        code: 'MIN_LENGTH',
        expected: schema.minLength,
        received: data.length,
      })
    }

    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path,
        message: `String length ${data.length} exceeds maximum ${schema.maxLength}`,
        code: 'MAX_LENGTH',
        expected: schema.maxLength,
        received: data.length,
      })
    }

    if (schema.pattern && !new RegExp(schema.pattern).test(data)) {
      errors.push({
        path,
        message: `String does not match pattern ${schema.pattern}`,
        code: 'PATTERN_MISMATCH',
        expected: schema.pattern,
        received: data,
      })
    }
  }

  private validateNumberConstraints(data: number | undefined, schema: JSONSchema, path: string, errors: SchemaValidationError[]): void {
    if (typeof data !== 'number') return

    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path,
        message: `Value ${data} is less than minimum ${schema.minimum}`,
        code: 'MINIMUM',
        expected: schema.minimum,
        received: data,
      })
    }

    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path,
        message: `Value ${data} exceeds maximum ${schema.maximum}`,
        code: 'MAXIMUM',
        expected: schema.maximum,
        received: data,
      })
    }
  }

  private validateArrayConstraints(data: unknown, schema: JSONSchema, path: string, errors: SchemaValidationError[]): void {
    if (!Array.isArray(data)) return

    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push({
        path,
        message: `Array length ${data.length} is less than minimum ${schema.minItems}`,
        code: 'MIN_ITEMS',
        expected: schema.minItems,
        received: data.length,
      })
    }

    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array length ${data.length} exceeds maximum ${schema.maxItems}`,
        code: 'MAX_ITEMS',
        expected: schema.maxItems,
        received: data.length,
      })
    }

    if (schema.uniqueItems) {
      const seen = new Set()
      for (const item of data) {
        if (seen.has(item)) {
          errors.push({
            path,
            message: 'Array items must be unique',
            code: 'UNIQUE_ITEMS',
          })
          break
        }
        seen.add(item)
      }
    }

    if (schema.items) {
      if (Array.isArray(schema.items)) {
        for (let i = 0; i < Math.min(data.length, schema.items.length); i++) {
          this.validateValue(data[i], schema.items[i]!, `${path}[${i}]`, errors)
        }
      } else {
        for (let i = 0; i < data.length; i++) {
          this.validateValue(data[i], schema.items, `${path}[${i}]`, errors)
        }
      }
    }
  }

  private validateObjectConstraints(data: unknown, schema: JSONSchema, path: string, errors: SchemaValidationError[]): void {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return

    if (schema.required) {
      for (const key of schema.required) {
        if (!(key in (data as Record<string, unknown>))) {
          errors.push({
            path: `${path}/${key}`,
            message: `Required property '${key}' is missing`,
            code: 'REQUIRED',
            expected: key,
          })
        }
      }
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in (data as Record<string, unknown>)) {
          this.validateValue(
            (data as Record<string, unknown>)[key],
            propSchema,
            `${path}/${key}`,
            errors,
          )
        }
      }
    }
  }
}

export function validateSchema(data: unknown, schema: JSONSchema): SchemaValidationResult {
  return new SchemaValidator().validate(data, schema)
}

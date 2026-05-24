export type SanitizedString = string

export interface SanitizerOptions {
  stripHtml: boolean
  stripScriptTags: boolean
  maxLength: number
  allowedTags?: string[]
  encodeSpecialChars: boolean
  trimWhitespace: boolean
  normalizeUnicode: boolean
}

export interface InputSanitizationResult {
  sanitized: unknown
  modified: boolean
  warnings: string[]
}

const DEFAULT_OPTIONS: SanitizerOptions = {
  stripHtml: true,
  stripScriptTags: true,
  maxLength: 10000,
  encodeSpecialChars: true,
  trimWhitespace: true,
  normalizeUnicode: true,
}

const HTML_TAG_REGEX = /<[^>]*>/g
const SCRIPT_TAG_REGEX = /<script[\s\S]*?<\/script>/gi
const ON_EVENT_REGEX = /\son\w+\s*=\s*["'][^"']*["']/gi
const JAVASCRIPT_PROTOCOL_REGEX = /javascript\s*:/gi
const DATA_PROTOCOL_REGEX = /data\s*:/gi
const SQL_META_REGEX = /(';|--|\bOR\b|\bAND\b|\bUNION\b|\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b|\bSELECT\b|\bEXEC\b|\bEXECUTE\b)/gi
const NO_WS_REGEX = /\p{C}/gu

export class InputSanitizer {
  private options: SanitizerOptions

  constructor(options?: Partial<SanitizerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  sanitize(input: unknown): InputSanitizationResult {
    if (typeof input === 'string') {
      return this.sanitizeString(input)
    }

    if (Array.isArray(input)) {
      return this.sanitizeArray(input)
    }

    if (input !== null && typeof input === 'object') {
      return this.sanitizeObject(input as Record<string, unknown>)
    }

    return { sanitized: input, modified: false, warnings: [] }
  }

  private sanitizeString(input: string): InputSanitizationResult {
    let modified = false
    const warnings: string[] = []
    let value = input

    if (this.options.trimWhitespace) {
      const trimmed = value.trim()
      if (trimmed !== value) {
        modified = true
        value = trimmed
      }
    }

    if (this.options.normalizeUnicode) {
      const normalized = value.normalize('NFKC')
      if (normalized !== value) {
        modified = true
        value = normalized
      }
    }

    value = value.replace(NO_WS_REGEX, '')

    if (this.options.stripScriptTags) {
      const stripped = value.replace(SCRIPT_TAG_REGEX, '')
      if (stripped !== value) {
        modified = true
        value = stripped
        warnings.push('Script tags were removed from input')
      }
    }

    if (this.options.stripHtml) {
      const stripped = value.replace(HTML_TAG_REGEX, '')
      if (stripped !== value) {
        modified = true
        value = stripped
        warnings.push('HTML tags were removed from input')
      }
    }

    const noOnEvent = value.replace(ON_EVENT_REGEX, '')
    if (noOnEvent !== value) {
      modified = true
      value = noOnEvent
      warnings.push('Inline event handlers were removed from input')
    }

    const noJSProtocol = value.replace(JAVASCRIPT_PROTOCOL_REGEX, '')
    if (noJSProtocol !== value) {
      modified = true
      value = noJSProtocol
      warnings.push('javascript: protocol references were removed')
    }

    const noDataProtocol = value.replace(DATA_PROTOCOL_REGEX, '')
    if (noDataProtocol !== value) {
      modified = true
      value = noDataProtocol
      warnings.push('data: protocol references were removed')
    }

    if (value.length > this.options.maxLength) {
      value = value.slice(0, this.options.maxLength)
      modified = true
      warnings.push(`Input was truncated to ${this.options.maxLength} characters`)
    }

    if (this.options.encodeSpecialChars) {
      const encoded = value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
      if (encoded !== value) {
        modified = true
        value = encoded
      }
    }

    return { sanitized: value, modified, warnings }
  }

  private sanitizeArray(input: unknown[]): InputSanitizationResult {
    let modified = false
    const warnings: string[] = []
    const result: unknown[] = []

    for (let i = 0; i < input.length; i++) {
      const item = this.sanitize(input[i])
      result.push(item.sanitized)
      if (item.modified) modified = true
      warnings.push(...item.warnings.map((w) => `[${i}] ${w}`))
    }

    return { sanitized: result, modified, warnings }
  }

  private sanitizeObject(input: Record<string, unknown>): InputSanitizationResult {
    let modified = false
    const warnings: string[] = []
    const result: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(input)) {
      const sanitizedKey = this.sanitizeString(key)
      if (sanitizedKey.sanitized !== key) {
        modified = true
        warnings.push(`Key was sanitized: ${key}`)
      }

      const sanitizedValue = this.sanitize(value)
      result[sanitizedKey.sanitized as string] = sanitizedValue.sanitized
      if (sanitizedValue.modified) modified = true
      warnings.push(...sanitizedValue.warnings)
    }

    return { sanitized: result, modified, warnings }
  }

  stripInjectionPatterns(input: string): string {
    return input.replace(SQL_META_REGEX, '')
  }

  isSafe(input: string): boolean {
    const result = this.sanitizeString(input)
    if (result.modified) return false
    if (SCRIPT_TAG_REGEX.test(input)) return false
    if (JAVASCRIPT_PROTOCOL_REGEX.test(input)) return false
    return true
  }
}

export function sanitizeInput(input: unknown, options?: Partial<SanitizerOptions>): InputSanitizationResult {
  return new InputSanitizer(options).sanitize(input)
}

export function isInputSafe(input: string, options?: Partial<SanitizerOptions>): boolean {
  return new InputSanitizer(options).isSafe(input)
}

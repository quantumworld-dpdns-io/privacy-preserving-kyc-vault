import { AppError, type ErrorContext } from './base.js'

export class WasmError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('WASM_ERROR', message, context)
    this.name = 'WasmError'
  }
}

export class WasmInstantiationError extends WasmError {
  constructor(moduleName: string, reason: string, context?: ErrorContext) {
    super(`Wasm module instantiation failed for ${moduleName}: ${reason}`, {
      ...context,
      moduleName,
      reason,
    })
    this.name = 'WasmInstantiationError'
  }
}

export class WasmCompilationError extends WasmError {
  constructor(moduleName: string, compileErrors: string[], context?: ErrorContext) {
    super(`Wasm compilation failed for ${moduleName}`, {
      ...context,
      moduleName,
      compileErrors,
    })
    this.name = 'WasmCompilationError'
  }
}

export class WasmRuntimeError extends WasmError {
  constructor(moduleName: string, trapReason: string, context?: ErrorContext) {
    super(`Wasm runtime error in ${moduleName}: ${trapReason}`, {
      ...context,
      moduleName,
      trapReason,
    })
    this.name = 'WasmRuntimeError'
  }
}

export class WasmMemoryError extends WasmError {
  constructor(moduleName: string, reason: string, context?: ErrorContext) {
    super(`Wasm memory error in ${moduleName}: ${reason}`, {
      ...context,
      moduleName,
      reason,
    })
    this.name = 'WasmMemoryError'
  }
}

export class WasmExportNotFoundError extends WasmError {
  constructor(moduleName: string, exportName: string, context?: ErrorContext) {
    super(`Wasm export not found in ${moduleName}: ${exportName}`, {
      ...context,
      moduleName,
      exportName,
    })
    this.name = 'WasmExportNotFoundError'
  }
}

export class WasmHostFunctionError extends WasmError {
  constructor(functionName: string, reason: string, context?: ErrorContext) {
    super(`Wasm host function call failed: ${functionName} - ${reason}`, {
      ...context,
      functionName,
      reason,
    })
    this.name = 'WasmHostFunctionError'
  }
}

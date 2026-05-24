import { AppError, type ErrorContext } from './base.js'

export class StorageError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('STORAGE_ERROR', message, context)
    this.name = 'StorageError'
  }
}

export class StorageWriteError extends StorageError {
  constructor(key: string, reason: string, context?: ErrorContext) {
    super(`Storage write failed for key ${key}: ${reason}`, {
      ...context,
      key,
      reason,
    })
    this.name = 'StorageWriteError'
  }
}

export class StorageReadError extends StorageError {
  constructor(key: string, reason: string, context?: ErrorContext) {
    super(`Storage read failed for key ${key}: ${reason}`, {
      ...context,
      key,
      reason,
    })
    this.name = 'StorageReadError'
  }
}

export class StorageDeleteError extends StorageError {
  constructor(key: string, reason: string, context?: ErrorContext) {
    super(`Storage delete failed for key ${key}: ${reason}`, {
      ...context,
      key,
      reason,
    })
    this.name = 'StorageDeleteError'
  }
}

export class StorageKeyNotFoundError extends StorageError {
  constructor(key: string, context?: ErrorContext) {
    super(`Storage key not found: ${key}`, { ...context, key })
    this.name = 'StorageKeyNotFoundError'
  }
}

export class StorageCapacityExceededError extends StorageError {
  constructor(currentSize: number, maxSize: number, context?: ErrorContext) {
    super(`Storage capacity exceeded: ${currentSize}/${maxSize}`, {
      ...context,
      currentSize,
      maxSize,
    })
    this.name = 'StorageCapacityExceededError'
  }
}

export class StorageEncryptionError extends StorageError {
  constructor(operation: string, reason: string, context?: ErrorContext) {
    super(`Storage encryption ${operation} failed: ${reason}`, {
      ...context,
      operation,
      reason,
    })
    this.name = 'StorageEncryptionError'
  }
}

export class StorageIntegrityError extends StorageError {
  constructor(key: string, context?: ErrorContext) {
    super(`Storage integrity check failed for key ${key}`, {
      ...context,
      key,
    })
    this.name = 'StorageIntegrityError'
  }
}

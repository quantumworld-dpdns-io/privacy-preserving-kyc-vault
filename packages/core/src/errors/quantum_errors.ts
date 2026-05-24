import { AppError, type ErrorContext } from './base.js'

export class QuantumError extends AppError {
  constructor(message: string, context?: ErrorContext) {
    super('QUANTUM_ERROR', message, context)
    this.name = 'QuantumError'
  }
}

export class QuantumKeyDistributionError extends QuantumError {
  constructor(protocol: string, reason: string, context?: ErrorContext) {
    super(`QKD protocol ${protocol} failed: ${reason}`, {
      ...context,
      protocol,
      reason,
    })
    this.name = 'QuantumKeyDistributionError'
  }
}

export class QuantumRandomnessError extends QuantumError {
  constructor(source: string, reason: string, context?: ErrorContext) {
    super(`Quantum randomness generation failed from ${source}: ${reason}`, {
      ...context,
      source,
      reason,
    })
    this.name = 'QuantumRandomnessError'
  }
}

export class QuantumEntanglementError extends QuantumError {
  constructor(protocol: string, reason: string, context?: ErrorContext) {
    super(`Quantum entanglement protocol ${protocol} failed: ${reason}`, {
      ...context,
      protocol,
      reason,
    })
    this.name = 'QuantumEntanglementError'
  }
}

export class QuantumTeleportationError extends QuantumError {
  constructor(reason: string, context?: ErrorContext) {
    super(`Quantum teleportation failed: ${reason}`, {
      ...context,
      reason,
    })
    this.name = 'QuantumTeleportationError'
  }
}

export class QuantumNoiseThresholdExceededError extends QuantumError {
  constructor(threshold: number, measured: number, context?: ErrorContext) {
    super(`Quantum noise threshold exceeded: ${measured} > ${threshold}`, {
      ...context,
      threshold,
      measured,
    })
    this.name = 'QuantumNoiseThresholdExceededError'
  }
}

export class QuantumDecoherenceError extends QuantumError {
  constructor(qubit: string, coherenceTime: number, context?: ErrorContext) {
    super(`Quantum decoherence detected on qubit ${qubit} after ${coherenceTime}ms`, {
      ...context,
      qubit,
      coherenceTime,
    })
    this.name = 'QuantumDecoherenceError'
  }
}

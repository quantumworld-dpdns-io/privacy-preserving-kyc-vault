import { RetryPolicy } from './retry_policy.js'
import { computeBackoff, type BackoffStrategy } from './backoff.js'
import { CircuitBreaker, type CircuitBreakerOptions } from './circuit_breaker.js'

export interface RetryQueueItem<T = unknown> {
  id: string
  task: () => Promise<T>
  retryPolicy: RetryPolicy
  maxRetries: number
  attempt: number
  createdAt: number
  updatedAt: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  result?: T
  error?: Error
  priority: number
}

export interface RetryQueueOptions {
  concurrency: number
  circuitBreakerOptions?: CircuitBreakerOptions
  backoffStrategy?: BackoffStrategy
  persistence?: RetryQueuePersistence
}

export interface RetryQueuePersistence {
  save(item: RetryQueueItem): Promise<void>
  load(): Promise<RetryQueueItem[]>
  delete(id: string): Promise<void>
  list(): Promise<RetryQueueItem[]>
}

export type RetryQueueEvent = 'enqueued' | 'started' | 'completed' | 'failed' | 'cancelled' | 'retrying'

export type RetryQueueEventHandler = (event: RetryQueueEvent, item: RetryQueueItem) => void

export const DEFAULT_RETRY_QUEUE_OPTIONS: RetryQueueOptions = {
  concurrency: 5,
  backoffStrategy: 'exponential',
}

export class RetryQueue {
  private items: RetryQueueItem[] = []
  private running = 0
  private readonly concurrency: number
  private readonly circuitBreaker?: CircuitBreaker
  private readonly backoffStrategy: BackoffStrategy
  private readonly persistence?: RetryQueuePersistence
  private readonly handlers = new Set<RetryQueueEventHandler>()
  private processing = false

  constructor(options: Partial<RetryQueueOptions> = {}) {
    const opts = { ...DEFAULT_RETRY_QUEUE_OPTIONS, ...options }
    this.concurrency = opts.concurrency
    this.backoffStrategy = opts.backoffStrategy ?? 'exponential'
    this.persistence = opts.persistence
    if (opts.circuitBreakerOptions) {
      this.circuitBreaker = new CircuitBreaker(opts.circuitBreakerOptions)
    }
  }

  async enqueue<T>(item: Omit<RetryQueueItem<T>, 'createdAt' | 'updatedAt' | 'attempt' | 'status'>): Promise<string> {
    const fullItem: RetryQueueItem<T> = {
      ...item,
      attempt: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'pending',
    } as unknown as RetryQueueItem<T>

    this.items.push(fullItem as RetryQueueItem)
    this.sortByPriority()

    await this.persistence?.save(fullItem as RetryQueueItem)
    this.emit('enqueued', fullItem as RetryQueueItem)
    this.processNext()
    return fullItem.id
  }

  private async processNext(): Promise<void> {
    if (this.processing) return
    this.processing = true

    while (this.running < this.concurrency) {
      const item = this.items.find((i) => i.status === 'pending')
      if (!item) break

      this.running++
      item.status = 'running'
      item.updatedAt = Date.now()
      this.emit('started', item)
      this.executeItem(item).finally(() => {
        this.running--
        this.processNext()
      })
    }

    this.processing = false
  }

  private async executeItem(item: RetryQueueItem): Promise<void> {
    const executeFn = async (): Promise<unknown> => {
      const delay = computeBackoff(item.attempt, {
        baseDelayMs: item.retryPolicy.baseDelayMs,
        maxDelayMs: item.retryPolicy.maxDelayMs,
        strategy: this.backoffStrategy,
        jitterFactor: item.retryPolicy.jitterFactor,
      })

      if (item.attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        this.emit('retrying', item)
      }

      return item.task()
    }

    try {
      const result = this.circuitBreaker
        ? await this.circuitBreaker.execute(executeFn)
        : await executeFn()

      item.status = 'completed'
      item.result = result
      item.updatedAt = Date.now()
      await this.persistence?.save(item)
      this.emit('completed', item)
    } catch (err) {
      item.attempt++
      item.updatedAt = Date.now()

      if (item.retryPolicy.shouldRetry(item.attempt)) {
        item.status = 'pending'
        await this.persistence?.save(item)
        this.processNext()
      } else {
        item.status = 'failed'
        item.error = err as Error
        await this.persistence?.save(item)
        this.emit('failed', item)
      }
    }
  }

  cancel(id: string): boolean {
    const item = this.items.find((i) => i.id === id && i.status === 'pending')
    if (!item) return false
    item.status = 'cancelled'
    item.updatedAt = Date.now()
    this.emit('cancelled', item)
    return true
  }

  cancelAll(): void {
    for (const item of this.items) {
      if (item.status === 'pending') {
        item.status = 'cancelled'
        item.updatedAt = Date.now()
        this.emit('cancelled', item)
      }
    }
  }

  getPendingCount(): number {
    return this.items.filter((i) => i.status === 'pending').length
  }

  getRunningCount(): number {
    return this.running
  }

  getCompletedCount(): number {
    return this.items.filter((i) => i.status === 'completed').length
  }

  getFailedCount(): number {
    return this.items.filter((i) => i.status === 'failed').length
  }

  getItems(): RetryQueueItem[] {
    return [...this.items]
  }

  async clearCompleted(): Promise<void> {
    const completed = this.items.filter(
      (i) => i.status === 'completed' || i.status === 'failed' || i.status === 'cancelled',
    )
    for (const item of completed) {
      await this.persistence?.delete(item.id)
    }
    this.items = this.items.filter((i) => i.status === 'pending' || i.status === 'running')
  }

  async recover(): Promise<void> {
    if (!this.persistence) return
    const saved = await this.persistence.load()
    for (const item of saved) {
      if (item.status === 'pending' || item.status === 'running') {
        item.attempt = 0
        item.status = 'pending'
        item.updatedAt = Date.now()
        this.items.push(item)
      }
    }
    this.sortByPriority()
    this.processNext()
  }

  on(handler: RetryQueueEventHandler): () => void {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  private emit(event: RetryQueueEvent, item: RetryQueueItem): void {
    for (const handler of this.handlers) {
      try {
        handler(event, item)
      } catch {
      }
    }
  }

  private sortByPriority(): void {
    this.items.sort((a, b) => b.priority - a.priority)
  }

  destroy(): void {
    this.cancelAll()
    this.handlers.clear()
    this.circuitBreaker?.destroy()
  }
}

class CircuitBreaker {
  /**
   * @param {Object} options - Configuration options
   * @param {number} options.timeout - Timeout in milliseconds
   * @param {number} options.errorThresholdPercentage - Error threshold percentage (0-100)
   * @param {number} options.resetTimeout - Timeout in milliseconds before attempting to close the circuit
   */
  constructor(options = {}) {
    this.timeout = options.timeout || 5000;
    this.errorThresholdPercentage = options.errorThresholdPercentage || 50;
    this.resetTimeout = options.resetTimeout || 30000;
    
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  /**
   * Execute a function with circuit breaker protection
   * @param {Function} fn - Function to execute
   * @returns {Promise<any>} Result of the function
   */
  async fire(fn) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Circuit breaker timeout')), this.timeout)
        )
      ]);
      
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.successCount++;
    if (this.state === 'HALF_OPEN') {
      // Reset on success in half-open state
      this.reset();
    }
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    const totalRequests = this.successCount + this.failureCount;
    const failurePercentage = (this.failureCount / totalRequests) * 100;
    
    if (failurePercentage >= this.errorThresholdPercentage) {
      this.state = 'OPEN';
    }
  }

  reset() {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED';
  }
}

export { CircuitBreaker };
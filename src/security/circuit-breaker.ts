/**
 * VegaMCP — Circuit Breaker
 * 
 * Prevents cascading failures when external APIs are down.
 * Three states: CLOSED (normal) → OPEN (failing, fast-fail) → HALF_OPEN (testing recovery).
 * 
 * Usage:
 *   const breaker = getCircuitBreaker('tavily');
 *   const result = await breaker.execute(() => fetch(...));
 */

// ═══════════════════════════════════════════════
// CIRCUIT BREAKER IMPLEMENTATION
// ═══════════════════════════════════════════════

enum CircuitState {
  CLOSED = 'CLOSED',       // Normal operation
  OPEN = 'OPEN',           // Fast-failing, don't call
  HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;  // Failures before opening
  resetTimeout: number;      // Ms before trying again (OPEN → HALF_OPEN)
  halfOpenMax: number;       // Max concurrent requests in HALF_OPEN
  name: string;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private halfOpenRequests: number = 0;
  private readonly config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> & { name: string }) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      resetTimeout: config.resetTimeout ?? 30000,
      halfOpenMax: config.halfOpenMax ?? 1,
      name: config.name,
    };
  }

  /**
   * Execute a function with circuit breaker protection.
   * Throws CircuitBreakerError if the circuit is OPEN.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from OPEN → HALF_OPEN
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenRequests = 0;
      } else {
        throw new CircuitBreakerError(
          `Circuit breaker '${this.config.name}' is OPEN — API failing, will retry in ${Math.ceil((this.config.resetTimeout - (Date.now() - this.lastFailureTime)) / 1000)}s`,
          this.config.name
        );
      }
    }

    // In HALF_OPEN, limit concurrent requests
    if (this.state === CircuitState.HALF_OPEN && this.halfOpenRequests >= this.config.halfOpenMax) {
      throw new CircuitBreakerError(
        `Circuit breaker '${this.config.name}' is HALF_OPEN — testing recovery`,
        this.config.name
      );
    }

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenRequests++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /**
   * Execute with fallback — if circuit is open or call fails, use fallback.
   */
  async executeWithFallback<T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
    try {
      return await this.execute(fn);
    } catch (err) {
      if (err instanceof CircuitBreakerError) {
        return fallback();
      }
      // If the function itself threw, still use fallback
      return fallback();
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.successes++;
    if (this.state === CircuitState.HALF_OPEN) {
      // Recovery confirmed
      this.state = CircuitState.CLOSED;
      this.halfOpenRequests = 0;
    }
  }

  private onFailure(): void {
    this.failures++;
    this.successes = 0;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
    }
  }

  /** Get current breaker status. */
  getStatus(): { name: string; state: string; failures: number; successes: number } {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
    };
  }

  /** Force reset the breaker to CLOSED. */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.halfOpenRequests = 0;
  }
}

export class CircuitBreakerError extends Error {
  public readonly breakerName: string;
  constructor(message: string, breakerName: string) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.breakerName = breakerName;
  }
}

// ═══════════════════════════════════════════════
// GLOBAL CIRCUIT BREAKER REGISTRY
// ═══════════════════════════════════════════════

const breakers: Map<string, CircuitBreaker> = new Map();

/**
 * Get or create a circuit breaker for a named service.
 * Breakers are shared globally so state persists.
 */
export function getCircuitBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  let breaker = breakers.get(name);
  if (!breaker) {
    breaker = new CircuitBreaker({
      name,
      failureThreshold: config?.failureThreshold ?? 5,
      resetTimeout: config?.resetTimeout ?? 30000,
      halfOpenMax: config?.halfOpenMax ?? 1,
    });
    breakers.set(name, breaker);
  }
  return breaker;
}

/**
 * Get status of all circuit breakers.
 */
export function getAllBreakerStatus(): Array<{ name: string; state: string; failures: number; successes: number }> {
  return [...breakers.values()].map(b => b.getStatus());
}

// Pre-register breakers for known external services
getCircuitBreaker('tavily', { failureThreshold: 3, resetTimeout: 30000 });
getCircuitBreaker('searxng', { failureThreshold: 5, resetTimeout: 60000 });
getCircuitBreaker('github', { failureThreshold: 5, resetTimeout: 60000 });
getCircuitBreaker('openai', { failureThreshold: 3, resetTimeout: 30000 });
getCircuitBreaker('deepseek', { failureThreshold: 3, resetTimeout: 30000 });
getCircuitBreaker('kimi', { failureThreshold: 3, resetTimeout: 30000 });
getCircuitBreaker('embeddings', { failureThreshold: 3, resetTimeout: 15000 });

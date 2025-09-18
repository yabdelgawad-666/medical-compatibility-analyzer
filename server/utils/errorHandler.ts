// Comprehensive Error Handling and Circuit Breaker Utility
import { randomUUID } from 'crypto';

export interface ApiError {
  id: string;
  service: string;
  operation: string;
  error: Error;
  timestamp: number;
  retryCount: number;
  isRecoverable: boolean;
}

export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  lastFailureTime: number;
  successCount: number;
  threshold: number;
  timeout: number;
}

export interface FallbackStrategy {
  type: 'cache' | 'mock' | 'alternative_api' | 'degraded_service';
  data?: any;
  source: string;
  confidence: number;
}

export class ErrorHandlingService {
  private static instance: ErrorHandlingService;
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private errorLog = new Map<string, ApiError[]>();
  private metrics = {
    totalErrors: 0,
    recoveredErrors: 0,
    circuitBreakerTrips: 0,
    fallbackActivations: 0
  };

  private constructor() {}

  public static getInstance(): ErrorHandlingService {
    if (!ErrorHandlingService.instance) {
      ErrorHandlingService.instance = new ErrorHandlingService();
    }
    return ErrorHandlingService.instance;
  }

  // Circuit Breaker Implementation
  public createCircuitBreaker(
    serviceName: string,
    threshold: number = 5,
    timeout: number = 60000 // 1 minute
  ): CircuitBreakerState {
    const circuitBreaker: CircuitBreakerState = {
      state: 'closed',
      failures: 0,
      lastFailureTime: 0,
      successCount: 0,
      threshold,
      timeout
    };
    
    this.circuitBreakers.set(serviceName, circuitBreaker);
    return circuitBreaker;
  }

  public async executeWithCircuitBreaker<T>(
    serviceName: string,
    operation: string,
    apiCall: () => Promise<T>,
    fallbackStrategy: FallbackStrategy
  ): Promise<{ result: T; fromFallback: boolean; strategy?: FallbackStrategy }> {
    
    let circuitBreaker = this.circuitBreakers.get(serviceName);
    if (!circuitBreaker) {
      circuitBreaker = this.createCircuitBreaker(serviceName);
    }

    // Check circuit breaker state
    if (circuitBreaker.state === 'open') {
      if (Date.now() - circuitBreaker.lastFailureTime > circuitBreaker.timeout) {
        circuitBreaker.state = 'half-open';
        circuitBreaker.successCount = 0;
      } else {
        // Circuit is open, use fallback immediately
        console.warn(`Circuit breaker OPEN for ${serviceName}, using fallback strategy`);
        this.metrics.fallbackActivations++;
        const fallbackResult = await this.executeFallbackStrategy<T>(fallbackStrategy);
        return { result: fallbackResult, fromFallback: true, strategy: fallbackStrategy };
      }
    }

    try {
      const result = await apiCall();
      
      // Success - reset circuit breaker
      if (circuitBreaker.state === 'half-open') {
        circuitBreaker.successCount++;
        if (circuitBreaker.successCount >= 2) {
          circuitBreaker.state = 'closed';
          circuitBreaker.failures = 0;
          console.info(`Circuit breaker CLOSED for ${serviceName} - service recovered`);
        }
      } else {
        circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1); // Gradual recovery
      }
      
      return { result, fromFallback: false };
      
    } catch (error) {
      // Record the error
      const apiError: ApiError = {
        id: randomUUID(),
        service: serviceName,
        operation,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: Date.now(),
        retryCount: 0,
        isRecoverable: this.isRecoverableError(error)
      };
      
      this.recordError(serviceName, apiError);
      
      // Update circuit breaker
      circuitBreaker.failures++;
      circuitBreaker.lastFailureTime = Date.now();
      
      if (circuitBreaker.failures >= circuitBreaker.threshold) {
        circuitBreaker.state = 'open';
        this.metrics.circuitBreakerTrips++;
        console.warn(`Circuit breaker OPENED for ${serviceName} after ${circuitBreaker.failures} failures`);
      }
      
      // Execute fallback strategy
      console.warn(`API call failed for ${serviceName}:${operation}, using fallback strategy`, error);
      this.metrics.fallbackActivations++;
      const fallbackResult = await this.executeFallbackStrategy<T>(fallbackStrategy);
      return { result: fallbackResult, fromFallback: true, strategy: fallbackStrategy };
    }
  }

  private isRecoverableError(error: any): boolean {
    if (error instanceof Error) {
      // Timeout errors are usually recoverable
      if (error.name === 'AbortError' || error.message.includes('timeout')) {
        return true;
      }
      
      // Network errors are usually recoverable
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        return true;
      }
      
      // 5xx server errors are usually recoverable
      if (error.message.includes('500') || error.message.includes('502') || error.message.includes('503')) {
        return true;
      }
      
      // 4xx client errors are usually not recoverable (except rate limiting)
      if (error.message.includes('429')) {
        return true;
      }
    }
    
    return false;
  }

  private async executeFallbackStrategy<T>(strategy: FallbackStrategy): Promise<T> {
    switch (strategy.type) {
      case 'cache':
        if (strategy.data) {
          console.info(`Using cached data as fallback (confidence: ${strategy.confidence})`);
          return strategy.data as T;
        }
        throw new Error('Cache fallback requested but no cached data available');
      
      case 'mock':
        if (strategy.data) {
          console.info(`Using mock data as fallback (confidence: ${strategy.confidence})`);
          return strategy.data as T;
        }
        throw new Error('Mock fallback requested but no mock data available');
      
      case 'degraded_service':
        console.info(`Using degraded service mode (confidence: ${strategy.confidence})`);
        return this.getDegradedServiceResponse(strategy);
      
      default:
        throw new Error(`Unknown fallback strategy: ${strategy.type}`);
    }
  }

  private getDegradedServiceResponse<T>(strategy: FallbackStrategy): T {
    // Return a basic response indicating degraded service
    const degradedResponse = {
      isCompatible: true,
      riskLevel: 'medium',
      notes: `Service temporarily degraded - ${strategy.source}. Manual review recommended.`,
      confidence: strategy.confidence,
      degraded: true
    };
    
    return degradedResponse as T;
  }

  private recordError(serviceName: string, error: ApiError): void {
    if (!this.errorLog.has(serviceName)) {
      this.errorLog.set(serviceName, []);
    }
    
    const serviceErrors = this.errorLog.get(serviceName)!;
    serviceErrors.push(error);
    
    // Keep only last 100 errors per service
    if (serviceErrors.length > 100) {
      serviceErrors.shift();
    }
    
    this.metrics.totalErrors++;
  }

  // Retry mechanism with exponential backoff
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error = new Error('No attempts made');
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          this.metrics.recoveredErrors++;
          console.info(`Operation succeeded on retry attempt ${attempt}`);
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Don't retry non-recoverable errors
        if (!this.isRecoverableError(error)) {
          break;
        }
        
        // Exponential backoff
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`Operation failed, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  // Get service health metrics
  public getServiceHealth(serviceName: string): {
    circuitBreakerState: string;
    recentErrors: number;
    errorRate: number;
    isHealthy: boolean;
  } {
    const circuitBreaker = this.circuitBreakers.get(serviceName);
    const errors = this.errorLog.get(serviceName) || [];
    const recentErrors = errors.filter(e => Date.now() - e.timestamp < 300000).length; // Last 5 minutes
    
    return {
      circuitBreakerState: circuitBreaker?.state || 'unknown',
      recentErrors,
      errorRate: recentErrors / 5, // Errors per minute
      isHealthy: (!circuitBreaker || circuitBreaker.state === 'closed') && recentErrors < 5
    };
  }

  public getOverallMetrics() {
    return {
      ...this.metrics,
      servicesMonitored: this.circuitBreakers.size,
      circuitBreakerStates: Array.from(this.circuitBreakers.entries()).reduce((acc, [service, cb]) => {
        acc[service] = cb.state;
        return acc;
      }, {} as { [service: string]: string })
    };
  }
}

// Enhanced API client wrapper with comprehensive error handling
export class ResilientApiClient {
  private errorHandler = ErrorHandlingService.getInstance();
  
  constructor(
    private serviceName: string,
    private baseTimeout: number = 15000
  ) {}

  async makeRequest<T>(
    operation: string,
    requestFn: () => Promise<T>,
    fallbackStrategy: FallbackStrategy,
    retryOptions?: { maxRetries?: number; baseDelay?: number }
  ): Promise<{ result: T; fromFallback: boolean; strategy?: FallbackStrategy }> {
    
    const retryWrapper = () => this.errorHandler.executeWithRetry(
      requestFn,
      retryOptions?.maxRetries || 2,
      retryOptions?.baseDelay || 1000
    );

    return this.errorHandler.executeWithCircuitBreaker(
      this.serviceName,
      operation,
      retryWrapper,
      fallbackStrategy
    );
  }

  createTimeoutWrapper<T>(
    requestFn: () => Promise<T>,
    timeout: number = this.baseTimeout
  ): () => Promise<T> {
    return async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const request = requestFn();
        
        // If the request function accepts a signal parameter, pass it
        if (typeof (request as any).signal !== 'undefined') {
          (request as any).signal = controller.signal;
        }
        
        const result = await request;
        clearTimeout(timeoutId);
        return result;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };
  }
}

export default ErrorHandlingService;
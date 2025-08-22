/**
 * Correlation Manager for tracking requests across components
 * Provides correlation IDs for enhanced observability and debugging
 */

import { v4 as uuidv4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';
import { CorrelationContext } from '@/types/monitoring.types';

class CorrelationManager {
  private asyncLocalStorage: AsyncLocalStorage<CorrelationContext>;
  private enabled: boolean;

  constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage<CorrelationContext>();
    this.enabled = process.env['LOG_CORRELATION_ID']?.toLowerCase() === 'true';
  }

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId(): string {
    return uuidv4();
  }

  /**
   * Create a new correlation context
   */
  createContext(options: Partial<CorrelationContext> = {}): CorrelationContext {
    return {
      correlationId: options.correlationId || this.generateCorrelationId(),
      timestamp: options.timestamp || Date.now(),
      ...(options.component !== undefined && { component: options.component }),
      ...(options.userId !== undefined && { userId: options.userId }),
      ...(options.sessionId !== undefined && { sessionId: options.sessionId })
    };
  }

  /**
   * Run code within a correlation context
   */
  runWithContext<T>(context: CorrelationContext, callback: () => T): T {
    if (!this.enabled) {
      return callback();
    }
    return this.asyncLocalStorage.run(context, callback);
  }

  /**
   * Run code with a new correlation context
   */
  runWithNewContext<T>(
    callback: () => T,
    options: Partial<CorrelationContext> = {}
  ): T {
    const context = this.createContext(options);
    return this.runWithContext(context, callback);
  }

  /**
   * Get the current correlation context
   */
  getCurrentContext(): CorrelationContext | undefined {
    if (!this.enabled) {
      return undefined;
    }
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Get the current correlation ID
   */
  getCurrentCorrelationId(): string | undefined {
    const context = this.getCurrentContext();
    return context?.correlationId;
  }

  /**
   * Set correlation ID for current context
   */
  setCorrelationId(correlationId: string): void {
    const currentContext = this.getCurrentContext();
    if (currentContext) {
      currentContext.correlationId = correlationId;
    }
  }

  /**
   * Set component for current context
   */
  setComponent(component: string): void {
    const currentContext = this.getCurrentContext();
    if (currentContext) {
      currentContext.component = component;
    }
  }

  /**
   * Create child context with new correlation ID
   */
  createChildContext(parentContext?: CorrelationContext): CorrelationContext {
    const parent = parentContext || this.getCurrentContext();
    return this.createContext({
      ...(parent?.component !== undefined && { component: parent.component }),
      ...(parent?.userId !== undefined && { userId: parent.userId }),
      ...(parent?.sessionId !== undefined && { sessionId: parent.sessionId })
    });
  }

  /**
   * Wrap a function to automatically propagate correlation context
   */
  wrapFunction<T extends (...args: unknown[]) => unknown>(
    fn: T,
    component?: string
  ): T {
    if (!this.enabled) {
      return fn;
    }

    return ((...args: Parameters<T>) => {
      const currentContext = this.getCurrentContext();
      if (!currentContext) {
        // Create new context if none exists
        return this.runWithNewContext(
          () => {
            if (component) {
              this.setComponent(component);
            }
            return fn(...args);
          }
        );
      } else {
        // Use existing context
        if (component) {
          this.setComponent(component);
        }
        return fn(...args);
      }
    }) as T;
  }

  /**
   * Wrap a promise to propagate correlation context
   */
  wrapPromise<T>(promise: Promise<T>, component?: string): Promise<T> {
    if (!this.enabled) {
      return promise;
    }

    const currentContext = this.getCurrentContext();
    if (!currentContext) {
      return promise;
    }

    return new Promise<T>((resolve, reject) => {
      this.runWithContext(currentContext, () => {
        if (component) {
          this.setComponent(component);
        }
        promise.then(resolve).catch(reject);
      });
    });
  }

  /**
   * Check if correlation tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable correlation tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get correlation metadata for logging
   */
  getMetadata(): Record<string, unknown> {
    const context = this.getCurrentContext();
    if (!context || !this.enabled) {
      return {};
    }

    return {
      correlationId: context.correlationId,
      component: context.component,
      userId: context.userId,
      sessionId: context.sessionId,
      timestamp: context.timestamp
    };
  }
}

// Export singleton instance
export const correlationManager = new CorrelationManager();
export { CorrelationManager };
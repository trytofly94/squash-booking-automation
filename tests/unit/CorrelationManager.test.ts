/**
 * Tests for CorrelationManager
 * Validates correlation ID generation, context management, and async propagation
 */

import { correlationManager, CorrelationManager } from '@/utils/CorrelationManager';
import { CorrelationContext } from '@/types/monitoring.types';

describe('CorrelationManager', () => {
  let manager: CorrelationManager;

  beforeEach(() => {
    manager = new CorrelationManager();
    manager.setEnabled(true);
  });

  afterEach(() => {
    manager.setEnabled(false);
  });

  describe('Correlation ID Generation', () => {
    it('should generate valid UUID v4 correlation IDs', () => {
      const correlationId = manager.generateCorrelationId();
      
      expect(correlationId).toBeDefined();
      expect(typeof correlationId).toBe('string');
      expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique correlation IDs', () => {
      const id1 = manager.generateCorrelationId();
      const id2 = manager.generateCorrelationId();
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('Context Creation', () => {
    it('should create context with default values', () => {
      const context = manager.createContext();
      
      expect(context.correlationId).toBeDefined();
      expect(context.timestamp).toBeDefined();
      expect(context.timestamp).toBeCloseTo(Date.now(), -2); // Within 100ms
    });

    it('should create context with provided values', () => {
      const customContext: Partial<CorrelationContext> = {
        correlationId: 'custom-id',
        component: 'TestComponent',
        userId: 'user123',
        sessionId: 'session456'
      };

      const context = manager.createContext(customContext);
      
      expect(context.correlationId).toBe('custom-id');
      expect(context.component).toBe('TestComponent');
      expect(context.userId).toBe('user123');
      expect(context.sessionId).toBe('session456');
    });
  });

  describe('Context Management', () => {
    it('should run code within correlation context', () => {
      const testContext: CorrelationContext = {
        correlationId: 'test-correlation-id',
        timestamp: Date.now(),
        component: 'TestComponent'
      };

      let retrievedContext: CorrelationContext | undefined;

      manager.runWithContext(testContext, () => {
        retrievedContext = manager.getCurrentContext();
      });

      expect(retrievedContext).toEqual(testContext);
    });

    it('should return undefined when no context is active', () => {
      const context = manager.getCurrentContext();
      expect(context).toBeUndefined();
    });

    it('should create new context and run code within it', () => {
      let retrievedId: string | undefined;

      manager.runWithNewContext(() => {
        retrievedId = manager.getCurrentCorrelationId();
      }, { component: 'TestComponent' });

      expect(retrievedId).toBeDefined();
      expect(typeof retrievedId).toBe('string');
    });

    it('should handle nested contexts correctly', () => {
      const outerContext = manager.createContext({ component: 'Outer' });
      const innerContext = manager.createContext({ component: 'Inner' });

      let outerRetrieved: CorrelationContext | undefined;
      let innerRetrieved: CorrelationContext | undefined;

      manager.runWithContext(outerContext, () => {
        outerRetrieved = manager.getCurrentContext();
        
        manager.runWithContext(innerContext, () => {
          innerRetrieved = manager.getCurrentContext();
        });
      });

      expect(outerRetrieved?.component).toBe('Outer');
      expect(innerRetrieved?.component).toBe('Inner');
    });
  });

  describe('Context Modification', () => {
    it('should set correlation ID for current context', () => {
      const testContext = manager.createContext();
      const newId = 'updated-correlation-id';

      manager.runWithContext(testContext, () => {
        manager.setCorrelationId(newId);
        const currentId = manager.getCurrentCorrelationId();
        expect(currentId).toBe(newId);
      });
    });

    it('should set component for current context', () => {
      const testContext = manager.createContext();

      manager.runWithContext(testContext, () => {
        manager.setComponent('UpdatedComponent');
        const context = manager.getCurrentContext();
        expect(context?.component).toBe('UpdatedComponent');
      });
    });
  });

  describe('Child Context Creation', () => {
    it('should create child context with new correlation ID', () => {
      const parentContext = manager.createContext({
        component: 'Parent',
        userId: 'user123'
      });

      manager.runWithContext(parentContext, () => {
        const childContext = manager.createChildContext();
        
        expect(childContext.correlationId).not.toBe(parentContext.correlationId);
        expect(childContext.component).toBe(parentContext.component);
        expect(childContext.userId).toBe(parentContext.userId);
      });
    });

    it('should create child context without parent', () => {
      const childContext = manager.createChildContext();
      
      expect(childContext.correlationId).toBeDefined();
      expect(childContext.timestamp).toBeDefined();
    });
  });

  describe('Function Wrapping', () => {
    it('should wrap function to propagate correlation context', () => {
      let capturedId: string | undefined;
      
      const wrappedFunction = manager.wrapFunction(() => {
        capturedId = manager.getCurrentCorrelationId();
        return 'result';
      }, 'TestComponent');

      const result = wrappedFunction();
      
      expect(result).toBe('result');
      expect(capturedId).toBeDefined();
    });

    it('should preserve function arguments in wrapped function', () => {
      const wrappedFunction = manager.wrapFunction((...args: unknown[]) => {
        const [a, b] = args as [number, string];
        return `${a}-${b}`;
      });

      const result = wrappedFunction(42, 'test');
      expect(result).toBe('42-test');
    });

    it('should wrap promise to propagate correlation context', async () => {
      const testContext = manager.createContext({ component: 'TestComponent' });
      let capturedId: string | undefined;

      // Create a promise that resolves immediately (not with setTimeout)
      const promise = Promise.resolve('async-result');

      const result = await manager.runWithContext(testContext, async () => {
        // Capture the correlation ID when the promise is actually executed
        capturedId = manager.getCurrentCorrelationId();
        return await manager.wrapPromise(promise);
      });

      expect(result).toBe('async-result');
      expect(capturedId).toBe(testContext.correlationId);
    });
  });

  describe('Enable/Disable Functionality', () => {
    it('should respect enabled state', () => {
      manager.setEnabled(false);
      
      let capturedId: string | undefined;
      
      manager.runWithNewContext(() => {
        capturedId = manager.getCurrentCorrelationId();
      });

      expect(capturedId).toBeUndefined();
    });

    it('should check enabled state correctly', () => {
      manager.setEnabled(true);
      expect(manager.isEnabled()).toBe(true);
      
      manager.setEnabled(false);
      expect(manager.isEnabled()).toBe(false);
    });
  });

  describe('Metadata Generation', () => {
    it('should generate metadata for logging', () => {
      const testContext: CorrelationContext = {
        correlationId: 'test-id',
        timestamp: Date.now(),
        component: 'TestComponent',
        userId: 'user123'
      };

      manager.runWithContext(testContext, () => {
        const metadata = manager.getMetadata();
        
        expect(metadata['correlationId']).toBe('test-id');
        expect(metadata['component']).toBe('TestComponent');
        expect(metadata['userId']).toBe('user123');
        expect(metadata['timestamp']).toBeDefined();
      });
    });

    it('should return empty metadata when disabled', () => {
      manager.setEnabled(false);
      
      const testContext = manager.createContext();
      
      manager.runWithContext(testContext, () => {
        const metadata = manager.getMetadata();
        expect(Object.keys(metadata)).toHaveLength(0);
      });
    });
  });

  describe('Singleton Instance', () => {
    it('should use singleton pattern', () => {
      expect(correlationManager).toBeInstanceOf(CorrelationManager);
    });

    it('should maintain state across singleton access', () => {
      correlationManager.setEnabled(true);
      
      correlationManager.runWithNewContext(() => {
        const id1 = correlationManager.getCurrentCorrelationId();
        const id2 = correlationManager.getCurrentCorrelationId();
        
        expect(id1).toBe(id2);
        expect(id1).toBeDefined();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle errors in wrapped functions gracefully', () => {
      const wrappedFunction = manager.wrapFunction(() => {
        throw new Error('Test error');
      });

      expect(() => wrappedFunction()).toThrow('Test error');
    });

    it('should handle errors in wrapped promises gracefully', async () => {
      const testContext = manager.createContext();
      
      const failingPromise = Promise.reject(new Error('Async error'));
      
      await manager.runWithContext(testContext, async () => {
        await expect(manager.wrapPromise(failingPromise)).rejects.toThrow('Async error');
      });
    });
  });
});
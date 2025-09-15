// Function Wrapper - Provi utility functions for wrapping functions with error handling
import { ErrorContext } from '../types/errorHandler';

export class FunctionWrapper {
  /**
   * Create a wrapped function with error handling
   */
  static wrapFunction<T extends (...args: any[]) => any>(
    fn: T,
    context: Partial<ErrorContext>,
    errorHandler: (error: Error | string, context: Partial<ErrorContext>) => void
  ): (...args: Parameters<T>) => ReturnType<T> {
    return (...args: Parameters<T>): ReturnType<T> => {
      try {
        return fn(...args);
      } catch (error) {
        errorHandler(error instanceof Error ? error : new Error(String(error)), context);
        throw error;
      }
    };
  }

  /**
   * Create a wrapped async function with error handling
   */
  static wrapAsyncFunction<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    context: Partial<ErrorContext>,
    errorHandler: (error: Error | string, context: Partial<ErrorContext>) => void
  ): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      try {
        return await fn(...args);
      } catch (error) {
        errorHandler(error instanceof Error ? error : new Error(String(error)), context);
        throw error;
      }
    };
  }
}

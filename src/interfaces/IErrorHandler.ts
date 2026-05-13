import { DocumentationException, ErrorReport } from '../models';

/**
 * Interface for handling errors during documentation generation
 */
export interface IErrorHandler {
  /**
   * Handles a documentation exception
   * @param exception - Documentation exception to handle
   */
  handleError(exception: DocumentationException): void;

  /**
   * Logs a warning message
   * @param message - Warning message
   * @param context - Context information
   */
  logWarning(message: string, context: string): void;

  /**
   * Gets summary of all errors
   * @returns Array of error reports
   */
  getErrorSummary(): ErrorReport[];
}

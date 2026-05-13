import { ErrorCategory } from './DocumentationException';

/**
 * Enum for severity levels
 */
export enum Severity {
  Critical = 'Critical',
  Error = 'Error',
  Warning = 'Warning',
  Info = 'Info'
}

/**
 * Represents an error report
 */
export class ErrorReport {
  category: ErrorCategory;
  message: string;
  filePath?: string;
  serviceName?: string;
  timestamp: Date;
  severity: Severity;

  constructor(
    category: ErrorCategory,
    message: string,
    severity: Severity,
    filePath?: string,
    serviceName?: string,
    timestamp: Date = new Date()
  ) {
    this.category = category;
    this.message = message;
    this.severity = severity;
    this.filePath = filePath;
    this.serviceName = serviceName;
    this.timestamp = timestamp;
  }
}

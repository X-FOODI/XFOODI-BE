/**
 * Enum for error categories
 */
export enum ErrorCategory {
  FileSystem = 'FileSystem',
  Parsing = 'Parsing',
  Analysis = 'Analysis',
  Generation = 'Generation',
  Configuration = 'Configuration',
  MultiService = 'MultiService'
}

/**
 * Custom exception for documentation generation errors
 */
export class DocumentationException extends Error {
  category: ErrorCategory;
  filePath?: string;
  serviceName?: string;
  context?: string;

  constructor(
    message: string,
    category: ErrorCategory,
    options?: {
      filePath?: string;
      serviceName?: string;
      context?: string;
    }
  ) {
    super(message);
    this.name = 'DocumentationException';
    this.category = category;
    this.filePath = options?.filePath;
    this.serviceName = options?.serviceName;
    this.context = options?.context;
  }
}

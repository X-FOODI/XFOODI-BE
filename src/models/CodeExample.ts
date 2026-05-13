/**
 * Represents a code example for documentation
 */
export class CodeExample {
  title: string;
  language: string; // 'typescript', 'javascript', 'json'
  code: string;
  explanation: string;
  filePath: string;
  serviceName?: string; // 'core-saas', 'rag-chatbot', etc.

  constructor(
    title: string,
    language: string,
    code: string,
    explanation: string,
    filePath: string,
    serviceName?: string
  ) {
    this.title = title;
    this.language = language;
    this.code = code;
    this.explanation = explanation;
    this.filePath = filePath;
    this.serviceName = serviceName;
  }
}

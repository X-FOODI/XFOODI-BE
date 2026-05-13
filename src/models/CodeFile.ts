/**
 * Represents a code file in the repository
 */
export class CodeFile {
  filePath: string;
  fileName: string;
  extension: string;
  content: string;
  serviceName: string;

  constructor(
    filePath: string,
    fileName: string,
    extension: string,
    content: string = '',
    serviceName: string = ''
  ) {
    this.filePath = filePath;
    this.fileName = fileName;
    this.extension = extension;
    this.content = content;
    this.serviceName = serviceName;
  }
}

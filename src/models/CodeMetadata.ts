/**
 * Represents metadata extracted from a code file
 */
export class CodeMetadata {
  filePath: string;
  serviceName: string;
  imports: string[];
  exports: string[];
  classes: string[];
  functions: string[];
  interfaces: string[];

  constructor(
    filePath: string,
    serviceName: string = '',
    imports: string[] = [],
    exports: string[] = [],
    classes: string[] = [],
    functions: string[] = [],
    interfaces: string[] = []
  ) {
    this.filePath = filePath;
    this.serviceName = serviceName;
    this.imports = imports;
    this.exports = exports;
    this.classes = classes;
    this.functions = functions;
    this.interfaces = interfaces;
  }
}

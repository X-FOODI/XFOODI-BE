import { CodeExample } from './CodeExample';

/**
 * Represents a section of documentation
 */
export class DocumentationSection {
  title: string;
  requirementId: string;
  content: string;
  codeExamples: CodeExample[];
  keyPoints: string[];
  diagrams: any[]; // Placeholder for DiagramDefinition[]

  constructor(
    title: string,
    requirementId: string,
    content: string = '',
    codeExamples: CodeExample[] = [],
    keyPoints: string[] = [],
    diagrams: any[] = []
  ) {
    this.title = title;
    this.requirementId = requirementId;
    this.content = content;
    this.codeExamples = codeExamples;
    this.keyPoints = keyPoints;
    this.diagrams = diagrams;
  }
}

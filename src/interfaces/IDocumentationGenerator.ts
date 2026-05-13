import {
  MultiServicePattern,
  DualDatabasePattern,
  ServicePattern,
  RAGPattern,
  AIBuilderPattern,
  DocumentationSection
} from '../models';

/**
 * Interface for generating documentation from extracted patterns
 */
export interface IDocumentationGenerator {
  /**
   * Generates documentation for multi-service architecture
   * @param pattern - Multi-service pattern
   * @returns Promise resolving to documentation section
   */
  generateMultiServiceDoc(pattern: MultiServicePattern): Promise<DocumentationSection>;

  /**
   * Generates documentation for dual database architecture
   * @param pattern - Dual database pattern
   * @returns Promise resolving to documentation section
   */
  generateDualDatabaseDoc(pattern: DualDatabasePattern): Promise<DocumentationSection>;

  /**
   * Generates documentation for service layer architecture
   * @param pattern - Service pattern
   * @returns Promise resolving to documentation section
   */
  generateServiceLayerDoc(pattern: ServicePattern): Promise<DocumentationSection>;

  /**
   * Generates documentation for RAG pipeline
   * @param pattern - RAG pattern
   * @returns Promise resolving to documentation section
   */
  generateRAGPipelineDoc(pattern: RAGPattern): Promise<DocumentationSection>;

  /**
   * Generates documentation for AI Builder
   * @param pattern - AI Builder pattern
   * @returns Promise resolving to documentation section
   */
  generateAIBuilderDoc(pattern: AIBuilderPattern): Promise<DocumentationSection>;

  /**
   * Generates complete documentation from all sections
   * @param sections - Array of documentation sections
   * @returns Promise resolving to complete documentation markdown
   */
  generateCompleteDocumentation(sections: DocumentationSection[]): Promise<string>;
}

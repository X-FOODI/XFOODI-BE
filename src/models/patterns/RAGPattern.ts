import { CodeExample } from '../CodeExample';

/**
 * Represents RAG pipeline patterns
 */
export class RAGPattern {
  documentIngestionPipeline: any; // Placeholder for IngestionPipeline
  embeddingConfiguration: any; // Placeholder for EmbeddingConfig
  vectorStoragePattern: any; // Placeholder for VectorStorageConfig
  retrievalFlow: any; // Placeholder for RetrievalFlow
  chatGenerationPattern: any; // Placeholder for ChatGenerationConfig
  knowledgeBaseManagement: any; // Placeholder for KnowledgeBaseConfig
  examples: CodeExample[];

  constructor(
    documentIngestionPipeline: any = {},
    embeddingConfiguration: any = {},
    vectorStoragePattern: any = {},
    retrievalFlow: any = {},
    chatGenerationPattern: any = {},
    knowledgeBaseManagement: any = {},
    examples: CodeExample[] = []
  ) {
    this.documentIngestionPipeline = documentIngestionPipeline;
    this.embeddingConfiguration = embeddingConfiguration;
    this.vectorStoragePattern = vectorStoragePattern;
    this.retrievalFlow = retrievalFlow;
    this.chatGenerationPattern = chatGenerationPattern;
    this.knowledgeBaseManagement = knowledgeBaseManagement;
    this.examples = examples;
  }
}

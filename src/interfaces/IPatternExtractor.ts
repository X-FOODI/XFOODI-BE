import {
  RepositoryStructure,
  MultiServicePattern,
  DualDatabasePattern,
  ServicePattern,
  RAGPattern,
  AIBuilderPattern,
  AuthenticationPattern,
  InfrastructurePattern,
  DomainModelPattern,
  IntegrationPattern
} from '../models';

/**
 * Interface for extracting architectural patterns from repository structure
 */
export interface IPatternExtractor {
  /**
   * Extracts multi-service architecture patterns
   * @param structure - Repository structure
   * @returns Promise resolving to multi-service pattern
   */
  extractMultiServicePatterns(structure: RepositoryStructure): Promise<MultiServicePattern>;

  /**
   * Extracts dual database patterns (MySQL + MongoDB)
   * @param structure - Repository structure
   * @returns Promise resolving to dual database pattern
   */
  extractDualDatabasePatterns(structure: RepositoryStructure): Promise<DualDatabasePattern>;

  /**
   * Extracts service layer patterns
   * @param structure - Repository structure
   * @returns Promise resolving to service pattern
   */
  extractServiceLayerPatterns(structure: RepositoryStructure): Promise<ServicePattern>;

  /**
   * Extracts RAG pipeline patterns
   * @param structure - Repository structure
   * @returns Promise resolving to RAG pattern
   */
  extractRAGPipelinePatterns(structure: RepositoryStructure): Promise<RAGPattern>;

  /**
   * Extracts AI Builder patterns
   * @param structure - Repository structure
   * @returns Promise resolving to AI Builder pattern
   */
  extractAIBuilderPatterns(structure: RepositoryStructure): Promise<AIBuilderPattern>;

  /**
   * Extracts authentication patterns
   * @param structure - Repository structure
   * @returns Promise resolving to authentication pattern
   */
  extractAuthPatterns(structure: RepositoryStructure): Promise<AuthenticationPattern>;

  /**
   * Extracts infrastructure patterns
   * @param structure - Repository structure
   * @returns Promise resolving to infrastructure pattern
   */
  extractInfrastructurePatterns(structure: RepositoryStructure): Promise<InfrastructurePattern>;

  /**
   * Extracts domain model patterns
   * @param structure - Repository structure
   * @returns Promise resolving to domain model pattern
   */
  extractDomainModelPatterns(structure: RepositoryStructure): Promise<DomainModelPattern>;

  /**
   * Extracts integration patterns
   * @param structure - Repository structure
   * @returns Promise resolving to integration pattern
   */
  extractIntegrationPatterns(structure: RepositoryStructure): Promise<IntegrationPattern>;
}

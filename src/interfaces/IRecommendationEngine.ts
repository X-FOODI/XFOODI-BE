import { RepositoryStructure, Recommendation } from '../models';

/**
 * Interface for generating recommendations from repository analysis
 */
export interface IRecommendationEngine {
  /**
   * Generates all recommendations for the repository
   * @param structure - Repository structure
   * @returns Promise resolving to array of recommendations
   */
  generateRecommendations(structure: RepositoryStructure): Promise<Recommendation[]>;

  /**
   * Identifies code duplication across services
   * @param structure - Repository structure
   * @returns Promise resolving to array of recommendations
   */
  identifyCodeDuplication(structure: RepositoryStructure): Promise<Recommendation[]>;

  /**
   * Identifies missing validations
   * @param structure - Repository structure
   * @returns Promise resolving to array of recommendations
   */
  identifyMissingValidations(structure: RepositoryStructure): Promise<Recommendation[]>;

  /**
   * Identifies inconsistencies across services
   * @param structure - Repository structure
   * @returns Promise resolving to array of recommendations
   */
  identifyInconsistencies(structure: RepositoryStructure): Promise<Recommendation[]>;

  /**
   * Identifies security vulnerabilities
   * @param structure - Repository structure
   * @returns Promise resolving to array of recommendations
   */
  identifySecurityVulnerabilities(structure: RepositoryStructure): Promise<Recommendation[]>;

  /**
   * Identifies performance bottlenecks
   * @param structure - Repository structure
   * @returns Promise resolving to array of recommendations
   */
  identifyPerformanceBottlenecks(structure: RepositoryStructure): Promise<Recommendation[]>;

  /**
   * Prioritizes recommendations by impact and effort
   * @param recommendations - Array of recommendations
   * @returns Promise resolving to prioritized array of recommendations
   */
  prioritizeRecommendations(recommendations: Recommendation[]): Promise<Recommendation[]>;
}

import { RepositoryStructure, CodeFile, CodeMetadata } from '../models';

/**
 * Interface for analyzing repository structure and extracting code files
 */
export interface ICodeAnalyzer {
  /**
   * Analyzes a repository and extracts its structure
   * @param repositoryPath - Path to the repository root
   * @returns Promise resolving to repository structure
   */
  analyzeRepository(repositoryPath: string): Promise<RepositoryStructure>;

  /**
   * Extracts source files from repository by extensions
   * @param repositoryPath - Path to the repository root
   * @param extensions - Array of file extensions to extract (e.g., ['.ts', '.js'])
   * @returns Promise resolving to array of code files
   */
  extractSourceFiles(repositoryPath: string, extensions: string[]): Promise<CodeFile[]>;

  /**
   * Extracts metadata from a code file
   * @param file - Code file to analyze
   * @returns Promise resolving to code metadata
   */
  extractMetadata(file: CodeFile): Promise<CodeMetadata>;
}

import { CodeExample } from './CodeExample';

/**
 * Enum for recommendation types
 */
export enum RecommendationType {
  CodeDuplication = 'CodeDuplication',
  MissingValidation = 'MissingValidation',
  InconsistentNaming = 'InconsistentNaming',
  MissingDocumentation = 'MissingDocumentation',
  SecurityVulnerability = 'SecurityVulnerability',
  PerformanceBottleneck = 'PerformanceBottleneck',
  MissingTests = 'MissingTests',
  MissingMonitoring = 'MissingMonitoring'
}

/**
 * Enum for priority levels
 */
export enum Priority {
  Critical = 'Critical',
  High = 'High',
  Medium = 'Medium',
  Low = 'Low'
}

/**
 * Enum for effort levels
 */
export enum Effort {
  Small = 'Small',
  Medium = 'Medium',
  Large = 'Large',
  ExtraLarge = 'ExtraLarge'
}

/**
 * Represents a recommendation for improvement
 */
export class Recommendation {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  currentState: string;
  proposedSolution: string;
  priority: Priority;
  estimatedEffort: Effort;
  affectedFiles: string[];
  affectedServices: string[]; // Which of the 4 services are affected
  examples: CodeExample[];

  constructor(
    id: string,
    type: RecommendationType,
    title: string,
    description: string,
    currentState: string,
    proposedSolution: string,
    priority: Priority,
    estimatedEffort: Effort,
    affectedFiles: string[] = [],
    affectedServices: string[] = [],
    examples: CodeExample[] = []
  ) {
    this.id = id;
    this.type = type;
    this.title = title;
    this.description = description;
    this.currentState = currentState;
    this.proposedSolution = proposedSolution;
    this.priority = priority;
    this.estimatedEffort = estimatedEffort;
    this.affectedFiles = affectedFiles;
    this.affectedServices = affectedServices;
    this.examples = examples;
  }
}

import { createContainer, asClass, asFunction, InjectionMode } from 'awilix';
import { createLogger } from './utils/logger';
import {
  CodeAnalyzer,
  PatternExtractor,
  DocumentationGenerator,
  RecommendationEngine,
  ErrorHandler
} from './services';

/**
 * Creates and configures the dependency injection container
 */
export function setupContainer() {
  const container = createContainer({
    injectionMode: InjectionMode.CLASSIC
  });

  // Register logger
  container.register({
    logger: asFunction(createLogger).singleton()
  });

  // Register services
  container.register({
    codeAnalyzer: asClass(CodeAnalyzer).singleton(),
    patternExtractor: asClass(PatternExtractor).singleton(),
    documentationGenerator: asClass(DocumentationGenerator).singleton(),
    recommendationEngine: asClass(RecommendationEngine).singleton(),
    errorHandler: asClass(ErrorHandler).singleton()
  });

  return container;
}

export type Container = ReturnType<typeof setupContainer>;

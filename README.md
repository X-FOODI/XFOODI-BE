# RestX-API Documentation Generator

A comprehensive documentation generator system that analyzes the RestX Evolution multi-service architecture to extract architectural patterns, design decisions, and best practices.

## Overview

This system analyzes a 4-service Node.js architecture (Core SaaS API, RAG Chatbot, AI Builder Editor, AI Builder Renderer) with dual database design (MySQL + MongoDB) to generate structured documentation across 15 domain areas.

### Target Architecture

- **Core SaaS Service**: Restaurant operations (menu, orders, reservations, inventory, HR)
- **RAG Chatbot Service**: Retrieval-Augmented Generation chatbot with vector embeddings
- **AI Builder Editor**: Visual website builder with 200+ components
- **AI Builder Renderer**: Static site generation with custom domain routing
- **YARP Gateway**: Reverse proxy for subdomain-based routing
- **Nginx Edge**: DDoS protection, SSL termination, rate limiting

### Database Architecture

- **MySQL**: Admin database + per-tenant databases (transactional data)
- **MongoDB**: restx_builder (AI Builder data) + restx_rag (RAG data with vector embeddings)

## Project Structure

```
RestX-API/
├── src/
│   ├── interfaces/          # Core interfaces
│   │   ├── ICodeAnalyzer.ts
│   │   ├── IPatternExtractor.ts
│   │   ├── IDocumentationGenerator.ts
│   │   ├── IRecommendationEngine.ts
│   │   └── IErrorHandler.ts
│   ├── models/              # Data models
│   │   ├── RepositoryStructure.ts
│   │   ├── ServiceInfo.ts
│   │   ├── CodeFile.ts
│   │   ├── PackageInfo.ts
│   │   ├── CodeMetadata.ts
│   │   ├── patterns/        # Pattern models
│   │   │   ├── MultiServicePattern.ts
│   │   │   ├── DualDatabasePattern.ts
│   │   │   ├── ServicePattern.ts
│   │   │   ├── RAGPattern.ts
│   │   │   ├── AIBuilderPattern.ts
│   │   │   ├── AuthenticationPattern.ts
│   │   │   ├── InfrastructurePattern.ts
│   │   │   ├── DomainModelPattern.ts
│   │   │   └── IntegrationPattern.ts
│   │   ├── CodeExample.ts
│   │   ├── DocumentationSection.ts
│   │   ├── Recommendation.ts
│   │   ├── DocumentationException.ts
│   │   └── ErrorReport.ts
│   ├── services/            # Service implementations
│   │   ├── CodeAnalyzer.ts
│   │   ├── PatternExtractor.ts
│   │   ├── DocumentationGenerator.ts
│   │   ├── RecommendationEngine.ts
│   │   └── ErrorHandler.ts
│   ├── utils/               # Utility functions
│   │   └── logger.ts
│   ├── container.ts         # Dependency injection setup
│   └── index.ts             # Main entry point
├── dist/                    # Compiled JavaScript output
├── logs/                    # Application logs
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
cd RestX-API
npm install
```

## Usage

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

### Testing

```bash
npm test
npm run test:watch
```

### Linting

```bash
npm run lint
npm run format
```

## Core Components

### Code Analyzer

Analyzes repository structure and extracts code files:
- Traverses multi-service directory structure
- Identifies TypeScript/JavaScript source files
- Extracts metadata and service context
- Parses package.json from each service

### Pattern Extractor

Extracts architectural patterns:
- Multi-service architecture patterns
- Dual database patterns (MySQL + MongoDB)
- Service layer patterns
- RAG pipeline patterns
- AI Builder patterns
- Authentication patterns
- Infrastructure patterns
- Domain model patterns
- Integration patterns

### Documentation Generator

Generates structured markdown documentation:
- Multi-service architecture documentation
- Dual database documentation
- Service layer documentation
- RAG pipeline documentation
- AI Builder documentation
- Complete documentation with table of contents

### Recommendation Engine

Generates actionable recommendations:
- Code duplication identification
- Missing validation detection
- Inconsistency detection
- Security vulnerability identification
- Performance bottleneck identification
- Recommendation prioritization

### Error Handler

Handles errors during documentation generation:
- Categorizes errors (FileSystem, Parsing, Analysis, Generation)
- Logs errors with context
- Generates error summary reports

## Dependency Injection

The system uses Awilix for dependency injection:

```typescript
const container = setupContainer();
const codeAnalyzer = container.resolve<ICodeAnalyzer>('codeAnalyzer');
```

## Logging

Winston logger with structured logging:
- JSON format for production
- Colorized console output for development
- Separate error.log and combined.log files

## Configuration

Environment variables:
- `LOG_LEVEL`: Logging level (default: 'info')
- `NODE_ENV`: Environment (development/production)

## Requirements Coverage

This system addresses 15 requirement domains:

1. Multi-Service Architecture (YARP + Nginx)
2. Dual Database Architecture (MySQL + MongoDB)
3. Service Layer Architecture
4. RAG Pipeline Implementation
5. AI Builder Component Architecture
6. Static Site Generation and Custom Domain Routing
7. Authentication and Authorization
8. Core SaaS Domain Models
9. Third-Party Integration Patterns
10. Infrastructure and Docker Orchestration
11. Code Organization and Project Structure
12. Performance Optimization Patterns
13. Security Best Practices
14. Error Handling, Logging, and Monitoring
15. Template Improvement Recommendations

## Development Status

**Current Status**: Minimal template infrastructure created

This is a minimal template with:
- ✅ Project structure and configuration
- ✅ Core interfaces defined
- ✅ Data models created
- ✅ Skeleton service classes
- ✅ Dependency injection setup
- ✅ Logging configuration
- ⏳ Business logic implementation (pending)
- ⏳ Pattern extraction logic (pending)
- ⏳ Documentation generation logic (pending)

## Next Steps

1. Implement repository traversal logic in CodeAnalyzer
2. Implement pattern extraction logic in PatternExtractor
3. Implement documentation generation logic in DocumentationGenerator
4. Implement recommendation logic in RecommendationEngine
5. Add unit tests for all components
6. Add integration tests for end-to-end workflow

## License

MIT

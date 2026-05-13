import { CodeExample } from '../CodeExample';

/**
 * Represents domain model patterns
 */
export class DomainModelPattern {
  sequelizeModels: any[]; // Placeholder for Sequelize model info
  mongooseSchemas: any[]; // Placeholder for Mongoose schema info
  relationships: any[]; // Placeholder for relationship info
  examples: CodeExample[];

  constructor(
    sequelizeModels: any[] = [],
    mongooseSchemas: any[] = [],
    relationships: any[] = [],
    examples: CodeExample[] = []
  ) {
    this.sequelizeModels = sequelizeModels;
    this.mongooseSchemas = mongooseSchemas;
    this.relationships = relationships;
    this.examples = examples;
  }
}

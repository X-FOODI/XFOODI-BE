import { CodeExample } from '../CodeExample';

/**
 * Represents dual database patterns (MySQL + MongoDB)
 */
export class DualDatabasePattern {
  mysqlDatabases: any[]; // Placeholder for MySQLDatabaseInfo[]
  mongodbDatabases: any[]; // Placeholder for MongoDBDatabaseInfo[]
  dataPartitioningStrategy: string;
  connectionPatterns: any[]; // Placeholder for ConnectionConfig[]
  examples: CodeExample[];

  constructor(
    mysqlDatabases: any[] = [],
    mongodbDatabases: any[] = [],
    dataPartitioningStrategy: string = '',
    connectionPatterns: any[] = [],
    examples: CodeExample[] = []
  ) {
    this.mysqlDatabases = mysqlDatabases;
    this.mongodbDatabases = mongodbDatabases;
    this.dataPartitioningStrategy = dataPartitioningStrategy;
    this.connectionPatterns = connectionPatterns;
    this.examples = examples;
  }
}

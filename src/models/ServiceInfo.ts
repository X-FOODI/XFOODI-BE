/**
 * Represents information about a service in the multi-service architecture
 */
export class ServiceInfo {
  serviceName: string; // 'core-saas', 'rag-chatbot', 'builder-editor', 'builder-renderer'
  servicePath: string;
  port: number;
  dependencies: string[];
  npmPackages: string[];
  databaseType: 'mysql' | 'mongodb' | 'both' | 'none';

  constructor(
    serviceName: string,
    servicePath: string,
    port: number,
    dependencies: string[] = [],
    npmPackages: string[] = [],
    databaseType: 'mysql' | 'mongodb' | 'both' | 'none' = 'none'
  ) {
    this.serviceName = serviceName;
    this.servicePath = servicePath;
    this.port = port;
    this.dependencies = dependencies;
    this.npmPackages = npmPackages;
    this.databaseType = databaseType;
  }
}

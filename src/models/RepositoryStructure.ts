import { ServiceInfo } from './ServiceInfo';
import { CodeFile } from './CodeFile';
import { PackageInfo } from './PackageInfo';

/**
 * Represents the structure of a repository
 */
export class RepositoryStructure {
  repositoryName: string;
  services: ServiceInfo[];
  sourceFiles: CodeFile[];
  configurationFiles: Map<string, string>;
  packageJsonFiles: PackageInfo[];

  constructor(
    repositoryName: string,
    services: ServiceInfo[] = [],
    sourceFiles: CodeFile[] = [],
    configurationFiles: Map<string, string> = new Map(),
    packageJsonFiles: PackageInfo[] = []
  ) {
    this.repositoryName = repositoryName;
    this.services = services;
    this.sourceFiles = sourceFiles;
    this.configurationFiles = configurationFiles;
    this.packageJsonFiles = packageJsonFiles;
  }
}

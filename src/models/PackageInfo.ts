/**
 * Represents package.json information for a service
 */
export class PackageInfo {
  serviceName: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;

  constructor(
    serviceName: string,
    dependencies: Record<string, string> = {},
    devDependencies: Record<string, string> = {},
    scripts: Record<string, string> = {}
  ) {
    this.serviceName = serviceName;
    this.dependencies = dependencies;
    this.devDependencies = devDependencies;
    this.scripts = scripts;
  }
}

import { CodeExample } from '../CodeExample';

/**
 * Represents infrastructure patterns
 */
export class InfrastructurePattern {
  dockerConfiguration: any; // Placeholder for Docker config
  networkConfiguration: any; // Placeholder for Network config
  volumeConfiguration: any; // Placeholder for Volume config
  examples: CodeExample[];

  constructor(
    dockerConfiguration: any = {},
    networkConfiguration: any = {},
    volumeConfiguration: any = {},
    examples: CodeExample[] = []
  ) {
    this.dockerConfiguration = dockerConfiguration;
    this.networkConfiguration = networkConfiguration;
    this.volumeConfiguration = volumeConfiguration;
    this.examples = examples;
  }
}

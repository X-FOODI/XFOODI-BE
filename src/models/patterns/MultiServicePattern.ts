import { ServiceInfo } from '../ServiceInfo';
import { CodeExample } from '../CodeExample';

/**
 * Represents multi-service architecture patterns
 */
export class MultiServicePattern {
  services: ServiceInfo[];
  yarpConfiguration: any; // Placeholder for YARPConfig
  nginxConfiguration: any; // Placeholder for NginxConfig
  serviceDiscovery: string;
  interServiceCommunication: string;
  examples: CodeExample[];

  constructor(
    services: ServiceInfo[] = [],
    yarpConfiguration: any = {},
    nginxConfiguration: any = {},
    serviceDiscovery: string = '',
    interServiceCommunication: string = '',
    examples: CodeExample[] = []
  ) {
    this.services = services;
    this.yarpConfiguration = yarpConfiguration;
    this.nginxConfiguration = nginxConfiguration;
    this.serviceDiscovery = serviceDiscovery;
    this.interServiceCommunication = interServiceCommunication;
    this.examples = examples;
  }
}

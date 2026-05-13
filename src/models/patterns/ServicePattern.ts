import { CodeExample } from '../CodeExample';

/**
 * Represents service layer patterns
 */
export class ServicePattern {
  baseServicePattern: string;
  serviceRegistrations: any[]; // Placeholder for ServiceRegistration[]
  dependencyInjectionPattern: any; // Placeholder for DIPattern
  examples: CodeExample[];

  constructor(
    baseServicePattern: string = '',
    serviceRegistrations: any[] = [],
    dependencyInjectionPattern: any = {},
    examples: CodeExample[] = []
  ) {
    this.baseServicePattern = baseServicePattern;
    this.serviceRegistrations = serviceRegistrations;
    this.dependencyInjectionPattern = dependencyInjectionPattern;
    this.examples = examples;
  }
}

import { CodeExample } from '../CodeExample';

/**
 * Represents integration patterns
 */
export class IntegrationPattern {
  thirdPartyIntegrations: any[]; // Placeholder for integration info
  apiClients: any[]; // Placeholder for API client info
  webhookHandlers: any[]; // Placeholder for webhook handler info
  examples: CodeExample[];

  constructor(
    thirdPartyIntegrations: any[] = [],
    apiClients: any[] = [],
    webhookHandlers: any[] = [],
    examples: CodeExample[] = []
  ) {
    this.thirdPartyIntegrations = thirdPartyIntegrations;
    this.apiClients = apiClients;
    this.webhookHandlers = webhookHandlers;
    this.examples = examples;
  }
}

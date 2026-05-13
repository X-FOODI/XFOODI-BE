import { CodeExample } from '../CodeExample';

/**
 * Represents authentication patterns
 */
export class AuthenticationPattern {
  authenticationType: string;
  passportStrategies: any[]; // Placeholder for PassportStrategy[]
  jwtConfiguration: any; // Placeholder for JWTConfig
  authorizationPolicies: string[];
  examples: CodeExample[];

  constructor(
    authenticationType: string = '',
    passportStrategies: any[] = [],
    jwtConfiguration: any = {},
    authorizationPolicies: string[] = [],
    examples: CodeExample[] = []
  ) {
    this.authenticationType = authenticationType;
    this.passportStrategies = passportStrategies;
    this.jwtConfiguration = jwtConfiguration;
    this.authorizationPolicies = authorizationPolicies;
    this.examples = examples;
  }
}

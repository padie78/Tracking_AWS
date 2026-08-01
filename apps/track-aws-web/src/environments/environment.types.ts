/** Shape compartido entre environment.ts / environment.prod.ts (y inject de CI). */
export interface AppRuntimeEnvironment {
  production: boolean;
  appsync: {
    endpoint: string;
    region: string;
    apiKey: string;
  };
  cognito: {
    userPoolId: string;
    userPoolClientId: string;
    domain?: string;
    oauthRedirectSignIn?: string;
    oauthRedirectSignOut?: string;
  };
  /** HTTP endpoint POST /scan (API GW). */
  scanIngestionUrl: string;
}

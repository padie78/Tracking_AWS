import type { AppRuntimeEnvironment } from './environment.types';

export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: 'REPLACE_APPSYNC_ENDPOINT',
    region: 'eu-central-1',
    apiKey: 'REPLACE_APPSYNC_API_KEY',
  },
  cognito: {
    userPoolId: 'REPLACE_COGNITO_USER_POOL_ID',
    userPoolClientId: 'REPLACE_COGNITO_WEB_CLIENT_ID',
    domain: 'REPLACE_COGNITO_DOMAIN',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
  scanIngestionUrl: 'REPLACE_SCAN_URL',
};

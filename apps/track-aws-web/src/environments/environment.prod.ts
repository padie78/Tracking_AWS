import type { AppRuntimeEnvironment } from './environment.types';

/** Placeholders — sobrescrito en CI por Deploy Frontend. */
export const environment: AppRuntimeEnvironment = {
  production: true,
  appsync: {
    endpoint: 'REPLACE_APPSYNC_ENDPOINT',
    region: 'eu-central-1',
    apiKey: 'REPLACE_APPSYNC_API_KEY',
  },
  cognito: {
    userPoolId: 'REPLACE_COGNITO_USER_POOL_ID',
    userPoolClientId: 'REPLACE_COGNITO_WEB_CLIENT_ID',
    domain: 'REPLACE_COGNITO_DOMAIN',
    oauthRedirectSignIn: 'REPLACE_OAUTH_SIGN_IN',
    oauthRedirectSignOut: 'REPLACE_OAUTH_SIGN_OUT',
  },
  scanIngestionUrl: 'REPLACE_SCAN_URL',
};

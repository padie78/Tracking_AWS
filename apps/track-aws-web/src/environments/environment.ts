import type { AppRuntimeEnvironment } from './environment.types';

export const environment: AppRuntimeEnvironment = {
  production: false,
  appsync: {
    endpoint: 'https://bgwwa46kqnhb7jg7c55lsakosu.appsync-api.eu-central-1.amazonaws.com/graphql',
    region: 'eu-central-1',
    apiKey: 'da2-v3nlwlr52jfrrnm2x4qkq5ydri',
  },
  cognito: {
    userPoolId: 'eu-central-1_rCtpzUjtt',
    userPoolClientId: '1i0183hpfqrj43qlb2nihkor1m',
    domain: 'track-dev-473959757331',
    oauthRedirectSignIn: 'http://localhost:4200/auth/callback',
    oauthRedirectSignOut: 'http://localhost:4200/login',
  },
  scanIngestionUrl: 'https://vz9e0zlfdb.execute-api.eu-central-1.amazonaws.com/scan',
};

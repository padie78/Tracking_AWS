import { Amplify } from 'aws-amplify';

export interface AppEnvironment {
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
}

export function configureAmplify(env: AppEnvironment): void {
  const redirectSignIn =
    env.cognito.oauthRedirectSignIn ?? `${window.location.origin}/auth/callback`;
  const redirectSignOut =
    env.cognito.oauthRedirectSignOut ?? `${window.location.origin}/login`;
  const oauthDomain = resolveCognitoOAuthDomain(env.cognito.domain, env.appsync.region);

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: env.cognito.userPoolId,
        userPoolClientId: env.cognito.userPoolClientId,
        loginWith: {
          email: true,
          ...(oauthDomain
            ? {
                oauth: {
                  domain: oauthDomain,
                  scopes: ['openid', 'email', 'profile'],
                  redirectSignIn: [redirectSignIn],
                  redirectSignOut: [redirectSignOut],
                  responseType: 'code' as const,
                },
              }
            : {}),
        },
        signUpVerificationMethod: 'code',
      },
    },
    API: {
      GraphQL: {
        endpoint: env.appsync.endpoint,
        region: env.appsync.region,
        defaultAuthMode: 'apiKey',
        apiKey: env.appsync.apiKey,
      },
    },
  });
}

export function resolveCognitoOAuthDomain(
  domain: string | undefined,
  region: string,
): string | undefined {
  const trimmed = domain?.trim();
  if (!trimmed || trimmed.startsWith('REPLACE_')) return undefined;
  if (trimmed.includes('.amazoncognito.com')) return trimmed;
  return `${trimmed}.auth.${region}.amazoncognito.com`;
}

export function isOAuthConfigured(env: AppEnvironment): boolean {
  return !!resolveCognitoOAuthDomain(env.cognito.domain, env.appsync.region);
}

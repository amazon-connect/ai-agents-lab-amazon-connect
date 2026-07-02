// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import * as cdk from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class InfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // --- CDK Context Parameter Validation ---
    const existingOidcClientId = this.node.tryGetContext('existingOidcClientId') as string | undefined;
    const existingOidcIssuerUrl = this.node.tryGetContext('existingOidcIssuerUrl') as string | undefined;
    const existingOidcClientSecret = this.node.tryGetContext('existingOidcClientSecret') as string | undefined;
    const identityCenterStartUrl = this.node.tryGetContext('identityCenterStartUrl') as string | undefined;
    const identityCenterRegion = (this.node.tryGetContext('identityCenterRegion') as string | undefined) ?? this.region;

    if (existingOidcClientId && !existingOidcIssuerUrl) {
      throw new Error(
        "CDK context 'existingOidcIssuerUrl' is required when 'existingOidcClientId' is provided",
      );
    }

    if (!existingOidcClientId && !identityCenterStartUrl) {
      throw new Error(
        "CDK context 'identityCenterStartUrl' is required. " +
        "Provide it via: npx cdk deploy -c identityCenterStartUrl=https://d-XXXXXXXXXX.awsapps.com/start\n" +
        "Find your start URL in the IAM Identity Center console under Settings.\n" +
        "If your Identity Center is in a different region than the stack, also pass: -c identityCenterRegion=<region>",
      );
    }

    // --- OIDC Client Registration ---
    let oidcClientId: string;
    let oidcClientSecret: string;
    const oidcIssuerUrl = existingOidcIssuerUrl ?? `https://oidc.${identityCenterRegion}.amazonaws.com`;
    const redirectUri = 'http://127.0.0.1:5173/oauth/callback';

    if (!existingOidcClientId) {
      // Custom resource Lambda to call RegisterClient at deploy time.
      // This creates a standalone public OIDC client (like the AWS CLI uses).
      const registerClientFn = new lambda.Function(this, 'RegisterClientFn', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromInline(`
const { SSOOIDCClient, RegisterClientCommand } = require('@aws-sdk/client-sso-oidc');

exports.handler = async function(event) {
  const props = event.ResourceProperties;

  if (event.RequestType === 'Delete') {
    return { Data: {} };
  }

  const client = new SSOOIDCClient({ region: props.Region });
  const response = await client.send(new RegisterClientCommand({
    clientName: props.ClientName,
    clientType: 'public',
    issuerUrl: props.IssuerUrl,
    redirectUris: JSON.parse(props.RedirectUris),
    grantTypes: ['authorization_code', 'refresh_token'],
    scopes: ['sso:account:access'],
  }));

  if (!response.clientId) {
    throw new Error('RegisterClient did not return a clientId');
  }

  return {
    Data: {
      ClientId: response.clientId,
      ClientSecret: response.clientSecret || '',
      ClientSecretExpiresAt: String(response.clientSecretExpiresAt || 0),
    },
  };
};
        `),
        timeout: Duration.seconds(30),
      });

      // RegisterClient is unauthenticated but Lambda needs basic execution permissions
      registerClientFn.addToRolePolicy(new iam.PolicyStatement({
        actions: ['sso-oauth:*'],
        resources: ['*'],
      }));

      const registerClientProvider = new cr.Provider(this, 'RegisterClientProvider', {
        onEventHandler: registerClientFn,
      });

      const registerClientResource = new cdk.CustomResource(this, 'RegisterClientResource', {
        serviceToken: registerClientProvider.serviceToken,
        properties: {
          Region: identityCenterRegion,
          IssuerUrl: identityCenterStartUrl!,
          RedirectUris: JSON.stringify([redirectUri]),
          ClientName: `${this.stackName}-web-client`,
        },
      });

      oidcClientId = registerClientResource.getAttString('ClientId');
      oidcClientSecret = registerClientResource.getAttString('ClientSecret');
    } else {
      oidcClientId = existingOidcClientId;
      oidcClientSecret = existingOidcClientSecret ?? '';
    }

    // --- Stack Outputs ---

    new cdk.CfnOutput(this, 'OidcClientId', {
      value: oidcClientId,
      description: 'OIDC client ID — maps to VITE_OIDC_CLIENT_ID',
    });

    new cdk.CfnOutput(this, 'OidcClientSecret', {
      value: oidcClientSecret,
      description: 'OIDC client secret — maps to VITE_OIDC_CLIENT_SECRET',
    });

    new cdk.CfnOutput(this, 'OidcIssuerUrl', {
      value: oidcIssuerUrl,
      description: 'OIDC issuer URL — maps to VITE_OIDC_ISSUER_URL',
    });

    new cdk.CfnOutput(this, 'OidcRedirectUri', {
      value: redirectUri,
      description: 'OIDC redirect URI — maps to VITE_OIDC_REDIRECT_URI',
    });

    new cdk.CfnOutput(this, 'AwsRegion', {
      value: identityCenterRegion,
      description: 'Identity Center region — maps to VITE_AWS_REGION',
    });
  }
}

# AI Agents Lab for Amazon Connect — CDK Infrastructure

This CDK stack registers an IAM Identity Center OIDC client for AI Agents Lab for Amazon Connect. The app runs locally and authenticates via Identity Center's OIDC Authorization Code flow with PKCE.

## Prerequisites

1. **AWS CLI** configured with credentials that have permissions to create CloudFormation stacks and Lambda functions.
2. **Node.js 18+** and npm installed.
3. **CDK Bootstrap** — run once per AWS account/region before the first deployment:

```bash
cd infra
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

4. Install dependencies:

```bash
cd infra
npm install
```

## Deployment Modes

The stack supports two modes: **full provisioning** (creates the OIDC client) and **bring-your-own** (uses an existing OIDC client).

### Mode 1: Full Provisioning

The stack registers a public OIDC client with your IAM Identity Center instance using the `RegisterClient` API.

```bash
cd infra
npx cdk deploy -c identityCenterStartUrl=https://d-XXXXXXXXXX.awsapps.com/start
```

If your Identity Center is in a different region than the deployment target:

```bash
npx cdk deploy \
  -c identityCenterStartUrl=https://d-XXXXXXXXXX.awsapps.com/start \
  -c identityCenterRegion=us-east-1
```

### Mode 2: Bring-Your-Own OIDC

If you already have an OIDC client registered, skip provisioning by supplying your existing credentials:

```bash
cd infra
npx cdk deploy \
  -c existingOidcClientId=<YOUR_CLIENT_ID> \
  -c existingOidcIssuerUrl=https://oidc.<REGION>.amazonaws.com \
  -c existingOidcClientSecret=<YOUR_CLIENT_SECRET>
```

Both `existingOidcClientId` and `existingOidcIssuerUrl` are required together. The stack will fail synthesis if only one is provided.

## Stack Outputs

After deployment, the stack outputs the values needed for the frontend `.env` file:

| Stack Output | Maps to `.env` Variable |
|---|---|
| `OidcClientId` | `VITE_OIDC_CLIENT_ID` |
| `OidcClientSecret` | `VITE_OIDC_CLIENT_SECRET` |
| `OidcIssuerUrl` | `VITE_OIDC_ISSUER_URL` |
| `OidcRedirectUri` | `VITE_OIDC_REDIRECT_URI` |
| `AwsRegion` | `VITE_AWS_REGION` |

Use `./scripts/deploy.sh env` from the project root to auto-populate `.env` from these outputs.

## Running the App

After deployment:

```bash
# From the project root
npm run dev
```

The app starts at `http://127.0.0.1:5173` and authenticates against your Identity Center instance.

## Identity Sources

### Built-in Directory (Default)

IAM Identity Center has its built-in directory enabled by default. Users can be created directly in the Identity Center console with username/password credentials.

### Adding a Federated IdP (Okta, Azure AD)

You can add an external Identity Provider alongside the built-in directory. Both login options will appear on the Identity Center sign-in page without any frontend code changes.

**Manual steps to add a federated IdP:**

1. Open the **IAM Identity Center** console.
2. Navigate to **Settings** → **Identity source** → **Actions** → **Change identity source**.
3. Select **External identity provider**.
4. Download the IAM Identity Center SAML metadata file.
5. In your IdP (Okta, Azure AD, etc.):
   - Create a new SAML application using the metadata from step 4.
   - Configure attribute mappings (at minimum: email, given name, family name).
   - Copy the IdP metadata URL or download the IdP metadata XML.
6. Back in the Identity Center console, paste the IdP metadata URL or upload the XML file.
7. Complete the identity source change.
8. (Optional) Configure SCIM provisioning for automatic user/group sync.

## Useful Commands

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript |
| `npm run synth` | Synthesize CloudFormation template (validate without deploying) |
| `npm run deploy` | Deploy stack (non-interactive, `--require-approval never`) |
| `npm test` | Run CDK assertion tests |

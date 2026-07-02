// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  SSOClient,
  ListAccountsCommand,
  ListAccountRolesCommand,
  GetRoleCredentialsCommand,
} from "@aws-sdk/client-sso";
import type { AccountInfo, AWSCredentials, RoleInfo } from "./types";

/**
 * Custom error class for session expiry detection.
 * Thrown when the SSO service returns UnauthorizedException,
 * indicating the access token is no longer valid.
 */
export class SessionExpiredError extends Error {
  public readonly code = "SESSION_EXPIRED";

  constructor(message: string) {
    super(message);
    this.name = "SessionExpiredError";
  }
}

/**
 * Determines whether an error is a network-level failure
 * (no response received from the service).
 */
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (
    error instanceof Error &&
    ("code" in error || error.message.toLowerCase().includes("network"))
  ) {
    const code = (error as { code?: string }).code;
    if (
      code === "ENOTFOUND" ||
      code === "ECONNREFUSED" ||
      code === "ECONNRESET" ||
      code === "ETIMEDOUT" ||
      code === "ERR_NETWORK"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Executes an async operation with exponential backoff retry
 * for TooManyRequestsException errors.
 * Retry delays: 1s, 2s, 4s (max 3 retries).
 */
async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  const MAX_RETRIES = 3;
  const BASE_DELAY_MS = 1000;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error: unknown) {
      const isThrottle =
        error instanceof Error &&
        (error.name === "TooManyRequestsException" ||
          (error as { __type?: string }).__type === "TooManyRequestsException");

      if (!isThrottle || attempt === MAX_RETRIES) {
        throw error;
      }

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      await sleep(delay);
    }
  }

  // Unreachable, but satisfies TypeScript
  throw new Error("Retry logic exhausted");
}

/** Utility sleep function for retry delays. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps an SSO API call with standardized error handling:
 * - TooManyRequestsException → retry with exponential backoff
 * - UnauthorizedException → rethrow as SessionExpiredError
 * - Network errors → rethrow with descriptive message
 * - Other errors → rethrow with the error message
 */
async function callWithErrorHandling<T>(
  operation: () => Promise<T>
): Promise<T> {
  try {
    return await withRetry(operation);
  } catch (error: unknown) {
    if (error instanceof SessionExpiredError) {
      throw error;
    }

    if (
      error instanceof Error &&
      (error.name === "UnauthorizedException" ||
        (error as { __type?: string }).__type === "UnauthorizedException")
    ) {
      throw new SessionExpiredError(
        "Your session has expired. Please sign in again."
      );
    }

    if (isNetworkError(error)) {
      throw new Error(
        `Network error: Unable to reach AWS SSO service. Please check your internet connection and try again.`
      );
    }

    if (error instanceof Error) {
      throw new Error(error.message);
    }

    throw new Error("An unexpected error occurred while calling AWS SSO.");
  }
}

/**
 * Fetches all accounts the user can access, handling pagination.
 */
export async function listAccounts(
  accessToken: string,
  region: string
): Promise<AccountInfo[]> {
  // The AWS SSO API authenticates via the bearer access token in the request body,
  // not SigV4. The SDK still requires a credentials object to be present, so we
  // supply placeholder values that are never used for signing.
  const client = new SSOClient({ credentials: { accessKeyId: 'anonymous', secretAccessKey: 'anonymous' },
    region,
    ...(import.meta.env.DEV && { endpoint: 'http://127.0.0.1:5173/sso-portal' }),
  });
  const accounts: AccountInfo[] = [];
  let nextToken: string | undefined;

  await callWithErrorHandling(async () => {
    do {
      const command = new ListAccountsCommand({
        accessToken,
        nextToken,
      });
      const response = await client.send(command);

      if (response.accountList) {
        for (const account of response.accountList) {
          if (account.accountId && account.accountName) {
            accounts.push({
              accountId: account.accountId,
              accountName: account.accountName,
            });
          }
        }
      }

      nextToken = response.nextToken;
    } while (nextToken);
  });

  return accounts;
}

/**
 * Fetches all roles for a given account, handling pagination.
 * Returns roles sorted alphabetically by role name.
 */
export async function listAccountRoles(
  accessToken: string,
  accountId: string,
  region: string
): Promise<RoleInfo[]> {
  const client = new SSOClient({ credentials: { accessKeyId: 'anonymous', secretAccessKey: 'anonymous' },
    region,
    ...(import.meta.env.DEV && { endpoint: 'http://127.0.0.1:5173/sso-portal' }),
  });
  const roles: RoleInfo[] = [];
  let nextToken: string | undefined;

  await callWithErrorHandling(async () => {
    do {
      const command = new ListAccountRolesCommand({
        accessToken,
        accountId,
        nextToken,
      });
      const response = await client.send(command);

      if (response.roleList) {
        for (const role of response.roleList) {
          if (role.roleName) {
            roles.push({ roleName: role.roleName });
          }
        }
      }

      nextToken = response.nextToken;
    } while (nextToken);
  });

  roles.sort((a, b) => a.roleName.localeCompare(b.roleName));

  return roles;
}

/**
 * Obtains temporary AWS credentials for the given account and role.
 */
export async function getRoleCredentials(
  accessToken: string,
  accountId: string,
  roleName: string,
  region: string
): Promise<AWSCredentials> {
  const client = new SSOClient({ credentials: { accessKeyId: 'anonymous', secretAccessKey: 'anonymous' },
    region,
    ...(import.meta.env.DEV && { endpoint: 'http://127.0.0.1:5173/sso-portal' }),
  });

  return callWithErrorHandling(async () => {
    const command = new GetRoleCredentialsCommand({
      accessToken,
      accountId,
      roleName,
    });
    const response = await client.send(command);

    if (
      !response.roleCredentials?.accessKeyId ||
      !response.roleCredentials?.secretAccessKey ||
      !response.roleCredentials?.sessionToken ||
      !response.roleCredentials?.expiration
    ) {
      throw new Error(
        "Incomplete credentials received from AWS SSO. Please try again."
      );
    }

    return {
      accessKeyId: response.roleCredentials.accessKeyId,
      secretAccessKey: response.roleCredentials.secretAccessKey,
      sessionToken: response.roleCredentials.sessionToken,
      expiration: response.roleCredentials.expiration,
    };
  });
}

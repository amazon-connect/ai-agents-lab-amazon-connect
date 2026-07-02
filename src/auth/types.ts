// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export type AuthState = "unauthenticated" | "loading" | "authenticated";

export interface AuthUser {
  displayName: string;
}

export interface AuthContextValue {
  state: AuthState;
  user: AuthUser | null;
  login: () => void;
  logout: () => void;
  error: string | null;
}

export interface OIDCConfig {
  issuerUrl: string;
  clientId: string;
  /**
   * Client secret issued by IAM Identity Center's RegisterClient API.
   * Despite the name, Identity Center issues this for public clients too and
   * requires it be presented back at the token endpoint. It is not a
   * confidential application secret — it scopes the registration, not the user.
   */
  clientSecret: string;
  redirectUri: string;
  region: string;
}

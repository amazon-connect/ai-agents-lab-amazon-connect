// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import { useAuth } from "../auth/AuthContext";

/**
 * Login page displayed when the user is unauthenticated.
 * Shows a sign-in prompt and optional error alert.
 */
export function LoginPage() {
  const { login, error } = useAuth();

  return (
    <Box margin={{ top: "xxxl" }} textAlign="center">
      <SpaceBetween size="l" direction="vertical" alignItems="center">
        <Header variant="h1">Sign in required</Header>
        <Box variant="p" color="text-body-secondary">
          You need to authenticate with your organisation's Identity Provider to
          access this application.
        </Box>
        {error && <Alert type="error">{error}</Alert>}
        <Button variant="primary" onClick={login}>
          Sign in with SSO
        </Button>
      </SpaceBetween>
    </Box>
  );
}

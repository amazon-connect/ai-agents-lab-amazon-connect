// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import Alert from "@cloudscape-design/components/alert";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ContentLayout from "@cloudscape-design/components/content-layout";
import Form from "@cloudscape-design/components/form";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import type { SelectProps } from "@cloudscape-design/components/select";

import { useAuth } from "../auth/AuthContext";
import type { AccountInfo, RoleInfo } from "../credentials/types";

export interface CredentialSetupPageProps {
  accounts: AccountInfo[];
  roles: RoleInfo[];
  selectedAccountId: string | null;
  selectedRoleName: string | null;
  accountsLoading: boolean;
  rolesLoading: boolean;
  credentialLoading: boolean;
  error: string | null;
  onSelectAccount: (accountId: string) => void;
  onSelectRole: (roleName: string) => void;
  onContinue: () => void;
  onRetry: () => void;
  onReset: () => void;
}

const SESSION_EXPIRED_CODE = "SESSION_EXPIRED";

function isSessionExpiredError(error: string | null): boolean {
  if (!error) return false;
  return error.includes(SESSION_EXPIRED_CODE) || error.includes("session has expired");
}

export function CredentialSetupPage({
  accounts,
  roles,
  selectedAccountId,
  selectedRoleName,
  accountsLoading,
  rolesLoading,
  credentialLoading,
  error,
  onSelectAccount,
  onSelectRole,
  onContinue,
  onRetry,
  onReset,
}: CredentialSetupPageProps) {
  const { user, logout } = useAuth();

  const accountOptions: SelectProps.Options = useMemo(
    () =>
      accounts.map((account) => ({
        label: `${account.accountName} (${account.accountId})`,
        value: account.accountId,
      })),
    [accounts]
  );

  const roleOptions: SelectProps.Options = useMemo(
    () =>
      [...roles]
        .sort((a, b) => a.roleName.localeCompare(b.roleName))
        .map((role) => ({
          label: role.roleName,
          value: role.roleName,
        })),
    [roles]
  );

  const selectedAccountOption: SelectProps.Option | null = useMemo(() => {
    if (!selectedAccountId) return null;
    return accountOptions.find((opt) => (opt as SelectProps.Option).value === selectedAccountId) as SelectProps.Option | null ?? null;
  }, [selectedAccountId, accountOptions]);

  const selectedRoleOption: SelectProps.Option | null = useMemo(() => {
    if (!selectedRoleName) return null;
    return roleOptions.find((opt) => (opt as SelectProps.Option).value === selectedRoleName) as SelectProps.Option | null ?? null;
  }, [selectedRoleName, roleOptions]);

  const isAnyLoading = accountsLoading || rolesLoading || credentialLoading;
  const continueDisabled = !selectedAccountId || !selectedRoleName || isAnyLoading;

  const isSessionExpired = isSessionExpiredError(error);
  const isEmptyRoles = !rolesLoading && roles.length === 0 && selectedAccountId && error?.includes("No roles");

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 20px" }}>
      <ContentLayout
        header={
          <Header
            variant="h1"
            description={
              <>
                <span>Signed in as {user?.displayName ?? "Unknown"}</span>
                {" · "}
                <Link onFollow={logout}>Sign out</Link>
              </>
            }
          >
            Select AWS Account and Role
          </Header>
        }
      >
        <Container>
          <SpaceBetween direction="vertical" size="l">
            {/* Session expired error */}
            {isSessionExpired && (
              <Alert
                type="error"
                header="Session expired"
                action={
                  <Button onClick={logout}>Sign in again</Button>
                }
              >
                Your session has expired. Please sign in again to continue.
              </Alert>
            )}

            {/* General error (non-session-expired) */}
            {error && !isSessionExpired && (
              <Alert
                type="error"
                header="Error"
                action={
                  <SpaceBetween direction="horizontal" size="xs">
                    <Button onClick={onRetry}>Retry</Button>
                    {isEmptyRoles && (
                      <Button variant="link" onClick={onReset}>
                        Change account
                      </Button>
                    )}
                  </SpaceBetween>
                }
              >
                {error}
              </Alert>
            )}

            {/* Form - hidden when session expired */}
            {!isSessionExpired && (
              <Form
                actions={
                  <Button
                    variant="primary"
                    disabled={continueDisabled}
                    loading={credentialLoading}
                    onClick={onContinue}
                  >
                    Continue
                  </Button>
                }
              >
                <SpaceBetween direction="vertical" size="l">
                  {/* Account selector */}
                  <FormField label="AWS Account">
                    {accountsLoading ? (
                      <Spinner />
                    ) : (
                      <Select
                        selectedOption={selectedAccountOption}
                        onChange={({ detail }) => {
                          if (detail.selectedOption.value) {
                            onSelectAccount(detail.selectedOption.value);
                          }
                        }}
                        options={accountOptions}
                        placeholder="Select an account"
                        disabled={accountsLoading || credentialLoading}
                        filteringType="auto"
                      />
                    )}
                  </FormField>

                  {/* Role selector */}
                  <FormField label="IAM Role">
                    {rolesLoading ? (
                      <Spinner />
                    ) : (
                      <Select
                        selectedOption={selectedRoleOption}
                        onChange={({ detail }) => {
                          if (detail.selectedOption.value) {
                            onSelectRole(detail.selectedOption.value);
                          }
                        }}
                        options={roleOptions}
                        placeholder="Select a role"
                        disabled={!selectedAccountId || rolesLoading || credentialLoading}
                      />
                    )}
                  </FormField>
                </SpaceBetween>
              </Form>
            )}
          </SpaceBetween>
        </Container>
      </ContentLayout>
    </div>
  );
}

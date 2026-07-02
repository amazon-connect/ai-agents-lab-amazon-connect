// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import type { TopNavigationProps } from "@cloudscape-design/components/top-navigation";
import AppLayout from "@cloudscape-design/components/app-layout";
import Flashbar from "@cloudscape-design/components/flashbar";
import SideNavigation from "@cloudscape-design/components/side-navigation";
import Spinner from "@cloudscape-design/components/spinner";
import Box from "@cloudscape-design/components/box";
import { useAuth } from "../auth/AuthContext";
import { useWorkspace } from "../workspace/WorkspaceContext";
import { useCredentials } from "../credentials/CredentialsContext";
import { useSplitPanelConfig } from "./SplitPanelContext";
import { useAppNotifications } from "./AppNotificationContext";

const NAV_ITEMS = [
  { type: "link" as const, text: "Contacts", href: "/contacts" },
  { type: "link" as const, text: "Testing", href: "/testing" },
  { type: "link" as const, text: "Evaluations", href: "/evaluations" },
  { type: "divider" as const },
  {
    type: "section" as const,
    text: "Settings",
    items: [
      { type: "link" as const, text: "General", href: "/settings" },
      { type: "link" as const, text: "Evaluations", href: "/settings/evaluations" },
      { type: "link" as const, text: "Permissions", href: "/settings/permissions" },
    ],
  },
];

/**
 * Truncates a display name to 30 characters with an ellipsis (U+2026) if it exceeds 30 characters.
 * Strings of 30 characters or fewer are returned unchanged.
 */
export function truncateDisplayName(name: string): string {
  if (name.length > 30) {
    return name.slice(0, 29) + "\u2026";
  }
  return name;
}

interface AppShellProps {
  children: React.ReactNode;
}

export default function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { state: authState, user, login, logout } = useAuth();
  const splitPanelConfig = useSplitPanelConfig();
  const { accountId, roleName } = useCredentials();
  const { messages: notificationMessages } = useAppNotifications();
  const {
    state: workspaceState,
    instances,
    assistants,
    instance: selectedInstance,
    assistant: selectedAssistant,
    instancesLoading,
    assistantsLoading,
    selectInstance,
    selectAssistant,
  } = useWorkspace();

  const activeHref = useMemo(() => {
    if (location.pathname.startsWith("/sessions")) return "/sessions";
    if (location.pathname.startsWith("/contacts")) return "/contacts";
    if (location.pathname.startsWith("/testing")) return "/testing";
    if (location.pathname.startsWith("/evaluations")) return "/evaluations";
    if (location.pathname === "/settings/permissions") return "/settings/permissions";
    if (location.pathname === "/settings/evaluations") return "/settings/evaluations";
    if (location.pathname === "/settings") return "/settings";
    return "/";
  }, [location.pathname]);

  // Build instance dropdown items
  const instanceMenuItems = useMemo(() => {
    if (instancesLoading) {
      return [{ id: "__loading", text: "Loading instances…", disabled: true }];
    }
    if (instances.length === 0) {
      return [{ id: "__empty", text: "No instances found", disabled: true }];
    }
    return instances.map((inst) => ({
      id: inst.instanceId,
      text: inst.instanceAlias || inst.instanceId,
      description: `${inst.region}`,
    }));
  }, [instances, instancesLoading]);

  // Build assistant dropdown items
  const assistantMenuItems = useMemo(() => {
    if (!selectedInstance) {
      return [{ id: "__none", text: "Select an instance first", disabled: true }];
    }
    if (assistantsLoading) {
      return [{ id: "__loading", text: "Loading assistants…", disabled: true }];
    }
    if (assistants.length === 0) {
      return [{ id: "__empty", text: "No assistants found", disabled: true }];
    }
    return assistants.map((asst) => ({
      id: asst.assistantId,
      text: asst.name || asst.assistantId,
    }));
  }, [assistants, assistantsLoading, selectedInstance]);

  const utilities = useMemo((): TopNavigationProps.Utility[] => {
    const items: TopNavigationProps.Utility[] = [];

    // Instance selector
    items.push({
      type: "menu-dropdown",
      text: selectedInstance?.instanceAlias || "Select instance",
      title: "Connect Instance",
      items: instanceMenuItems,
      onItemClick: ({ detail }) => {
        const inst = instances.find((i) => i.instanceId === detail.id);
        if (inst) selectInstance(inst);
      },
    });

    // Assistant selector (only show when instance is selected)
    if (selectedInstance) {
      items.push({
        type: "menu-dropdown",
        text: selectedAssistant?.name || "Select assistant",
        title: "Amazon Connect AI Agents Assistant",
        items: assistantMenuItems,
        onItemClick: ({ detail }) => {
          const asst = assistants.find((a) => a.assistantId === detail.id);
          if (asst) selectAssistant(asst);
        },
      });
    }

    // User menu
    if (authState === "authenticated" && user) {
      const displayName = roleName
        ? truncateDisplayName(roleName)
        : truncateDisplayName(user.displayName);
      items.push({
        type: "menu-dropdown",
        text: displayName,
        description: accountId ?? undefined,
        items: [
          { id: "settings", text: "Settings" },
          { id: "signout", text: "Sign out" },
        ],
        onItemClick: ({ detail }) => {
          if (detail.id === "settings") navigate("/settings/permissions");
          if (detail.id === "signout") logout();
        },
      });
    } else if (authState !== "loading") {
      items.push({
        type: "button",
        text: "Sign in",
        onClick: () => login(),
      });
    }

    return items;
  }, [
    authState,
    user,
    login,
    logout,
    accountId,
    roleName,
    selectedInstance,
    selectedAssistant,
    instanceMenuItems,
    assistantMenuItems,
    instances,
    assistants,
    selectInstance,
    selectAssistant,
  ]);

  // Gate content: show spinner while loading, placeholder while selecting
  const isReady = workspaceState === "ready";
  const isLoading = workspaceState === "loading-instances" || workspaceState === "pending";

  const content = isReady ? (
    children
  ) : isLoading ? (
    <Box textAlign="center" padding={{ top: "xxxl" }}>
      <Spinner size="large" />
      <Box variant="p" padding={{ top: "s" }} color="text-body-secondary">
        Discovering Connect instances…
      </Box>
    </Box>
  ) : workspaceState === "error" ? (
    <Box textAlign="center" padding={{ top: "xxxl" }}>
      <Box variant="p" color="text-status-error">
        Failed to load workspace. Please try again.
      </Box>
    </Box>
  ) : (
    // "selecting" state — prompt user via the top nav dropdowns
    <Box textAlign="center" padding={{ top: "xxxl" }}>
      <Box variant="p" color="text-body-secondary">
        Select a Connect instance and assistant from the top navigation to continue.
      </Box>
    </Box>
  );

  return (
    <>
      <TopNavigation
        identity={{ title: "AI Agents Lab for Amazon Connect", href: "/" }}
        utilities={utilities}
      />
      <AppLayout
        navigation={
          isReady ? (
            <SideNavigation
              activeHref={activeHref}
              items={NAV_ITEMS}
              onFollow={(event) => {
                event.preventDefault();
                if (splitPanelConfig) {
                  splitPanelConfig.onToggle(false);
                }
                navigate(event.detail.href);
              }}
            />
          ) : undefined
        }
        navigationHide={!isReady}
        notifications={notificationMessages.length > 0 ? <Flashbar items={notificationMessages} /> : undefined}
        content={content}
        toolsHide
        splitPanel={splitPanelConfig?.panel}
        splitPanelOpen={splitPanelConfig?.open ?? false}
        splitPanelPreferences={splitPanelConfig?.preferences}
        splitPanelSize={splitPanelConfig?.size}
        onSplitPanelResize={({ detail }) => splitPanelConfig?.onResize?.(detail.size)}
        onSplitPanelPreferencesChange={({ detail }) =>
          splitPanelConfig?.onPreferencesChange(detail)
        }
        onSplitPanelToggle={({ detail }) =>
          splitPanelConfig?.onToggle(detail.open)
        }
      />
    </>
  );
}

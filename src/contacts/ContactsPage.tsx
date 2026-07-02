// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import Button from "@cloudscape-design/components/button";
import DateRangePicker from "@cloudscape-design/components/date-range-picker";
import type { DateRangePickerProps } from "@cloudscape-design/components/date-range-picker";
import Flashbar from "@cloudscape-design/components/flashbar";
import type { FlashbarProps } from "@cloudscape-design/components/flashbar";
import FormField from "@cloudscape-design/components/form-field";
import Header from "@cloudscape-design/components/header";
import Input from "@cloudscape-design/components/input";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import type { TableProps } from "@cloudscape-design/components/table";
import Box from "@cloudscape-design/components/box";

import { useWorkspace } from "../workspace/WorkspaceContext";
import { useCredentials } from "../credentials/CredentialsContext";
import { useAppNotifications } from "../layouts/AppNotificationContext";
import { searchContacts, describeContact } from "./contacts-client";
import type { ContactSummary, ContactSearchResult } from "./contacts-client";
import { validateTimeRange } from "./validate-time-range";
import { formatDuration } from "./format-duration";

/**
 * Classifies an error by type to determine the appropriate user-facing message.
 */
export function classifyError(
  err: unknown
): "throttled" | "access-denied" | "expired-credentials" | "generic" {
  if (err instanceof Error) {
    const name = err.name;
    const message = err.message ?? "";
    if (name === "TooManyRequestsException" || name === "ThrottlingException")
      return "throttled";
    if (name === "AccessDeniedException") return "access-denied";
    if (
      name === "ExpiredTokenException" ||
      name === "InvalidIdentityToken" ||
      name === "ExpiredToken" ||
      message.includes("security token included in the request is expired") ||
      message.includes("Token has expired")
    )
      return "expired-credentials";
  }
  return "generic";
}

/**
 * Resolves a DateRangePickerProps.Value to absolute start/end Dates.
 */
function resolveTimeRange(
  value: DateRangePickerProps.Value
): { start: Date; end: Date } {
  if (value.type === "absolute") {
    return { start: new Date(value.startDate), end: new Date(value.endDate) };
  }
  // Relative range: compute from now
  const now = new Date();
  const start = new Date(now);
  const { amount, unit } = value;
  switch (unit) {
    case "second":
      start.setSeconds(start.getSeconds() - amount);
      break;
    case "minute":
      start.setMinutes(start.getMinutes() - amount);
      break;
    case "hour":
      start.setHours(start.getHours() - amount);
      break;
    case "day":
      start.setDate(start.getDate() - amount);
      break;
    case "week":
      start.setDate(start.getDate() - amount * 7);
      break;
    case "month":
      start.setMonth(start.getMonth() - amount);
      break;
    case "year":
      start.setFullYear(start.getFullYear() - amount);
      break;
  }
  return { start, end: now };
}

const DEFAULT_TIME_RANGE: DateRangePickerProps.Value = {
  type: "relative",
  amount: 24,
  unit: "hour",
};

/**
 * Serializes a DateRangePickerProps.Value to URL search params.
 */
function timeRangeToSearchParams(
  value: DateRangePickerProps.Value | null
): URLSearchParams {
  const params = new URLSearchParams();
  if (!value) return params;
  if (value.type === "relative") {
    params.set("rangeType", "relative");
    params.set("amount", String(value.amount));
    params.set("unit", value.unit);
  } else {
    params.set("rangeType", "absolute");
    params.set("start", value.startDate);
    params.set("end", value.endDate);
  }
  return params;
}

/**
 * Deserializes URL search params to a DateRangePickerProps.Value.
 * Returns null if params don't contain valid time range data.
 */
function searchParamsToTimeRange(
  params: URLSearchParams
): DateRangePickerProps.Value | null {
  const rangeType = params.get("rangeType");
  if (rangeType === "relative") {
    const amount = Number(params.get("amount"));
    const unit = params.get("unit") as DateRangePickerProps.RelativeValue["unit"];
    if (amount > 0 && unit) {
      return { type: "relative", amount, unit };
    }
  } else if (rangeType === "absolute") {
    const start = params.get("start");
    const end = params.get("end");
    if (start && end) {
      return { type: "absolute", startDate: start, endDate: end };
    }
  }
  return null;
}

function getColumnDefinitions(
  describingContactId: string | null
): TableProps.ColumnDefinition<ContactSummary>[] {
  return [
    {
      id: "contactId",
      header: "Contact ID",
      cell: (item) =>
        describingContactId === item.contactId ? (
          <StatusIndicator type="loading">
            {item.contactId}
          </StatusIndicator>
        ) : (
          item.contactId
        ),
    },
    {
      id: "timestamp",
      header: "Timestamp",
      cell: (item) =>
        item.initiationTimestamp
          ? item.initiationTimestamp.toLocaleString(undefined, {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "-",
    },
    {
      id: "duration",
      header: "Duration",
      cell: (item) =>
        formatDuration(item.initiationTimestamp, item.disconnectTimestamp),
    },
    {
      id: "channel",
      header: "Channel",
      cell: (item) => item.channel,
    },
    {
      id: "initiationMethod",
      header: "Initiation Method",
      cell: (item) => item.initiationMethod,
    },
  ];
}

export default function ContactsPage() {
  const { instance, region } = useWorkspace();
  const { credentials, refresh } = useCredentials();
  const { reportError } = useAppNotifications();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize time range from URL params, falling back to default
  const initialTimeRange = searchParamsToTimeRange(searchParams) ?? DEFAULT_TIME_RANGE;

  // Time range state
  const [timeRangeValue, setTimeRangeValue] =
    useState<DateRangePickerProps.Value | null>(initialTimeRange);

  // Search results state
  const [contacts, setContacts] = useState<ContactSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [flashItems, setFlashItems] = useState<FlashbarProps.MessageDefinition[]>([]);

  // Pagination state
  const [tokenStack, setTokenStack] = useState<(string | undefined)[]>([undefined]);
  const [currentPage, setCurrentPage] = useState(1);

  // Resolved absolute time range used for the current search (frozen for pagination)
  const [resolvedRange, setResolvedRange] = useState<{ start: Date; end: Date } | null>(null);

  // Contact describe (row click) state
  const [describingContactId, setDescribingContactId] = useState<string | null>(null);

  // Direct contact ID lookup
  const [directContactId, setDirectContactId] = useState("");

  // Abort controller for in-flight requests
  const abortRef = useRef<AbortController | null>(null);

  // Abort on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Builds a Flashbar item based on the classified error type.
   * Includes a retry button for throttled and generic errors.
   */
  const buildErrorFlash = useCallback(
    (
      err: unknown,
      id: string,
      retryFn: () => void
    ): FlashbarProps.MessageDefinition => {
      const errorType = classifyError(err);

      switch (errorType) {
        case "throttled":
          return {
            type: "error",
            content:
              "Request was rate-limited. The service is receiving too many requests. Please wait a moment and try again.",
            dismissible: true,
            id,
            onDismiss: () => setFlashItems([]),
            action: (
              <Button onClick={retryFn}>Retry</Button>
            ),
          };
        case "access-denied":
          return {
            type: "error",
            content:
              "You do not have permission to search contacts for this instance. Check your IAM permissions.",
            dismissible: false,
            id,
          };
        case "generic":
        default: {
          const name = err instanceof Error ? err.name : "Error";
          const message =
            err instanceof Error ? err.message : "An unexpected error occurred";
          return {
            type: "error",
            content: `${name}: ${message}`,
            dismissible: true,
            id,
            onDismiss: () => setFlashItems([]),
            action: (
              <Button onClick={retryFn}>Retry</Button>
            ),
          };
        }
      }
    },
    []
  );

  const performSearch = useCallback(
    async (rangeValue: DateRangePickerProps.Value) => {
      if (!credentials || !instance || !region) return;

      const { start, end } = resolveTimeRange(rangeValue);

      // Validate time range
      const validation = validateTimeRange(start, end);
      if (!validation.valid) {
        setFlashItems([
          {
            type: "error",
            content: validation.message,
            dismissible: true,
            id: "time-range-error",
            onDismiss: () => setFlashItems([]),
          },
        ]);
        return;
      }

      // Clear previous errors
      setFlashItems([]);

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);

      // Freeze the resolved time range for pagination consistency
      setResolvedRange({ start, end });

      try {
        const result: ContactSearchResult = await searchContacts({
          credentials,
          region,
          instanceId: instance.instanceId,
          startTime: start,
          endTime: end,
          maxResults: 100,
          nextToken: undefined,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setContacts(result.contacts);
        // Reset pagination on new search
        setTokenStack([undefined, result.nextToken]);
        setCurrentPage(1);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;

        const errorType = classifyError(err);

        // Handle credential expiry: refresh and retry once
        if (errorType === "expired-credentials") {
          try {
            await refresh();
            if (controller.signal.aborted) return;
            setLoading(false);
            setTimeout(() => {
              void performSearch(rangeValue);
            }, 0);
            return;
          } catch {
            if (controller.signal.aborted) return;
            // Refresh failed — report to app-level notification (shows re-auth button)
            reportError(err);
          }
        } else {
          // Report to app-level notification for access-denied etc.
          reportError(err);
          const retryFn = () => void performSearch(rangeValue);
          setFlashItems([buildErrorFlash(err, "search-error", retryFn)]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [credentials, instance, region, refresh, buildErrorFlash, reportError]
  );

  // Trigger search on mount when time range is present (from URL params or default).
  // The cleanup function aborts the request, making this safe under React StrictMode.
  useEffect(() => {
    if (!timeRangeValue || !credentials || !instance || !region) return;

    const { start, end } = resolveTimeRange(timeRangeValue);
    const validation = validateTimeRange(start, end);
    if (!validation.valid) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setFlashItems([]);

    // Freeze the resolved time range for pagination consistency
    setResolvedRange({ start, end });

    searchContacts({
      credentials,
      region,
      instanceId: instance.instanceId,
      startTime: start,
      endTime: end,
      maxResults: 100,
      nextToken: undefined,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) return;
        setContacts(result.contacts);
        setTokenStack([undefined, result.nextToken]);
        setCurrentPage(1);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        reportError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
    // Only run on mount (credentials/instance/region are stable once available)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTimeRangeChange: DateRangePickerProps["onChange"] = (event) => {
    const newValue = event.detail.value;
    setTimeRangeValue(newValue);

    // Sync time range to URL search params
    setSearchParams(timeRangeToSearchParams(newValue), { replace: true });

    if (newValue === null) {
      // Time range cleared — disable search, clear results, reset pagination
      setContacts([]);
      setTokenStack([undefined]);
      setCurrentPage(1);
      setFlashItems([]);
      setLoading(false);
      return;
    }

    // Trigger search on confirm
    void performSearch(newValue);
  };

  /**
   * Builds a pagination-specific error flash item.
   * Keeps the user on the current page with existing results.
   */
  const buildPaginationErrorFlash = useCallback(
    (err: unknown, retryFn: () => void): FlashbarProps.MessageDefinition => {
      const errorType = classifyError(err);

      switch (errorType) {
        case "throttled":
          return {
            type: "error",
            content:
              "Could not load the next page due to rate limiting. Please wait a moment and try again.",
            dismissible: true,
            id: "pagination-error",
            onDismiss: () => setFlashItems([]),
            action: (
              <Button onClick={retryFn}>Retry</Button>
            ),
          };
        case "access-denied":
          return {
            type: "error",
            content:
              "You do not have permission to search contacts for this instance. Check your IAM permissions.",
            dismissible: false,
            id: "pagination-error",
          };
        case "generic":
        default: {
          const name = err instanceof Error ? err.name : "Error";
          const message =
            err instanceof Error ? err.message : "Failed to load page";
          return {
            type: "error",
            content: `${name}: ${message}`,
            dismissible: true,
            id: "pagination-error",
            onDismiss: () => setFlashItems([]),
            action: (
              <Button onClick={retryFn}>Retry</Button>
            ),
          };
        }
      }
    },
    []
  );

  /**
   * Fetches a specific page of results. Extracted from handlePageChange
   * so it can be called directly for retries without needing a synthetic event.
   */
  const fetchPage = useCallback(
    (targetPageIndex: number) => {
      if (!credentials || !instance || !region || !resolvedRange) return;

      const isForward = targetPageIndex > currentPage;
      const token = isForward
        ? tokenStack[currentPage]
        : tokenStack[targetPageIndex - 1];

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const previousPage = currentPage;
      setLoading(true);
      setCurrentPage(targetPageIndex);

      searchContacts({
        credentials,
        region,
        instanceId: instance.instanceId,
        startTime: resolvedRange.start,
        endTime: resolvedRange.end,
        maxResults: 100,
        nextToken: token,
        signal: controller.signal,
      })
        .then((result) => {
          if (controller.signal.aborted) return;
          setContacts(result.contacts);
          if (isForward) {
            // Push the new nextToken onto the stack at position targetPageIndex
            setTokenStack((prev) => {
              const updated = [...prev];
              updated[targetPageIndex] = result.nextToken;
              return updated;
            });
          }
        })
        .catch(async (err: unknown) => {
          if (controller.signal.aborted) return;

          const errorType = classifyError(err);

          // Handle credential expiry during pagination
          if (errorType === "expired-credentials") {
            try {
              await refresh();
              if (controller.signal.aborted) return;
              // Revert page, then auto-retry
              setCurrentPage(previousPage);
              setLoading(false);
              fetchPage(targetPageIndex);
              return;
            } catch {
              if (controller.signal.aborted) return;
              reportError(err);
              setCurrentPage(previousPage);
            }
          } else {
            // On error, revert to previous page with existing results
            reportError(err);
            setCurrentPage(previousPage);
            const retryFn = () => fetchPage(targetPageIndex);
            setFlashItems([buildPaginationErrorFlash(err, retryFn)]);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false);
          }
        });
    },
    [credentials, instance, region, resolvedRange, tokenStack, currentPage, refresh, buildPaginationErrorFlash, reportError]
  );

  const handlePageChange = useCallback(
    (event: { detail: { currentPageIndex: number } }) => {
      fetchPage(event.detail.currentPageIndex);
    },
    [fetchPage]
  );

  const handleRowClick = useCallback(
    async (event: { detail: { item: ContactSummary } }) => {
      const { item } = event.detail;
      if (!credentials || !instance || !region) return;
      if (describingContactId) return; // Already describing a contact

      setDescribingContactId(item.contactId);
      setFlashItems([]);

      try {
        const result = await describeContact({
          credentials,
          region,
          instanceId: instance.instanceId,
          contactId: item.contactId,
        });

        if (result) {
          navigate(`/sessions/${item.contactId}`, {
            state: { sessionArn: result.sessionArn, aiAgents: result.aiAgents, channel: item.channel },
          });
        } else {
          setFlashItems([
            {
              type: "info",
              content:
                "This contact does not have an AI agent session. Only contacts handled by Amazon Connect AI Agents AI agents have execution traces.",
              dismissible: true,
              id: "no-ai-session",
              onDismiss: () => setFlashItems([]),
            },
          ]);
        }
      } catch (err: unknown) {
        const errorType = classifyError(err);

        // Handle credential expiry for describe contact
        if (errorType === "expired-credentials") {
          try {
            await refresh();
            // Retry the describe call once
            const retryResult = await describeContact({
              credentials: credentials!, // credentials may be stale in closure
              region,
              instanceId: instance.instanceId,
              contactId: item.contactId,
            });

            if (retryResult) {
              navigate(`/sessions/${item.contactId}`, {
                state: {
                  sessionArn: retryResult.sessionArn,
                  aiAgents: retryResult.aiAgents,
                  channel: item.channel,
                },
              });
            } else {
              setFlashItems([
                {
                  type: "info",
                  content:
                    "This contact does not have an AI agent session. Only contacts handled by Amazon Connect AI Agents AI agents have execution traces.",
                  dismissible: true,
                  id: "no-ai-session",
                  onDismiss: () => setFlashItems([]),
                },
              ]);
            }
          } catch (retryErr: unknown) {
            reportError(retryErr);
            const retryFlash = buildErrorFlash(
              retryErr,
              "describe-error",
              () => void handleRowClick({ detail: { item } })
            );
            setFlashItems([retryFlash]);
          }
        } else {
          reportError(err);
          const retryFn = () => void handleRowClick({ detail: { item } });
          setFlashItems([buildErrorFlash(err, "describe-error", retryFn)]);
        }
      } finally {
        setDescribingContactId(null);
      }
    },
    [credentials, instance, region, describingContactId, navigate, refresh, buildErrorFlash, reportError]
  );

  return (
    <SpaceBetween size="l">
      <Header variant="h1">Contacts</Header>

      <Flashbar items={flashItems} />

      <div style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}>
        <FormField label="Go to contact by ID" stretch={true}>
          <Input
            value={directContactId}
            onChange={({ detail }) => setDirectContactId(detail.value)}
            placeholder="Paste a contact ID (UUID)"
            onKeyDown={({ detail }) => {
              if (detail.key === "Enter" && directContactId.trim()) {
                navigate(`/sessions/${directContactId.trim()}`);
              }
            }}
          />
        </FormField>
        <Button
          variant="primary"
          disabled={!directContactId.trim()}
          onClick={() => navigate(`/sessions/${directContactId.trim()}`)}
        >
          Go
        </Button>
      </div>

      <DateRangePicker
        value={timeRangeValue}
        onChange={handleTimeRangeChange}
        relativeOptions={[
          { key: "1-hour", amount: 1, unit: "hour", type: "relative" },
          { key: "24-hours", amount: 24, unit: "hour", type: "relative" },
          { key: "7-days", amount: 7, unit: "day", type: "relative" },
          { key: "30-days", amount: 30, unit: "day", type: "relative" },
        ]}
        isValidRange={(value) => {
          if (!value) return { valid: false, errorMessage: "Select a time range" };
          const { start, end } = resolveTimeRange(value);
          const result = validateTimeRange(start, end);
          if (!result.valid) {
            return { valid: false, errorMessage: result.message };
          }
          return { valid: true };
        }}
        i18nStrings={{
          todayAriaLabel: "Today",
          nextMonthAriaLabel: "Next month",
          previousMonthAriaLabel: "Previous month",
          customRelativeRangeDurationLabel: "Duration",
          customRelativeRangeDurationPlaceholder: "Enter duration",
          customRelativeRangeOptionLabel: "Custom range",
          customRelativeRangeOptionDescription: "Set a custom range in the past",
          customRelativeRangeUnitLabel: "Unit of time",
          formatRelativeRange: (range) => `Last ${range.amount} ${range.unit}${range.amount > 1 ? "s" : ""}`,
          formatUnit: (unit, value) => (value === 1 ? unit : `${unit}s`),
          dateTimeConstraintText: "Range must be within 30 days and end time cannot be in the future.",
          relativeModeTitle: "Relative range",
          absoluteModeTitle: "Absolute range",
          relativeRangeSelectionHeading: "Choose a range",
          startDateLabel: "Start date",
          startTimeLabel: "Start time",
          endDateLabel: "End date",
          endTimeLabel: "End time",
          cancelButtonLabel: "Cancel",
          clearButtonLabel: "Clear",
          applyButtonLabel: "Apply",
        }}
        placeholder="Select a time range"
        showClearButton={true}
        rangeSelectorMode="default"
      />

      <div className="contacts-table-clickable">
        <style>{`
          .contacts-table-clickable table tbody tr {
            cursor: pointer;
          }
          .contacts-table-clickable table tbody tr:hover {
            background-color: var(--color-background-dropdown-item-hover, #f2f3f3);
          }
        `}</style>
        <Table
          columnDefinitions={getColumnDefinitions(describingContactId)}
          items={contacts}
          loading={loading}
          loadingText="Searching contacts..."
          onRowClick={handleRowClick}
          empty={
            <Box textAlign="center" color="inherit">
              <b>No contacts found</b>
              <Box padding={{ bottom: "s" }} variant="p" color="inherit">
                {timeRangeValue
                  ? "No contacts were found for the selected time range."
                  : "Select a time range to search for contacts."}
              </Box>
            </Box>
          }
          header={
            <Header
              counter={!loading && contacts.length > 0 ? `(${contacts.length}${tokenStack[currentPage] !== undefined ? "+" : ""})` : undefined}
              actions={
                <Button
                  iconName="refresh"
                  onClick={() => timeRangeValue && void performSearch(timeRangeValue)}
                  disabled={!timeRangeValue || loading}
                  ariaLabel="Refresh contacts"
                >
                  Refresh
                </Button>
              }
            >
              Search results
            </Header>
          }
          variant="full-page"
          stickyHeader={true}
          pagination={
            contacts.length > 0 || loading ? (
              <Pagination
                currentPageIndex={currentPage}
                openEnd={tokenStack[currentPage] !== undefined}
                pagesCount={currentPage}
                onChange={handlePageChange}
                disabled={loading}
                ariaLabels={{
                  nextPageLabel: "Next page",
                  previousPageLabel: "Previous page",
                  pageLabel: (pageNumber) => `Page ${pageNumber}`,
                }}
              />
            ) : undefined
          }
        />
      </div>
    </SpaceBetween>
  );
}

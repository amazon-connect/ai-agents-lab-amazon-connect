// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { useMemo, useState } from "react";

import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Multiselect from "@cloudscape-design/components/multiselect";
import Pagination from "@cloudscape-design/components/pagination";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import type { TableProps } from "@cloudscape-design/components/table";

import { useCollection } from "@cloudscape-design/collection-hooks";

import type { IterationResult } from "../test-harness/batch-types";
import type { TerminationReason } from "../test-harness/script-types";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface BatchResultsTableProps {
  /** Array of iteration results to display */
  iterations: IterationResult[];
  /** Whether the batch has finished executing */
  batchCompleted: boolean;
  /** Callback when a row is clicked (omit to disable row click) */
  onRowClick?: (result: IterationResult) => void;
  /** Callback for the export button */
  onExport: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

const TERMINATION_REASON_OPTIONS: Array<{
  label: string;
  value: TerminationReason | "failed";
}> = [
  { label: "Completed", value: "completed" },
  { label: "Exit Branch", value: "exit_branch" },
  { label: "Max Timeout", value: "max_timeout" },
  { label: "User Stopped", value: "user_stopped" },
  { label: "Failed", value: "failed" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderStatus(item: IterationResult) {
  if (item.status === "running" || item.status === "backoff") {
    return <Spinner size="normal" />;
  }
  if (item.status === "queued") {
    return <StatusIndicator type="pending">queued</StatusIndicator>;
  }
  if (item.terminationReason === "completed") {
    return <StatusIndicator type="success">completed</StatusIndicator>;
  }
  if (item.terminationReason === "failed") {
    return <StatusIndicator type="error">failed</StatusIndicator>;
  }
  // exit_branch, max_timeout, user_stopped
  return <StatusIndicator type="warning">{item.terminationReason}</StatusIndicator>;
}

function renderReason(item: IterationResult): string {
  if (item.status === "running" || item.status === "backoff") {
    return "running";
  }
  if (item.status === "queued") {
    return "queued";
  }
  return item.terminationReason ?? "—";
}

function renderDuration(item: IterationResult): string {
  if (item.status === "running" || item.status === "queued" || item.status === "backoff") {
    return "—";
  }
  return (item.durationMs / 1000).toFixed(1);
}

function renderTurns(item: IterationResult): string {
  return `${item.turnsCompleted}/${item.turnsTotal}`;
}

// ─── Column Definitions ──────────────────────────────────────────────────────

const COLUMN_DEFINITIONS: TableProps.ColumnDefinition<IterationResult>[] = [
  {
    id: "iterationNumber",
    header: "#",
    cell: (item) => item.iterationNumber,
    sortingField: "iterationNumber",
    width: 70,
  },
  {
    id: "status",
    header: "Status",
    cell: (item) => renderStatus(item),
    sortingComparator: (a, b) => {
      const order = { queued: 0, running: 1, backoff: 2, completed: 3, failed: 4 };
      return order[a.status] - order[b.status];
    },
    width: 140,
  },
  {
    id: "reason",
    header: "Reason",
    cell: (item) => renderReason(item),
    sortingComparator: (a, b) => {
      const reasonA = renderReason(a);
      const reasonB = renderReason(b);
      return reasonA.localeCompare(reasonB);
    },
    width: 130,
  },
  {
    id: "duration",
    header: "Duration",
    cell: (item) => renderDuration(item),
    sortingComparator: (a, b) => a.durationMs - b.durationMs,
    width: 100,
  },
  {
    id: "turns",
    header: "Turns",
    cell: (item) => renderTurns(item),
    sortingComparator: (a, b) => a.turnsCompleted - b.turnsCompleted,
    width: 90,
  },
  {
    id: "contactId",
    header: "Contact ID",
    cell: (item) => {
      if (!item.contactId) return "—";
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Button
            variant="inline-icon"
            iconName="copy"
            ariaLabel="Copy contact ID"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(item.contactId!);
            }}
          />
          {item.contactId}
        </div>
      );
    },
    sortingField: "contactId",
    width: 240,
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Displays batch iteration results in a sortable, filterable, paginated Cloudscape Table.
 * Supports row click to open transcript detail and export after batch completion.
 */
export default function BatchResultsTable({
  iterations,
  batchCompleted,
  onRowClick,
  onExport,
}: BatchResultsTableProps) {
  // ─── Filter State ────────────────────────────────────────────────────────

  const [selectedReasons, setSelectedReasons] = useState<
    Array<{ label: string; value: string }>
  >([]);

  // ─── Filtered Items ──────────────────────────────────────────────────────

  const filteredIterations = useMemo(() => {
    if (selectedReasons.length === 0) return iterations;
    const reasonValues = new Set(selectedReasons.map((r) => r.value));
    return iterations.filter((item) => {
      if (item.status === "running" || item.status === "queued" || item.status === "backoff") {
        return false;
      }
      return item.terminationReason != null && reasonValues.has(item.terminationReason);
    });
  }, [iterations, selectedReasons]);

  // ─── Collection Hook (sorting + pagination) ─────────────────────────────

  const { items, collectionProps, paginationProps } = useCollection(filteredIterations, {
    sorting: {
      defaultState: {
        sortingColumn: COLUMN_DEFINITIONS[0]!,
        isDescending: false,
      },
    },
    pagination: {
      pageSize: PAGE_SIZE,
    },
  });

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Table
      {...collectionProps}
      items={items}
      columnDefinitions={COLUMN_DEFINITIONS}
      variant="embedded"
      stripedRows
      onRowClick={onRowClick ? ({ detail }) => onRowClick(detail.item) : undefined}
      trackBy="iterationNumber"
      header={
        <Header
          counter={`(${filteredIterations.length})`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Multiselect
                selectedOptions={selectedReasons}
                onChange={({ detail }) =>
                  setSelectedReasons(
                    detail.selectedOptions as Array<{ label: string; value: string }>
                  )
                }
                options={TERMINATION_REASON_OPTIONS}
                placeholder="Filter by reason"
                hideTokens
              />
              {batchCompleted && (
                <Button variant="normal" iconName="download" onClick={onExport}>
                  Export Results
                </Button>
              )}
            </SpaceBetween>
          }
        >
          Results
        </Header>
      }
      pagination={
        filteredIterations.length > PAGE_SIZE ? (
          <Pagination {...paginationProps} />
        ) : undefined
      }
      empty="No iterations started yet."
    />
  );
}

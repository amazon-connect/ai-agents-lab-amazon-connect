// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  ListInstancesCommand,
} from "@aws-sdk/client-connect";
import { CONNECT_REGIONS } from "./regions";
import { withRetry, DEFAULT_RETRY_CONFIG } from "./retry";
import type { DiscoverInstancesOptions, InstanceSummary } from "./types";

/** Maximum number of pages to fetch per region. */
const MAX_PAGES_PER_REGION = 50;

/** Maximum results per page for ListInstances. */
const MAX_RESULTS_PER_PAGE = 10;

/** Timeout in milliseconds for each regional request. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Fetches all Connect instances for a single region with full pagination.
 * Wraps each paginated call with retry logic for throttling errors.
 * Annotates each instance with the source region.
 */
async function discoverRegion(
  region: string,
  options: DiscoverInstancesOptions
): Promise<InstanceSummary[]> {
  const { credentials, signal } = options;

  const client = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
    requestHandler: {
      requestTimeout: REQUEST_TIMEOUT_MS,
    } as never,
  });

  const instances: InstanceSummary[] = [];
  let nextToken: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_REGION; page++) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const response = await withRetry(
      () =>
        client.send(
          new ListInstancesCommand({
            MaxResults: MAX_RESULTS_PER_PAGE,
            NextToken: nextToken,
          }),
          { abortSignal: signal }
        ),
      DEFAULT_RETRY_CONFIG,
      signal
    );

    if (response.InstanceSummaryList) {
      for (const item of response.InstanceSummaryList) {
        instances.push({
          instanceId: item.Id ?? "",
          instanceAlias: item.InstanceAlias ?? "",
          arn: item.Arn ?? "",
          instanceStatus: item.InstanceStatus ?? "",
          region,
        });
      }
    }

    nextToken = response.NextToken ?? undefined;
    if (!nextToken) break;
  }

  return instances;
}

/**
 * Discovers Connect instances across all supported regions in parallel.
 *
 * - Creates a ConnectClient per region with 10s request timeout
 * - Paginates each region up to 50 pages (MaxResults: 10)
 * - Uses Promise.allSettled for parallel execution
 * - Calls onRegionComplete/onRegionError as each region settles
 * - Returns aggregated list sorted alphabetically by instanceAlias (case-insensitive)
 */
export async function discoverInstances(
  options: DiscoverInstancesOptions
): Promise<InstanceSummary[]> {
  const { onRegionComplete, onRegionError } = options;

  const regionPromises = CONNECT_REGIONS.map((region) =>
    discoverRegion(region, options).then(
      (instances) => {
        onRegionComplete?.(region, instances);
        return instances;
      },
      (err: unknown) => {
        const error =
          err instanceof Error ? err : new Error(String(err));
        onRegionError?.(region, error);
        return [] as InstanceSummary[];
      }
    )
  );

  const results = await Promise.allSettled(regionPromises);

  const allInstances: InstanceSummary[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allInstances.push(...result.value);
    }
  }

  allInstances.sort((a, b) =>
    a.instanceAlias.localeCompare(b.instanceAlias, undefined, {
      sensitivity: "base",
    })
  );

  return allInstances;
}

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * AWS regions where Amazon Connect is available.
 * Used by discoverInstances to query ListInstances in parallel across all regions.
 */
export const CONNECT_REGIONS = [
  "us-east-1",
  "us-west-2",
  "eu-west-2",
  "eu-central-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "ca-central-1",
  "af-south-1",
] as const;

export type ConnectRegion = (typeof CONNECT_REGIONS)[number];

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import {
  ConnectClient,
  DescribeContactCommand,
} from "@aws-sdk/client-connect";
import { S3Client, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { AWSCredentials } from "../credentials/types";
import type { TranscriptSegment, FetchTranscriptResult } from "./types";
import { withRetry, DEFAULT_RETRY_CONFIG } from "../workspace/retry";

export interface FetchTranscriptSegmentsParams {
  contactId: string;
  instanceId: string;
  credentials: AWSCredentials;
  region: string;
  signal?: AbortSignal;
}

/**
 * Fetches transcript segments for a contact from S3 (post-call Contact Lens JSON).
 *
 * Returns `{ status: "ready", segments }` when the S3 file is found.
 * Returns `{ status: "awaiting_analysis" }` when the S3 file is not yet available
 * (NoSuchKey/NotFound), indicating Contact Lens analysis is still in progress.
 */
export async function fetchTranscriptSegments(
  params: FetchTranscriptSegmentsParams
): Promise<FetchTranscriptResult> {
  const { contactId, instanceId, credentials, region, signal } = params;

  const connectClient = new ConnectClient({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  return fetchS3Segments(connectClient, contactId, instanceId, credentials, region, signal);
}

// ---------------------------------------------------------------------------
// S3 post-call path
// ---------------------------------------------------------------------------

/**
 * Fetches the post-call Contact Lens analysis JSON from S3.
 *
 * All the information needed to construct the S3 key comes from DescribeContact:
 * - Bucket: parsed from Recordings[].Location (e.g. "amazon-connect-xxxxxxxxxxxx/...")
 * - Channel: CHAT → "Chat", VOICE → "Voice"
 * - Date: from InitiationTimestamp
 * - Key pattern: Analysis/{Chat|Voice}/{YYYY}/{MM}/{DD}/{contactId}_analysis_{timestamp}.json
 */
async function fetchS3Segments(
  connectClient: ConnectClient,
  contactId: string,
  instanceId: string,
  credentials: AWSCredentials,
  region: string,
  signal?: AbortSignal
): Promise<FetchTranscriptResult> {
  if (signal?.aborted) throw new Error("Aborted");

  const describeResponse = await withRetry(
    () => connectClient.send(
      new DescribeContactCommand({ InstanceId: instanceId, ContactId: contactId }),
      { abortSignal: signal }
    ),
    DEFAULT_RETRY_CONFIG,
    signal
  );

  const contact = describeResponse.Contact;
  if (!contact) throw new Error("Contact not found");

  const initiationTimestamp = contact.InitiationTimestamp;
  if (!initiationTimestamp) throw new Error("Contact has no initiation timestamp");

  // Extract bucket from the first S3 recording location
  // e.g. "amazon-connect-xxxxxxxxxxxx/connect/my-instance-alias/ChatTranscripts/..."
  const recordingLocation = contact.Recordings?.find((r) => r.StorageType === "S3" && r.Location)?.Location;
  if (!recordingLocation) throw new Error("No S3 recording location found on contact");
  const bucket = recordingLocation.split("/")[0];
  if (!bucket) throw new Error("Could not parse bucket from recording location");

  const channel = contact.Channel ?? "CHAT";

  const date = new Date(initiationTimestamp);
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  // Timestamp in S3 key uses seconds precision with Z suffix
  const keyTimestamp = new Date(initiationTimestamp).toISOString().replace(/\.\d+Z$/, "Z");

  // Voice contacts from the test harness (WebRTC/IVR) land under Analysis/Voice/ivr/
  // Chat contacts land under Analysis/Chat/
  // Build candidate key prefixes to try in order
  const datePath = `${yyyy}/${mm}/${dd}`;
  const candidatePrefixes =
    channel === "VOICE"
      ? [`Analysis/Voice/ivr/${datePath}`, `Analysis/Voice/${datePath}`]
      : [`Analysis/Chat/${datePath}`];

  const exactKeys = candidatePrefixes.map(
    (p) => `${p}/${contactId}_analysis_${keyTimestamp}.json`
  );

  const s3Client = new S3Client({
    region,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
    },
  });

  if (signal?.aborted) throw new Error("Aborted");

  // Try exact keys first
  for (const key of exactKeys) {
    try {
      const s3Response = await withRetry(
        () => s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal }),
        DEFAULT_RETRY_CONFIG,
        signal
      );
      if (s3Response.Body) {
        const text = await s3Response.Body.transformToString("utf-8");
        return { status: "ready", segments: parseContactLensS3Json(text) };
      }
    } catch (err) {
      const name = err instanceof Error ? (err as { name?: string }).name ?? "" : "";
      if (name !== "NoSuchKey" && name !== "NotFound") throw err;
    }
  }

  // Prefix search fallback across all candidate prefixes
  for (const prefix of candidatePrefixes) {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `${prefix}/${contactId}_analysis_`, MaxKeys: 5 }),
      { abortSignal: signal }
    );
    const match = listResponse.Contents?.find(
      (obj) => obj.Key && obj.Key.endsWith(".json") && !obj.Key.includes("redacted")
    );
    if (match?.Key) {
      const s3Response = await withRetry(
        () => s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: match.Key! }), { abortSignal: signal }),
        DEFAULT_RETRY_CONFIG,
        signal
      );
      if (s3Response.Body) {
        const text = await s3Response.Body.transformToString("utf-8");
        return { status: "ready", segments: parseContactLensS3Json(text) };
      }
    }
  }

  // S3 file not found — Contact Lens analysis not yet available
  return { status: "awaiting_analysis" };
}

/**
 * Parses a Contact Lens post-call/post-chat analysis JSON file.
 * The file has a top-level "Transcript" array where each entry has:
 *   ParticipantId: "AGENT" | "CUSTOMER"
 *   Content: string
 *   BeginOffsetMillis: number  (voice; chat uses AbsoluteTime)
 *   AbsoluteTime?: string      (chat; ISO-8601 timestamp)
 */
export function parseContactLensS3Json(jsonText: string): TranscriptSegment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("Failed to parse Contact Lens S3 JSON");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Unexpected Contact Lens JSON structure");
  }

  const root = parsed as Record<string, unknown>;
  const transcript = root["Transcript"];

  if (!Array.isArray(transcript)) {
    throw new Error("Contact Lens JSON missing Transcript array");
  }

  const segments: TranscriptSegment[] = [];

  for (const turn of transcript) {
    if (typeof turn !== "object" || turn === null) continue;

    const t = turn as Record<string, unknown>;
    // Contact Lens S3 files use "ParticipantRole" (not "ParticipantId")
    const participantId = (t["ParticipantRole"] ?? t["ParticipantId"]) as string | undefined;
    const content = (t["Content"] as string | undefined ?? "").trim();

    // Skip events (join/leave/ended) — only process messages
    if (t["Type"] === "EVENT" || !content) continue;

    // Map ParticipantId to our ParticipantRole type
    const role =
      participantId === "AGENT"
        ? "AGENT"
        : participantId === "CUSTOMER"
        ? "CUSTOMER"
        : participantId === "SYSTEM"
        ? "SYSTEM"
        : null;

    if (!role) continue;

    // Chat contacts have AbsoluteTime; voice contacts have BeginOffsetMillis
    let timestamp = 0;
    if (typeof t["AbsoluteTime"] === "string") {
      timestamp = new Date(t["AbsoluteTime"] as string).getTime();
    } else if (typeof t["BeginOffsetMillis"] === "number") {
      timestamp = t["BeginOffsetMillis"] as number;
    }

    segments.push({ participantRole: role, displayText: content, timestamp });
  }

  segments.sort((a, b) => a.timestamp - b.timestamp);
  return segments;
}

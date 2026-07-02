// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type {
  RunScriptParams,
  ScriptRunnerCallbacks,
  ConversationTranscript,
  TurnTranscript,
  TerminationReason,
  ScriptTurn,
} from "./script-types";
import type { ChatClientCallbacks, ChatMessage, ChatSession } from "./chat-client";
import { startChat, sendMessage, disconnectChat } from "./chat-client";

/**
 * Pick one utterance from the pool (canonical + variations).
 * Pure random — no round-robin or even distribution.
 * When `useVariations` is false, or the turn has no variations, always returns the canonical.
 */
export function pickUtterance(turn: ScriptTurn, useVariations: boolean): string {
  if (!useVariations || !turn.variations?.length) return turn.customer;
  const pool = [turn.customer, ...turn.variations];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** Per-turn timeout in milliseconds (45 seconds). */
const TURN_TIMEOUT_MS = 45_000;

/**
 * Default settle duration in milliseconds.
 * After receiving the minimum expected responses, the runner waits this long
 * for additional agent messages before finalizing the turn. Mirrors the
 * voice runner's silence threshold concept.
 * Must be longer than typical inter-message gaps in multi-part agent responses (~3-4s).
 */
const DEFAULT_SETTLE_MS = 5_000;

/** Delay before sending a customer message (ms) to avoid racing the agent. */
const SEND_DELAY_MS = 750;

/**
 * Execute a test script sequentially.
 * Returns a promise that resolves with the complete transcript.
 * Pass an AbortSignal to support cancellation via the Stop button.
 */
export function runScript(
  params: RunScriptParams,
  callbacks: ScriptRunnerCallbacks,
  signal: AbortSignal
): Promise<ConversationTranscript> {
  const { script, agentArn, credentials, region, instanceId, contactFlowId } =
    params;
  const settleMs = params.settleDurationMs ?? DEFAULT_SETTLE_MS;

  return new Promise<ConversationTranscript>((resolve) => {
    const completedTurns: TurnTranscript[] = [];
    let currentTurnIndex = 0;
    let turnSendTimestamp: string | null = null;
    let turnTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let session: ChatSession | null = null;
    let resolved = false;
    let firstSendTimestamp: string | null = null;
    let lastEventTimestamp: string | null = null;
    let agentResponsesReceived = 0; // Count of agent messages received for current turn
    let turnAgentResponses: string[] = []; // Collect agent response texts for current turn
    let turnResponseTimestamps: number[] = []; // Date.now() for each agent message in current turn
    let firstTurnSent = false; // Whether the first customer message has been sent
    let lastUtterance = ""; // The utterance actually sent for the current turn
    let settleTimeoutId: ReturnType<typeof setTimeout> | null = null; // Settle timer for multi-response turns
    let settleStartedAt: number | null = null; // When the current settle timer started (for excluding from metrics)
    let totalSettleWaitMs = 0; // Accumulated settle wait time to subtract from totalDurationMs
    let awaitingCustomerSend = false; // True while sendNextTurn is in its SEND_DELAY, suppresses stale agent messages
    let sendGeneration = 0; // Increments each time sendNextTurn is called; used to detect rollbacks

    // Helper: build the final transcript and resolve
    function buildAndResolve(reason: TerminationReason): void {
      if (resolved) return;
      resolved = true;

      // Clear any pending timeout
      if (turnTimeoutId !== null) {
        clearTimeout(turnTimeoutId);
        turnTimeoutId = null;
      }

      // Clear any pending settle timer
      if (settleTimeoutId !== null) {
        clearTimeout(settleTimeoutId);
        settleTimeoutId = null;
      }

      // Disconnect the chat session (best-effort, for all termination reasons)
      if (session) {
        disconnectChat(session.connectionToken, region, credentials).catch(
          () => {
            // Best-effort; ignore errors
          }
        );
      }

      const turnsCompleted = completedTurns.length;
      const turnsTotal = script.turns.length;

      // Compute totalDurationMs (excluding settle wait time between turns)
      let totalDurationMs = 0;
      if (firstSendTimestamp && lastEventTimestamp) {
        totalDurationMs =
          Date.parse(lastEventTimestamp) - Date.parse(firstSendTimestamp) - totalSettleWaitMs;
      }

      const transcript: ConversationTranscript = {
        scriptName: script.name,
        agentArn,
        terminationReason: reason,
        totalDurationMs,
        turnsCompleted,
        turnsTotal,
        turns: completedTurns,
      };

      // Add stoppedAtIndex when terminated early
      if (reason !== "completed") {
        transcript.stoppedAtIndex = turnsCompleted;
      }

      callbacks.onComplete(transcript);
      resolve(transcript);
    }

    // Helper: start the per-turn timeout
    function startTurnTimeout(): void {
      if (turnTimeoutId !== null) {
        clearTimeout(turnTimeoutId);
      }
      turnTimeoutId = setTimeout(() => {
        console.warn(`[script-runner] ⏰ TIMEOUT turn=${currentTurnIndex} after ${TURN_TIMEOUT_MS}ms. Responses received: ${agentResponsesReceived}. Last event: ${lastEventTimestamp}`);
        // Update lastEventTimestamp to now for duration calculation
        lastEventTimestamp = new Date().toISOString();
        buildAndResolve("max_timeout");
      }, TURN_TIMEOUT_MS);
    }

    // Helper: finalize the current turn after the settle timer expires.
    // Computes latencies, builds transcript, and advances to the next turn.
    function finalizeTurn(): void {
      if (resolved) return;

      console.log(`[script-runner] ✓ settle done turn=${currentTurnIndex} responses=${agentResponsesReceived} lastEvent=${lastEventTimestamp}`);

      // Record how long the settle wait was (exclude from total duration)
      if (settleStartedAt !== null) {
        totalSettleWaitMs += Date.now() - settleStartedAt;
        settleStartedAt = null;
      }

      // Clear the hard timeout (turn is done)
      if (turnTimeoutId !== null) {
        clearTimeout(turnTimeoutId);
        turnTimeoutId = null;
      }

      const receiveTimestamp = lastEventTimestamp!;
      const latencyMs =
        Date.parse(receiveTimestamp) - Date.parse(turnSendTimestamp!);

      // Compute per-response latencies
      const sendMs = Date.parse(turnSendTimestamp!);
      const responseLatencies: number[] = turnResponseTimestamps.map((ts, idx) => {
        if (idx === 0) return ts - sendMs;
        return ts - turnResponseTimestamps[idx - 1]!;
      });

      // Build TurnTranscript (join multiple responses)
      const turnTranscript: TurnTranscript = {
        turnIndex: currentTurnIndex,
        customerUtterance: lastUtterance,
        agentResponse: turnAgentResponses.join("\n\n"),
        agentResponses: [...turnAgentResponses],
        sendTimestamp: turnSendTimestamp!,
        receiveTimestamp,
        latencyMs,
        responseLatencies,
      };

      completedTurns.push(turnTranscript);

      // Emit turn complete callback
      callbacks.onTurnComplete(turnTranscript);

      // Reset per-turn counters
      agentResponsesReceived = 0;
      turnAgentResponses = [];
      turnResponseTimestamps = [];

      // Advance to next turn or complete
      if (currentTurnIndex < script.turns.length - 1) {
        currentTurnIndex++;
        awaitingCustomerSend = true; // Suppress stale agent messages during SEND_DELAY
        sendGeneration++; // New generation for this send attempt
        sendNextTurn();
      } else {
        buildAndResolve("completed");
      }
    }

    // Helper: send the next turn's customer message
    async function sendNextTurn(): Promise<void> {
      if (resolved) return;

      const myGeneration = sendGeneration;
      const turn = script.turns[currentTurnIndex]!;

      // Emit progress
      callbacks.onProgress({
        currentTurn: currentTurnIndex + 1,
        totalTurns: script.turns.length,
        state: "running",
      });

      // Wait before sending to avoid racing the agent
      await new Promise((r) => setTimeout(r, SEND_DELAY_MS));
      if (resolved) return;

      // If a rollback happened during the sleep, abort this send attempt
      if (myGeneration !== sendGeneration) {
        console.log(`[script-runner] ✋ sendNextTurn aborted (generation ${myGeneration} → ${sendGeneration})`);
        return;
      }

      // Record send timestamp
      const sendTime = new Date().toISOString();
      turnSendTimestamp = sendTime;
      if (!firstSendTimestamp) {
        firstSendTimestamp = sendTime;
      }

      const utterance = pickUtterance(turn, params.useVariations ?? false);
      lastUtterance = utterance;

      try {
        await sendMessage(
          session!.connectionToken,
          utterance,
          region,
          credentials
        );

        // Customer message sent — now safe to process agent responses for this turn
        awaitingCustomerSend = false;
        console.log(`[script-runner] → sent turn=${currentTurnIndex} "${utterance.substring(0, 40)}" at ${new Date().toISOString()}`);

        // Emit customer message via callbacks (sendMessage doesn't do this)
        const customerMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: "customer",
          content: utterance,
          timestamp: new Date(),
        };
        callbacks.onMessage(customerMessage);
      } catch (error) {
        awaitingCustomerSend = false;
        // Treat send failure as timeout
        lastEventTimestamp = new Date().toISOString();
        buildAndResolve("max_timeout");
        return;
      }

      // Emit waiting state
      callbacks.onProgress({
        currentTurn: currentTurnIndex + 1,
        totalTurns: script.turns.length,
        state: "waiting_for_response",
      });

      // Start timeout for this turn
      startTurnTimeout();
    }

    // Set up ChatClientCallbacks to intercept WebSocket events
    const chatCallbacks: ChatClientCallbacks = {
      onStateChange: (state) => {
        if (state === "complete" || state === "error") {
          console.log(`[script-runner] 🔌 onStateChange=${state} turn=${currentTurnIndex} responses=${agentResponsesReceived}`);
          // EXIT_BRANCH detected — stop execution
          lastEventTimestamp = new Date().toISOString();
          buildAndResolve("exit_branch");
        }
      },

      onMessage: (message) => {
        if (resolved) return;

        if (message.role === "customer") {
          // Forward customer messages to the UI (e.g., initial message from startChat)
          callbacks.onMessage(message);
          return;
        }

        if (message.role === "agent") {
          // If we haven't sent the first customer message yet, this is the Lex greeting.
          // Forward it to the UI, then send the first turn (same as subsequent turns).
          if (!firstTurnSent) {
            callbacks.onMessage(message);
            firstTurnSent = true;
            sendNextTurn();
            return;
          }

          // Handle agent messages that arrive during the SEND_DELAY between turns.
          // These belong to the previous turn's multi-part response that arrived
          // after the settle timer fired. Roll back and restart the settle cycle.
          if (awaitingCustomerSend) {
            console.log(`[script-runner] ↩ late msg during SEND_DELAY, rolling back turn=${currentTurnIndex}: "${message.content.substring(0, 60)}..."`);
            
            // Invalidate the in-flight sendNextTurn
            sendGeneration++;
            
            // Pop the premature turn advancement — go back to the previous turn
            currentTurnIndex--;
            awaitingCustomerSend = false;
            
            // The previous finalizeTurn() already pushed a transcript entry — update it
            const prevTurn = completedTurns.pop();
            
            // Restore per-turn state from the popped transcript
            if (prevTurn) {
              turnAgentResponses = [...prevTurn.agentResponses];
              turnResponseTimestamps = []; // Can't restore exact timestamps, but settle logic only needs count
              turnSendTimestamp = prevTurn.sendTimestamp;
              agentResponsesReceived = prevTurn.agentResponses.length;
              lastUtterance = prevTurn.customerUtterance;
            }
            
            // Now process this message as a normal agent response on the restored turn
            // (fall through to the logic below)
          }

          // Clear the turn timeout (reset it — more responses may be coming)
          if (turnTimeoutId !== null) {
            clearTimeout(turnTimeoutId);
            turnTimeoutId = null;
          }

          // Clear any pending settle timer (new message arrived, reset the window)
          if (settleTimeoutId !== null) {
            clearTimeout(settleTimeoutId);
            console.log(`[script-runner] ↻ settle reset turn=${currentTurnIndex} (new msg #${agentResponsesReceived + 1})`);
            settleTimeoutId = null;
            settleStartedAt = null; // Reset — we'll start a new one below
          }

          // Record receive timestamp
          const receiveTimestamp = new Date().toISOString();
          lastEventTimestamp = receiveTimestamp;

          // Track this response
          agentResponsesReceived++;
          turnAgentResponses.push(message.content);
          turnResponseTimestamps.push(Date.now());

          // Forward message to UI immediately
          callbacks.onMessage(message);

          // Start (or restart) the settle timer.
          // If another message arrives within settleMs, we'll collect it and reset.
          // This replaces the old expectedResponses hard-gating — the agent's
          // message splitting is non-deterministic, so we always settle.
          settleStartedAt = Date.now();
          settleTimeoutId = setTimeout(() => {
            settleTimeoutId = null;
            finalizeTurn();
          }, settleMs);

          // Also keep the hard timeout as an outer safety net
          startTurnTimeout();
        }
      },

      onTypingStart: () => {
        if (!resolved) {
          // Reset the settle timer — agent is still processing, more messages may come
          if (settleTimeoutId !== null) {
            clearTimeout(settleTimeoutId);
            settleStartedAt = Date.now();
            settleTimeoutId = setTimeout(() => {
              settleTimeoutId = null;
              finalizeTurn();
            }, settleMs);
          }
          callbacks.onTypingStart();
        }
      },

      onTypingStop: () => {
        if (!resolved) {
          callbacks.onTypingStop();
        }
      },

      onError: (error) => {
        if (!resolved) {
          callbacks.onError(error);
        }
      },
    };

    // Handle AbortSignal for user-initiated stop
    function handleAbort(): void {
      if (resolved) return;

      // Update lastEventTimestamp for duration calculation
      lastEventTimestamp = new Date().toISOString();

      buildAndResolve("user_stopped");
    }

    if (signal.aborted) {
      // Already aborted before we started
      lastEventTimestamp = new Date().toISOString();
      firstSendTimestamp = lastEventTimestamp;
      buildAndResolve("user_stopped");
      return;
    }

    signal.addEventListener("abort", handleAbort, { once: true });

    // Start the chat session with NO initial message (Lex greeting will fire first)
    // Record the send timestamp for the first turn (will be set when we actually send it)
    turnSendTimestamp = null;

    // Emit progress for first turn
    callbacks.onProgress({
      currentTurn: 1,
      totalTurns: script.turns.length,
      state: "running",
    });

    startChat(
      {
        credentials,
        region,
        instanceId,
        contactFlowId,
        agentArn,
      },
      chatCallbacks
    )
      .then((chatSession) => {
        if (resolved) return;

        session = chatSession;
        callbacks.onSessionStart(chatSession.contactId);

        // The Lex greeting will arrive via WebSocket.
        // The onMessage handler calls sendNextTurn() when it receives it.
      })
      .catch((error) => {
        if (resolved) return;

        const errorMessage =
          error instanceof Error ? error.message : "Failed to start chat";
        callbacks.onError(errorMessage);

        // Treat startChat failure as timeout with 0 turns
        lastEventTimestamp = new Date().toISOString();
        buildAndResolve("max_timeout");
      });
  });
}

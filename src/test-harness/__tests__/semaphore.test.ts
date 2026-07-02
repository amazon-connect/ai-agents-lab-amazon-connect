// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from "vitest";
import { Semaphore } from "../semaphore";

describe("Semaphore", () => {
  it("allows immediate acquire when slots are available", async () => {
    const sem = new Semaphore(2);
    expect(sem.available).toBe(2);
    expect(sem.waiting).toBe(0);

    await sem.acquire();
    expect(sem.available).toBe(1);
    expect(sem.waiting).toBe(0);
  });

  it("queues acquire when all slots are occupied", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    let acquired = false;
    const pending = sem.acquire().then(() => {
      acquired = true;
    });

    // Should be queued, not yet resolved
    expect(sem.waiting).toBe(1);
    expect(acquired).toBe(false);

    sem.release();
    await pending;
    expect(acquired).toBe(true);
    expect(sem.waiting).toBe(0);
  });

  it("release resolves the next queued waiter in FIFO order", async () => {
    const sem = new Semaphore(1);
    await sem.acquire();

    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));

    expect(sem.waiting).toBe(2);

    sem.release();
    await p1;

    sem.release();
    await p2;

    expect(order).toEqual([1, 2]);
  });

  it("tracks available slots correctly through acquire/release cycles", async () => {
    const sem = new Semaphore(3);
    expect(sem.available).toBe(3);

    await sem.acquire();
    await sem.acquire();
    expect(sem.available).toBe(1);

    sem.release();
    expect(sem.available).toBe(2);

    sem.release();
    expect(sem.available).toBe(3);
  });

  it("throws on invalid limit", () => {
    expect(() => new Semaphore(0)).toThrow();
    expect(() => new Semaphore(-1)).toThrow();
    expect(() => new Semaphore(1.5)).toThrow();
  });

  it("handles concurrent acquire/release with multiple slots", async () => {
    const sem = new Semaphore(2);
    const results: string[] = [];

    await sem.acquire();
    await sem.acquire();

    const p1 = sem.acquire().then(() => results.push("a"));
    const p2 = sem.acquire().then(() => results.push("b"));

    expect(sem.waiting).toBe(2);
    expect(sem.available).toBe(0);

    sem.release();
    await p1;
    expect(results).toEqual(["a"]);

    sem.release();
    await p2;
    expect(results).toEqual(["a", "b"]);
  });
});

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * A counting semaphore for concurrency control.
 * Gates how many async operations can run simultaneously.
 */
export class Semaphore {
  private currentLimit: number;
  private running: number = 0;
  private readonly queue: Array<() => void> = [];

  constructor(limit: number) {
    if (limit < 1 || !Number.isInteger(limit)) {
      throw new Error("Semaphore limit must be a positive integer");
    }
    this.currentLimit = limit;
  }

  /** Acquire a slot. Resolves when a slot is available. */
  acquire(): Promise<void> {
    if (this.running < this.currentLimit) {
      this.running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /** Release a slot, allowing a queued acquire to proceed. */
  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      // Slot stays occupied — transfer to the next waiter
      next();
    } else {
      this.running--;
    }
  }

  /**
   * Resize the concurrency limit at runtime.
   *
   * Increasing the limit immediately drains queued waiters to fill the new slots.
   * Decreasing the limit takes effect gradually — active holders keep their slots
   * until they release, after which the lower limit is enforced.
   */
  resize(newLimit: number): void {
    if (newLimit < 1 || !Number.isInteger(newLimit)) {
      throw new Error("Semaphore limit must be a positive integer");
    }
    const oldLimit = this.currentLimit;
    this.currentLimit = newLimit;

    // If the limit increased, drain queued waiters into the new slots
    if (newLimit > oldLimit) {
      const slotsOpened = newLimit - oldLimit;
      for (let i = 0; i < slotsOpened && this.queue.length > 0; i++) {
        const next = this.queue.shift()!;
        this.running++;
        next();
      }
    }
  }

  /** Current concurrency limit. */
  get limit(): number {
    return this.currentLimit;
  }

  /** Current number of available slots. */
  get available(): number {
    return Math.max(0, this.currentLimit - this.running);
  }

  /** Current number of waiters in the queue. */
  get waiting(): number {
    return this.queue.length;
  }
}

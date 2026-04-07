/**
 * global concurrency semaphore for ffmpeg processes.
 * prevents CPU overload when multiple users download simultaneously.
 */

class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

// max 2 concurrent ffmpeg processes across all requests (reduced from 4 to prevent CPU overload)
export const ffmpegSemaphore = new Semaphore(2);

// max 1 concurrent tidal request globally — prevents multiple users from hammering tidal simultaneously
export const tidalSemaphore = new Semaphore(1);

// adds a random delay after each tidal request to look more human
export async function withTidalThrottle<T>(fn: () => Promise<T>): Promise<T> {
  return tidalSemaphore.run(async () => {
    const result = await fn();
    // small delay after each request
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 700));
    return result;
  });
}

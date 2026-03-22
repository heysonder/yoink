import { readFile, writeFile } from "fs/promises";
import { join } from "path";

const COUNTER_FILE = join(process.cwd(), ".download-count");

let count: number | null = null;
let dirty = false;

async function load(): Promise<number> {
  if (count !== null) return count;
  try {
    const data = await readFile(COUNTER_FILE, "utf-8");
    count = parseInt(data, 10) || 0;
  } catch {
    count = 0;
  }
  return count;
}

async function persist() {
  if (!dirty || count === null) return;
  try {
    await writeFile(COUNTER_FILE, String(count));
    dirty = false;
  } catch {
    // Best effort
  }
}

// Flush to disk every 10 seconds
setInterval(persist, 10_000);

export async function getDownloadCount(): Promise<number> {
  return load();
}

export async function incrementDownloads(n = 1): Promise<void> {
  await load();
  count! += n;
  dirty = true;
}

import { createHash } from "crypto";

interface PowSolution {
  challenge: string;
  nonce: number;
  hash: string;
  timestamp: number;
}

const DIFFICULTY = 16;
const MAX_AGE_MS = 30_000; // challenge must be solved within 30s

// Track used challenges to prevent replay
const usedChallenges = new Set<string>();

// Clean up old challenges every 5 minutes
setInterval(() => {
  usedChallenges.clear();
}, 5 * 60_000);

export function verifyProofOfWork(solution: PowSolution): boolean {
  // Check age
  if (Date.now() - solution.timestamp > MAX_AGE_MS) return false;

  // Check replay
  const key = `${solution.challenge}:${solution.nonce}`;
  if (usedChallenges.has(key)) return false;

  // Verify hash
  const input = `${solution.challenge}:${solution.nonce}`;
  const hash = createHash("sha256").update(input).digest("hex");
  if (hash !== solution.hash) return false;

  // Verify difficulty
  const hashBuffer = Buffer.from(hash, "hex");
  if (!hasLeadingZeroBits(hashBuffer, DIFFICULTY)) return false;

  // Mark as used
  usedChallenges.add(key);
  return true;
}

function hasLeadingZeroBits(hash: Buffer, bits: number): boolean {
  const fullBytes = Math.floor(bits / 8);
  const remainingBits = bits % 8;

  for (let i = 0; i < fullBytes; i++) {
    if (hash[i] !== 0) return false;
  }

  if (remainingBits > 0) {
    const mask = 0xff << (8 - remainingBits);
    if ((hash[fullBytes] & mask) !== 0) return false;
  }

  return true;
}

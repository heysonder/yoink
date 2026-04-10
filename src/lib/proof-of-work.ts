// Client-side proof-of-work challenge
// Browser must find a nonce that, combined with the challenge string,
// produces a SHA-256 hash starting with N zero bits.
// Difficulty 16 = ~1-2s on average, 18 = ~3-5s, 20 = ~10s+

export interface PowChallenge {
  challenge: string;
  difficulty: number;
  timestamp: number;
}

export interface PowSolution {
  challenge: string;
  nonce: number;
  hash: string;
  timestamp: number;
}

export function supportsProofOfWork(): boolean {
  return typeof globalThis.crypto?.getRandomValues === "function"
    && typeof globalThis.crypto?.subtle?.digest === "function";
}

export async function solveChallenge(
  challenge: PowChallenge,
  onProgress?: (attempts: number) => void
): Promise<PowSolution> {
  if (!supportsProofOfWork()) {
    throw new Error("proof-of-work is not supported in this browser");
  }

  const encoder = new TextEncoder();
  let nonce = 0;
  const target = challenge.difficulty;

  while (true) {
    const input = `${challenge.challenge}:${nonce}`;
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = new Uint8Array(hashBuffer);

    // Check if hash starts with enough zero bits
    if (hasLeadingZeroBits(hashArray, target)) {
      const hashHex = Array.from(hashArray)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return {
        challenge: challenge.challenge,
        nonce,
        hash: hashHex,
        timestamp: challenge.timestamp,
      };
    }

    nonce++;

    // Report progress every 1000 attempts
    if (onProgress && nonce % 1000 === 0) {
      onProgress(nonce);
      // Yield to UI thread so shimmer stays smooth
      await new Promise((r) => setTimeout(r, 0));
    }
  }
}

function hasLeadingZeroBits(hash: Uint8Array, bits: number): boolean {
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

export function generateChallenge(difficulty = 16): PowChallenge {
  if (!supportsProofOfWork()) {
    throw new Error("proof-of-work is not supported in this browser");
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const challenge = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return {
    challenge,
    difficulty,
    timestamp: Date.now(),
  };
}

export async function createProofOfWorkSolution(difficulty = 16): Promise<PowSolution | null> {
  if (!supportsProofOfWork()) return null;
  return solveChallenge(generateChallenge(difficulty));
}

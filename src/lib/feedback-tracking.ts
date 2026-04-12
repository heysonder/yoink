import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const TOKEN_VERSION = 1;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

interface FeedbackTrackingPayload {
  v: number;
  issueId: string;
  issuedAt: number;
}

function getTrackingSecret(): string {
  const secret = process.env.FEEDBACK_TRACKING_SECRET || process.env.LINEAR_API_KEY;
  if (!secret) throw new Error("FEEDBACK_TRACKING_SECRET or LINEAR_API_KEY is required");
  return secret;
}

function getTrackingKey(): Buffer {
  return createHash("sha256")
    .update(`yoink-feedback-tracking:${getTrackingSecret()}`)
    .digest();
}

export function createFeedbackTrackingToken(issueId: string): string {
  const payload = Buffer.from(JSON.stringify({ v: TOKEN_VERSION, issueId, issuedAt: Date.now() }), "utf8");
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getTrackingKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([TOKEN_VERSION]), iv, authTag, encrypted]).toString("base64url");
}

export function readFeedbackTrackingToken(token: string): FeedbackTrackingPayload | null {
  try {
    const packet = Buffer.from(token, "base64url");
    if (packet.length <= 1 + IV_LENGTH + AUTH_TAG_LENGTH) return null;
    if (packet[0] !== TOKEN_VERSION) return null;

    const ivStart = 1;
    const tagStart = ivStart + IV_LENGTH;
    const cipherStart = tagStart + AUTH_TAG_LENGTH;
    const iv = packet.subarray(ivStart, tagStart);
    const authTag = packet.subarray(tagStart, cipherStart);
    const encrypted = packet.subarray(cipherStart);

    const decipher = createDecipheriv("aes-256-gcm", getTrackingKey(), iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(decrypted) as FeedbackTrackingPayload;

    if (parsed.v !== TOKEN_VERSION || typeof parsed.issueId !== "string" || !parsed.issueId) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

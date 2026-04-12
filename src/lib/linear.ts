import { LinearClient } from "@linear/sdk";

export function getLinearClient(): LinearClient {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY is not configured");
  return new LinearClient({ apiKey });
}

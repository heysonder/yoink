const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(token: string, ip?: string): Promise<boolean> {
  if (!SECRET_KEY) return true; // skip verification if not configured

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: SECRET_KEY,
        response: token,
        ...(ip && { remoteip: ip }),
      }),
    });

    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}

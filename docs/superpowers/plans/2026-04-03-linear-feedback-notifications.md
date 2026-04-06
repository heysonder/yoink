# Linear Feedback Status Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone webhook service that emails feedback reporters when their Linear issue status changes to In Progress, In Review, Done, or Cancelled.

**Architecture:** A Hono app deployed on Vercel receives Linear webhooks, verifies signatures, filters for feedback project issues with tracked statuses, extracts the reporter email from the issue description, and sends branded catppuccin-styled emails via Resend.

**Tech Stack:** Hono, Resend, react-email + @react-email/components, TypeScript, Vercel

**Repo:** `heysonder/yoink-ops` (private) — `git@github.com:heysonder/yoink-ops.git`

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.env.example`
- Create: `.gitignore`

- [ ] **Step 1: Clone the repo and initialize the project**

```bash
git clone git@github.com:heysonder/yoink-ops.git
cd yoink-ops
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install hono resend @react-email/components react react-dom
npm install -D typescript @types/react @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create .env.example**

```
LINEAR_WEBHOOK_SECRET=
RESEND_API_KEY=
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
dist/
.env
.vercel/
```

- [ ] **Step 6: Create the src directory structure**

```bash
mkdir -p src/emails
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .env.example .gitignore
git commit -m "feat: project scaffolding with hono, resend, react-email"
```

---

### Task 2: Webhook signature verification

**Files:**
- Create: `src/verify.ts`

- [ ] **Step 1: Create src/verify.ts**

This module verifies Linear webhook signatures using HMAC-SHA256. Linear sends the signature in the `linear-signature` header as a hex string. We compute the HMAC of the raw request body using the webhook secret and compare using timing-safe comparison.

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const LINEAR_WEBHOOK_SECRET = process.env.LINEAR_WEBHOOK_SECRET;

export function verifyLinearSignature(signature: string | null, rawBody: string): boolean {
  if (!signature || !LINEAR_WEBHOOK_SECRET) return false;

  const expected = createHmac("sha256", LINEAR_WEBHOOK_SECRET)
    .update(rawBody)
    .digest();
  const actual = Buffer.from(signature, "hex");

  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/verify.ts
git commit -m "feat: linear webhook signature verification"
```

---

### Task 3: Email parser

**Files:**
- Create: `src/parse-email.ts`

- [ ] **Step 1: Create src/parse-email.ts**

Extracts the reporter email from a Linear issue description. The yoink feedback API writes emails in the format `**Reporter email:** user@example.com`.

```typescript
const EMAIL_PATTERN = /\*\*Reporter email:\*\*\s*(\S+@\S+\.\S+)/;

export function parseReporterEmail(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = description.match(EMAIL_PATTERN);
  return match ? match[1] : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/parse-email.ts
git commit -m "feat: parse reporter email from issue description"
```

---

### Task 4: Email templates — shared base layout

**Files:**
- Create: `src/emails/base.tsx`

- [ ] **Step 1: Create src/emails/base.tsx**

Shared layout component for all notification emails. Catppuccin Mocha palette, JetBrains Mono font, dark background with a surface0 card.

```tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Font,
} from "@react-email/components";
import * as React from "react";

const colors = {
  base: "#1e1e2e",
  surface0: "#313244",
  text: "#cdd6f4",
  subtext0: "#a6adc8",
  lavender: "#b4befe",
};

interface BaseEmailProps {
  children: React.ReactNode;
}

export function BaseEmail({ children }: BaseEmailProps) {
  return (
    <Html lang="en">
      <Head>
        <Font
          fontFamily="JetBrains Mono"
          fallbackFontFamily="monospace"
          webFont={{
            url: "https://fonts.gstatic.com/s/jetbrainsmono/v18/tDbY2o-flEEny0FZhsfKu5WU4zr3E_BX0PnT8RD8yKxjPVmUsaaDhw.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
      </Head>
      <Body
        style={{
          backgroundColor: colors.base,
          margin: 0,
          padding: "40px 0",
          fontFamily: "'JetBrains Mono', monospace",
        }}
      >
        <Container
          style={{
            maxWidth: "480px",
            margin: "0 auto",
            padding: "0 20px",
          }}
        >
          {/* wordmark */}
          <Text
            style={{
              color: colors.lavender,
              fontSize: "14px",
              fontWeight: 700,
              letterSpacing: "0.3em",
              textTransform: "uppercase" as const,
              textAlign: "center" as const,
              margin: "0 0 32px 0",
            }}
          >
            yoink
          </Text>

          {/* card */}
          <Section
            style={{
              backgroundColor: colors.surface0,
              borderRadius: "12px",
              padding: "32px",
            }}
          >
            {children}
          </Section>

          {/* footer */}
          <Text
            style={{
              color: colors.subtext0,
              fontSize: "12px",
              textAlign: "center" as const,
              margin: "32px 0 0 0",
              opacity: 0.6,
            }}
          >
            yoinkify.com
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export { colors };
```

- [ ] **Step 2: Commit**

```bash
git add src/emails/base.tsx
git commit -m "feat: base email layout with catppuccin mocha styling"
```

---

### Task 5: Email templates — status-specific emails

**Files:**
- Create: `src/emails/in-progress.tsx`
- Create: `src/emails/in-review.tsx`
- Create: `src/emails/done.tsx`
- Create: `src/emails/cancelled.tsx`

- [ ] **Step 1: Create src/emails/in-progress.tsx**

```tsx
import { Text } from "@react-email/components";
import * as React from "react";
import { BaseEmail, colors } from "./base";

interface InProgressEmailProps {
  title: string;
}

export function InProgressEmail({ title }: InProgressEmailProps) {
  return (
    <BaseEmail>
      <Text
        style={{
          color: colors.lavender,
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          margin: "0 0 16px 0",
        }}
      >
        in progress
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: "15px",
          lineHeight: "1.6",
          margin: "0 0 12px 0",
        }}
      >
        hey, we saw your report &ldquo;{title}&rdquo; and we&apos;re looking into it.
      </Text>
      <Text
        style={{
          color: colors.subtext0,
          fontSize: "13px",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        we&apos;ll let you know when there&apos;s an update.
      </Text>
    </BaseEmail>
  );
}
```

- [ ] **Step 2: Create src/emails/in-review.tsx**

```tsx
import { Text } from "@react-email/components";
import * as React from "react";
import { BaseEmail, colors } from "./base";

interface InReviewEmailProps {
  title: string;
}

export function InReviewEmail({ title }: InReviewEmailProps) {
  return (
    <BaseEmail>
      <Text
        style={{
          color: colors.lavender,
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          margin: "0 0 16px 0",
        }}
      >
        in review
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: "15px",
          lineHeight: "1.6",
          margin: "0 0 12px 0",
        }}
      >
        we&apos;ve got a fix for &ldquo;{title}&rdquo; and it&apos;s being tested now.
      </Text>
      <Text
        style={{
          color: colors.subtext0,
          fontSize: "13px",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        almost there.
      </Text>
    </BaseEmail>
  );
}
```

- [ ] **Step 3: Create src/emails/done.tsx**

```tsx
import { Text } from "@react-email/components";
import * as React from "react";
import { BaseEmail, colors } from "./base";

interface DoneEmailProps {
  title: string;
}

export function DoneEmail({ title }: DoneEmailProps) {
  return (
    <BaseEmail>
      <Text
        style={{
          color: colors.lavender,
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          margin: "0 0 16px 0",
        }}
      >
        resolved
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: "15px",
          lineHeight: "1.6",
          margin: "0 0 12px 0",
        }}
      >
        &ldquo;{title}&rdquo; has been resolved. thanks for letting us know.
      </Text>
      <Text
        style={{
          color: colors.subtext0,
          fontSize: "13px",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        your feedback helps make yoink better.
      </Text>
    </BaseEmail>
  );
}
```

- [ ] **Step 4: Create src/emails/cancelled.tsx**

```tsx
import { Text } from "@react-email/components";
import * as React from "react";
import { BaseEmail, colors } from "./base";

interface CancelledEmailProps {
  title: string;
}

export function CancelledEmail({ title }: CancelledEmailProps) {
  return (
    <BaseEmail>
      <Text
        style={{
          color: colors.lavender,
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.2em",
          textTransform: "uppercase" as const,
          margin: "0 0 16px 0",
        }}
      >
        update
      </Text>
      <Text
        style={{
          color: colors.text,
          fontSize: "15px",
          lineHeight: "1.6",
          margin: "0 0 12px 0",
        }}
      >
        we looked at &ldquo;{title}&rdquo; but decided not to move forward with it right now.
      </Text>
      <Text
        style={{
          color: colors.subtext0,
          fontSize: "13px",
          lineHeight: "1.5",
          margin: 0,
        }}
      >
        thanks for taking the time to report it.
      </Text>
    </BaseEmail>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/emails/in-progress.tsx src/emails/in-review.tsx src/emails/done.tsx src/emails/cancelled.tsx
git commit -m "feat: status notification email templates"
```

---

### Task 6: Hono webhook route

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Create src/index.ts**

The main app — a Hono server with a single POST route that handles Linear webhooks. It verifies the signature, filters for feedback project issues with tracked statuses, extracts the reporter email, and sends the appropriate email via Resend.

```typescript
import { Hono } from "hono";
import { handle } from "hono/vercel";
import { Resend } from "resend";
import { verifyLinearSignature } from "./verify";
import { parseReporterEmail } from "./parse-email";
import { InProgressEmail } from "./emails/in-progress";
import { InReviewEmail } from "./emails/in-review";
import { DoneEmail } from "./emails/done";
import { CancelledEmail } from "./emails/cancelled";
import React from "react";

const FEEDBACK_PROJECT = "External Feedback Intake + Linear Triage";
const FROM_ADDRESS = "yoink <noreply@yoinkify.com>";

const STATUS_CONFIG: Record<string, {
  subject: (title: string) => string;
  template: (title: string) => React.ReactElement;
}> = {
  "in progress": {
    subject: (title) => `your feedback is being looked at — yoink`,
    template: (title) => InProgressEmail({ title }),
  },
  "in review": {
    subject: (title) => `a fix is being tested — yoink`,
    template: (title) => InReviewEmail({ title }),
  },
  "done": {
    subject: (title) => `your feedback was addressed — yoink`,
    template: (title) => DoneEmail({ title }),
  },
  "cancelled": {
    subject: (title) => `update on your feedback — yoink`,
    template: (title) => CancelledEmail({ title }),
  },
};

interface WebhookPayload {
  action: string;
  type: string;
  data: {
    id: string;
    title: string;
    description?: string;
    state?: { name: string; type: string };
    project?: { name: string };
  };
  updatedFrom?: Record<string, unknown>;
  webhookTimestamp: number;
}

const app = new Hono().basePath("/api");

app.post("/webhooks/linear", async (c) => {
  const rawBody = await c.req.text();

  // verify signature
  const signature = c.req.header("linear-signature");
  if (!verifyLinearSignature(signature ?? null, rawBody)) {
    console.warn("[webhook] invalid signature");
    return c.json({ error: "invalid signature" }, 401);
  }

  const payload: WebhookPayload = JSON.parse(rawBody);

  // reject replay attacks (60s window)
  if (Math.abs(Date.now() - payload.webhookTimestamp) > 60_000) {
    console.warn("[webhook] stale timestamp");
    return c.json({ error: "stale timestamp" }, 401);
  }

  // only handle issue updates where state changed
  if (payload.type !== "Issue" || payload.action !== "update") {
    return c.json({ ok: true });
  }
  if (!payload.updatedFrom || !("stateId" in payload.updatedFrom)) {
    return c.json({ ok: true });
  }

  // only handle feedback project issues
  if (payload.data.project?.name !== FEEDBACK_PROJECT) {
    return c.json({ ok: true });
  }

  // check if this is a tracked status
  const statusName = payload.data.state?.name?.toLowerCase();
  if (!statusName || !(statusName in STATUS_CONFIG)) {
    return c.json({ ok: true });
  }

  // extract reporter email
  const email = parseReporterEmail(payload.data.description);
  if (!email) {
    console.info(`[webhook] no reporter email on issue ${payload.data.id}`);
    return c.json({ ok: true });
  }

  // send email
  const config = STATUS_CONFIG[statusName];
  const resend = new Resend(process.env.RESEND_API_KEY);

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: config.subject(payload.data.title),
      react: config.template(payload.data.title),
    });

    if (error) {
      console.error(`[webhook] resend error for issue ${payload.data.id}:`, error);
    } else {
      console.info(`[webhook] sent ${statusName} email to ${email} for "${payload.data.title}"`);
    }
  } catch (err) {
    console.error(`[webhook] failed to send email for issue ${payload.data.id}:`, err);
  }

  return c.json({ ok: true });
});

// health check
app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
export const GET = handle(app);
export const POST = handle(app);
```

- [ ] **Step 2: Commit**

```bash
git add src/index.ts
git commit -m "feat: linear webhook route with status filtering and email dispatch"
```

---

### Task 7: Vercel deployment config

**Files:**
- Create: `api/index.ts` (Vercel entry point that re-exports the Hono app)

- [ ] **Step 1: Create api/index.ts**

Vercel expects the entry point in `api/`. This file re-exports the Hono app handles.

```typescript
export { GET, POST } from "../src/index";
```

- [ ] **Step 2: Update package.json scripts**

Add a build script and set the module type. In `package.json`, ensure these fields are set:

```json
{
  "type": "module",
  "scripts": {
    "dev": "vercel dev",
    "build": "tsc"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add api/index.ts package.json
git commit -m "feat: vercel deployment entry point"
```

---

### Task 8: Deploy and configure

- [ ] **Step 1: Deploy to Vercel**

```bash
vercel deploy
```

Link to the `heysonder` team / create a new project called `yoink-ops`.

- [ ] **Step 2: Set environment variables on Vercel**

```bash
vercel env add LINEAR_WEBHOOK_SECRET
vercel env add RESEND_API_KEY
```

Enter the values when prompted.

- [ ] **Step 3: Redeploy with env vars**

```bash
vercel deploy --prod
```

- [ ] **Step 4: Test the health endpoint**

```bash
curl https://<deployed-url>/api/health
```

Expected: `{"status":"ok"}`

- [ ] **Step 5: Configure Linear webhook**

1. Go to Linear Settings → API → Webhooks
2. Create a new webhook:
   - **Label**: yoink-ops feedback notifications
   - **URL**: `https://<deployed-url>/api/webhooks/linear`
   - **Events**: select "Issues" (or "Data changes" → "Issues")
   - Copy the **Signing secret** and make sure it matches the `LINEAR_WEBHOOK_SECRET` env var you set

- [ ] **Step 6: Test end-to-end**

1. Find an existing feedback issue in Linear (in the "External Feedback Intake + Linear Triage" project) that has a reporter email in the description
2. Move it to "In Progress"
3. Check the reporter's inbox (or your test email) for the notification
4. Verify the email renders correctly with catppuccin styling

- [ ] **Step 7: Commit any final adjustments and push**

```bash
git push origin main
```

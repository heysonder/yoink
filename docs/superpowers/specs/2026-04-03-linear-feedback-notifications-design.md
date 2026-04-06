# Linear Feedback Status Notifications

Standalone webhook service that emails feedback reporters when their yoink feedback issue changes status in Linear.

## Context

yoink has a public `/feedback` page that creates Linear issues in the yoinkify team. When a reporter provides their email, it's embedded in the issue description as `**Reporter email:** user@example.com`. This service listens for status changes on those issues and sends branded notification emails.

This lives in a **separate private repo** (`heysonder/yoink-ops`) to keep yoink's open-source codebase clean for self-hosters.

## Tech Stack

- **Hono** — lightweight web framework (single webhook endpoint)
- **Resend** — email delivery (free tier: 3,000/month, 100/day)
- **react-email** + `@react-email/components` — branded email templates
- **TypeScript**
- Deployed on **Vercel** (or any Node.js host)

## Architecture

```
Linear (issue status change)
  → POST /api/webhooks/linear
    → verify webhook signature
    → filter: is this a feedback project issue?
    → filter: is this a status we care about?
    → parse reporter email from issue description
    → send branded email via Resend
    → return 200
```

## Repo Structure

```
yoink-ops/
├── src/
│   ├── index.ts              — hono app, webhook route
│   ├── verify.ts             — linear webhook signature verification
│   ├── parse-email.ts        — extract reporter email from issue body
│   └── emails/
│       ├── base.tsx          — shared layout (catppuccin mocha styling)
│       ├── in-progress.tsx
│       ├── in-review.tsx
│       ├── done.tsx
│       └── cancelled.tsx
├── package.json
├── tsconfig.json
└── .env.example
```

## Webhook Handler

`POST /api/webhooks/linear`

### Flow

1. **Verify signature** — Linear signs webhooks with `LINEAR_WEBHOOK_SECRET`. Reject with 401 if invalid.
2. **Filter event type** — only act on `Issue` update events where the `state` field changed.
3. **Check project** — only process issues belonging to the "External Feedback Intake + Linear Triage" project.
4. **Check status** — only fire on these four statuses:
   - In Progress
   - In Review
   - Done
   - Cancelled
5. **Extract email** — regex parse `**Reporter email:** <email>` from the issue description. If no email found, log and return 200 (no-op).
6. **Send email** — call Resend with the appropriate template, including the issue title for context.
7. **Return 200** — always return 200 to prevent Linear retry storms. Log errors internally.

### Webhook Payload

Linear sends `Issue` update webhooks with this shape (relevant fields):

```json
{
  "action": "update",
  "type": "Issue",
  "data": {
    "id": "...",
    "title": "...",
    "description": "...",
    "state": { "name": "In Progress", "type": "started" },
    "project": { "name": "External Feedback Intake + Linear Triage" }
  },
  "updatedFrom": {
    "stateId": "previous-state-id"
  }
}
```

### Signature Verification

Linear signs webhooks using HMAC SHA-256. The signature is in the `linear-signature` header. Verify by computing `HMAC-SHA256(body, LINEAR_WEBHOOK_SECRET)` and comparing.

## Email Templates

### Shared Layout (`base.tsx`)

Catppuccin Mocha palette:
- Background: `#1e1e2e` (base)
- Card/container: `#313244` (surface0)
- Text: `#cdd6f4` (text)
- Subtext: `#a6adc8` (subtext0)
- Accent: `#b4befe` (lavender)
- Font: JetBrains Mono (with system monospace fallback)

Structure:
- yoink wordmark at top (text, not image — keeps it simple)
- Main content area
- Footer: "yoinkify.com" in subtext

### Email Content

| Status | Subject | Message |
|--------|---------|---------|
| In Progress | your feedback is being looked at — yoink | hey, we saw your report "{title}" and we're looking into it. |
| In Review | a fix is being tested — yoink | we've got a fix for "{title}" and it's being tested now. |
| Done | your feedback was addressed — yoink | "{title}" has been resolved. thanks for letting us know. |
| Cancelled | update on your feedback — yoink | we looked at "{title}" but decided not to move forward with it right now. thanks for taking the time to report it. |

Tone: lowercase, casual, honest — matches yoink's voice.

No links to Linear (reporters don't have access). No reply-to. From: `noreply@yoinkify.com`.

## Email Parsing

The existing yoink feedback API route writes emails into the issue description in this format:

```markdown
---
**Reporter email:** user@example.com
```

Regex to extract: `/\*\*Reporter email:\*\*\s*(\S+@\S+\.\S+)/`

If no match, skip silently (the email field is optional on the feedback form).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LINEAR_WEBHOOK_SECRET` | Secret for verifying Linear webhook signatures |
| `RESEND_API_KEY` | Resend API key for sending emails |

### `.env.example`

```
LINEAR_WEBHOOK_SECRET=
RESEND_API_KEY=
```

## Linear Setup

1. Go to Linear Settings → API → Webhooks
2. Create webhook:
   - **URL**: `https://<deployed-url>/api/webhooks/linear`
   - **Events**: Issue updates
   - **Secret**: generate and store as `LINEAR_WEBHOOK_SECRET`

## Resend Setup

1. Create account at resend.com
2. Add and verify `yoinkify.com` domain (requires DNS records: SPF, DKIM)
3. Generate API key, store as `RESEND_API_KEY`

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid signature | Return 401, log warning |
| Not a feedback project issue | Return 200, no-op |
| Status not in tracked list | Return 200, no-op |
| No reporter email in description | Return 200, log info |
| Resend API failure | Return 200, log error (don't block Linear) |

No retries in v1. If an email fails to send, it's logged but not critical.

## Out of Scope

- Custom reply handling (reporters can't reply to notifications)
- Unsubscribe mechanism (low volume, not needed yet)
- Multiple email addresses per issue
- Email templates configurable via UI
- Notification preferences for reporters

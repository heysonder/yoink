# Feedback Intake Page Design

Public feedback and bug report intake page for yoinkify.com that creates issues in Linear, replacing email-based intake.

## Route

`/feedback` — top-level public route, same tier as `/roadmap`, `/status`, `/terms`.

## Architecture

**Server component page** (`src/app/feedback/page.tsx`) renders the static shell. A **client component** (`src/components/FeedbackForm.tsx`) handles form state, validation, image upload, and submission. The form POSTs to a new **API route** (`src/app/api/feedback/route.ts`).

This follows the existing pattern in the codebase: server-rendered page shell + client island for interactivity + API route for backend logic.

## Page Structure

Matches the existing page pattern (see `/roadmap`):

1. **`bg-grid` wrapper** — dot grid background
2. **Header** — reuse `Header` component (sticky nav, status dot + yoink wordmark, "open app" CTA)
3. **Hero section** — `max-w-2xl mx-auto`, `animate-fade-in-up` entrance
   - Eyebrow: `"feedback"` in lavender uppercase tracking
   - Headline: e.g. "tell us what's broken. or what's missing."
   - Subhead: brief explanation in `subtext0`
4. **Divider** — `border-t border-surface0/40`
5. **Form section** — `FeedbackForm` client component
6. **Footer** — same footer as roadmap

## Visual Style

Full yoinkify aesthetic — Catppuccin Mocha palette, JetBrains Mono, dot grid background, `animate-fade-in-up` staggered entrances, `input-glow` focus rings, `btn-press` button effects. No visual departure from the existing site.

## FeedbackForm Component

`"use client"` component at `src/components/FeedbackForm.tsx`.

### Fields

1. **Report type** — `<select>` dropdown: "Bug Report" / "Feature Request". Styled with `surface0` background, `input-glow` on focus.
2. **Title** — single-line text input, required. Placeholder adapts to report type: "what's broken?" for bugs, "what's missing?" for features.
3. **Description** — `<textarea>`, required, ~4 rows default, resizable. Placeholder: "tell us more...". Character counter appears after 4000 chars, max 5000.
4. **Email** — optional text input. Placeholder: "email (optional, for follow-up)".
5. **Image upload** — drag-and-drop zone + click-to-browse. Dashed `surface0` border, `lavender` highlight on dragover. Shows inline image preview with filename, size, and a remove button after selection. Max 1 image, 5MB cap, image MIME types only (png, jpg, gif, webp).

### Input Styling

All inputs share: `bg-surface0/50 border border-surface0 rounded-lg px-4 py-3 text-sm text-text placeholder:text-overlay0 input-glow focus:outline-none focus:border-lavender/50`. Consistent with existing `SpotifyInput` patterns.

### Submit Button

Full-width, `bg-lavender hover:bg-mauve text-crust`, uppercase tracking, `btn-press` effect. Disabled state during submission shows `loading-dot` animation (reusing existing CSS pattern).

### Success State

Form content replaced with a centered success message:
- Green dot indicator
- "submitted" heading
- "we'll take a look" subtext
- "submit another" ghost button (`border-lavender/30`) that resets the form

### Validation

Inline, shown on blur and on submit attempt. Red text (`text-red`) below invalid fields. No external validation library — local component state only.

- Title: required
- Description: required, max 5000 characters
- Email: optional, basic format validation if provided
- Image: max 5MB, image MIME types only

## API Route

`POST /api/feedback` at `src/app/api/feedback/route.ts`.

### Request

`FormData` containing:
- `type` — "bug" or "feature" (required)
- `title` — string (required)
- `description` — string (required)
- `email` — string (optional)
- `image` — File (optional)

### Flow

1. Validate payload (type, title, description required; email format if present; image size/type)
2. If image attached: upload to Linear via attachment API, get URL
3. Create Linear issue in yoinkify team:
   - **Title**: from form
   - **Description**: markdown-formatted — user description + reporter email section (if provided) + image link (if provided)
   - **Label**: `Bug` or `Feature Request` based on type
   - **Project**: External Feedback Intake + Linear Triage
   - **State**: triage
4. Return JSON response: `{ success: true }` or `{ error: "message" }`

### Rate Limiting

5 submissions per IP per minute, using the existing `ratelimit.ts` pattern.

### Environment

New `LINEAR_API_KEY` environment variable for the Linear API token.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Network/server failure | Inline error below submit button: "something went wrong. try again." Button re-enables. |
| Validation errors | Per-field red text on blur and submit |
| Rate limited (429) | "slow down — try again in a minute." |
| Image upload fails | Create issue without image. Success state notes: "submitted (image upload failed)." |

## Dependencies

- `@linear/sdk` npm package for Linear API calls (typed, simpler than raw GraphQL)

- Existing: `ratelimit.ts` for rate limiting

## Linear Integration Details

- **Team**: yoinkify (YK)
- **Project**: External Feedback Intake + Linear Triage
- **Labels**: `Bug`, `Feature Request` (must exist or be created in Linear)
- **Initial state**: triage
- Reporter email stored in issue description body, not a custom field

## Out of Scope

- Reporter notification when issues are resolved (future consideration per Linear project spec)
- Duplicate detection (handled manually during triage)
- CAPTCHA or advanced spam protection beyond rate limiting (v1 scope)
- Multiple image uploads

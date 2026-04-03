# Feedback Intake Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public `/feedback` page that lets external users submit bug reports and feature requests, creating issues in Linear's yoinkify team.

**Architecture:** Server component page renders the static shell (Header, hero, footer). A `"use client"` FeedbackForm component handles form state, validation, drag-and-drop image upload, and submission. A `POST /api/feedback` route validates input, uploads images to Linear, and creates issues via the `@linear/sdk`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS 4, `@linear/sdk`, existing `ratelimit.ts`

**Spec:** `docs/superpowers/specs/2026-04-02-feedback-intake-page-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/app/feedback/page.tsx` | Server component — Header, hero, FeedbackForm island, footer |
| Create | `src/components/FeedbackForm.tsx` | Client component — form state, validation, image preview, submission |
| Create | `src/app/api/feedback/route.ts` | API route — validate, upload image, create Linear issue |
| Modify | `package.json` | Add `@linear/sdk` dependency |
| Modify | `.env.example` | Add `LINEAR_API_KEY` |

---

### Task 1: Install Linear SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `@linear/sdk`**

Run:
```bash
npm install @linear/sdk
```

- [ ] **Step 2: Add `LINEAR_API_KEY` to `.env.example`**

Add to the end of `.env.example`:
```
LINEAR_API_KEY=
```

- [ ] **Step 3: Add `LINEAR_API_KEY` to local `.env`**

Add your actual Linear API key to `.env` (not committed). Create a Personal API key at https://linear.app/settings/api.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "feat: add @linear/sdk dependency and LINEAR_API_KEY env var"
```

---

### Task 2: Build the API Route

**Files:**
- Create: `src/app/api/feedback/route.ts`

- [ ] **Step 1: Create the API route**

Create `src/app/api/feedback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { LinearClient } from "@linear/sdk";
import { rateLimit } from "@/lib/ratelimit";

const TEAM_KEY = "YK";
const PROJECT_NAME = "External Feedback Intake + Linear Triage";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function getLinearClient(): LinearClient {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) throw new Error("LINEAR_API_KEY is not configured");
  return new LinearClient({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limit
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const { allowed, retryAfter } = rateLimit(`feedback:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json(
        { error: `slow down — try again in ${retryAfter}s`, rateLimit: true },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const formData = await request.formData();
    const type = formData.get("type") as string | null;
    const title = formData.get("title") as string | null;
    const description = formData.get("description") as string | null;
    const email = formData.get("email") as string | null;
    const image = formData.get("image") as File | null;

    // Validate required fields
    if (!type || !["bug", "feature"].includes(type)) {
      return NextResponse.json({ error: "valid report type is required" }, { status: 400 });
    }
    if (!title?.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!description?.trim()) {
      return NextResponse.json({ error: "description is required" }, { status: 400 });
    }
    if (description.length > 5000) {
      return NextResponse.json({ error: "description is too long (max 5000 characters)" }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid email format" }, { status: 400 });
    }

    // Validate image if provided
    if (image) {
      if (!ALLOWED_IMAGE_TYPES.includes(image.type)) {
        return NextResponse.json({ error: "image must be png, jpg, gif, or webp" }, { status: 400 });
      }
      if (image.size > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: "image must be under 5MB" }, { status: 400 });
      }
    }

    const client = getLinearClient();

    // Find the yoinkify team
    const teams = await client.teams();
    const team = teams.nodes.find((t) => t.key === TEAM_KEY);
    if (!team) {
      console.error("[feedback] yoinkify team not found");
      return NextResponse.json({ error: "internal configuration error" }, { status: 500 });
    }

    // Find triage state
    const states = await team.states();
    const triageState = states.nodes.find((s) => s.name.toLowerCase() === "triage");

    // Find or note missing labels
    const labels = await team.labels();
    const labelName = type === "bug" ? "Bug" : "Feature Request";
    const label = labels.nodes.find((l) => l.name === labelName);

    // Find project
    const projects = await client.projects({ filter: { name: { eq: PROJECT_NAME } } });
    const project = projects.nodes[0];

    // Upload image if provided
    let imageUrl: string | null = null;
    let imageUploadFailed = false;
    if (image) {
      try {
        const arrayBuffer = await image.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const uploadPayload = await client.fileUpload(image.type, image.name, image.size);
        const uploadUrl = uploadPayload.uploadFile?.uploadUrl;
        const assetUrl = uploadPayload.uploadFile?.assetUrl;

        if (uploadUrl && assetUrl) {
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": image.type,
              "Cache-Control": "public, max-age=31536000",
            },
            body: buffer,
          });
          if (uploadRes.ok) {
            imageUrl = assetUrl;
          } else {
            console.error("[feedback] image upload PUT failed:", uploadRes.status);
            imageUploadFailed = true;
          }
        } else {
          console.error("[feedback] no upload URL from Linear");
          imageUploadFailed = true;
        }
      } catch (e) {
        console.error("[feedback] image upload error:", e instanceof Error ? e.message : e);
        imageUploadFailed = true;
      }
    }

    // Build issue description
    let body = description.trim();
    if (imageUrl) {
      body += `\n\n**Attached screenshot:**\n![screenshot](${imageUrl})`;
    }
    if (email) {
      body += `\n\n---\n**Reporter email:** ${email}`;
    }
    body += `\n\n---\n*Submitted via yoinkify.com/feedback*`;

    // Create the issue
    const issuePayload = await client.createIssue({
      teamId: team.id,
      title: title.trim(),
      description: body,
      ...(triageState ? { stateId: triageState.id } : {}),
      ...(label ? { labelIds: [label.id] } : {}),
      ...(project ? { projectId: project.id } : {}),
    });

    const issue = await issuePayload.issue;
    console.log(`[feedback] [${type}] ${ip} → created ${issue?.identifier || "issue"}: "${title.trim()}"`);

    return NextResponse.json({
      success: true,
      imageUploadFailed,
    });
  } catch (error) {
    console.error("[feedback] error:", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "something went wrong" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the route loads**

Run:
```bash
npm run dev
```

Then test with curl:
```bash
curl -X POST http://localhost:3000/api/feedback \
  -F "type=bug" \
  -F "title=Test submission" \
  -F "description=Testing the feedback endpoint"
```

Expected: `{"success":true,"imageUploadFailed":false}` and a new issue appears in Linear's yoinkify team triage.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/feedback/route.ts
git commit -m "feat: add POST /api/feedback route for Linear issue creation"
```

---

### Task 3: Build the FeedbackForm Client Component

**Files:**
- Create: `src/components/FeedbackForm.tsx`

- [ ] **Step 1: Create the FeedbackForm component**

Create `src/components/FeedbackForm.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";

type ReportType = "bug" | "feature";

interface FieldErrors {
  title?: string;
  description?: string;
  email?: string;
  image?: string;
}

const MAX_DESCRIPTION = 5000;
const CHAR_WARN_THRESHOLD = 4000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export default function FeedbackForm() {
  const [type, setType] = useState<ReportType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageUploadFailed, setImageUploadFailed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const placeholders: Record<ReportType, { title: string; description: string }> = {
    bug: { title: "what's broken?", description: "tell us more..." },
    feature: { title: "what's missing?", description: "tell us more..." },
  };

  const validateField = useCallback((field: string, value: string): string | undefined => {
    switch (field) {
      case "title":
        return value.trim() ? undefined : "title is required";
      case "description":
        if (!value.trim()) return "description is required";
        if (value.length > MAX_DESCRIPTION) return `max ${MAX_DESCRIPTION} characters`;
        return undefined;
      case "email":
        if (!value) return undefined;
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : "invalid email";
      default:
        return undefined;
    }
  }, []);

  const handleBlur = (field: string, value: string) => {
    const error = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const validateImage = (file: File): string | undefined => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "must be png, jpg, gif, or webp";
    if (file.size > MAX_IMAGE_SIZE) return "must be under 5MB";
    return undefined;
  };

  const handleImageSelect = (file: File) => {
    const error = validateImage(file);
    if (error) {
      setErrors((prev) => ({ ...prev, image: error }));
      return;
    }
    setErrors((prev) => ({ ...prev, image: undefined }));
    setImage(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageSelect(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const removeImage = () => {
    setImage(null);
    setImagePreview(null);
    setErrors((prev) => ({ ...prev, image: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    // Validate all fields
    const newErrors: FieldErrors = {
      title: validateField("title", title),
      description: validateField("description", description),
      email: validateField("email", email),
    };
    setErrors(newErrors);

    if (Object.values(newErrors).some(Boolean)) return;

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("title", title.trim());
      formData.append("description", description.trim());
      if (email) formData.append("email", email.trim());
      if (image) formData.append("image", image);

      const res = await fetch("/api/feedback", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setSubmitError("slow down — try again in a minute.");
        } else {
          setSubmitError(data.error || "something went wrong. try again.");
        }
        return;
      }

      setImageUploadFailed(data.imageUploadFailed || false);
      setSubmitted(true);
    } catch {
      setSubmitError("something went wrong. try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setType("bug");
    setTitle("");
    setDescription("");
    setEmail("");
    setImage(null);
    setImagePreview(null);
    setErrors({});
    setSubmitError(null);
    setSubmitted(false);
    setImageUploadFailed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (submitted) {
    return (
      <div
        className="animate-fade-in-up text-center py-16 space-y-4"
        style={{ opacity: 0 }}
      >
        <div className="flex justify-center">
          <div className="status-dot w-3 h-3 rounded-full bg-green" />
        </div>
        <p className="text-2xl font-bold text-text">submitted</p>
        <p className="text-sm text-subtext0">
          {imageUploadFailed
            ? "we got your report (image upload failed). we'll take a look."
            : "we'll take a look."}
        </p>
        <button
          onClick={resetForm}
          className="btn-press mt-6 text-sm text-lavender border border-lavender/30 hover:bg-lavender/10 px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all duration-200"
        >
          submit another
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="animate-fade-in-up space-y-5"
      style={{ opacity: 0, animationDelay: "80ms" }}
    >
      {/* Report type */}
      <div className="space-y-2">
        <label htmlFor="feedback-type" className="text-xs text-overlay1 uppercase tracking-wider font-bold">
          type
        </label>
        <select
          id="feedback-type"
          value={type}
          onChange={(e) => setType(e.target.value as ReportType)}
          className="w-full bg-surface0/50 border border-surface0 rounded-lg px-4 py-3 text-sm text-text input-glow focus:outline-none focus:border-lavender/50 appearance-none cursor-pointer"
        >
          <option value="bug">bug report</option>
          <option value="feature">feature request</option>
        </select>
      </div>

      {/* Title */}
      <div className="space-y-2">
        <label htmlFor="feedback-title" className="text-xs text-overlay1 uppercase tracking-wider font-bold">
          title
        </label>
        <input
          id="feedback-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => handleBlur("title", title)}
          placeholder={placeholders[type].title}
          className="w-full bg-surface0/50 border border-surface0 rounded-lg px-4 py-3 text-sm text-text placeholder:text-overlay0 input-glow focus:outline-none focus:border-lavender/50"
        />
        {errors.title && <p className="text-xs text-red">{errors.title}</p>}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label htmlFor="feedback-description" className="text-xs text-overlay1 uppercase tracking-wider font-bold">
          description
        </label>
        <textarea
          id="feedback-description"
          value={description}
          onChange={(e) => {
            if (e.target.value.length <= MAX_DESCRIPTION) setDescription(e.target.value);
          }}
          onBlur={() => handleBlur("description", description)}
          placeholder={placeholders[type].description}
          rows={4}
          className="w-full bg-surface0/50 border border-surface0 rounded-lg px-4 py-3 text-sm text-text placeholder:text-overlay0 input-glow focus:outline-none focus:border-lavender/50 resize-y"
        />
        <div className="flex justify-between">
          {errors.description && <p className="text-xs text-red">{errors.description}</p>}
          {description.length >= CHAR_WARN_THRESHOLD && (
            <p className={`text-xs ml-auto ${description.length >= MAX_DESCRIPTION ? "text-red" : "text-overlay0"}`}>
              {description.length}/{MAX_DESCRIPTION}
            </p>
          )}
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <label htmlFor="feedback-email" className="text-xs text-overlay1 uppercase tracking-wider font-bold">
          email <span className="text-overlay0 normal-case tracking-normal font-normal">(optional, for follow-up)</span>
        </label>
        <input
          id="feedback-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => handleBlur("email", email)}
          placeholder="you@example.com"
          className="w-full bg-surface0/50 border border-surface0 rounded-lg px-4 py-3 text-sm text-text placeholder:text-overlay0 input-glow focus:outline-none focus:border-lavender/50"
        />
        {errors.email && <p className="text-xs text-red">{errors.email}</p>}
      </div>

      {/* Image upload */}
      <div className="space-y-2">
        <label className="text-xs text-overlay1 uppercase tracking-wider font-bold">
          screenshot <span className="text-overlay0 normal-case tracking-normal font-normal">(optional)</span>
        </label>
        {imagePreview ? (
          <div className="border border-surface0 rounded-lg p-3 bg-surface0/30 space-y-3">
            <img
              src={imagePreview}
              alt="Upload preview"
              className="max-h-48 rounded-md object-contain"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-overlay0 truncate max-w-[200px]">
                {image?.name} ({image ? `${(image.size / 1024).toFixed(0)}KB` : ""})
              </span>
              <button
                type="button"
                onClick={removeImage}
                className="btn-press text-xs text-red hover:text-red/80 uppercase tracking-wider font-bold transition-colors"
              >
                remove
              </button>
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
              dragOver
                ? "border-lavender bg-lavender/5"
                : "border-surface0 hover:border-surface2 hover:bg-surface0/20"
            }`}
          >
            <p className="text-sm text-overlay0">
              drop an image here or <span className="text-lavender">browse</span>
            </p>
            <p className="text-xs text-surface2 mt-1">png, jpg, gif, webp — max 5MB</p>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImageSelect(file);
          }}
          className="hidden"
        />
        {errors.image && <p className="text-xs text-red">{errors.image}</p>}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="btn-press w-full bg-lavender hover:bg-mauve text-crust py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:bg-surface1 disabled:text-overlay0"
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-1">
            <span className="loading-dot w-1.5 h-1.5 rounded-full bg-overlay0 inline-block" />
            <span className="loading-dot w-1.5 h-1.5 rounded-full bg-overlay0 inline-block" />
            <span className="loading-dot w-1.5 h-1.5 rounded-full bg-overlay0 inline-block" />
          </span>
        ) : (
          "submit"
        )}
      </button>

      {/* Submit error */}
      {submitError && (
        <p className="text-xs text-red text-center animate-fade-in">{submitError}</p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FeedbackForm.tsx
git commit -m "feat: add FeedbackForm client component with validation and image upload"
```

---

### Task 4: Build the Feedback Page

**Files:**
- Create: `src/app/feedback/page.tsx`

- [ ] **Step 1: Create the page**

Create `src/app/feedback/page.tsx`:

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import FeedbackForm from "@/components/FeedbackForm";

export const metadata: Metadata = {
  title: "feedback",
  description:
    "report bugs or request features for yoink. submissions go straight to our backlog for review.",
  openGraph: {
    title: "feedback — yoink",
    description:
      "report bugs or request features for yoink.",
  },
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-grid">
      <Header />

      {/* Hero */}
      <section className="px-6 pt-20 sm:pt-32 pb-16 sm:pb-24 max-w-2xl mx-auto">
        <div className="space-y-6 animate-fade-in-up" style={{ opacity: 0 }}>
          <p className="text-xs text-lavender uppercase tracking-[0.3em] font-bold">
            feedback
          </p>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[0.95] tracking-tight text-text">
            tell us what&apos;s
            <br />
            <span className="text-lavender">broken.</span>
          </h1>
          <p className="text-lg text-subtext0/80 leading-relaxed max-w-md">
            found a bug? want a feature? let us know and we&apos;ll
            take a look.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Form */}
      <section className="px-6 py-16 max-w-2xl mx-auto">
        <FeedbackForm />
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Footer */}
      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/how" className="text-mauve/60 hover:text-mauve transition-colors duration-200">local files</Link>
          <Link href="/players" className="text-green/60 hover:text-green transition-colors duration-200">players</Link>
          <a
            href="https://yoinkify.com/tip"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-peach transition-colors duration-200"
          >
            tip jar
          </a>
          <a
            href="https://github.com/heysonder/yoink"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors duration-200"
          >
            github
          </a>
        </div>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run:
```bash
npm run dev
```

Navigate to `http://localhost:3000/feedback`. Expected: the page renders with Header, hero section, feedback form, and footer. All styled consistently with `/roadmap`.

- [ ] **Step 3: Commit**

```bash
git add src/app/feedback/page.tsx
git commit -m "feat: add /feedback page with hero and FeedbackForm"
```

---

### Task 5: End-to-End Smoke Test

- [ ] **Step 1: Test bug report submission**

1. Navigate to `http://localhost:3000/feedback`
2. Select "bug report" from the dropdown
3. Enter a title and description
4. Submit without email or image
5. Expected: green success state with "submitted" and "we'll take a look."
6. Verify the issue appears in Linear under the yoinkify team in triage with the `Bug` label

- [ ] **Step 2: Test feature request with all fields**

1. Click "submit another"
2. Select "feature request"
3. Enter title, description, email, and attach an image via drag-and-drop
4. Submit
5. Expected: success state. Linear issue has `Feature Request` label, description contains the image and reporter email
6. Verify the image renders in the Linear issue

- [ ] **Step 3: Test validation**

1. Click "submit another"
2. Click submit with empty fields
3. Expected: red error text under title and description fields
4. Enter a title, leave description empty, enter an invalid email like "notanemail"
5. Tab out of email field
6. Expected: "invalid email" error appears on blur

- [ ] **Step 4: Test rate limiting**

Submit 6 times rapidly. Expected: 6th submission returns "slow down — try again in a minute."

- [ ] **Step 5: Test image validation**

Try to upload a file larger than 5MB or a non-image file. Expected: error message "must be under 5MB" or "must be png, jpg, gif, or webp".

- [ ] **Step 6: Commit any fixes**

If any fixes were needed during testing:
```bash
git add -A
git commit -m "fix: feedback form fixes from smoke testing"
```

---

### Task 6: Link Feedback Page in Navigation

**Files:**
- Modify: `src/components/Header.tsx`
- Modify: `src/app/roadmap/page.tsx` (update the CTA at the bottom that currently links to email)

- [ ] **Step 1: Add feedback link to Header**

In `src/components/Header.tsx`, add a feedback link in the right side nav alongside the existing links:

After the tip jar link and before the v3.0 link, add:
```tsx
<Link href="/feedback" className="text-xs text-surface2 hover:text-lavender transition-colors duration-200">feedback</Link>
```

Add the `Link` import if not already present (it is already imported).

- [ ] **Step 2: Update roadmap CTA**

In `src/app/roadmap/page.tsx`, the CTA section at the bottom currently links to `mailto:me@yoinkify.com`. Update it to link to the feedback page instead:

Replace the `<a href="mailto:me@yoinkify.com" ...>` with:
```tsx
<Link
  href="/feedback"
  className="btn-press text-sm text-lavender border border-lavender/30 hover:bg-lavender/10 px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-all duration-200 flex-shrink-0"
>
  send feedback
</Link>
```

Update the description text from "reach out and tell us what to build next." to "tell us what to build next."

- [ ] **Step 3: Verify navigation**

1. Check Header shows "feedback" link on all pages
2. Click it, lands on `/feedback`
3. Check roadmap CTA links to `/feedback` instead of email

- [ ] **Step 4: Commit**

```bash
git add src/components/Header.tsx src/app/roadmap/page.tsx
git commit -m "feat: add feedback link to header and roadmap CTA"
```

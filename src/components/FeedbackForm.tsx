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
        {!errors.email && email && (
          <p className="text-xs text-overlay0">
            we&apos;ll only use this if we need to follow up about your report, and
            we aim to remove optional contact details within 90 days after the
            ticket is resolved.
          </p>
        )}
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
                ? "border-lavender bg-lavender/10"
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
          <span className="animate-text-shimmer">submitting</span>
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

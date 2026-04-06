import { Loader2 } from "lucide-react";

export default function Spinner({ className = "w-4 h-4 text-lavender" }: { className?: string }) {
  return <Loader2 className={`animate-spin ${className}`} />;
}

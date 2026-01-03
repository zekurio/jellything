import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  centered?: boolean;
}

const sizeClasses = {
  sm: "size-4",
  md: "size-6",
  lg: "size-8",
};

export function Spinner({ className, size = "md", centered = false }: SpinnerProps) {
  const spinner = (
    <Loader2
      className={cn("animate-spin text-muted-foreground", sizeClasses[size], className)}
    />
  );

  if (centered) {
    return <div className="flex flex-1 items-center justify-center py-8">{spinner}</div>;
  }

  return spinner;
}

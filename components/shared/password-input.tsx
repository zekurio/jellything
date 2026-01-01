"use client";

import { useState, useMemo, useId } from "react";
import { IconEye, IconEyeOff, IconCheck, IconX } from "@tabler/icons-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validatePassword, type PasswordStrength } from "@/lib/schemas";

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showStrengthIndicator?: boolean;
  showRequirements?: boolean;
  autoComplete?: string;
  error?: string;
}

const strengthColors: Record<PasswordStrength, string> = {
  weak: "bg-destructive",
  fair: "bg-orange-500",
  good: "bg-yellow-500",
  strong: "bg-green-500",
};

const strengthWidths: Record<PasswordStrength, string> = {
  weak: "w-1/4",
  fair: "w-2/4",
  good: "w-3/4",
  strong: "w-full",
};

export function PasswordInput({
  id,
  value,
  onChange,
  label,
  placeholder = "Enter password",
  disabled = false,
  showStrengthIndicator = false,
  showRequirements = false,
  autoComplete = "new-password",
  error,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  const validation = useMemo(() => validatePassword(value), [value]);

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        <Input
          id={inputId}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="pr-10"
          aria-invalid={error ? true : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
          disabled={disabled}
          tabIndex={-1}
        >
          {showPassword ? (
            <IconEyeOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <IconEye className="h-4 w-4 text-muted-foreground" />
          )}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showStrengthIndicator && value.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  strengthColors[validation.strength],
                  strengthWidths[validation.strength],
                )}
              />
            </div>
            <span className="text-xs text-muted-foreground capitalize">
              {validation.strength}
            </span>
          </div>
        </div>
      )}

      {showRequirements && value.length > 0 && (
        <div className="space-y-1">
          <RequirementCheck
            passed={validation.checks.minLength}
            label="At least 8 characters"
          />
          <RequirementCheck
            passed={validation.checks.hasUppercase}
            label="One uppercase letter"
          />
          <RequirementCheck
            passed={validation.checks.hasLowercase}
            label="One lowercase letter"
          />
          <RequirementCheck
            passed={validation.checks.hasNumber}
            label="One number (optional)"
            optional
          />
          <RequirementCheck
            passed={validation.checks.hasSpecial}
            label="One special character (optional)"
            optional
          />
        </div>
      )}
    </div>
  );
}

function RequirementCheck({
  passed,
  label,
  optional = false,
}: {
  passed: boolean;
  label: string;
  optional?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {passed ? (
        <IconCheck className="h-3 w-3 text-green-500" />
      ) : (
        <IconX
          className={cn(
            "h-3 w-3",
            optional ? "text-muted-foreground" : "text-destructive",
          )}
        />
      )}
      <span
        className={cn(
          passed
            ? "text-muted-foreground"
            : optional
              ? "text-muted-foreground"
              : "text-foreground",
        )}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * Hook for password validation state management
 */
export function usePasswordValidation() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const validation = useMemo(() => validatePassword(password), [password]);
  const passwordsMatch = password === confirmPassword;

  const isValid =
    validation.isValid && passwordsMatch && confirmPassword.length > 0;

  return {
    password,
    setPassword,
    confirmPassword,
    setConfirmPassword,
    validation,
    passwordsMatch,
    isValid,
    errors: {
      password:
        password.length > 0 && !validation.isValid ? validation.errors : [],
      confirm:
        confirmPassword.length > 0 && !passwordsMatch
          ? ["Passwords do not match"]
          : [],
    },
  };
}

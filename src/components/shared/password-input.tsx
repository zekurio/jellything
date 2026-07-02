"use client"

import { Eye, EyeOff, Check, X } from "lucide-react"
import { useId, useMemo, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { translateMaybeMessageKey, useTranslations } from "@/lib/i18n"
import { validatePassword, type PasswordStrength } from "@/lib/schemas"
import { cn } from "@/lib/utils"

interface PasswordInputProps {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  disabled?: boolean
  showStrengthIndicator?: boolean
  showRequirements?: boolean
  autoComplete?: string
  error?: string
}

const strengthColors: Record<PasswordStrength, string> = {
  weak: "bg-destructive",
  fair: "bg-orange-500",
  good: "bg-yellow-500",
  strong: "bg-green-500",
}

const strengthWidths: Record<PasswordStrength, string> = {
  weak: "w-1/4",
  fair: "w-2/4",
  good: "w-3/4",
  strong: "w-full",
}

export function PasswordInput({
  id,
  value,
  onChange,
  label,
  placeholder,
  disabled = false,
  showStrengthIndicator = false,
  showRequirements = false,
  autoComplete = "new-password",
  error,
}: PasswordInputProps) {
  const t = useTranslations()
  const [showPassword, setShowPassword] = useState(false)
  const generatedId = useId()
  const inputId = id ?? generatedId
  const resolvedPlaceholder = placeholder ?? t("auth.passwordPlaceholder")
  const resolvedError = useMemo(
    () => translateMaybeMessageKey(t, error),
    [error, t],
  )

  const validation = useMemo(() => validatePassword(value), [value])

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <div className="relative">
        <Input
          id={inputId}
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          autoComplete={autoComplete}
          className="pr-10"
          aria-invalid={resolvedError ? true : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
          onClick={() => setShowPassword(!showPassword)}
          disabled={disabled}
          aria-label={
            showPassword ? t("auth.hidePassword") : t("auth.showPassword")
          }
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <EyeOff className="text-muted-foreground h-4 w-4" />
          ) : (
            <Eye className="text-muted-foreground h-4 w-4" />
          )}
        </Button>
      </div>

      {resolvedError && (
        <p className="text-destructive text-sm">{resolvedError}</p>
      )}

      {showStrengthIndicator && value.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="bg-muted h-1.5 flex-1 rounded-full">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  strengthColors[validation.strength],
                  strengthWidths[validation.strength],
                )}
              />
            </div>
            <span className="text-muted-foreground text-xs capitalize">
              {
                {
                  weak: t("auth.passwordStrength.weak"),
                  fair: t("auth.passwordStrength.fair"),
                  good: t("auth.passwordStrength.good"),
                  strong: t("auth.passwordStrength.strong"),
                }[validation.strength]
              }
            </span>
          </div>
        </div>
      )}

      {showRequirements && value.length > 0 && (
        <div className="space-y-1">
          <RequirementCheck
            passed={validation.checks.minLength}
            label={t("auth.passwordRequirements.minLength")}
          />
          <RequirementCheck
            passed={validation.checks.hasUppercase}
            label={t("auth.passwordRequirements.uppercase")}
          />
          <RequirementCheck
            passed={validation.checks.hasLowercase}
            label={t("auth.passwordRequirements.lowercase")}
          />
          <RequirementCheck
            passed={validation.checks.hasNumber}
            label={t("auth.passwordRequirements.numberOptional")}
            optional
          />
          <RequirementCheck
            passed={validation.checks.hasSpecial}
            label={t("auth.passwordRequirements.specialOptional")}
            optional
          />
        </div>
      )}
    </div>
  )
}

function RequirementCheck({
  passed,
  label,
  optional = false,
}: {
  passed: boolean
  label: string
  optional?: boolean
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      {passed ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <X
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
  )
}

/**
 * Hook for password validation state management
 */
export function usePasswordValidation() {
  const t = useTranslations()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const validation = useMemo(() => validatePassword(password), [password])
  const passwordsMatch = password === confirmPassword

  const isValid =
    validation.isValid && passwordsMatch && confirmPassword.length > 0

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
          ? [t("auth.passwordsDoNotMatch")]
          : [],
    },
  }
}

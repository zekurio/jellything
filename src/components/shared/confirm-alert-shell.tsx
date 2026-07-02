import type { ReactNode } from "react"

import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

interface ConfirmAlertShellProps {
  title: string
  description: ReactNode
  cancelLabel: string
  confirmLabel: string
  isLoading?: boolean
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmAlertShell({
  title,
  description,
  cancelLabel,
  confirmLabel,
  isLoading,
  onConfirm,
  destructive = false,
}: ConfirmAlertShellProps) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isLoading}>
          {cancelLabel}
        </AlertDialogCancel>
        <AlertDialogAction
          onClick={onConfirm}
          disabled={isLoading}
          className={cn(
            destructive
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "",
          )}
        >
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

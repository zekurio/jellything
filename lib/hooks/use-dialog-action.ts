"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

interface UseDialogActionOptions<T> {
  /** Callback when action completes successfully */
  onSuccess?: (result: T) => void;
  /** Success message to show in toast */
  successMessage?: string | ((result: T) => string);
  /** Error message to show in toast */
  errorMessage?: string;
}

interface UseDialogActionReturn<TItem, TResult> {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** The item being acted upon */
  item: TItem | null;
  /** Whether the action is loading */
  isLoading: boolean;
  /** Open the dialog with an item */
  open: (item: TItem) => void;
  /** Close the dialog and reset state */
  close: () => void;
  /** Execute the action */
  execute: (action: () => Promise<TResult>) => Promise<void>;
}

/**
 * Hook for managing dialog state with async actions.
 * Handles open/close state, loading state, and toast notifications.
 */
export function useDialogAction<TItem = unknown, TResult = unknown>(
  options: UseDialogActionOptions<TResult> = {},
): UseDialogActionReturn<TItem, TResult> {
  const { onSuccess, successMessage, errorMessage = "Action failed" } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [item, setItem] = useState<TItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const open = useCallback((newItem: TItem) => {
    setItem(newItem);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setItem(null);
  }, []);

  const execute = useCallback(
    async (action: () => Promise<TResult>) => {
      setIsLoading(true);
      try {
        const result = await action();
        if (successMessage) {
          const message =
            typeof successMessage === "function" ? successMessage(result) : successMessage;
          toast.success(message);
        }
        onSuccess?.(result);
        close();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [onSuccess, successMessage, errorMessage, close],
  );

  return {
    isOpen,
    item,
    isLoading,
    open,
    close,
    execute,
  };
}

interface UseSimpleDialogReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

/**
 * Simple hook for managing dialog open/close state.
 */
export function useSimpleDialog(initialOpen = false): UseSimpleDialogReturn {
  const [isOpen, setIsOpen] = useState(initialOpen);

  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    toggle: useCallback(() => setIsOpen((prev) => !prev), []),
  };
}

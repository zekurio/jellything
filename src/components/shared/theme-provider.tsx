"use client"

import { ThemeProvider } from "next-themes"
import type { ComponentProps } from "react"

function InviterrThemeProvider({
  children,
  ...props
}: ComponentProps<typeof ThemeProvider>) {
  return <ThemeProvider {...props}>{children}</ThemeProvider>
}

export { InviterrThemeProvider as ThemeProvider }

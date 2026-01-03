import type { Metadata } from "next";
import { Geist_Mono, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { configManager } from "@/lib/config";
import "@/app/globals.css";

const geistMono = Geist_Mono({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export function generateMetadata(): Metadata {
  // Use safe defaults during onboarding when config doesn't exist yet
  if (!configManager.isConfigured()) {
    return {
      title: {
        default: "Jellything",
        template: "%s | Jellything",
      },
      description: "User management and invitation system for Jellyfin",
    };
  }

  const app = configManager.app;
  return {
    title: {
      default: app.title,
      template: `%s | ${app.title}`,
    },
    description: app.description,
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistMono.variable} ${jetBrainsMono.variable} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors={true} />
        </ThemeProvider>
      </body>
    </html>
  );
}

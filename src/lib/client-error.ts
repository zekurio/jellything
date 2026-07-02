export function reportClientError(error: unknown): void {
  if (typeof globalThis.reportError !== "function") {
    return
  }

  globalThis.reportError(error)
}

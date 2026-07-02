import { useEffect } from "react"
import { registerSW } from "virtual:pwa-register"

export function usePwaRegistration() {
  useEffect(() => {
    const updateServiceWorker = registerSW({
      immediate: true,
    })

    return () => {
      updateServiceWorker(false)
    }
  }, [])
}

declare global {
  interface Window {
    dataLayer: Record<string, string | number | boolean | Record<string, unknown> | undefined>[]
  }
}

export {}

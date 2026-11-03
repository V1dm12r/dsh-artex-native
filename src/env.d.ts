/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Provided by the DSH Web shell before any Client module runs. */
    __ModuleLoader__: {
      load(module: { id: string; factory(require?: unknown): unknown }): void
    }
  }
}

export {}

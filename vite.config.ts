import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import { fileURLToPath, URL } from 'node:url'

/**
 * Spike build: bundle one ARTEX page into a self-contained IIFE that the DSH
 * Client module loader can execute.
 *
 * - `@` resolves at ARTEX's own source root, so the pages' internal imports
 *   (`@/components/ui/button`, `@/lib/api`, …) keep working untouched.
 * - React is bundled IN (not externalised): the DSH loader has no require path
 *   to pass into an IIFE, and a second React instance is fine here because the
 *   ARTEX subtree never shares hooks or context with the host tree.
 */
export default defineConfig({
  // The host loads exactly one Client script per package, so any stylesheet a
  // dependency imports as a plain `import 'x.css'` (React Flow, for example)
  // must be injected from JS rather than emitted as a sibling .css file that
  // never gets fetched.
  plugins: [react(), tailwindcss(), cssInjectedByJsPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./artex-src', import.meta.url)),
      // ARTEX is a Next.js app; the panel has no Next runtime, so its runtime
      // modules are replaced with small shims. Order matters: these are exact
      // specifiers, checked before the '@' prefix alias applies to nothing.
      'next/navigation': fileURLToPath(new URL('./src/shims/next-navigation.ts', import.meta.url)),
      'next/link': fileURLToPath(new URL('./src/shims/next-link.tsx', import.meta.url)),
      'next/font/local': fileURLToPath(new URL('./src/shims/next-font-local.ts', import.meta.url)),
      'next/image': fileURLToPath(new URL('./src/shims/next-image.tsx', import.meta.url)),
    },
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    // Next.js inlines NEXT_PUBLIC_* at build time; Vite does not, and the
    // browser has no `process` global — leaving them in throws on the first
    // line that reads one, which is what crashed the host boot.
    'process.env.NEXT_PUBLIC_MOCK': JSON.stringify('0'),
    'process.env.NEXT_PUBLIC_SSE_BASE': JSON.stringify(''),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    lib: {
      entry: fileURLToPath(new URL('./src/client.tsx', import.meta.url)),
      formats: ['iife'],
      name: '__ARTEX_NATIVE__',
      fileName: () => 'client.js',
    },
    rollupOptions: {
      output: {
        // One file: DSH loads exactly one Client script per package.
        inlineDynamicImports: true,
        // Belt-and-braces for any transitive dependency that still reaches for
        // Node's `process`: without this the browser throws ReferenceError.
        banner:
          'var process=globalThis.process||{env:{NODE_ENV:"production"},versions:{},platform:"browser",nextTick:function(f){setTimeout(f,0)}};',
      },
    },
  },
})

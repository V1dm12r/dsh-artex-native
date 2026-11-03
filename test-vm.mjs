/**
 * Browser-accurate smoke test.
 *
 * jsdom alone is not enough: `new Function(...)` runs with Node's globals, so
 * Node's `process` leaks in and hides "process is not defined" — the exact
 * crash this test exists to catch. A `vm` context with no `process` reproduces
 * the browser global scope instead.
 */
import { JSDOM } from 'jsdom'
import vm from 'node:vm'
import fs from 'node:fs'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:51375/',
  pretendToBeVisual: true,
})

const w = dom.window

w.matchMedia = w.matchMedia || (() => ({
  matches: false, media: '',
  addEventListener() {}, removeEventListener() {},
  addListener() {}, removeListener() {}, dispatchEvent() { return false },
}))
w.ResizeObserver = w.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
w.IntersectionObserver = w.IntersectionObserver || class { observe() {} unobserve() {} disconnect() {} }

let loaded = false
let pluginKeys = null

w.__ModuleLoader__ = {
  load(mod) {
    loaded = true
    console.log('[vm] ModuleLoader.load:', mod.id)
    try {
      const plugin = mod.factory()
      pluginKeys = Object.keys(plugin || {})
      console.log('[vm] factory OK:', pluginKeys.join(','))
    } catch (e) {
      console.error('[vm] factory THREW:', e && e.stack ? e.stack : e)
    }
  },
}

const sandbox = {
  window: w,
  document: w.document,
  navigator: w.navigator,
  localStorage: w.localStorage,
  location: w.location,
  history: w.history,
  self: w,
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  // NOTE: no `process`, no `Buffer`, no `require` — exactly like a browser.
}

// Web APIs a browser (and Electron's renderer) provides but a bare vm context
// does not. Keep them out of the "browser-only" verdict below by mirroring them.
const webApis = [
  'structuredClone', 'queueMicrotask', 'TextEncoder', 'TextDecoder',
  'URL', 'URLSearchParams', 'Blob', 'crypto', 'performance',
  'Event', 'EventTarget', 'CustomEvent', 'AbortController', 'AbortSignal',
  'atob', 'btoa',
]
for (const key of webApis) {
  if (globalThis[key] !== undefined) sandbox[key] = globalThis[key]
}

const ctx = vm.createContext(sandbox)
const code = fs.readFileSync(new URL('./dist/client.js', import.meta.url), 'utf8')

try {
  vm.runInContext(code, ctx)
} catch (e) {
  console.error('[vm] BUNDLE THREW AT TOP LEVEL:')
  console.error(e && e.stack ? e.stack : e)
}

console.log('[vm] loaded =', loaded, '| plugin keys =', pluginKeys)

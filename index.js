/**
 * Host half of the ARTEX-native spike.
 *
 * Reverse-proxies `/artex-api/*` to the Docker backend on 127.0.0.1:8787, so the
 * panel (which runs on the DSH origin) reaches ARTEX same-origin. The prefix is
 * deliberately not `/api`: the host's own routes may own that space.
 *
 * Streamed responses (the log tail and task-event SSE endpoints) are piped
 * through without buffering; `x-accel-buffering: no` keeps intermediaries from
 * holding frames back.
 */
import http from 'node:http'
import z from './vendor/schemastery.mjs'

const PREFIX = '/artex-api'
const DEFAULT_ARTEX_URL = 'http://127.0.0.1:8787'

/**
 * Parse the configured backend origin. Kept tolerant: a missing scheme or a
 * trailing slash should not take the plugin down, and a bad value falls back to
 * the default rather than leaving the panel with no proxy at all.
 */
function resolveTarget(rawUrl) {
  const candidate = typeof rawUrl === 'string' && rawUrl.trim() ? rawUrl.trim() : DEFAULT_ARTEX_URL
  const withScheme = /^[a-z]+:\/\//i.test(candidate) ? candidate : `http://${candidate}`
  try {
    const parsed = new URL(withScheme)
    return {
      host: parsed.hostname,
      port: Number(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
      protocol: parsed.protocol,
    }
  } catch {
    console.warn(`[artex-native] invalid artexUrl "${candidate}", falling back to ${DEFAULT_ARTEX_URL}`)
    return { host: '127.0.0.1', port: 8787, protocol: 'http:' }
  }
}

function toUpstreamPath(url) {
  // `/artex-api/tasks` -> `/api/tasks`
  const rest = url.startsWith(PREFIX) ? url.slice(PREFIX.length) : url
  return `/api${rest.startsWith('/') ? rest : `/${rest}`}`
}

function makeProxy(target) {
  return function proxy(req, res) {
    const headers = { ...req.headers }
    headers.host = `${target.host}:${target.port}`
    // Hop-by-hop headers must not be forwarded.
    delete headers.connection
    delete headers['keep-alive']
    delete headers['proxy-connection']
    delete headers.transfer_encoding
    delete headers.upgrade

    const upstream = http.request(
      {
        host: target.host,
        port: target.port,
        method: req.method,
        path: toUpstreamPath(req.url || '/'),
        headers,
      },
      (upstreamRes) => {
        const responseHeaders = { ...upstreamRes.headers }
        responseHeaders['x-accel-buffering'] = 'no'
        delete responseHeaders.connection

        res.writeHead(upstreamRes.statusCode || 502, responseHeaders)
        if (typeof res.flushHeaders === 'function') res.flushHeaders()
        upstreamRes.pipe(res)
      },
    )

    upstream.on('error', (error) => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: `ARTEX backend unreachable: ${error.message}` }))
      } else {
        res.end()
      }
    })

    // Body: pipe so uploads and large JSON bodies work without buffering.
    req.pipe(upstream)
  }
}

export const inject = ['webServer']

/**
 * Plugin configuration surfaced in the DSH plugin settings UI.
 *
 * DSH only recognises a schemastery Schema here — a hand-rolled descriptor with
 * `~standard` is reported as `unsupported` and never rendered. `schemastery` and
 * its `cosmokit` dependency are vendored under `vendor/` (patched to import each
 * other relatively), which keeps this package self-contained: no node_modules
 * and no profile-path assumptions.
 *
 * `volatile()` marks the field as user-editable in the config editor.
 */
export const Config = z.object({
  artexUrl: z
    .string()
    .default(DEFAULT_ARTEX_URL)
    .description('ARTEX 后端地址，例如 http://127.0.0.1:8787')
    .volatile(),
})

/**
 * Read one config field.
 *
 * A `volatile()` field reaches `apply` as a `{ value, meta }` wrapper (that is
 * what makes it editable in the settings UI), not as a bare value, so unwrap it
 * when a `get()` is present. Falls back to the default for missing/invalid input.
 */
function readConfigValue(config, key, fallback) {
  const raw = config && typeof config === 'object' ? config[key] : undefined
  if (raw && typeof raw === 'object' && typeof raw.get === 'function') {
    const unwrapped = raw.get()
    return typeof unwrapped === 'string' && unwrapped.trim() ? unwrapped.trim() : fallback
  }
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
}

export function apply(ctx, config) {
  const webServer = ctx.webServer
  if (!webServer || typeof webServer.register !== 'function') {
    console.warn('[artex-native] webServer unavailable; /artex-api proxy not installed')
    return
  }

  const target = resolveTarget(readConfigValue(config, 'artexUrl', DEFAULT_ARTEX_URL))
  console.info(`[artex-native] proxying ${PREFIX}/* -> ${target.protocol}//${target.host}:${target.port}/api/*`)

  ctx.effect(
    () =>
      webServer.register({
        kind: 'prefix',
        path: PREFIX,
        handler: makeProxy(target),
      }),
    'artex-native: /artex-api proxy',
  )
}

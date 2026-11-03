/**
 * Headless preview + per-page sweep.
 *
 * Renders the panel standalone, then clicks every navigation tab and records
 * whether the page rendered, threw, or stayed empty. This catches missing
 * providers / shims before a user has to click through and report them.
 */
import { chromium } from 'playwright-core'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
}

const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || '/').split('?')[0])
  if (pathname === '/') pathname = '/test-page.html'

  // Proxy /artex-api/* to the real Docker backend so the sweep exercises real
  // API response shapes instead of empty objects.
  if (pathname.startsWith('/artex-api/')) {
    const upstreamPath = `/api${req.url.slice('/artex-api'.length)}`
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: 8787,
        method: req.method,
        path: upstreamPath,
        headers: { ...req.headers, host: '127.0.0.1:8787' },
      },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode || 502, upstreamRes.headers)
        upstreamRes.pipe(res)
      },
    )
    upstream.on('error', (error) => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ error: error.message }))
      }
    })
    req.pipe(upstream)
    return
  }

  const file = path.join(process.cwd(), pathname)
  if (!file.startsWith(process.cwd()) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404
    res.end('not found')
    return
  }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream')
  res.end(fs.readFileSync(file))
})

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await chromium.launch({ executablePath: edge, headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })

// Real JWT so the panel skips its login gate and renders actual pages.
// The password is never hard-coded: set ARTEX_PASSWORD before running the sweep.
const ARTEX_PASSWORD = process.env.ARTEX_PASSWORD ?? ''
let token = ''
if (!ARTEX_PASSWORD) {
  console.log('ARTEX_PASSWORD not set — the sweep will stop at the login gate.')
} else {
  try {
    const loginRes = await fetch('http://127.0.0.1:8787/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'ARTEX', password: ARTEX_PASSWORD }),
    })
    token = ((await loginRes.json()) || {}).token || ''
    console.log('login token:', token ? `${token.length} chars` : 'FAILED')
  } catch (error) {
    console.log('login failed:', error.message)
  }
}

if (token) {
  await page.addInitScript((value) => {
    try {
      localStorage.setItem('artex_token', value)
    } catch {
      /* ignore */
    }
  }, token)
}

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`))

await page.goto(`http://127.0.0.1:${port}/test-page.html`, { waitUntil: 'load' })
await page.waitForTimeout(6000)

const labels = await page.evaluate(() => {
  const shadow = document.getElementById('root')?.shadowRoot
  if (!shadow) return []
  // First div inside the mount is the nav bar.
  const nav = shadow.querySelector('div')
  return [...(nav?.querySelectorAll('button') ?? [])].map((b) => b.textContent || '')
})

console.log('nav labels:', JSON.stringify(labels))

const results = []
for (const label of labels) {
  const before = consoleErrors.length

  const clicked = await page.evaluate((label) => {
    const shadow = document.getElementById('root')?.shadowRoot
    if (!shadow) return false
    const nav = shadow.querySelector('div')
    const btn = [...(nav?.querySelectorAll('button') ?? [])].find((b) => b.textContent === label)
    if (!btn) return false
    btn.click()
    return true
  }, label)

  await page.waitForTimeout(1200)

  const state = await page.evaluate(() => {
    const shadow = document.getElementById('root')?.shadowRoot
    if (!shadow) return { err: 'no shadow' }
    const text = shadow.textContent || ''
    const crashMatch = text.match(/ARTEX 渲染失败[\s\S]{0,300}/)
    const headings = [...shadow.querySelectorAll('h1,h2')].map((n) => n.textContent).filter(Boolean).slice(0, 3)
    return {
      headings,
      crashed: Boolean(crashMatch),
      crashSnippet: crashMatch ? crashMatch[0].replace(/\s+/g, ' ').slice(0, 200) : null,
      buttons: shadow.querySelectorAll('button').length,
      textLen: text.length,
    }
  })

  results.push({
    label,
    clicked,
    ...state,
    newErrors: consoleErrors.slice(before).slice(0, 2),
  })
}

await page.screenshot({ path: 'preview.png' })

// --- portal verification: open a Select and check where the popup landed ---
const portalCheck = await page.evaluate(async () => {
  const shadow = document.getElementById('root')?.shadowRoot
  if (!shadow) return { err: 'no shadow' }

  // Switch to the findings page, which has status selects.
  const nav = shadow.querySelector('div')
  const findings = [...(nav?.querySelectorAll('button') ?? [])].find((b) => b.textContent === '发现')
  findings?.click()

  await new Promise((r) => setTimeout(r, 900))

  const trigger = shadow.querySelector('[data-slot="select-trigger"]')
  if (!trigger) return { err: 'no select trigger found' }
  trigger.click()

  await new Promise((r) => setTimeout(r, 700))

  const portalRoot = [...shadow.children].find((c) => c instanceof HTMLElement && c.style.display === 'contents')
  const inBody = document.body.querySelector('[data-slot="select-content"]')

  return {
    portalRootExists: Boolean(portalRoot),
    portalChildCount: portalRoot ? portalRoot.childElementCount : -1,
    popupInShadow: portalRoot ? Boolean(portalRoot.querySelector('[data-slot="select-content"]')) : false,
    popupInDocumentBody: Boolean(inBody),
    popupText: portalRoot
      ? (portalRoot.querySelector('[data-slot="select-content"]')?.textContent || '').replace(/\s+/g, ' ').slice(0, 120)
      : null,
  }
})

console.log('\n=== PORTAL CHECK ===')
console.log(JSON.stringify(portalCheck, null, 2))
await page.screenshot({ path: 'preview-dropdown.png' })

console.log('\n=== PER-PAGE RESULT ===')
for (const r of results) {
  const flag = r.crashed ? 'CRASH' : r.headings && r.headings.length ? 'ok   ' : 'EMPTY'
  console.log(`[${flag}] ${String(r.label).padEnd(6)} headings=${JSON.stringify(r.headings)} buttons=${r.buttons} textLen=${r.textLen}`)
  if (r.crashed && r.crashSnippet) console.log(`         ${r.crashSnippet}`)
  if (r.newErrors.length) console.log(`         console: ${r.newErrors.join(' | ').slice(0, 180)}`)
}

await browser.close()
server.close()

/**
 * Spike entry.
 *
 * Bundles one ARTEX page (system/logs) and mounts it inside the DSH Web UI as a
 * native slot entry. A Shadow DOM wrapper isolates ARTEX's Tailwind output.
 *
 * Hard requirement learned the hard way: the previous build took the whole DSH
 * Client boot down. Every entry point here is therefore defensive — a failure
 * inside ARTEX must surface as a message inside this panel, never as a blank
 * page for the host.
 */
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { NAV_PAGES, DEFAULT_PATH, findPage } from './pages'
import { subscribe, navigate, getRoute } from './shims/next-navigation'
import { Toaster } from '@/components/ui/sonner'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PREFERENCE_DEFAULTS } from '@/lib/preferences/preferences-config'
import { setPortalRoot } from '@/lib/portal-root'
import { PreferencesStoreProvider } from '@/stores/preferences/preferences-provider'
import rawCss from '@/app/globals.css?inline'
// React Flow's stylesheet must be inlined too: a plain css import lands in
// document.head, which the shadow root cannot see.
import xyflowCss from '@xyflow/react/dist/style.css?inline'

/**
 * Tailwind v4 emits its design tokens under `:root`, which never matches inside
 * a shadow tree; `:host` keeps the variables available to the subtree.
 *
 * `--background` is an opaque oklch colour in both themes and
 * `body { @apply bg-background }` paints it over everything, so forcing it
 * transparent is what lets the wallpaper layer show through.
 *
 * Transparent background alone is not enough: ARTEX paints almost everything
 * on `--card` (pure white), so a single white sheet still covers the wallpaper.
 * The glass patch below turns the surfaces into translucent panels and forces
 * the dark palette, which is what the host theme uses.
 */
const GLASS_PATCH = `
.dark {
  --background: transparent;
  --card: oklch(20.5% 0 0 / 0.62);
  --popover: oklch(20.5% 0 0 / 0.84);
  --muted: oklch(26.9% 0 0 / 0.5);
  --secondary: oklch(26.9% 0 0 / 0.55);
  --sidebar: oklch(20.5% 0 0 / 0.6);
  --border: oklch(100% 0 0 / 0.12);
  --input: oklch(100% 0 0 / 0.15);
}
:host {
  --card: oklch(100% 0 0 / 0.62);
  --popover: oklch(100% 0 0 / 0.84);
  --muted: oklch(96% 0 0 / 0.5);
  --secondary: oklch(96% 0 0 / 0.55);
  --sidebar: oklch(98% 0 0 / 0.6);
}

/* React Flow's own stylesheet ships only CSS variables for .react-flow and no
   position, so the absolutely-positioned .react-flow__pane resolves against the
   wrong ancestor inside a shadow root — the whole canvas lands far below the
   panel. ARTEX works in a normal document because the page supplies the context. */
.react-flow {
  position: relative;
  width: 100%;
  height: 100%;
}
`

const shadowCss =
  rawCss
    .replace(/:root/g, ':host')
    .replace(/--background:\s*oklch\([^)]*\)/g, '--background: transparent') +
  xyflowCss +
  GLASS_PATCH

/** Renders a readable failure inside the panel instead of propagating it. */
class Boundary extends React.Component<
  { children?: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children?: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[artex-native] render failed', error, info)
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        'pre',
        {
          style: {
            margin: 0,
            padding: 12,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            color: '#ff6b6b',
            background: 'rgba(0,0,0,.6)',
            overflow: 'auto',
            height: '100%',
            boxSizing: 'border-box',
          },
        },
        'ARTEX 渲染失败\n\n' + String(this.state.error?.stack ?? this.state.error),
      )
    }
    return this.props.children as React.ReactElement
  }
}

/** Page switcher. Lives inside the shadow tree, so bundle React hooks are safe. */
function NavBar({ current }: { current: string }): React.ReactElement {
  return React.createElement(
    'div',
    {
      className:
        'flex shrink-0 flex-wrap items-center gap-1 border-b border-border px-2 py-1.5 text-xs',
    },
    NAV_PAGES.map((page) =>
      React.createElement(
        'button',
        {
          key: page.path,
          type: 'button',
          onClick: () => navigate(page.path),
          className:
            'rounded px-2 py-1 transition-colors ' +
            (current === page.path
              ? 'bg-muted font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted/50'),
        },
        page.label,
      ),
    ),
  )
}

const TOKEN_KEY = 'artex_token'

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

/**
 * Login gate.
 *
 * ARTEX issues a JWT from POST /api/auth/login and the UI keeps it in
 * localStorage. The panel has no login page of its own (the host page must not
 * navigate), so it renders this form until a token exists, and again whenever
 * `artex:unauthorized` fires.
 */
function LoginGate({ onSuccess }: { onSuccess: () => void }): React.ReactElement {
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/artex-api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'ARTEX', password }),
      })
      const payload = (await response.json().catch(() => ({}))) as { token?: string; error?: string }
      if (!response.ok || !payload.token) {
        throw new Error(payload.error || `登录失败 (HTTP ${response.status})`)
      }
      localStorage.setItem(TOKEN_KEY, payload.token)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return React.createElement(
    'div',
    { className: 'flex min-h-0 flex-1 items-center justify-center p-6' },
    React.createElement(
      'form',
      {
        onSubmit: submit,
        className:
          'w-full max-w-sm space-y-3 rounded-xl border border-border bg-card/70 p-5 backdrop-blur',
      },
      React.createElement(
        'h2',
        { className: 'text-base font-semibold text-foreground' },
        '登录 ARTEX',
      ),
      React.createElement(
        'p',
        { className: 'text-xs text-muted-foreground' },
        '用户名固定为 ARTEX，密码与 Docker 里的一致。',
      ),
      React.createElement('input', {
        type: 'password',
        value: password,
        placeholder: '密码',
        autoComplete: 'current-password',
        onChange: (e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value),
        className:
          'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring',
      }),
      error ? React.createElement('p', { className: 'text-xs text-destructive' }, error) : null,
      React.createElement(
        'button',
        {
          type: 'submit',
          disabled: busy,
          className:
            'h-9 w-full rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50',
        },
        busy ? '登录中…' : '登录',
      ),
    ),
  )
}

/** Backend status panel. `checking` keeps it mounted so the click is visible. */
function BackendDown({
  onRetry,
  checking,
}: {
  onRetry: () => void
  checking: boolean
}): React.ReactElement {
  return React.createElement(
    'div',
    {
      className: 'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center',
    },
    React.createElement(
      'h2',
      { className: 'text-base font-semibold text-foreground' },
      checking ? '正在连接 ARTEX…' : 'ARTEX 后端未运行',
    ),
    React.createElement(
      'p',
      { className: 'max-w-md text-xs text-muted-foreground' },
      '面板通过 /artex-api 代理访问 Docker 里的后端，现在连不上。可以在插件设置里改地址。',
    ),
    React.createElement(
      'code',
      {
        className:
          'rounded-md border border-border bg-muted/60 px-3 py-2 text-xs text-foreground',
      },
      'cd <ARTEX 安装目录> && docker compose up -d',
    ),
    React.createElement(
      'button',
      {
        type: 'button',
        onClick: onRetry,
        disabled: checking,
        className:
          'h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60',
      },
      checking ? '检测中…' : '重新检测',
    ),
  )
}

function PanelBody(): React.ReactElement {
  const [route, setRoute] = React.useState(() => getRoute())
  const [authed, setAuthed] = React.useState(() => Boolean(readToken()))
  const [backend, setBackend] = React.useState<'checking' | 'up' | 'down'>('checking')
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => subscribe(setRoute), [])

  React.useEffect(() => {
    const onUnauthorized = () => setAuthed(false)
    window.addEventListener('artex:unauthorized', onUnauthorized)
    return () => window.removeEventListener('artex:unauthorized', onUnauthorized)
  }, [])

  // Distinguish "backend down" from "bad password": without this the login form
  // surfaces ECONNREFUSED and reads like a credential error.
  React.useEffect(() => {
    let alive = true
    setBackend('checking')
    fetch('/artex-api/health', { cache: 'no-store' })
      .then((response) => {
        if (alive) setBackend(response.ok ? 'up' : 'down')
      })
      .catch(() => {
        if (alive) setBackend('down')
      })
    return () => {
      alive = false
    }
  }, [attempt])

  const pathname = route.split('?')[0] || DEFAULT_PATH
  const entry = findPage(pathname)
  const Page = entry.component

  let content: React.ReactElement
  if (backend === 'down' || backend === 'checking') {
    // One component for both states, so pressing the button visibly flips the
    // label to "检测中…" instead of remounting a different view for a frame.
    content = React.createElement(BackendDown, {
      checking: backend === 'checking',
      onRetry: () => setAttempt((n) => n + 1),
    })
  } else if (!authed) {
    content = React.createElement(LoginGate, { onSuccess: () => setAuthed(true) })
  } else {
    content = React.createElement(
      'div',
      { className: 'flex min-h-0 flex-1 flex-col' },
      React.createElement(NavBar, { current: pathname }),
      React.createElement(
        'div',
        { className: 'min-h-0 flex-1 overflow-auto' },
        React.createElement(Page),
      ),
      React.createElement(Toaster),
    )
  }

  // Mirrors ARTEX's app/layout.tsx. Without these providers the pages throw:
  // Radix Tooltip requires TooltipProvider, the preference store backs the
  // theme/layout lookups, and several pages call `useSidebar()` (shadcn) which
  // needs a SidebarProvider ancestor even though we render no ARTEX sidebar.
  return React.createElement(
    PreferencesStoreProvider,
    {
      themeMode: 'dark',
      themePreset: PREFERENCE_DEFAULTS.theme_preset,
      contentLayout: PREFERENCE_DEFAULTS.content_layout,
      navbarStyle: PREFERENCE_DEFAULTS.navbar_style,
      font: PREFERENCE_DEFAULTS.font,
    },
    React.createElement(
      SidebarProvider,
      {
        defaultOpen: true,
        // The provider renders a div with `flex min-h-svh w-full`, which fights
        // our column layout and collapses the panel. `display: contents` keeps
        // the context and the --sidebar-* variables while removing the box.
        style: { display: 'contents' },
      },
      React.createElement(TooltipProvider, { delayDuration: 200 }, content),
    ),
  )
}

/**
 * This component is mounted by the HOST's React (it is registered into a host
 * slot), while everything below the shadow root is rendered by THIS bundle's
 * React. Two different React instances are therefore involved, and the
 * slot-facing component must not use hooks: a hook from the bundle's React
 * executed inside the host's renderer throws "Invalid hook call", which
 * silently blanks the panel. A class component only relies on
 * `prototype.isReactComponent`, which both versions share.
 */
class ArtexPanel extends React.Component<Record<string, never>, Record<string, never>> {
  private host: HTMLDivElement | null = null
  private root: Root | null = null
  private shadow: ShadowRoot | null = null

  componentDidMount(): void {
    const host = this.host
    if (!host) return

    try {
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
      this.shadow = shadow

      const style = document.createElement('style')
      style.textContent = shadowCss
      shadow.appendChild(style)

      const mount = document.createElement('div')
      // `dark` selects ARTEX's dark palette, matching the host theme; without
      // it the panel renders a light island inside a dark app.
      mount.className = 'dark'
      // The ARTEX page's root is `flex flex-1 flex-col`; without a flex
      // formatting context here its `flex-1` collapses to zero height.
      mount.style.flex = '1 1 auto'
      mount.style.minHeight = '0'
      mount.style.display = 'flex'
      mount.style.flexDirection = 'column'
      mount.style.overflow = 'auto'
      shadow.appendChild(mount)

      // Portal target for Radix popups: `display: contents` keeps it out of the
      // layout while still living inside the shadow tree, so ARTEX's stylesheet
      // applies to dropdown/select/tooltip content.
      const portal = document.createElement('div')
      portal.style.display = 'contents'
      shadow.appendChild(portal)
      setPortalRoot(portal)

      this.root = createRoot(mount)
      this.root.render(
        React.createElement(Boundary, null, React.createElement(PanelBody)),
      )
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[artex-native] mount failed', error)
      if (this.shadow) {
        this.shadow.replaceChildren()
        const pre = document.createElement('pre')
        pre.style.cssText =
          'margin:0;padding:12px;font-size:12px;white-space:pre-wrap;color:#ff6b6b;background:rgba(0,0,0,.6);height:100%;box-sizing:border-box;overflow:auto'
        pre.textContent = 'ARTEX 挂载失败\n\n' + String((error as Error)?.stack ?? error)
        this.shadow.appendChild(pre)
      }
    }
  }

  componentWillUnmount(): void {
    try {
      this.root?.unmount()
    } catch {
      /* ignore */
    }
    try {
      this.shadow?.replaceChildren()
    } catch {
      /* ignore */
    }
    this.root = null
    this.shadow = null
  }

  render(): React.ReactElement {
    return React.createElement('div', {
      ref: (el: HTMLDivElement | null) => {
        this.host = el
      },
      style: {
        height: '100%',
        minHeight: 0,
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      },
    })
  }
}

function ArtexNativeIcon(owner: { size?: number } = {}): React.ReactElement {
  const size = owner.size ?? 16
  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'none',
      'aria-hidden': true,
      style: { display: 'block' },
    },
    React.createElement('circle', { cx: 12, cy: 12, r: 8.5, stroke: 'currentColor', strokeWidth: 1.6 }),
    React.createElement('circle', { cx: 12, cy: 12, r: 2.1, fill: 'currentColor' }),
    React.createElement('path', {
      d: 'M12 1.8v4.2M12 18v4.2M1.8 12h4.2M18 12h4.2',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
    }),
  )
}

/** Key format DSH dispatches for a bundle row: `<package name>#<row id>`. */
const CONFIG_ROW_KEY = '@local/dsh-artex-native#dsh-artex-native'
const DEFAULT_ARTEX_URL = 'http://127.0.0.1:8787'

interface ArtexConfigFormShape {
  state?: {
    value?: unknown
    revision?: number
    writable?: boolean
    status?: string
    mode?: string
  }
  mutate?: (operations: unknown[], revision: number) => Promise<boolean>
}

function readArtexUrl(value: unknown): string {
  if (value && typeof value === 'object') {
    const raw = (value as Record<string, unknown>).artexUrl
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  return DEFAULT_ARTEX_URL
}

/** Summary line shown on the plugin row. */
function ArtexConfigSummary(props: { form?: ArtexConfigFormShape }): React.ReactElement {
  return React.createElement('span', null, readArtexUrl(props.form?.state?.value))
}

/**
 * Configuration form for the plugin row.
 *
 * Rendered by the HOST's React (it is registered into a host slot), while this
 * module ships its own React — so it must be a class component. A function
 * component here would call the bundle's hooks inside the host renderer and
 * throw "Invalid hook call".
 *
 * The write path mirrors dsh-ops: `form.mutate([{ op:'set', path:[…], value }], revision)`.
 */
class ArtexConfigForm extends React.Component<
  { form?: ArtexConfigFormShape; view?: string },
  { draft: string; busy: boolean; message: string }
> {
  constructor(props: { form?: ArtexConfigFormShape; view?: string }) {
    super(props)
    this.state = {
      draft: readArtexUrl(props.form?.state?.value),
      busy: false,
      message: '',
    }
  }

  private async save(): Promise<void> {
    const form = this.props.form
    if (!form || typeof form.mutate !== 'function') {
      this.setState({ message: '配置不可写（form 不可用）' })
      return
    }
    const revision = form.state?.revision
    if (typeof revision !== 'number') {
      this.setState({ message: '缺少 revision，无法保存' })
      return
    }
    const value = this.state.draft.trim() || DEFAULT_ARTEX_URL
    this.setState({ busy: true, message: '' })
    try {
      const accepted = await form.mutate([{ op: 'set', path: ['artexUrl'], value }], revision)
      this.setState({ busy: false, message: accepted ? '已保存' : '被拒绝' })
    } catch (error) {
      this.setState({ busy: false, message: error instanceof Error ? error.message : String(error) })
    }
  }

  render(): React.ReactElement {
    const busy = this.state.busy
    return React.createElement(
      'form',
      {
        onSubmit: (event: { preventDefault(): void }) => {
          event.preventDefault()
          void this.save()
        },
        style: { display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 520 },
      },
      React.createElement(
        'label',
        { style: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 } },
        'ARTEX 后端地址',
        React.createElement('input', {
          type: 'text',
          value: this.state.draft,
          placeholder: DEFAULT_ARTEX_URL,
          disabled: busy,
          onChange: (event: { target: { value: string } }) =>
            this.setState({ draft: event.target.value, message: '' }),
          style: {
            height: 32,
            padding: '0 10px',
            borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-l1)',
            background: 'var(--dsw-alias-bg-layer-1)',
            color: 'var(--dsw-alias-label-primary)',
            fontSize: 13,
          },
        }),
      ),
      React.createElement(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement(
          'button',
          {
            type: 'submit',
            disabled: busy || !this.state.draft.trim(),
            style: {
              height: 30,
              padding: '0 14px',
              borderRadius: 6,
              border: '1px solid var(--dsw-alias-border-l1)',
              background: 'var(--dsw-alias-bg-layer-2)',
              color: 'var(--dsw-alias-label-primary)',
              fontSize: 12,
              cursor: 'pointer',
            },
          },
          busy ? '保存中…' : '保存',
        ),
        this.state.message
          ? React.createElement(
              'span',
              { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' } },
              this.state.message,
            )
          : null,
      ),
    )
  }
}

/**
 * Dev-only hook: lets a standalone HTML page mount the same panel (same shadow
 * wrapper, same CSS pipeline) outside the DSH shell. Nothing in the host sets
 * `__ARTEX_TEST_MOUNT__`, so production behaviour is unchanged.
 */
const testMount = (window as unknown as { __ARTEX_TEST_MOUNT__?: HTMLElement }).__ARTEX_TEST_MOUNT__
if (testMount) {
  try {
    const shadow = testMount.shadowRoot ?? testMount.attachShadow({ mode: 'open' })
    const style = document.createElement('style')
    style.textContent = shadowCss
    shadow.appendChild(style)
    const mount = document.createElement('div')
    mount.className = 'dark'
    mount.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column;overflow:auto'
    shadow.appendChild(mount)
    const portal = document.createElement('div')
    portal.style.display = 'contents'
    shadow.appendChild(portal)
    setPortalRoot(portal)
    createRoot(mount).render(
      React.createElement(Boundary, null, React.createElement(PanelBody)),
    )
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[artex-native] test mount failed', error)
  }
}

window.__ModuleLoader__.load({
  id: '@local/dsh-artex-native',
  factory() {
    return {
      inject: ['slots'],
      apply(ctx: {
        slots: {
          inject(key: string, cb: () => unknown): unknown
          register(options: Record<string, unknown>, component: unknown): unknown
        }
      }) {
        // Registration errors must not escape into the host's boot sequence.
        try {
          ctx.slots.inject('main', () =>
            ctx.slots.register({ name: 'main', key: 'artex-native' }, ArtexPanel),
          )
          ctx.slots.inject('sidebar.panellist', () =>
            ctx.slots.register(
              { name: 'sidebar.panellist', id: 'artex-native', order: 6, label: () => 'ARTEX 原生' },
              ArtexNativeIcon,
            ),
          )
          // Plugin-row configuration UI. DSH does not derive this from the Host
          // Config schema — each bundle registers its own summary + form here.
          ctx.slots.inject('plugins.row.config', () =>
            ctx.slots.register(
              { name: 'plugins.row.config', key: CONFIG_ROW_KEY },
              (props: { view: string }) =>
                props.view === 'summary'
                  ? React.createElement(ArtexConfigSummary, props as never)
                  : React.createElement(ArtexConfigForm, props as never),
            ),
          )
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error('[artex-native] slot registration failed', error)
        }
      },
    }
  },
})

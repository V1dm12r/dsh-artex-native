/**
 * Portal target shared by every Radix portal in the panel.
 *
 * Radix renders Select / DropdownMenu / Popover / Tooltip / Dialog content into
 * `document.body` by default. Inside the DSH panel that means it escapes the
 * Shadow DOM, where ARTEX's stylesheet lives — the popup then renders as bare
 * unstyled text on top of the page (the "text overlapping" bug).
 *
 * The panel registers a `display: contents` element inside its shadow root
 * here, and every portal component passes it as `container`.
 */

let portalRoot: HTMLElement | null = null

export function setPortalRoot(element: HTMLElement | null): void {
  portalRoot = element
}

export function getPortalRoot(): HTMLElement | undefined {
  return portalRoot ?? undefined
}

/** Convenience wrapper so portal components read as `container={portalContainer()}`. */
export function portalContainer(): HTMLElement | undefined {
  return getPortalRoot()
}

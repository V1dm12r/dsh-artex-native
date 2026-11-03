/**
 * `next/navigation` shim.
 *
 * ARTEX pages use usePathname / useSearchParams / useRouter. There is no Next
 * router inside the DSH panel, and driving the real `location` would collide
 * with the host's routing, so the route (including its query string) lives in
 * memory and notifies subscribers.
 *
 * Detail pages read `searchParams.get("id")`, so the query string has to be
 * part of the stored route rather than dropped.
 */
import { useEffect, useState } from 'react'

const listeners = new Set<(route: string) => void>()
let currentRoute = '/dashboard'

function splitRoute(route: string): { pathname: string; params: URLSearchParams } {
  const question = route.indexOf('?')
  if (question === -1) return { pathname: route, params: new URLSearchParams() }
  return {
    pathname: route.slice(0, question),
    params: new URLSearchParams(route.slice(question + 1)),
  }
}

export function navigate(route: string): void {
  const next = route.startsWith('/') ? route : `/${route}`
  if (next === currentRoute) return
  currentRoute = next
  for (const listener of listeners) listener(next)
}

export function getRoute(): string {
  return currentRoute
}

export function subscribe(listener: (route: string) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function usePathname(): string {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => subscribe(setRoute), [])
  return splitRoute(route).pathname
}

export function useSearchParams(): URLSearchParams {
  const [route, setRoute] = useState(currentRoute)
  useEffect(() => subscribe(setRoute), [])
  return splitRoute(route).params
}

export function useRouter() {
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }
}

export function useParams(): Record<string, string> {
  return {}
}

export function redirect(href: string): void {
  navigate(href)
}

export function notFound(): never {
  throw new Error('not found')
}

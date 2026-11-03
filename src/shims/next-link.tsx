/**
 * `next/link` shim: renders an anchor that drives the hash router instead of a
 * full page navigation (which would unload the DSH host).
 */
import * as React from 'react'
import { navigate } from './next-navigation'

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string
  replace?: boolean
  prefetch?: boolean
  scroll?: boolean
}

const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace: _replace, prefetch: _prefetch, scroll: _scroll, onClick, children, ...rest },
  ref,
) {
  return React.createElement(
    'a',
    {
      ...rest,
      ref,
      href: `#${href.startsWith('/') ? href : `/${href}`}`,      onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        event.preventDefault()
        navigate(href)
      },
    },
    children,
  )
})

export default Link

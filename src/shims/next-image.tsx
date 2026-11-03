/**
 * `next/image` shim: falls back to a plain <img> with native lazy loading.
 * ARTEX only uses it for local assets, which the panel does not ship.
 */
import * as React from 'react'

type ImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  src: string
  width?: number
  height?: number
  fill?: boolean
  priority?: boolean
  quality?: number
  placeholder?: string
  blurDataURL?: string
  loader?: unknown
  unoptimized?: boolean
}

const Image = React.forwardRef<HTMLImageElement, ImageProps>(function Image(
  {
    src, width, height, fill, priority: _priority, quality: _quality,
    placeholder: _placeholder, blurDataURL: _blur, loader: _loader,
    unoptimized: _unoptimized, style, alt, ...rest
  },
  ref,
) {
  return React.createElement('img', {
    ...rest,
    ref,
    src,
    alt: alt ?? '',
    width,
    height,
    loading: 'lazy',
    style: fill
      ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style }
      : style,
  })
})

export default Image

/**
 * `next/font/local` shim: Next injects a CSS class per font file. Inside the
 * panel the font files are not shipped, so the loader returns a class name that
 * resolves to nothing and lets the CSS font stack fall through.
 */
export default function localFont(_options: unknown): {
  className: string
  variable: string
  style: { fontFamily: string }
} {
  return {
    className: '',
    variable: '',
    style: { fontFamily: 'inherit' },
  }
}

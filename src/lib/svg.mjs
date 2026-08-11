/**
 * Shared SVG plumbing.
 *
 * ── Why the whole README is ONE SVG ──────────────────────────────────────
 * Sections must butt together with no gap. With one <img> per section that
 * is impossible on GitHub: each image lands in its own <p> (16px margin) and
 * images are inline, so they also carry a baseline gap underneath. The usual
 * fix — style="display:block" — cannot be used because GitHub's markdown
 * sanitiser STRIPS style attributes. So sections are fragments, and
 * composeDocument() stacks them into a single document at exact offsets.
 *
 * ── The <img> sandbox ────────────────────────────────────────────────────
 * The result is embedded with <img src="...">. A browser will run the SVG's
 * OWN <style> and SMIL, but will NOT load external fonts, external images or
 * any JavaScript. data: URIs are fine — they aren't external fetches.
 *
 * ── The t=0 rule ─────────────────────────────────────────────────────────
 * Some renderers apply CSS animations but never advance them, freezing
 * everything at t=0. Any animated part must therefore be CORRECT at t=0:
 * anchor the visible state at 0% and let the animation only take away.
 */
import { theme, layout, fonts } from '../theme.mjs'

/** XML-escape text destined for a <text> node or an attribute. */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Emit every theme token as a CSS custom property, dark values under a query. */
function themeVars() {
  return `
  :root {
${Object.entries(theme).map(([k, v]) => `    --${k}: ${v[0]};`).join('\n')}
    --font-sans: ${fonts.sans};
    --font-mono: ${fonts.mono};
    --font-serif: ${fonts.serif};
  }
  @media (prefers-color-scheme: dark) {
    :root {
${Object.entries(theme).map(([k, v]) => `      --${k}: ${v[1]};`).join('\n')}
    }
  }`
}

/**
 * A section fragment. Coordinates inside `body` are LOCAL — the composer
 * wraps each fragment in a <g transform="translate(0, y)">, so a section
 * never needs to know where it sits on the page.
 */
export function part({ name, height, body, css = '', band = null, defs = '' }) {
  // Capture the width NOW, while this section is being laid out.
  //
  // The page is built twice — wide, then narrow — and both passes share the
  // one mutable `layout`. composeDocument() used to read layout.width when it
  // ran, which was AFTER the narrow pass had already changed it. So the wide
  // files came out holding an 880px layout but declaring width="480", and
  // every browser dutifully cropped away the right 45% of the page.
  return { name, height, body, css, band, defs, width: layout.width }
}

/**
 * Stack fragments into one SVG document.
 *
 * Bands are plain full-bleed rects: square corners, no stroke, no fade, and
 * each starts exactly where the previous ended — so consecutive sections
 * meet on a hard colour edge with no seam.
 */
export function composeDocument(parts, { title = '' } = {}) {
  // Use the width the sections were BUILT at, never the current global one —
  // see part() for why. Mismatched pieces are a hard error rather than a
  // silently cropped page: this exact bug shipped once and was only found by
  // measuring the rendered image in a browser.
  const widths = new Set(parts.map((p) => p.width))
  if (widths.size > 1) {
    throw new Error(
      `composeDocument got sections built at different widths: ${[...widths].join(', ')}\n` +
      `  Every section in one slab must come from the same setLayout() pass.`
    )
  }
  const width = parts[0]?.width ?? layout.width
  const total = parts.reduce((n, p) => n + p.height, 0)

  let y = 0
  const bands = []
  const groups = []
  for (const p of parts) {
    if (p.band) {
      bands.push(`  <rect x="0" y="${y}" width="${width}" height="${p.height}" fill="var(--${p.band})"/>`)
    }
    groups.push(`  <g transform="translate(0, ${y})">\n${p.body}\n  </g>`)
    y += p.height
  }

  const defs = parts.map((p) => p.defs).filter(Boolean).join('\n')
  const css = parts.map((p) => p.css).filter(Boolean).join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${width}" height="${total}" viewBox="0 0 ${width} ${total}"
     role="img"${title ? ` aria-label="${esc(title)}"` : ''}>
${title ? `  <title>${esc(title)}</title>` : ''}
  <style>${themeVars()}

  text { font-family: var(--font-sans) }
  .mono { font-family: var(--font-mono) }
  .serif { font-family: var(--font-serif) }
${css}
  </style>
${defs ? `  <defs>\n${defs}\n  </defs>` : ''}
${bands.join('\n')}
${groups.join('\n')}
</svg>
`
}

/**
 * A <text> node using theme tokens.
 *
 * Every size passes through `layout.typeScale`, which is the whole mechanism
 * behind the narrow build: sections keep writing the sizes that look right at
 * 880px, and the phone pass silently enlarges all of them. Without this, the
 * wide layout scaled down to a 360px column renders 13px body text at ~5px.
 */
export function text(content, { x, y, size = 16, weight = 400, fill = 'fg', anchor = 'start', cls = '', opacity, extra = '' } = {}) {
  size = Math.round(size * (layout.typeScale ?? 1) * 10) / 10
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" ` +
    `fill="var(--${fill})" text-anchor="${anchor}"` +
    `${cls ? ` class="${cls}"` : ''}${opacity != null ? ` opacity="${opacity}"` : ''}` +
    `${extra ? ` ${extra}` : ''}>${esc(content)}</text>`
}

/** Rectangle using theme tokens. Square by default — layout.radius is 0. */
export function rrect(x, y, w, h, r, fill, { stroke, dash, opacity } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill === 'none' ? 'none' : `var(--${fill})`}"` +
    `${stroke ? ` stroke="var(--${stroke})" stroke-width="${layout.hairline}"` : ''}` +
    `${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity != null ? ` opacity="${opacity}"` : ''}/>`
}

/** Small uppercase section label, top-left of every section. */
export function kicker(label, { y = layout.kickerY, x = layout.padX } = {}) {
  return text(label.toUpperCase(), {
    x, y, size: 11, weight: 700, fill: 'muted', extra: 'letter-spacing="2.5"',
  })
}

/**
 * Right-aligned note on the kicker line.
 *
 * Dropped entirely on the narrow build when it's long. These share a line with
 * the section kicker, and at 480px a 50-character note runs straight through
 * it — "ON REPEAT" and "MOCK — hardcoded, or via metrics' Apple Music plugin"
 * were printing on top of each other. Notes are secondary by definition, so
 * losing the long ones on a phone costs nothing; a short one like guestbook's
 * "3 signed" still fits and still matters.
 */
const NOTE_MAX_NARROW = 30

export function note(s, { y = layout.kickerY } = {}) {
  if (layout.narrow && String(s).length > NOTE_MAX_NARROW) return ''
  return text(s, { x: layout.width - layout.padX, y, size: 11, fill: 'muted', anchor: 'end' })
}

/** An explicit "your art goes here" slot: dashed box + dimensions. */
export function artSlot(x, y, w, h, label) {
  return [
    rrect(x, y, w, h, 0, 'none', { stroke: 'accent', dash: '7 6', opacity: 0.85 }),
    text(label, { x: x + w / 2, y: y + h / 2 - 2, size: 11, weight: 600, fill: 'accent', anchor: 'middle' }),
    text(`${Math.round(w)}×${Math.round(h)}`, { x: x + w / 2, y: y + h / 2 + 15, size: 10, fill: 'muted', anchor: 'middle', cls: 'mono' }),
  ].join('\n  ')
}

export { layout }

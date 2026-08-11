/**
 * ASCII-art signature — the name in ANSI-Shadow block lettering, at the foot
 * of the page.
 *
 * ── Drawn as text, not as rects ────────────────────────────────────────────
 * The art is literally the characters █ ╗ ╚ ═ ║ (U+2588 and the U+255x box-
 * drawing range) set in the mono stack. Drawing the same shapes as SVG <rect>
 * elements would be renderer-proof, but this is meant to BE ASCII art — the
 * fact that it's characters is the whole point, and every monospace face in
 * theme.fonts.mono (Menlo, Consolas, SF Mono, DejaVu) carries the full box-
 * drawing block. Worst case on an exotic font stack is tofu squares, which
 * still read as blocks.
 *
 * ── Alignment without measuring text ───────────────────────────────────────
 * Each line is centred independently with text-anchor="middle". That only
 * lines the rows up because every line in config.signature.art is the SAME
 * character count — in a monospace face, equal counts means equal widths, so
 * equal centres means a flush left and right edge. If a line is a character
 * short the whole letterform shears by half a cell, which is why the config
 * says so out loud.
 *
 * Size is solved from the available width rather than fixed, so the narrow
 * (phone) build shrinks the art to fit instead of running past the margin.
 */
import { part, text, layout, esc } from '../lib/svg.mjs'
import { MONO_ADV_TIGHT } from '../lib/metrics.mjs'

/**
 * Monospace advance ≈ 0.6em. Only used to pick a size — never to position.
 * Shared as MONO_ADV_TIGHT in src/lib/metrics.mjs — deliberately NOT the
 * same constant as intro.mjs's mono estimate, which pads above the measured
 * value to guard against overflow. Here an underestimate only costs a
 * slightly smaller signature, so there's no reason to pad it.
 */
const ADV = MONO_ADV_TIGHT
const MAX_SIZE = 24

export function signature(config, { band }) {
  const { art, tagline } = config.signature
  const cols = Math.max(...art.map((l) => [...l].length))

  const avail = layout.width - layout.padX * 2
  // Rounded to a tenth: the size feeds the line height, which feeds the
  // section height, which becomes the composed document's height attribute —
  // unrounded it produced height="508.25742574257424", a fractional page.
  const size = Math.round(Math.min(MAX_SIZE, avail / (cols * ADV)) * 10) / 10
  // Block characters fill their full em box, so line-height == font-size is
  // what makes the rows touch and read as solid letterforms. Any leading at
  // all opens a visible white stripe through the middle of every letter.
  const lineH = size
  // text() multiplies by layout.typeScale itself; hand it the pre-scaled value
  // so the size solved against the real width survives the narrow pass.
  const sizeForText = size / (layout.typeScale ?? 1)

  const cx = layout.width / 2
  const top = layout.contentY + size

  const lines = art.map((line, i) =>
    text(line, {
      x: cx, y: top + i * lineH, size: sizeForText,
      fill: 'accent', anchor: 'middle', cls: 'mono',
      // Kill the default word-spacing wobble: these lines contain spaces that
      // must stay exactly one cell wide, like every other character.
      extra: 'xml:space="preserve"',
    })).join('\n  ')

  const taglineY = top + art.length * lineH + 22
  const height = Math.ceil(taglineY + layout.padBottom + 8)

  const body = `  ${lines}
  ${text(tagline, { x: cx, y: taglineY, size: 11, fill: 'muted', anchor: 'middle', extra: 'letter-spacing="1.5"' })}`

  return part({ name: 'signature', height, body, band })
}

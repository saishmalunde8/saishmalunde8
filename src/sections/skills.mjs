/**
 * Skills grid.
 *
 * Each tile draws the fetched simple-icons path (see src/icons.mjs) centered
 * inside it, scaled from the icon's own viewBox. A skill with no `icon` in
 * config, or one whose fetch failed, falls back to its two-letter `abbr` —
 * a tile with a label is better than a blank square, and it makes a missing
 * icon obvious rather than silently invisible.
 *
 * ── Icons are wide-build only ──────────────────────────────────────────────
 * The narrow (phone) build reuses the text-abbreviation fallback ON PURPOSE,
 * even when a real icon exists. Path data for detailed brand marks (rust,
 * linux, postgresql — hundreds of points each, packed into a tiny 24-unit
 * box) genuinely can't be shrunk without visible corruption (tried rounding
 * coordinates, broke several icons — see src/icons.mjs). Since wide and
 * narrow are separate self-contained SVG files that can't share a <defs>,
 * embedding full icon data in both meant paying that cost twice — once was
 * already the honest price of real brand icons, twice pushed the whole page
 * over budget. Skipping icons on narrow removes the duplication entirely
 * without touching a single icon's geometry.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part, text, rrect, kicker, layout, esc } from '../lib/svg.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

const TILE = 48
const GAP = 12
const ICON_SIZE = 24

export async function skills(config, { band }) {
  const items = config.skills

  let icons = {}
  try {
    icons = JSON.parse(await readFile(join(root, 'icons/cache.json'), 'utf8'))
  } catch { /* not fetched yet — every tile falls back to text */ }

  // Fit as many tiles per row as the width allows, so the narrow build wraps
  // instead of overflowing.
  const PER_ROW = Math.max(4, Math.floor((layout.width - layout.padX * 2 + GAP) / (TILE + GAP)))
  const rows = Math.ceil(items.length / PER_ROW)
  const height = layout.contentY + rows * (TILE + GAP) + layout.padBottom

  const gridW = PER_ROW * TILE + (PER_ROW - 1) * GAP
  const startX = (layout.width - gridW) / 2

  const tiles = items.map((s, i) => {
    const col = i % PER_ROW
    const row = Math.floor(i / PER_ROW)
    const x = startX + col * (TILE + GAP)
    const y = layout.contentY + row * (TILE + GAP)
    const cx = x + TILE / 2
    const cy = y + TILE / 2

    const icon = s.icon && !layout.narrow ? icons[s.icon] : undefined
    let glyph
    if (icon) {
      const [, , vbW, vbH] = icon.viewBox.split(/\s+/).map(Number)
      const scale = ICON_SIZE / Math.max(vbW, vbH)
      const ix = cx - (vbW * scale) / 2
      const iy = cy - (vbH * scale) / 2
      glyph = `<g transform="translate(${ix.toFixed(2)},${iy.toFixed(2)}) scale(${scale.toFixed(4)})">` +
        `<path d="${icon.d}" fill="var(--fg)"/></g>`
    } else {
      glyph = text(s.abbr, { x: cx, y: cy + 5, size: 15, weight: 700, fill: 'fg', anchor: 'middle', cls: 'mono' })
    }

    return [rrect(x, y, TILE, TILE, 12, 'surface'), glyph].join('')
  }).join('\n  ')

  const body = `  ${kicker('stack')}
  ${tiles}`

  return part({ name: 'skills', height: height, body, band })
}

/**
 * The social row — the only genuinely clickable part of the README.
 *
 * Nothing inside an <img> can be clicked, and GitHub blocks both escape
 * hatches: <map>/<area> aren't on its HTML allowlist, and `style` is stripped
 * so an image map can't be faked. One <img> per link target is the only way.
 *
 * ── Icons instead of labels ────────────────────────────────────────────────
 * Each social badge now renders the fetched simple-icons path (see
 * src/icons.mjs) centered in the pill, instead of the platform name as text.
 * The `alt` attribute on the <img> in build.mjs still carries the name, so
 * screen readers and hover tooltips are unaffected — only the visible glyph
 * changed. The coffee badge is untouched: it never used a brand icon, so it
 * keeps its emoji + text.
 *
 * ── Making separate images look like one band ────────────────────────────
 * Every badge is authored at the SAME viewBox, and each carries a full-bleed
 * background in the band colour with the pill inset inside it. The markdown
 * then gives each one width="100/n %" with NO whitespace between the tags, so
 * they tile edge to edge and their backgrounds join into a single continuous
 * band that spans the column exactly — left edge to right edge.
 *
 * Two consequences worth knowing:
 *  - Uniform width means every pill is the same size regardless of platform
 *    name length, which is exactly why icons (fixed visual weight) fit this
 *    layout better than text labels (variable width) ever did.
 *  - Whitespace between the <a> tags would render as a real space and break
 *    the seam, so build.mjs joins them with no separator at all.
 */
import { theme, fonts } from '../theme.mjs'
import { esc } from '../lib/svg.mjs'

/** Uniform tile. Same aspect for every badge, so percentage widths keep
 *  their heights identical — different aspects would stagger them. */
const W = 126
const H = 58
const INSET_X = 6
const PILL_Y = 11
const PILL_H = 36
const ICON_SIZE = 20

export function badge({ label, icon, filled = false, band = 'band4' }) {
  const vars = (i) => Object.entries(theme).map(([k, v]) => `--${k}:${v[i]}`).join(';')

  const pillCx = W / 2
  const pillCy = PILL_Y + PILL_H / 2

  /**
   * Real brand colour, per theme.
   *
   * `icon.color` carries a light and a dark hex, already adjusted for
   * legibility against each theme's surface — see themeColors() in
   * src/icons.mjs for why a single hex isn't enough (X's #000000 disappears
   * on dark, Buy Me a Coffee's #FFDD00 disappears on light). It's emitted as
   * one more CSS custom property so the existing prefers-color-scheme block
   * switches it along with everything else.
   *
   * A `filled` badge keeps the page colour instead: its pill is solid accent,
   * and a brand hex on top of that is a colour clash at best and unreadable
   * at worst.
   */
  const ink = filled ? 'page' : 'ico'
  const inkVars = (i) => icon?.color
    ? `;--ico:${i ? icon.color.dark : icon.color.light}`
    : ';--ico:var(--fg)'

  // Icon path, if one was fetched — scaled from its own viewBox (always 24×24
  // in practice, but read the real one rather than assuming) into ICON_SIZE
  // and centered in the pill.
  let glyph
  if (icon) {
    const [, , vbW, vbH] = icon.viewBox.split(/\s+/).map(Number)
    const scale = ICON_SIZE / Math.max(vbW, vbH)
    const x = pillCx - (vbW * scale) / 2
    const y = pillCy - (vbH * scale) / 2
    glyph = `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${scale.toFixed(4)})">` +
      `<path d="${icon.d}" fill="var(--${ink})"/></g>`
  } else {
    // Fallback: no icon fetched yet (or the coffee badge, which never gets
    // one) — same text rendering as before this change.
    glyph = `<text x="${pillCx}" y="${pillCy + 5}" font-size="15" font-weight="600" ` +
      `fill="var(--${filled ? 'page' : 'fg'})" text-anchor="middle">${esc(label)}</text>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
  <style>
    :root { ${vars(0)}${inkVars(0)} }
    @media (prefers-color-scheme: dark) { :root { ${vars(1)}${inkVars(1)} } }
    text { font-family: ${fonts.sans} }
  </style>
  <rect width="${W}" height="${H}" fill="var(--${band})"/>
  <rect x="${INSET_X}" y="${PILL_Y}" width="${W - INSET_X * 2}" height="${PILL_H}"
        rx="6" fill="var(--${filled ? 'accent' : 'surface'})"/>
  ${glyph}
</svg>
`
}

/**
 * One row of badges, read from `config[group]` — `socials` (the platforms) or
 * `links` (call, talks, résumé, sponsor, coffee). Two rows rather than one
 * because eleven pills sharing a single 880px row shrink each tile to ~80px,
 * and the icons stop being legible before the row stops fitting.
 *
 * `icons` is a plain {slug: {d, viewBox}} map — a missing slug just falls back
 * to the text rendering above rather than failing the build, since a badge
 * with a name on it is still better than no badge.
 */
/**
 * An invisible spacer tile: same viewBox and full-bleed band colour as a real
 * badge, no pill, no icon, not wrapped in a link.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * Each row's badges get width="100/n%" so they tile edge to edge — but n is
 * that ROW's own count, and every badge shares one fixed 126×58 viewBox. A
 * shorter row therefore stretches its tiles to a LARGER physical size to
 * still fill 100% of the column, while a longer row's tiles stay smaller.
 * With socials at 6 and links at 5, the links row rendered visibly larger —
 * pills, icons and text all ~20% bigger than the row above it.
 *
 * The fix is to pad the shorter row with blank band-coloured tiles up to the
 * same tile COUNT as the widest row, so every row divides 100% by the same
 * denominator and every tile — real or blank — comes out the same physical
 * size. The padding is invisible: same band colour as its neighbours, so it
 * reads as the row simply ending a little early, exactly like a row that had
 * fewer badges to begin with — which is what the "keep row counts matched"
 * rule in the project docs meant, just enforced automatically now instead of
 * needing to be remembered by hand on every edit.
 */
export function spacerBadge({ band = 'band4' } = {}) {
  const vars = (i) => Object.entries(theme).map(([k, v]) => `--${k}:${v[i]}`).join(';')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"
     viewBox="0 0 ${W} ${H}" role="presentation" aria-hidden="true">
  <style>
    :root { ${vars(0)} }
    @media (prefers-color-scheme: dark) { :root { ${vars(1)} } }
  </style>
  <rect width="${W}" height="${H}" fill="var(--${band})"/>
</svg>
`
}

export function badgeList(config, icons = {}, group = 'socials') {
  return (config[group] ?? []).map((s) => ({
    // Filesystem-safe and unique across both rows, since every badge becomes
    // its own file in assets/.
    key: `${group}-${s.label.toLowerCase().replace(/[^a-z0-9]+/g, '')}`,
    label: s.label,
    url: s.url,
    filled: s.filled ?? false,
    icon: s.icon ? icons[s.icon] : undefined,
  }))
}

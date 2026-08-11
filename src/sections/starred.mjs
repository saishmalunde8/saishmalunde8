/**
 * Recently starred repositories.
 *
 * Reads data/starred.json, written by src/livedata.mjs / the daily
 * .github/workflows/refresh.yml job hitting the public, no-token
 * /users/<login>/starred endpoint.
 *
 * ── Three states, in order of preference ───────────────────────────────────
 *  1. Two or more real starred repos → show them.
 *  2. Fewer than two, but config.starred.repos has a curated list → show that
 *     instead. One lone repo under "Recently Starred" reads as broken.
 *  3. Neither → the honest empty state below.
 *
 * State 3 was what rendered for a long time, but not because the account had
 * no stars — the profile's "Private profile" setting hides starred repos from
 * anonymous callers, so the token-free fetch was being told zero. With that
 * off, real stars arrive and state 1 takes over on its own.
 *
 * ── Real descriptions are long, and must be cut to fit ─────────────────────
 * This section was written against ~40-character placeholder descriptions.
 * Real ones off the API measured 104, 151, 170 and 230 characters; at 12px
 * that last one is roughly 1,380px of text on an 880px page. Drawn raw it ran
 * past the card, under the star count and off the page entirely. Both the
 * name and the description are therefore cut to a budget solved from the
 * actual column width — see fitChars() below.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part, text, rrect, kicker, layout, esc } from '../lib/svg.mjs'
import { SANS_ADV } from '../lib/metrics.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ROW = 54
const MIN_REAL = 2

/**
 * Average glyph advance for the sans stack, as a fraction of font-size.
 *
 * Proportional type has no single advance, so this is an estimate — but a
 * deliberately generous one. Overshooting cuts a character early, which is
 * invisible next to an ellipsis; undershooting puts text through the edge of
 * the card, which is the bug being fixed. Shared as SANS_ADV in
 * src/lib/metrics.mjs — see there for why the mono sections use different
 * numbers rather than this one.
 */
const ADV = SANS_ADV

/** Width reserved on the right for the `★ 126.4k` count, plus a gap. */
const STAR_COL = 96

/** Longest string that fits `width` px at `size`, in characters. */
const fitChars = (width, size) =>
  Math.max(8, Math.floor(width / (size * (layout.typeScale ?? 1) * ADV)))

const clip = (s, max) =>
  String(s).length > max ? `${String(s).slice(0, Math.max(0, max - 1)).trimEnd()}…` : String(s)

export async function starred(config, { band }) {
  let repos = config.starred.repos
  let live = false

  try {
    const data = JSON.parse(await readFile(join(root, 'data/starred.json'), 'utf8'))
    if (data.repos.length >= MIN_REAL) {
      repos = data.repos
      live = true
    } else if (repos.length) {
      console.warn(`  ! data/starred.json has only ${data.repos.length} repo(s) — ` +
        `keeping the curated list in profile.config.json until there's more to show`)
    }
  } catch { /* no fetch yet — config list stands */ }

  const px = layout.padX

  /**
   * Honest empty state.
   *
   * The curated placeholder list was removed from config on purpose — four
   * invented "recently starred" repos are a claim about what you read, and
   * it wasn't true. One quiet row saying so costs a fraction of the height
   * and disappears by itself the moment there's real data.
   */
  if (!repos.length) {
    const h = 46
    return part({
      name: 'starred', band,
      height: layout.contentY + h + layout.padBottom,
      body: `  ${kicker('recently starred')}
  ${rrect(px, layout.contentY, layout.width - px * 2, h, 10, 'surface')}
  ${text('nothing starred yet — this fills in on its own', { x: px + 16, y: layout.contentY + 28, size: 13, fill: 'muted' })}`,
    })
  }

  const height = layout.contentY + repos.length * ROW + layout.padBottom

  // Text runs from the card's left padding to where the star count starts.
  const textW = (layout.width - px * 2) - 32 - STAR_COL
  const nameMax = fitChars(textW, 14)
  const descMax = fitChars(textW, 12)

  const rows = repos.map((r, i) => {
    const y = layout.contentY + i * ROW
    return [
      rrect(px, y, layout.width - px * 2, ROW - 10, 10, 'surface'),
      text(clip(r.name, nameMax), { x: px + 16, y: y + 23, size: 14, weight: 600, fill: 'accent2' }),
      text(clip(r.desc, descMax), { x: px + 16, y: y + 40, size: 12, fill: 'muted' }),
      text(`★ ${r.stars}`, { x: layout.width - px - 16, y: y + 31, size: 12, fill: 'muted', anchor: 'end', cls: 'mono' }),
    ].join('')
  }).join('\n  ')

  const body = `  ${kicker('recently starred')}
  ${rows}`

  return part({ name: 'starred', height: height, body, band })
}

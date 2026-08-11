/**
 * GitHub stats — four counters, nothing else.
 *
 * They read data/stats.json when it exists, written by src/livedata.mjs from
 * the public, no-token GitHub API. There is deliberately no "commits" tile:
 * an exact count isn't available without a personal access token (the same
 * limitation the contribution graph hit), so "forks earned" takes that slot
 * instead, summed from the same /repos call that already provides "stars
 * earned" — no extra request.
 *
 * ── The WakaTime bars are gone ─────────────────────────────────────────────
 * This section used to give half its width to a language breakdown. Those
 * numbers could only ever be hand-typed here: WakaTime is a separate service
 * needing its own account and an API key in a repo secret, and without it the
 * bars were decoration claiming to be data. Removed rather than left as
 * plausible-looking fiction. The counters now run full width, which is also
 * the only reason four of them fit on one row.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part, text, rrect, kicker, layout, esc } from '../lib/svg.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * "3 hours ago" from an ISO timestamp.
 *
 * Deliberately coarse — its accuracy is bounded by how often the refresh
 * Action runs, and there is no honest way to render minute precision into a
 * static image. Anything a day old rounds to days, which is the resolution
 * the number actually has.
 *
 * `now` defaults to the real clock but is always passed explicitly as
 * data/code.json's own `fetchedAt` — the moment livedata.mjs pulled this
 * number, not the moment build.mjs happens to run. Using the live clock here
 * made the string tick forward on every local rebuild (the underlying data
 * hadn't changed, only the time since it was fetched had), which made
 * `npm test` report drift on every run and defeated the daily refresh
 * workflow's "only commit if something changed" guard. Freezing `now` to
 * `fetchedAt` means this line is stable across any number of rebuilds and
 * only moves once a day, when the next real fetch happens.
 */
function ago(iso, now = new Date()) {
  const mins = Math.max(0, Math.round((now - new Date(iso)) / 60000))
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  const months = Math.round(days / 30)
  return `${months} ${months === 1 ? 'month' : 'months'} ago`
}

export async function stats(config, { band }) {
  let counters = config.stats.counters
  try {
    const data = JSON.parse(await readFile(join(root, 'data/stats.json'), 'utf8'))
    counters = data.counters
  } catch { /* no fetch yet — config counters stand */ }

  // Real line counts + most recent push, from src/livedata.mjs. Absent until
  // the fetch has run at least once, in which case the strip is simply not
  // drawn — no invented number stands in for it.
  let code = null
  try {
    code = JSON.parse(await readFile(join(root, 'data/code.json'), 'utf8'))
  } catch { /* not fetched yet */ }

  const px = layout.padX
  // Four across at 880. At 480 that's 108px a tile, which can't hold "PUBLIC
  // REPOS" on one line, so the phone build goes 2×2.
  const perRow = layout.narrow ? 2 : counters.length
  const rows = Math.ceil(counters.length / perRow)
  const gap = 12
  const w = (layout.width - px * 2 - gap * (perRow - 1)) / perRow
  const tileH = layout.narrow ? 62 : 70
  const gridBottom = layout.contentY + rows * (tileH + gap) - gap

  /**
   * Lines-of-code and last-push, as one strip under the tiles rather than two
   * more counter tiles. Five tiles don't divide evenly into a four-wide row,
   * and both of these read as sentences ("~57k lines across 7 repos") rather
   * than as single numbers — a tile would have to throw away the context that
   * makes them mean anything.
   */
  const stripH = 34
  const strip = []
  if (code) {
    const y = gridBottom + gap
    const linesText = code.lines >= 1000
      ? `~${Math.round(code.lines / 1000)}k lines`
      : `${code.lines} lines`
    strip.push(rrect(px, y, layout.width - px * 2, stripH, 10, 'surface'))
    strip.push(text(`${linesText} across ${code.repos} repos`,
      { x: px + 16, y: y + 22, size: 12, weight: 600, fill: 'fg' }))
    if (code.lastPush) {
      const now = code.fetchedAt ? new Date(code.fetchedAt) : new Date()
      strip.push(text(`last pushed ${ago(code.lastPush.at, now)} → ${code.lastPush.repo}`,
        { x: layout.width - px - 16, y: y + 22, size: 12, fill: 'muted', anchor: 'end' }))
    }
  }

  const height = (strip.length ? gridBottom + gap + stripH : gridBottom) + layout.padBottom

  const tiles = counters.map((c, i) => {
    const x = px + (i % perRow) * (w + gap)
    const y = layout.contentY + Math.floor(i / perRow) * (tileH + gap)
    return [
      rrect(x, y, w, tileH, 10, 'surface'),
      text(c.value, { x: x + 16, y: y + 34, size: 24, weight: 700, fill: 'fg', cls: 'mono' }),
      text(c.label, { x: x + 16, y: y + 54, size: 11, fill: 'muted', extra: 'letter-spacing="1.2"' }),
    ].join('')
  }).join('\n  ')

  const body = `  ${kicker('by the numbers')}
  ${tiles}
  ${strip.join('\n  ')}`

  return part({ name: 'stats', height, body, band })
}

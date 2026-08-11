/**
 * Guestbook.
 *
 * Reads data/guestbook.json, appended to by src/guestbook-append.mjs when
 * someone submits .github/ISSUE_TEMPLATE/guestbook.yml — see
 * .github/workflows/guestbook.yml for the full flow: parse the issue form,
 * append the entry, rebuild, commit, comment "thanks", close the issue.
 *
 * No sparse-data fallback: even one real signature is genuine content, so it
 * always renders as-is rather than waiting for some minimum count. Only the
 * very first build (before anyone has ever signed) shows the curated
 * config.guestbook.entries as a placeholder.
 *
 * No fabricated "visitors" count. The original mock had one (1,284, invented
 * for layout purposes) — nothing here actually tracks page views, so the
 * note now shows the real number of signatures instead of a number with no
 * data behind it.
 *
 * The whole band is wrapped in one link by build.mjs — see the guestbook
 * slab's `href`. The button drawn below is visual only; the real click
 * target is the entire image.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part, text, note, rrect, kicker, layout, esc } from '../lib/svg.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const ROW = 42

export async function guestbook(config, { band }) {
  let entries = config.guestbook.entries
  let live = false
  try {
    const data = JSON.parse(await readFile(join(root, 'data/guestbook.json'), 'utf8'))
    entries = data.entries
    live = true
  } catch { /* nobody has signed yet — curated entries stand */ }

  const px = layout.padX
  // An empty guestbook still needs a row's worth of height, or the Sign
  // button collides with the kicker. One line of invitation fills it.
  const height = layout.contentY + Math.max(1, entries.length) * ROW + 60

  const empty = entries.length
    ? ''
    : text('no signatures yet — be the first', { x: px, y: layout.contentY + 20, size: 13, fill: 'muted' })

  const rows = entries.map((e, i) => {
    const y = layout.contentY + i * ROW
    return [
      i > 0 ? `<line x1="${px}" y1="${y - 6}" x2="${layout.width - px}" y2="${y - 6}" stroke="var(--border)" stroke-width="1"/>` : '',
      `<circle cx="${px + 14}" cy="${y + 16}" r="13" fill="var(--accent)" opacity="0.25"/>`,
      text(e.name.slice(0, 1).toUpperCase(), { x: px + 14, y: y + 21, size: 12, weight: 700, fill: 'accent', anchor: 'middle' }),
      text(e.name, { x: px + 38, y: y + 15, size: 13, weight: 600, fill: 'fg' }),
      text(e.message, { x: px + 38, y: y + 32, size: 12, fill: 'muted' }),
      text(e.date, { x: layout.width - px, y: y + 22, size: 11, fill: 'muted', anchor: 'end', cls: 'mono' }),
    ].join('')
  }).join('\n  ')

  const btnY = height - 48
  const btnW = 190
  const body = `  ${kicker('guestbook')}
  ${note(entries.length ? `${entries.length} signed` : '')}
  ${empty}
  ${rows}
  ${rrect(px, btnY, btnW, 34, 17, 'accent', { opacity: 0.9 })}
  ${text('✎  Sign the guestbook', { x: px + btnW / 2, y: btnY + 22, size: 13, weight: 600, fill: 'bg', anchor: 'middle' })}
  ${text('click anywhere in this band — it opens a pre-filled issue', { x: px + btnW + 16, y: btnY + 22, size: 11, fill: 'muted' })}`

  return part({ name: 'guestbook', height: height, body, band })
}

/**
 * On repeat — hardcoded track list (title/artist/length, from config), real
 * pixelated album art fetched by src/albumart.mjs.
 *
 * Each cover is embedded as a base64 PNG, same discipline as the hero and
 * clips: no external image can load inside an SVG shown via <img>, so the
 * art has to be baked in at build time, not hotlinked. A track with no
 * matching cover (fetch not run yet, or no iTunes match for an obscure
 * track) falls back to the plain amber circle + music-note glyph this
 * section always had — never a blank row.
 *
 * ── Covers are wide-build only, same reasoning as skills.mjs ────────────────
 * Wide and narrow are separate self-contained SVG files, so embedding a
 * cover means paying for it twice. That's an easy call for skill-icon path
 * data (visible corruption risk if shrunk); it's a cheaper call here since
 * these are already-tiny pixelated PNGs, but the duplication is still real
 * bytes for no visual gain, and the placeholder note glyph already existed
 * as a legitimate fallback. Skip covers on narrow rather than pay twice.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part, text, rrect, kicker, layout, esc } from '../lib/svg.mjs'
import { trackKey } from '../albumart.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

const ART = 40
const ROW = 52

export async function music(config, { band }) {
  const tracks = config.music.tracks
  const px = layout.padX
  const height = layout.contentY + tracks.length * ROW + layout.padBottom

  let covers = {}
  try {
    covers = JSON.parse(await readFile(join(root, 'art/albumart-out/manifest.json'), 'utf8'))
  } catch { /* not fetched yet — every row falls back to the note glyph */ }

  const defs = []
  const rows = []

  for (const [i, t] of tracks.entries()) {
    const y = layout.contentY + i * ROW
    const ax = px + 8
    const ay = y + 2

    // The cover is wide-build only (see the header), but the DURATION comes
    // from the same manifest and is just text — cheap enough to use on both.
    const found = covers[trackKey(t.title, t.artist)]
    const length = found?.length ?? t.length ?? ''

    const cover = !layout.narrow && found
    let art
    if (cover) {
      const b64 = (await readFile(join(root, 'art/albumart-out', cover.file))).toString('base64')
      const id = `mc${i}`
      defs.push(`    <image id="${id}" href="data:image/png;base64,${b64}" width="${ART}" height="${ART}"/>`)
      art = `<use href="#${id}" x="${ax}" y="${ay}" style="image-rendering:pixelated"/>`
    } else {
      art = [
        rrect(ax, ay, ART, ART, 8, 'accent', { opacity: 0.18 }),
        text('♫', { x: ax + ART / 2, y: ay + ART / 2 + 6, size: 16, fill: 'accent', anchor: 'middle' }),
      ].join('')
    }

    rows.push([
      rrect(px, y, layout.width - px * 2, ROW - 10, 10, 'surface'),
      art,
      text(t.title, { x: px + 8 + ART + 14, y: y + 21, size: 14, weight: 600, fill: 'fg' }),
      text(t.artist, { x: px + 8 + ART + 14, y: y + 38, size: 12, fill: 'muted' }),
      text(length, { x: layout.width - px - 14, y: y + 30, size: 12, fill: 'muted', anchor: 'end', cls: 'mono' }),
    ].join(''))
  }

  const body = `  ${kicker('on repeat')}
  ${rows.join('\n  ')}`

  return part({ name: 'music', height, body, band, defs: defs.join('\n') })
}

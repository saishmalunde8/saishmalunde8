/**
 * "Currently" — looping clips of you doing things (guitar, boxing, pull-ups).
 *
 * Frames come from `npm run clips`, pixelated with the same treatment as the
 * paintings, and are embedded here as base64 layers cycled with opacity —
 * exactly the hero's mechanism.
 *
 * That choice is what lets the clips sit INSIDE the coloured band. Plain
 * animated GIFs would have to be separate <img> tags in the markdown, which
 * means no band behind them and a seam above and below each one. Pixelating
 * into the SVG keeps the section whole and the art direction consistent.
 *
 * Until frames exist the section renders labelled slots, so the layout is real
 * and only the content is missing.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part, kicker, artSlot, layout } from '../lib/svg.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const EPS = 0.001

/**
 * No captions under the clips, on purpose — the clips speak for themselves,
 * and a row of labels under moving images just competed with them. The
 * `label` in config survives only as the placeholder text inside the empty
 * slots below, which does need naming.
 */
export async function currently(config, { band }) {
  const items = config.currently.items
  const px = layout.padX
  const gap = 16
  // Five or more would need wrapping, but 4 across is already unreadable at
  // 480px, so the narrow build drops to 2 up once there are that many.
  const perRow = layout.narrow && items.length >= 4 ? 2 : items.length
  const rows = Math.ceil(items.length / perRow)

  /**
   * Fixed slot, centred row — not "divide the width up between however many
   * clips there are".
   *
   * SLOT is the size the frames are actually rendered at by src/clips.mjs, so
   * matching it here means the sprites display at their native resolution.
   * Letting three clips share the full width instead would blow each one up
   * to 261px, a 2.7x upscale of a 96px grid, which is visibly mushier for no
   * gain. Capped by the available width so the narrow build still fits.
   */
  const SLOT = 192
  const w = Math.min(SLOT, (layout.width - px * 2 - gap * (perRow - 1)) / perRow)
  // Portrait: these are standing figures, not landscape video. Keep in step
  // with SLOT_W/SLOT_H in src/clips.mjs — they describe the same box.
  const h = Math.round(w * 1.26)
  const height = layout.contentY + rows * (h + gap) - gap + layout.padBottom

  // Each row is centred on its OWN item count, so a partial last row sits in
  // the middle rather than hanging off the left.
  const rowStartX = (row) => {
    const inRow = Math.min(perRow, items.length - row * perRow)
    return (layout.width - (inRow * w + gap * (inRow - 1))) / 2
  }

  const slotAt = (i) => ({
    x: rowStartX(Math.floor(i / perRow)) + (i % perRow) * (w + gap),
    y: layout.contentY + Math.floor(i / perRow) * (h + gap),
  })

  let clips = []
  try {
    clips = JSON.parse(await readFile(join(root, 'art/clips-out/manifest.json'), 'utf8'))
  } catch { /* no frames yet — fall through to slots */ }

  /* ---------- no frames yet: labelled slots ---------- */
  if (!clips.length) {
    const slots = items.map((it, i) => {
      const { x, y } = slotAt(i)
      return artSlot(x, y, w, h, it.label.toUpperCase())
    }).join('\n  ')

    return part({
      name: 'currently', height, band,
      body: `  ${kicker('currently')}\n  ${slots}`,
    })
  }

  /* ---------- frames present: animate them ---------- */
  const frameMs = config.currently.frameMs ?? 90
  const defs = []
  const layers = []
  const keyframes = []
  const rules = []

  // Slots whose clip hasn't been made yet keep their dashed placeholder rather
  // than rendering nothing. Once one clip exists this section takes the
  // animate path for the whole row, and without this the other three slots
  // were simply absent — one figure and three holes, which reads as broken
  // rather than as work in progress.
  const pending = []

  for (const [i, it] of items.entries()) {
    const clip = clips.find((c) => c.name === (it.clip ?? it.label))
    const { x, y } = slotAt(i)
    if (!clip) {
      pending.push(artSlot(x, y, w, h, it.label.toUpperCase()))
      continue
    }

    // Scale the clip's own grid into whatever slot width this layout has, so
    // the narrow build reuses the same frames instead of needing a re-render.
    const sh = Math.round((clip.dispH / clip.dispW) * w)
    const sy = y + Math.round((h - sh) / 2)

    /**
     * `flip: true` on a config item mirrors that clip horizontally.
     *
     * Done at render time rather than baked into the frames: it costs nothing
     * (one attribute), needs no re-slicing, and stays reversible from config.
     * `scale(-1,1)` alone would mirror about x=0 and throw the image off the
     * left of the page, so it's paired with a translate of 2x+w to land the
     * mirrored copy back on the same span. It has to sit on the <image>
     * itself — putting it on the <use> below would fight the x/y already
     * baked into the referenced element.
     */
    const mirror = it.flip
      ? ` transform="translate(${(2 * x + w).toFixed(2)} 0) scale(-1 1)"`
      : ''

    /**
     * The phone gets ONE frame, held still.
     *
     * Every frame is a separate base64 PNG and wide/narrow are separate
     * self-contained files, so a full animation in both costs twice over for
     * a loop nobody watches at 480px. Unlike the skill icons or album art,
     * dropping the content entirely on narrow isn't an option here — the clip
     * IS the section, and a dashed placeholder on mobile forever would be
     * worse than a still. So narrow keeps the figure and loses the motion.
     */
    if (layout.narrow) {
      const b64 = (await readFile(join(root, 'art/clips-out', clip.name, clip.frames[0]))).toString('base64')
      layers.push(`  <image class="px" href="data:image/png;base64,${b64}" x="${x}" y="${sy}" width="${w}" height="${sh}"${mirror}/>`)
      continue
    }

    const n = clip.frames.length
    const total = n * frameMs
    const slice = 100 / n

    for (const [k, f] of clip.frames.entries()) {
      const b64 = (await readFile(join(root, 'art/clips-out', clip.name, f))).toString('base64')
      defs.push(`    <image id="c${i}f${k}" class="px" href="data:image/png;base64,${b64}" x="${x}" y="${sy}" width="${w}" height="${sh}"${mirror}/>`)
      layers.push(`  <use class="cl x${i}f${k}" href="#c${i}f${k}"/>`)

      // Each frame owns its slice. Frame 0 is opaque at 0% so a renderer that
      // freezes animation shows a clean first pose rather than nothing.
      const from = k * slice
      const to = (k + 1) * slice
      const stops = k === 0
        ? [[0, 1], [to - EPS, 1], [to, 0], [100, 0]]
        : k === n - 1
          ? [[0, 0], [from - EPS, 0], [from, 1], [100, 1]]
          : [[0, 0], [from - EPS, 0], [from, 1], [to - EPS, 1], [to, 0], [100, 0]]

      keyframes.push(`
  @keyframes c${i}f${k} {
${stops.map(([p, o]) => `    ${p.toFixed(4)}% { opacity: ${o} }`).join('\n')}
  }`)
      rules.push(`  .x${i}f${k} { animation: c${i}f${k} ${total}ms linear infinite${k === 0 ? '; opacity: 1' : ''} }`)
    }
  }

  return part({
    name: 'currently',
    height,
    band,
    defs: defs.join('\n'),
    body: `  ${kicker('currently')}\n  ${pending.join('\n  ')}\n${layers.join('\n')}`,
    css: `
  .px { image-rendering: pixelated; image-rendering: crisp-edges }
  .cl { opacity: 0 }
${rules.join('\n')}
${keyframes.join('')}
  @media (prefers-reduced-motion: reduce) { .cl { animation: none } }`,
  })
}

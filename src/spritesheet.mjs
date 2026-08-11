#!/usr/bin/env node
/**
 * Slice a sprite sheet into the PNG frame sequence src/clips.mjs expects.
 *
 *   node src/spritesheet.mjs <sheet.png> <name> <cols> <rows> [--every N]
 *
 * e.g. node src/spritesheet.mjs ~/Downloads/Saish-punch.png boxing 5 5
 *      → art/clips/boxing/frame-00.png … frame-24.png
 *
 * ── The flood fill is a fallback, and usually a no-op ─────────────────────
 * A sheet exported with real alpha needs no keying at all, and the first one
 * through here was exactly that — the white "background" was the image
 * viewer's backdrop showing through, not pixels in the file. The fill reports
 * how much it actually cleared so you can tell which kind you have.
 *
 * When a sheet DOES have baked-in white, the obvious fix is `colorkey=white`,
 * which makes every white pixel transparent — and on a character wearing a
 * white shirt that punches a hole straight through him. So instead background
 * is found by flooding inward from the border: a pixel counts only if it is
 * near-white AND reachable from the edge without crossing the character. An
 * enclosed white shirt is never reached. It clears the gutters between cells
 * in the same pass, since on a sheet they're all one connected region.
 *
 * ── Why raw RGBA through ffmpeg ───────────────────────────────────────────
 * The project has no image-library dependency and shouldn't grow one for
 * this. ffmpeg already ships with the pipeline, and it will happily decode a
 * PNG to a flat RGBA buffer and re-encode one afterwards — so the flood fill
 * is plain array work in Node between two ffmpeg calls, with nothing to
 * install.
 *
 * ── Frames are cropped to a SHARED box ────────────────────────────────────
 * Every cell is trimmed to the union of all cells' opaque bounds, never to
 * its own. Trimming each frame to its own content re-centres the character on
 * every frame, so a punch that should throw the arm forward instead looks
 * like the whole body twitching in place. One shared box preserves the motion.
 */
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** A pixel this close to white, reachable from the edge, is background. */
const WHITE = 238

/** Decode any image to a flat RGBA buffer. */
async function toRGBA(file, w, h) {
  const { stdout } = await run('ffmpeg',
    ['-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'],
    { encoding: 'buffer', maxBuffer: w * h * 4 + 1024 })
  return stdout
}

/**
 * Re-encode a flat RGBA buffer as a PNG.
 *
 * spawn, not promisify(execFile): the promisified form resolves to the output
 * and never hands back the child, so there is no stdin to write the buffer to.
 */
function fromRGBA(buf, w, h, outFile) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-y', '-v', 'error',
      '-f', 'rawvideo', '-pix_fmt', 'rgba', '-video_size', `${w}x${h}`, '-i', 'pipe:0',
      outFile])
    let err = ''
    p.stderr.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(err || `ffmpeg exited ${code}`)))
    p.stdin.on('error', reject)
    p.stdin.end(buf)
  })
}

/**
 * Make edge-connected near-white transparent, in place.
 *
 * Iterative 4-connected BFS with an explicit stack — a recursive flood fill
 * over a 1280×1280 sheet is tens of thousands of frames deep and overflows.
 */
function floodBackground(px, w, h) {
  const seen = new Uint8Array(w * h)
  const stack = []

  const isWhite = (i) => px[i * 4] >= WHITE && px[i * 4 + 1] >= WHITE && px[i * 4 + 2] >= WHITE

  const seed = (i) => { if (!seen[i] && isWhite(i)) { seen[i] = 1; stack.push(i) } }
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x) }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1) }

  let cleared = 0
  while (stack.length) {
    const i = stack.pop()
    px[i * 4 + 3] = 0
    cleared++
    const x = i % w
    const y = (i / w) | 0
    if (x > 0) seed(i - 1)
    if (x < w - 1) seed(i + 1)
    if (y > 0) seed(i - w)
    if (y < h - 1) seed(i + w)
  }
  return cleared
}

/**
 * The one figure in a cell, as a keep-mask plus its bounding box.
 *
 * ── Why a connected-component pass and not just a bounding box ────────────
 * A sprite sheet is only a grid by convention, and generated ones often
 * aren't one. On the pull-up sheet the drawn figures overflow their cells
 * vertically — detecting the sheet's real gutters finds five clean column
 * bands but only FOUR row bands, because rows 0 and 1 touch with no gap
 * between them. So slicing on a grid, however precisely the arithmetic is
 * done, drags a slice of the neighbouring cell in with it: the previous
 * row's shoes ended up floating above the bar in 9 of 25 frames, and the
 * shared crop then grew to contain them, in every frame.
 *
 * Each cell is supposed to hold exactly one figure, so the fix is to keep
 * only the largest connected blob and treat the rest of the cell as empty.
 * That works here because the figure is one component — the hands grip the
 * bar in every frame, so the bar comes along with it — and because the
 * columns DO have clean gutters, so two figures never join sideways.
 *
 * Same iterative explicit-stack traversal as floodBackground(), for the same
 * reason: recursion over a cell this size overflows.
 */
function cellFigure(px, sheetW, cx, cy, cw, ch) {
  const N = cw * ch
  const state = new Int8Array(N)          // 0 = untouched, 1 = visited
  const at = (x, y) => ((cy + y) * sheetW + cx + x) * 4 + 3
  const opaque = (i) => px[at(i % cw, (i / cw) | 0)] > 8

  let best = null
  const stack = []

  for (let s = 0; s < N; s++) {
    if (state[s] || !opaque(s)) continue
    state[s] = 1
    stack.length = 0
    stack.push(s)
    const pixels = []
    let minX = cw, minY = ch, maxX = -1, maxY = -1

    while (stack.length) {
      const i = stack.pop()
      pixels.push(i)
      const x = i % cw
      const y = (i / cw) | 0
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      const push = (j) => { if (!state[j] && opaque(j)) { state[j] = 1; stack.push(j) } }
      if (x > 0) push(i - 1)
      if (x < cw - 1) push(i + 1)
      if (y > 0) push(i - cw)
      if (y < ch - 1) push(i + cw)
    }

    if (!best || pixels.length > best.pixels.length) best = { pixels, minX, minY, maxX, maxY }
  }

  if (!best) return null
  const keep = new Uint8Array(N)
  for (const i of best.pixels) keep[i] = 1
  return { keep, minX: best.minX, minY: best.minY, maxX: best.maxX, maxY: best.maxY }
}

async function main() {
  const [sheet, name, colsRaw, rowsRaw] = process.argv.slice(2)
  if (!sheet || !name || !colsRaw || !rowsRaw) {
    console.error('usage: node src/spritesheet.mjs <sheet.png> <name> <cols> <rows> [--every N] [--align-top]')
    process.exit(1)
  }
  const cols = Number(colsRaw)
  const rows = Number(rowsRaw)
  const everyIdx = process.argv.indexOf('--every')
  const every = everyIdx > -1 ? Number(process.argv[everyIdx + 1]) : 1
  const alignTop = process.argv.includes('--align-top')

  const { stdout: probe } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', sheet])
  const [W, H] = probe.trim().split('x').map(Number)
  const cw = Math.floor(W / cols)
  const ch = Math.floor(H / rows)

  /**
   * Cell origins are ROUNDED from the true fractional edge, not stepped by a
   * floored cell size. 1024/5 is 204.8; stepping by 204 lands the fifth row
   * 3.2px above where it belongs, which is 3.2px of the row above coming
   * along for the ride. Rounding each origin independently keeps every window
   * inside its own cell. (This alone was NOT enough — see cellFigure().)
   */
  const originX = (c) => Math.round((c * W) / cols)
  const originY = (r) => Math.round((r * H) / rows)

  const px = await toRGBA(sheet, W, H)
  const cleared = floodBackground(px, W, H)
  console.log(`sheet ${W}×${H}, cells ${cw}×${ch}, background cleared: ${(cleared / (W * H) * 100).toFixed(1)}%`)

  // One figure per cell, everything else in that cell discarded.
  let u = null
  let tallest = 0
  let strays = 0
  const cells = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = originX(c)
      const cy = originY(r)
      const fig = cellFigure(px, W, cx, cy, cw, ch)
      cells.push({ cx, cy, fig })
      if (!fig) continue
      tallest = Math.max(tallest, fig.maxY - fig.minY + 1)
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          if (!fig.keep[y * cw + x] && px[((cy + y) * W + cx + x) * 4 + 3] > 8) strays++
        }
      }
      u = u
        ? { minX: Math.min(u.minX, fig.minX), minY: Math.min(u.minY, fig.minY),
            maxX: Math.max(u.maxX, fig.maxX), maxY: Math.max(u.maxY, fig.maxY) }
        : { minX: fig.minX, minY: fig.minY, maxX: fig.maxX, maxY: fig.maxY }
    }
  }
  if (!u) { console.error('every cell is empty — is the background actually white?'); process.exit(1) }
  console.log(`discarded ${strays} stray px that belonged to a neighbouring cell`)

  const PAD = 2
  const bw = (u.maxX - u.minX + 1) + PAD * 2

  /**
   * --align-top places each figure at a fixed distance from the top of the
   * frame instead of at its position within the sheet.
   *
   * For a clip with a fixed prop in it — the pull-up bar — the sheet drew that
   * prop at a different height in nearly every cell (its top edge ranged over
   * 30px), so keeping the sheet's positions reproduces that wobble faithfully
   * and the bar visibly jitters. Pinning the top pins the prop and lets the
   * body move against it, which is what a pull-up actually looks like.
   *
   * Off by default: for boxing and guitar the top edge is the head, and
   * pinning that would flatten the natural bob out of the animation.
   */
  const bh = alignTop
    ? tallest + PAD * 2
    : (u.maxY - u.minY + 1) + PAD * 2
  console.log(alignTop
    ? `frame ${bw}×${bh}, each figure pinned ${PAD}px from the top (--align-top)`
    : `frame ${bw}×${bh}, figures keep their positions relative to each other`)

  const outDir = join(root, 'art/clips', name)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  let n = 0
  for (const [i, cell] of cells.entries()) {
    if (i % every) continue
    if (!cell.fig) { console.warn(`  cell ${i} is empty — skipped`); continue }
    const fig = cell.fig

    /**
     * Composite the kept figure into a blank frame rather than copying a
     * rectangle out of the sheet.
     *
     * Copying raw rows cannot work here: these figures are TALLER than their
     * nominal cells, so any frame tall enough for the tallest one reads
     * straight into the neighbouring cell for a figure that sits lower —
     * which is the bug being fixed. Writing only pixels that belong to this
     * cell's own figure makes neighbour contamination structurally
     * impossible, whatever the frame geometry, and makes the alignment offset
     * below a free choice instead of something that has to be clamped.
     */
    const out = Buffer.alloc(bw * bh * 4)          // zero-filled = transparent
    const dx = PAD - u.minX                        // shared, so horizontal drift survives
    const dy = alignTop ? PAD - fig.minY : PAD - u.minY

    for (let y = fig.minY; y <= fig.maxY; y++) {
      for (let x = fig.minX; x <= fig.maxX; x++) {
        if (!fig.keep[y * cw + x]) continue
        const ox = x + dx
        const oy = y + dy
        if (ox < 0 || oy < 0 || ox >= bw || oy >= bh) continue
        const s = ((cell.cy + y) * W + cell.cx + x) * 4
        px.copy(out, (oy * bw + ox) * 4, s, s + 4)
      }
    }

    await fromRGBA(out, bw, bh, join(outDir, `frame-${String(n).padStart(2, '0')}.png`))
    n++
  }

  console.log(`\nart/clips/${name}/ — ${n} frames. Now run: npm run clips`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.stderr?.toString() ?? err); process.exit(1) })
}

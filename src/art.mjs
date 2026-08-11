#!/usr/bin/env node
/**
 * Pixel-art pipeline for the hero.
 *
 *   node src/art.mjs        →  art/src/*  →  art/out/*.png  + manifest.json
 *
 * Kept OUT of `npm run build`: it shells out to ffmpeg and takes seconds,
 * while build should stay instant. Re-run only when the source art changes.
 *
 * All four paintings are centre-cropped to ONE aspect (see TARGET_AR) and
 * fill the hero identically — nothing is letterboxed, so no frame can show
 * through another during a transition.
 */
import { readdir, mkdir, stat, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, basename, extname } from 'node:path'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Hero box, 16:9. Every painting is cropped to fill it exactly. */
export const HERO_W = 880
export const HERO_H = 495
const BLOCK = 2               // px per "pixel" at authored size
const COLORS = 32   // fewer colours: ~19% smaller, and reads more like pixel art

/**
 * One aspect for all four paintings, so none is letterboxed and every frame
 * fills the hero identically. 16:9 is essentially the average of the two Van
 * Goghs (1.787 and 1.765), so those two are trimmed imperceptibly, while the
 * orange wave (1.92 — too wide) loses a little from left and right, and the
 * blue Great Wave (1.45 — too tall) loses a little from top and bottom.
 * ffmpeg's crop centres by default, which is what we want for all four.
 */
const TARGET_AR = 16 / 9

/**
 * De-resolve levels: block-size multipliers relative to BLOCK.
 * Four levels rather than three gives six steps across a transition instead
 * of four, so the image visibly crumbles and re-forms rather than snapping
 * through two states.
 */
export const LEVELS = { full: 1, l2: 3, l3: 7, l4: 15 }

/**
 * Read pixel dimensions.
 *
 * Only ever call this on OUR OWN output, never on the source art. These JPEGs
 * carry EXIF orientation: ffmpeg's decoder auto-rotates, but ffprobe's
 * stream=width,height reports the pre-rotation values. Trusting those made
 * every landscape painting look portrait and letterboxed it into a sliver.
 * Letting ffmpeg do the fitting and measuring the result sidesteps the whole
 * question of what orientation the source claims to be.
 */
async function probe(file) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file])
  const [w, h] = stdout.trim().split('x').map(Number)
  return { w, h }
}

async function main() {
  const srcDir = join(root, 'art/src')
  const outDir = join(root, 'art/out')
  await mkdir(outDir, { recursive: true })

  const files = (await readdir(srcDir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort()
  if (!files.length) {
    console.error('no images in art/src — drop them there and re-run')
    process.exit(1)
  }

  const manifest = []
  for (const f of files) {
    const name = basename(f, extname(f))
    const inPath = join(srcDir, f)
    const palette = join(outDir, `.${name}.palette.png`)

    // One render per de-resolve level. Every level goes into the SAME display
    // box; only the pixel grid gets coarser, so the blocks visibly grow. The
    // coarse levels are tiny — well under a kilobyte — so the extra steps cost
    // far less than they look.
    const entry = { name, levels: {} }

    for (const [level, mult] of Object.entries(LEVELS)) {
      const b = BLOCK * mult
      const outFile = `${name}.${level}.png`
      const outPath = join(outDir, outFile)

      // Let ffmpeg fit the image inside the grid box itself, preserving aspect
      // (and applying EXIF rotation on the way). We then measure what it made,
      // rather than predicting it from dimensions we can't trust.
      const chain = `crop='min(iw,ih*${TARGET_AR})':'min(ih,iw/${TARGET_AR})',` +
        `scale=${Math.round(HERO_W / b)}:${Math.round(HERO_H / b)}:flags=area`

      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', inPath,
        '-vf', `${chain},palettegen=max_colors=${COLORS}:stats_mode=single`, palette])
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', inPath, '-i', palette,
        '-lavfi', `${chain} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`, outPath])

      const { w: gw, h: gh } = await probe(outPath)

      // Pin the output. ffmpeg's rounding is the silent dependency here: if a
      // version bump shifts it by a pixel, every section below moves and
      // nothing errors — you just get a subtly wrong page.
      const wantW = Math.round(HERO_W / b)
      const wantH = Math.round(HERO_H / b)
      if (Math.abs(gw - wantW) > 1 || Math.abs(gh - wantH) > 1) {
        throw new Error(`${name}.${level}: ffmpeg produced ${gw}×${gh}, expected ~${wantW}×${wantH}`)
      }
      const { size } = await stat(outPath)
      entry.levels[level] = { file: outFile, gw, gh, kb: +(size / 1024).toFixed(1) }

      // The full level defines the display box every level is drawn into.
      if (level === 'full') { entry.dispW = gw * BLOCK; entry.dispH = gh * BLOCK }
    }

    manifest.push(entry)
    const sizes = Object.entries(entry.levels).map(([k, v]) => `${k} ${v.gw}×${v.gh} (${v.kb}KB)`).join('  ')
    console.log(`  ${name.padEnd(18)} box ${entry.dispW}×${entry.dispH}   ${sizes}`)
  }

  // Every painting is cropped to the same aspect, so their display boxes must
  // agree exactly — otherwise the hero's <use> layers would jump between frames.
  const boxes = new Set(manifest.map((m) => `${m.dispW}×${m.dispH}`))
  if (boxes.size !== 1) {
    throw new Error(`paintings disagree on display box: ${[...boxes].join(', ')}`)
  }

  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\n${files.length} frames → art/out/  (${BLOCK}px blocks, ${COLORS} colours, full frames — no crop)`)
}

/**
 * Only run the pipeline when this file is executed directly (`node
 * src/art.mjs`), never when it's imported.
 *
 * This guard is load-bearing, not defensive boilerplate: hero.mjs imports
 * HERO_W/HERO_H from this file, and importing a module runs its top-level
 * code. Without this check, every `npm run build` was silently re-running
 * the full ffmpeg pipeline — 4 paintings × 4 levels × 2 ffmpeg calls each —
 * directly contradicting this file's own header comment that the pipeline is
 * "kept OUT of npm run build on purpose." Found while wiring up
 * src/albumart.mjs, which has the same shape (a script that also exports a
 * helper another section needs) and would have shipped with the identical bug.
 */
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.stderr ?? err)
    process.exit(1)
  })
}

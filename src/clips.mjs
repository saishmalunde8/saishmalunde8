#!/usr/bin/env node
/**
 * Pixel-art pipeline for the "currently" clips.
 *
 *   art/clips/<name>/*.png   →   node src/clips.mjs   →   art/clips-out/
 *
 * Same treatment as the paintings, so the clips match the hero's art direction
 * instead of looking like four pasted GIFs. The important difference is ALPHA:
 * these render on top of a coloured band, so the background has to stay
 * transparent all the way through quantisation. That's what
 * `reserve_transparent` and `alpha_threshold` are doing below — without them
 * ffmpeg happily bakes the background into the palette and you get four grey
 * rectangles sitting on the band.
 *
 * ── Getting frames in ────────────────────────────────────────────────────
 * Mixamo exports FBX only — no video, no GIF. Two ways across:
 *
 *   Blender (recommended, gives real alpha):
 *     1. Download the animation as FBX **with skin**
 *     2. File → Import → FBX
 *     3. Render Properties → Film → check **Transparent**
 *     4. Camera: orthographic, front-on, character filling the frame
 *     5. Output: PNG, RGBA, set the frame range to ONE loop cycle
 *     6. Render Animation into art/clips/<name>/
 *
 *   Screen recording (no 3D software, no alpha):
 *     Cmd+Shift+5 over the Mixamo preview, crop to the character, then
 *     `ffmpeg -i clip.mov -vf fps=12 art/clips/<name>/%03d.png`.
 *     The grey Mixamo backdrop comes along with it, so the clip will read as a
 *     card on the band rather than a cutout.
 *
 * Aim for 10–12 frames per clip: enough to read as motion, and the whole set
 * stays inside the build's size budget.
 */
import { readdir, mkdir, stat, writeFile, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Slot size at the wide layout, and the block size to match the hero.
 *
 * PORTRAIT, because the subject is a standing figure. The slot was landscape
 * (192×138) back when these were imagined as screen-recorded clips; a
 * full-body sprite dropped into that is letterboxed down to about 110px wide
 * with dead air either side. Keep this in step with the aspect ratio in
 * sections/currently.mjs — they describe the same box.
 */
const SLOT_W = 192
const SLOT_H = 242
const BLOCK = 2

/**
 * 16, not the hero's 32.
 *
 * Measured against a real sprite at this grid size and compared side by side:
 * 16 colours is indistinguishable from 32 on flat-shaded pixel art, and 13%
 * smaller. (72px wide at 16 colours was also tried and is NOT fine — the face
 * and hands lose their read.) The paintings keep 32 because photographic
 * source genuinely uses the range.
 */
const COLORS = 16

/**
 * Cap on frames per clip, sampled evenly across whatever is in the folder.
 *
 * Every frame is a separate base64 PNG inside the SVG, so cost is linear in
 * frame count with no compression across frames — 25 frames of one clip came
 * to 226KB across both builds and blew the size ceiling on its own. 12 frames
 * at 90ms is a ~1s loop, which reads as motion for a cyclic action.
 *
 * The full-resolution frames stay in art/clips/ — this only decimates on the
 * way out, so raising the cap is a re-run rather than a re-slice.
 */
const MAX_FRAMES = 12

async function main() {
  const srcRoot = join(root, 'art/clips')
  const outRoot = join(root, 'art/clips-out')

  let names = []
  try {
    names = (await readdir(srcRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory()).map((d) => d.name).sort()
  } catch {
    console.log('no art/clips/ yet — see the header of this file for how to produce frames')
    return
  }
  if (!names.length) {
    console.log('art/clips/ is empty — drop one folder of PNG frames per clip')
    return
  }

  await rm(outRoot, { recursive: true, force: true })
  await mkdir(outRoot, { recursive: true })

  const gw = Math.round(SLOT_W / BLOCK)
  const gh = Math.round(SLOT_H / BLOCK)
  const manifest = []

  for (const name of names) {
    const inDir = join(srcRoot, name)
    const outDir = join(outRoot, name)
    await mkdir(outDir, { recursive: true })

    const all = (await readdir(inDir)).filter((f) => /\.(png|webp)$/i.test(f)).sort()
    if (!all.length) { console.warn(`  ! ${name}: no frames`); continue }

    // Even sample, not the first N — taking a prefix would keep the first half
    // of the action and cut the rest, so a punch would never land.
    const frames = all.length <= MAX_FRAMES
      ? all
      : Array.from({ length: MAX_FRAMES }, (_, i) => all[Math.round(i * all.length / MAX_FRAMES)])

    // One palette for the WHOLE clip, not per frame: a per-frame palette makes
    // the colours shimmer between frames, which is very visible at this size.
    const palette = join(outDir, '.palette.png')
    const chain = `scale=${gw}:${gh}:force_original_aspect_ratio=decrease:flags=area,` +
      `pad=${gw}:${gh}:(ow-iw)/2:(oh-ih)/2:color=#00000000`

    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(inDir, frames[0]).replace(/\d+(\.\w+)$/, '%03d$1'),
      '-vf', `${chain},palettegen=max_colors=${COLORS}:reserve_transparent=1`, palette])
      .catch(async () => {
        // Filenames may not be a %03d sequence; fall back to the first frame.
        await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(inDir, frames[0]),
          '-vf', `${chain},palettegen=max_colors=${COLORS}:reserve_transparent=1`, palette])
      })

    let bytes = 0
    const out = []
    for (const [i, f] of frames.entries()) {
      const outFile = `frame-${String(i).padStart(2, '0')}.png`
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(inDir, f), '-i', palette,
        '-lavfi', `${chain} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3:alpha_threshold=128`,
        join(outDir, outFile)])
      bytes += (await stat(join(outDir, outFile))).size
      out.push(outFile)
    }

    manifest.push({ name, frames: out, gw, gh, dispW: gw * BLOCK, dispH: gh * BLOCK })
    const sampled = all.length > frames.length ? ` (from ${all.length})` : ''
    console.log(`  ${name.padEnd(12)} ${out.length} frames${sampled.padEnd(12)} ${gw}×${gh}  ${(bytes / 1024).toFixed(1)} KB`)
  }

  await writeFile(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\n${manifest.length} clips → art/clips-out/`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.stderr ?? err); process.exit(1) })
}

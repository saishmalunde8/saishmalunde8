#!/usr/bin/env node
/**
 * Fetch real album art for the "on repeat" tracks and pixelate it.
 *
 *   node src/albumart.mjs   →  art/albumart-out/*.png + manifest.json
 *
 * ── No Apple Developer account needed ─────────────────────────────────────
 * Apple's own iTunes Search API (itunes.apple.com/search) is free, needs no
 * key, and returns a real artwork URL for any title+artist search — this is
 * the standard trick behind most "now playing" README widgets that don't
 * want real MusicKit auth. Verified live: searching "Nightcall Kavinsky"
 * returns a genuine 600×600 cover.
 *
 * The URL it gives back is always sized "100x100bb.jpg" at the end; iTunes'
 * CDN serves any size at that same path, so swapping in "600x600bb" gets a
 * real high-res image with no extra API call — confirmed by fetching one.
 *
 * ── Pixelated, not a smooth photo ──────────────────────────────────────────
 * Run through the exact same treatment as the hero paintings (small palette,
 * tiny block size) rather than embedded as-is. A crisp photograph sitting
 * next to pixel-art paintings would read as a mistake, not a feature — this
 * keeps every image on the page in one consistent style.
 *
 * ── Tolerant of misses ──────────────────────────────────────────────────────
 * An obscure track with no iTunes match doesn't fail the build — that row
 * just falls back to the plain music-note placeholder it had before.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const DISPLAY = 40   // matches ART in sections/music.mjs — the row's art square
const BLOCK = 2       // same block size as the hero paintings and clips
const COLORS = 32     // same palette size as the hero paintings and clips

/** Stable, filesystem-safe key so music.mjs can look up a track's art. */
export function trackKey(title, artist) {
  return `${artist}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** 281000 → "4:41". */
function mmss(ms) {
  const total = Math.round(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The same lookup returns the track's real duration alongside the artwork, so
 * the row's running time comes from Apple's catalogue rather than being typed
 * into config by hand. One less number that can quietly be wrong.
 */
async function findTrack(title, artist) {
  const q = encodeURIComponent(`${title} ${artist}`)
  const res = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`)
  if (!res.ok) throw new Error(`iTunes search HTTP ${res.status}`)
  const { results } = await res.json()
  const hit = results[0]
  if (!hit?.artworkUrl100) throw new Error('no iTunes match')
  return {
    art: hit.artworkUrl100.replace('100x100bb', '600x600bb'),
    length: hit.trackTimeMillis ? mmss(hit.trackTimeMillis) : '',
    matched: `${hit.trackName} — ${hit.artistName}`,
  }
}

async function main() {
  const config = JSON.parse(await readFile(join(root, 'profile.config.json'), 'utf8'))
  const tracks = config.music?.tracks ?? []
  if (!tracks.length) { console.log('no tracks in profile.config.json — nothing to fetch'); return }

  const outDir = join(root, 'art/albumart-out')
  await mkdir(outDir, { recursive: true })

  const gw = Math.round(DISPLAY / BLOCK)
  const manifest = {}
  const failed = []

  for (const t of tracks) {
    const key = trackKey(t.title, t.artist)
    const jpgPath = join(outDir, `.${key}.jpg`)
    const palette = join(outDir, `.${key}.palette.png`)
    const outFile = `${key}.png`

    try {
      const found = await findTrack(t.title, t.artist)
      const imgRes = await fetch(found.art)
      if (!imgRes.ok) throw new Error(`artwork fetch HTTP ${imgRes.status}`)
      await writeFile(jpgPath, Buffer.from(await imgRes.arrayBuffer()))

      // Square in, square out — no crop needed, iTunes covers are always 1:1.
      const chain = `scale=${gw}:${gw}:flags=area`
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', jpgPath,
        '-vf', `${chain},palettegen=max_colors=${COLORS}:stats_mode=single`, palette])
      await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', jpgPath, '-i', palette,
        '-lavfi', `${chain} [x]; [x][1:v] paletteuse=dither=bayer:bayer_scale=3`, join(outDir, outFile)])

      const { size } = await stat(join(outDir, outFile))
      manifest[key] = { file: outFile, gw, gh: gw, dispW: gw * BLOCK, dispH: gw * BLOCK, length: found.length }
      // Print what iTunes actually matched — a wrong-but-plausible hit (a live
      // version, a cover, a same-titled track) is otherwise invisible until
      // the wrong album cover shows up on the page.
      console.log(`  ${key.padEnd(30)} ${found.length.padStart(5)}  ${(size / 1024).toFixed(1).padStart(5)} KB   ${found.matched}`)
    } catch (err) {
      failed.push(`${t.title} — ${t.artist}: ${err.message}`)
      console.warn(`  ${key.padEnd(30)} FAILED — ${err.message}`)
    }
  }

  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nart/albumart-out/manifest.json — ${Object.keys(manifest).length}/${tracks.length} covers`)
  if (failed.length) {
    console.error(`\n${failed.length} track(s) had no match — those rows keep the plain placeholder:`)
    failed.forEach((f) => console.error(`  ${f}`))
  }
}

// Guarded so importing `trackKey` (music.mjs needs it) doesn't also re-run
// the fetch-and-pixelate pipeline on every build — see the matching comment
// in art.mjs, where the missing version of this guard was a real live bug.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1) })
}

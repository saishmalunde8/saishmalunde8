#!/usr/bin/env node
/**
 * Fetch icons for the social badges and the skill tiles.
 *
 *   node src/icons.mjs   →  icons/cache.json
 *
 * Kept OUT of `npm run build`, same reasoning as the art/clips pipelines:
 * this hits the network and should stay a deliberate, occasional step, while
 * build must stay instant and offline-safe.
 *
 * ── Why path data, not a raster image ─────────────────────────────────────
 * simple-icons publishes each brand mark as a single <path> in a 24×24
 * viewBox, with no fill baked in. Extracting just the `d` attribute and
 * dropping it into our own <path fill="var(--fg)"> gets a crisp, theme-aware
 * icon for a few hundred bytes — vs. the hero pipeline's PNG-and-base64
 * approach, which exists only because photographs can't be reduced to a
 * path. Icons are already vector; re-rastering them would be a downgrade.
 *
 * ── The hand-authored ones ─────────────────────────────────────────────────
 * simple-icons only carries BRANDS, so four slots have no upstream icon:
 * email (envelope), website (globe), resume (a sheet of paper) and
 * toastmasters (a microphone — the org's real logo is trademarked artwork,
 * and a mic says "public speaking" without borrowing it). All four are drawn
 * at the same 24×24 convention so they scale identically to the fetched ones.
 *
 * The paper icon's ruled lines are HOLES, which in a single <path> means they
 * must be wound opposite to the sheet outline. Get that backwards and they
 * fill solid instead of cutting through — the icon still renders, just wrong,
 * which is exactly the kind of silent break that only shows up by looking.
 *
 * ── Slugs ──────────────────────────────────────────────────────────────────
 * Every slug is looked up from simple-icons' CDN before being trusted — a
 * wrong slug 404s loudly here rather than silently leaving a tile blank at
 * build time.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CDN = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/icons'
const DATA = 'https://cdn.jsdelivr.net/npm/simple-icons@latest/data/simple-icons.json'

/**
 * Brand colours the bulk data file doesn't carry.
 *
 * LinkedIn is the odd one: icons/linkedin.svg still resolves and renders, but
 * the brand is absent from data/simple-icons.json entirely (simple-icons drops
 * marks on trademark request while the file stays cached upstream). Its hex is
 * hardcoded here rather than left uncoloured. The rest are the hand-authored
 * glyphs below, which are not brands and so have no upstream colour at all —
 * email takes Gmail's red because it is a Gmail address, Toastmasters takes
 * the organisation's real maroon, and the two that are purely "mine" take the
 * page's own accent.
 */
const HEX = {
  linkedin: '0A66C2',
  visualstudiocode: '007ACC',   // same story as LinkedIn: icon present, brand absent
  email: 'EA4335',
  toastmasters: '772432',
  website: 'E8A33D',
  resume: 'E8A33D',
}

const rgb = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
const hex6 = (c) => c.map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0')).join('')

/** sRGB relative luminance, for the light-theme test. */
function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/**
 * A brand hex, adjusted per theme so the mark is actually visible.
 *
 * Two failure modes, both real in this icon set:
 *  - Dark marks vanish on the dark theme's #16213A surface. X is #000000; the
 *    Toastmasters maroon is nearly as dark. Rather than replacing them with
 *    plain white — which throws the brand away — each channel is scaled up
 *    until the brightest one reaches BRIGHT, which raises value while holding
 *    hue and saturation. Pure black has no hue to hold, so it's the one case
 *    that falls back to the theme's foreground.
 *  - Light marks vanish on the light theme's white surface. Buy Me a Coffee is
 *    #FFDD00. Those get scaled down by the same logic in reverse.
 * Tested by the value the eye actually cares about here (max channel), not by
 * luminance: saturated blues like Calendly's #006BFF score low on luminance
 * but are perfectly legible on dark, and "fixing" them would be wrong.
 */
const DARK_MIN = 140     // max channel below this is too dim for the dark theme
const BRIGHT = 210
const LIGHT_MAX_LUM = 0.62

function themeColors(hex) {
  const c = rgb(hex)
  const max = Math.max(...c)

  let dark = hex
  if (max === 0) dark = 'E8EEF8'                                  // pure black — no hue to preserve
  else if (max < DARK_MIN) dark = hex6(c.map((v) => v * (BRIGHT / max)))

  let light = hex
  const lum = luminance(c)
  if (lum > LIGHT_MAX_LUM) light = hex6(c.map((v) => v * 0.62))

  return { light: `#${light}`, dark: `#${dark}` }
}

/** Hand-authored, 24×24 viewBox, same convention as simple-icons. */
const BUILTIN = {
  email: 'M1.5 4.5A2 2 0 0 1 3.5 2.5h17a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2h-17a2 2 0 0 1-2-2v-15zm2.2.5 8.3 6.4L20.3 5H3.7zm16.8 1.6-8.02 6.18a1 1 0 0 1-1.22 0L3.5 6.6V19.5h17V6.6z',
  website: 'M12 1.5C6.2 1.5 1.5 6.2 1.5 12S6.2 22.5 12 22.5 22.5 17.8 22.5 12 17.8 1.5 12 1.5zm7.94 8.25h-3.55a15.9 15.9 0 0 0-1.39-5.64 9.03 9.03 0 0 1 4.94 5.64zM12 3.02c.95 1.27 1.98 3.4 2.36 6.73H9.64c.38-3.33 1.41-5.46 2.36-6.73zM3.5 12c0-.87.12-1.7.34-2.5h3.79a17.6 17.6 0 0 0 0 5H3.84A9 9 0 0 1 3.5 12zm1.56 4.25h3.55c.28 2.15.83 4.02 1.39 5.64a9.03 9.03 0 0 1-4.94-5.64zm0-8.5A9.03 9.03 0 0 1 10 2.11a15.9 15.9 0 0 0-1.39 5.64H5.06zM12 20.98c-.95-1.27-1.98-3.4-2.36-6.73h4.72c-.38 3.33-1.41 5.46-2.36 6.73zm2.55-8.23H9.45a15.9 15.9 0 0 1 0-5h5.1a15.9 15.9 0 0 1 0 5zm.5 7.09c.56-1.62 1.11-3.49 1.39-5.64h3.55a9.03 9.03 0 0 1-4.94 5.64zm1.6-7.14a17.6 17.6 0 0 0 0-5h3.79c.22.8.34 1.63.34 2.5s-.12 1.7-.34 2.5h-3.79z',

  // Sheet of paper, dog-eared corner, three ruled lines. The `v1.8h10v-1.8z`
  // rectangles run the opposite way round to the outline on purpose — that's
  // what makes them cut holes instead of filling solid.
  resume: 'M4 2.5a1 1 0 0 1 1-1h8.1v4.4a1 1 0 0 0 1 1h4.4v15.6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM14.6 1.9L18.1 5.4H14.6zM7 11.2v1.8h10v-1.8zM7 15.2v1.8h10v-1.8zM7 19.2v1.8h6.5v-1.8z',

  // Microphone on a stand — stands in for Toastmasters, whose actual logo is
  // trademarked artwork we have no licence to redraw.
  toastmasters: 'M12 1.5a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0V5A3.5 3.5 0 0 0 12 1.5zM5.5 10a.9.9 0 0 0-1.8 0 8.3 8.3 0 0 0 7.4 8.25V21H8.4a.9.9 0 0 0 0 1.8h7.2a.9.9 0 0 0 0-1.8h-2.7v-2.75A8.3 8.3 0 0 0 20.3 10a.9.9 0 0 0-1.8 0 6.5 6.5 0 0 1-13 0z',
}

/**
 * Path data is embedded EXACTLY as simple-icons publishes it — no rounding.
 *
 * I tried cutting it: coordinates on a 24-unit viewBox rendering at 20–24px
 * looked like an obvious place to shave precision. Two attempts, both
 * verified by actually looking at the rendered icons rather than trusting
 * the byte count:
 *
 *  1. A regex that required digits on both sides of the decimal point
 *     couldn't recognize numbers like ".002" (valid, common in minified
 *     path data) as complete tokens. It skipped forward hunting for the next
 *     digit-dot-digit run and stole digits from the PRECEDING number instead
 *     — not imprecise, actively deleting coordinates and desyncing every
 *     command argument after them. Rendered as garbled or blank icons.
 *  2. Fixed the tokenizer (verified lossless at high precision against all
 *     26 icons — see the git history of this file), then rounded for real at
 *     1 and then 2 decimal places. Both still broke specific icons: simple
 *     ones (triangles, single letters) survived fine, but detailed marks —
 *     rust's gear, linux's Tux, postgresql's elephant, each hundreds of
 *     points packed into the same tiny 24-unit box — lost fine strokes and
 *     rendered as solid blobs or vanished. There's no single precision safe
 *     across marks this different in complexity.
 *
 * These are published brand assets; correctness matters more than the ~15KB
 * rounding would have saved, and that cost is already accounted for in the
 * size ceiling (src/lib/guards.mjs) rather than clawed back here.
 */
async function fetchPath(slug) {
  if (BUILTIN[slug]) return { d: BUILTIN[slug], viewBox: '0 0 24 24' }

  const res = await fetch(`${CDN}/${slug}.svg`)
  if (!res.ok) throw new Error(`icon slug "${slug}" — HTTP ${res.status} from simple-icons`)
  const svg = await res.text()

  const vb = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24'
  const d = svg.match(/<path d="([^"]+)"/)?.[1]
  if (!d) throw new Error(`icon slug "${slug}" — couldn't find a <path> in the fetched SVG`)
  return { d, viewBox: vb }
}

/**
 * slug → brand hex, in ONE request for all 3,400-odd brands.
 *
 * The per-icon colour endpoint (cdn.simpleicons.org/<slug>) also works but is
 * a request per icon and returned empty for some slugs under repeated calls;
 * the bulk data file is a single fetch and doesn't rate-limit.
 */
async function fetchBrandColors() {
  const res = await fetch(DATA)
  if (!res.ok) throw new Error(`brand colour data — HTTP ${res.status}`)
  const raw = await res.json()
  const list = Array.isArray(raw) ? raw : (raw.icons ?? [])
  const map = {}
  for (const i of list) if (i.slug && i.hex) map[i.slug] = i.hex
  return map
}

async function main() {
  const config = JSON.parse(await readFile(join(root, 'profile.config.json'), 'utf8'))

  let brand = {}
  try {
    brand = await fetchBrandColors()
    console.log(`brand colours: ${Object.keys(brand).length} known\n`)
  } catch (err) {
    console.warn(`! brand colour data unavailable (${err.message}) — icons stay monochrome\n`)
  }

  const slugs = new Set([
    ...config.socials.map((s) => s.icon).filter(Boolean),
    ...config.links.map((s) => s.icon).filter(Boolean),
    ...config.skills.map((s) => s.icon).filter(Boolean),
  ])

  if (!slugs.size) {
    console.log('no `icon` fields in profile.config.json yet — add them to socials[], links[] and skills[], then re-run')
    return
  }

  const cache = {}
  const failed = []
  for (const slug of slugs) {
    try {
      const icon = await fetchPath(slug)
      const hex = HEX[slug] ?? brand[slug]
      if (hex) icon.color = themeColors(hex)
      cache[slug] = icon
      console.log(`  ${slug.padEnd(20)} ok   ${icon.color ? `${icon.color.light} / ${icon.color.dark}` : 'no colour — renders monochrome'}`)
    } catch (err) {
      failed.push(`${slug}: ${err.message}`)
      console.warn(`  ${slug.padEnd(20)} FAILED — ${err.message}`)
    }
  }

  await mkdir(join(root, 'icons'), { recursive: true })
  await writeFile(join(root, 'icons/cache.json'), JSON.stringify(cache, null, 2))

  console.log(`\nicons/cache.json — ${Object.keys(cache).length}/${slugs.size} icons`)
  if (failed.length) {
    console.error(`\n${failed.length} icon(s) failed — those tiles will fall back to text until fixed:`)
    failed.forEach((f) => console.error(`  ${f}`))
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1) })
}

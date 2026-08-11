/**
 * Hero: four full-frame paintings that de-resolve into each other.
 *
 * ── The transition ───────────────────────────────────────────────────────
 * The outgoing painting crumbles full → l2 → l3 → l4 as its blocks visibly
 * grow, then the incoming one re-forms l4 → l3 → l2 → full. Six hard cuts,
 * fast, so it reads as the image dissolving into pixels and rebuilding rather
 * than a fade. Levels come from the manifest, so adding one in art.mjs
 * automatically lengthens the transition.
 *
 * Built as a flat list of SEGMENTS — each (painting, level) state that appears
 * on screen gets a layer with its own visible window. Plain opacity keyframes,
 * the one animation mechanism already proven to survive GitHub's <img>
 * sandbox. Segments are wildly uneven (a ~2.2s hold against 70ms steps), so
 * each layer carries explicit start/end percentages rather than sharing one
 * track with a delay.
 *
 * ── Why <defs> + <use> ───────────────────────────────────────────────────
 * Each artwork is embedded EXACTLY ONCE and referenced by id. Two things were
 * silently doubling the file before: every <image> carried the same data URI
 * in both href and xlink:href, and every coarse level appears twice per cycle
 * (leaving one painting, entering it again) so its bytes were emitted twice.
 * Together that made the payload 940KB instead of ~400KB. <use> costs a few
 * bytes per reference instead of tens of kilobytes.
 *
 * Note this means the artwork carries `href` only, no xlink fallback. Every
 * current browser supports it; a pre-SVG2 rasteriser would not — but such a
 * renderer would not be running the animation either.
 *
 * t=0 correctness: segment 0 is painting 1 at full resolution starting at 0%,
 * so a renderer that freezes animations shows a clean, sharp first painting.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { part } from '../lib/svg.mjs'
import { HERO_W, HERO_H } from '../art.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const EPS = 0.001   // makes each opacity change a hard cut, not a fade

export async function hero(config) {
  const outDir = join(root, 'art/out')
  let manifest = []
  try {
    manifest = JSON.parse(await readFile(join(outDir, 'manifest.json'), 'utf8'))
  } catch {
    return part({ name: 'hero', height: HERO_H, band: 'band1', body: '' })
  }

  const { msPerFrame, deresolveMs } = config.hero
  const n = manifest.length
  const totalMs = n * msPerFrame

  // One <defs> entry per unique (painting, level). Referenced, never repeated.
  const defs = []
  for (const [i, m] of manifest.entries()) {
    const x = Math.round((HERO_W - m.dispW) / 2)
    const y = Math.round((HERO_H - m.dispH) / 2)
    for (const [level, lv] of Object.entries(m.levels)) {
      const b64 = (await readFile(join(outDir, lv.file))).toString('base64')
      defs.push(`    <g id="fr${i}_${level}">
      <rect x="0" y="0" width="${HERO_W}" height="${HERO_H}" fill="var(--page)"/>
      <image class="px" href="data:image/png;base64,${b64}" x="${x}" y="${y}" width="${m.dispW}" height="${m.dispH}"/>
    </g>`)
    }
  }

  /** Ordered list of on-screen states and how long each lasts. */
  const coarser = Object.keys(manifest[0].levels).filter((l) => l !== 'full')
  const step = deresolveMs / (coarser.length * 2)

  const segments = []
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n
    segments.push({ i, level: 'full', dur: msPerFrame - deresolveMs })
    // Crumble the outgoing painting, then re-form the incoming one.
    for (const level of coarser) segments.push({ i, level, dur: step })
    for (const level of [...coarser].reverse()) segments.push({ i: next, level, dur: step })
  }

  let t = 0
  const layers = []
  const keyframes = []

  segments.forEach((seg, k) => {
    const start = (t / totalMs) * 100
    t += seg.dur
    const end = (t / totalMs) * 100

    layers.push(`  <use class="sg s${k}" href="#fr${seg.i}_${seg.level}"/>`)

    /**
     * The final segment must stay OPAQUE through 100%.
     *
     * This was a visible flash at the loop wrap. Emitting a 0-opacity stop at
     * `end + EPS` clamps to 100% for the last segment, so 100% ended up with
     * two keyframes and the later one (0) won. At that instant every layer was
     * transparent and the page showed straight through — a blink, landing
     * exactly on the Van Gogh → Van Gogh boundary. Holding the last segment at
     * 1 hands over cleanly to segment 0, which is opaque at 0%.
     */
    const isLast = end >= 100 - EPS
    const stops = k === 0
      ? [[0, 1], [end, 1], [Math.min(100, end + EPS), 0], [100, 0]]
      : isLast
        ? [[0, 0], [Math.max(0, start - EPS), 0], [start, 1], [100, 1]]
        : [[0, 0], [Math.max(0, start - EPS), 0], [start, 1], [end, 1],
           [Math.min(100, end + EPS), 0], [100, 0]]

    keyframes.push(`
  @keyframes sg${k} {
${stops.map(([p, o]) => `    ${p.toFixed(4)}% { opacity: ${o} }`).join('\n')}
  }`)
  })

  const css = `
  .px { image-rendering: pixelated; image-rendering: crisp-edges }
  .sg { opacity: 0; animation-duration: ${totalMs}ms; animation-timing-function: linear;
        animation-iteration-count: infinite }
  .s0 { opacity: 1 }             /* static fallback if animation is ignored */
${segments.map((_, k) => `  .s${k} { animation-name: sg${k} }`).join('\n')}
${keyframes.join('')}
  /* Reduced motion: hold painting 1, sharp. */
  @media (prefers-reduced-motion: reduce) { .sg { animation: none } }`

  return part({
    name: 'hero',
    height: HERO_H,
    body: layers.join('\n'),
    css,
    defs: defs.join('\n'),
    band: null,   // full-bleed art, no background
  })
}

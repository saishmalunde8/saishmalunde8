#!/usr/bin/env node
/**
 * Build the profile README.
 *
 *   node src/build.mjs
 *
 * Reads profile.config.json, asks each enabled section for (a) an SVG to write
 * into assets/ and (b) the markdown that embeds it, then writes README.md.
 *
 * README.md is BUILD OUTPUT. Never hand-edit it — edit profile.config.json,
 * the theme, or a section module, and rebuild.
 *
 * Note: the hero reads pixelated frames from art/out/, which are produced by
 * the separate, slower `npm run art`. Build does not regenerate them.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { bandFor, setLayout, WIDE, NARROW } from './theme.mjs'
import { composeDocument } from './lib/svg.mjs'
import { assertNoPlaceholders, assertBudget } from './lib/guards.mjs'
import { hero } from './sections/hero.mjs'
import { intro } from './sections/intro.mjs'
import { snake } from './sections/snake.mjs'
import { starred } from './sections/starred.mjs'
import { skills } from './sections/skills.mjs'
import { stats } from './sections/stats.mjs'
import { music } from './sections/music.mjs'
import { currently } from './sections/currently.mjs'
import { guestbook } from './sections/guestbook.mjs'
import { quote } from './sections/quote.mjs'
import { signature } from './sections/signature.mjs'
import { badge, badgeList, spacerBadge } from './sections/badges.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Section registry, in render order. Reordering here reorders the page AND
 * reshuffles the background bands, since each section is handed the band for
 * its position rather than a hardcoded colour.
 */
const REGISTRY = [
  ['hero', hero],           // pixel-art loop, full bleed
  ['intro', intro],         // bio | principles | learning+reading | broken&fixed | greetings
  ['snake', snake],         // contributions
  ['starred', starred],
  ['skills', skills],       // stack
  ['stats', stats],
  ['currently', currently],
  ['music', music],
  ['guestbook', guestbook],
  ['quote', quote],
  ['signature', signature],
]

/**
 * Relative asset paths. GitHub rewrites these to the raw URL when it renders
 * the README, so they keep working without hardcoding the repo name.
 */
const asset = (file) => `assets/${file}`

async function main() {
  const config = JSON.parse(await readFile(join(root, 'profile.config.json'), 'utf8'))
  await mkdir(join(root, 'assets'), { recursive: true })

  // Icon path cache from `npm run icons`. Missing entirely just means the
  // badges fall back to text — same tolerant pattern as the art/clips
  // pipelines, so a fresh checkout without the fetch step still builds.
  let icons = {}
  try {
    icons = JSON.parse(await readFile(join(root, 'icons/cache.json'), 'utf8'))
  } catch { /* not fetched yet */ }

  /**
   * Build every enabled section at a given page width.
   *
   * Run twice — wide and narrow. A phone's README column is roughly 360px, so
   * the 880px layout renders at 41% and its 13px body text lands at about 5px.
   * setLayout() flips the shared layout constants; sections read them at render
   * time and reflow themselves.
   */
  const buildAll = async (width) => {
    setLayout(width)
    const built = new Map()
    let position = 0
    for (const [key, build] of REGISTRY) {
      if (!config.sections[key]) continue
      // The hero is full-bleed art — it carries no band.
      const band = key === 'hero' ? null : bandFor(position++)
      built.set(key, await build(config, { band }))
    }
    return built
  }

  const wide = await buildAll(WIDE)
  const narrow = await buildAll(NARROW)

  /**
   * Slabs, in page order. A `badges` slab is not an SVG — it's a row of linked
   * images, which has to be its own block because only a whole <img> can be
   * wrapped in an <a>. Placing them here puts the links directly under the
   * About band, which is what costs the extra seams.
   *
   * Two badge rows, both on band4: eleven pills in one row would shrink each
   * tile below the point where its icon is legible. Sharing one band colour
   * makes the pair read as a single block of links rather than two strips.
   */
  const SLABS = [
    // The hero sits alone: it is by far the largest asset, and on its own slab
    // the rest of the page can paint while it downloads instead of the whole
    // top of the README blocking on it. Costs one 5px seam.
    { file: 'hero.svg', sections: ['hero'], noNarrow: true },
    { file: 'intro.svg', sections: ['intro'] },
    { badges: 'socials', band: 'band4' },
    { badges: 'links', band: 'band4' },
    { file: 'main.svg', sections: ['snake', 'starred', 'skills', 'stats'] },
    { file: 'loops.svg', sections: ['currently', 'music'] },
    { file: 'guestbook.svg', sections: ['guestbook'], href: config.guestbook.signUrl },
    { file: 'closing.svg', sections: ['quote', 'signature'] },
  ]

  const lines = []
  const report = []
  // Buffered, not written as we go — the guards below must be able to reject a
  // build without having already half-replaced the previous good output.
  const outputs = []

  // The widest badge row's real count. Any shorter row gets padded with blank
  // spacerBadge() tiles up to this same count — see spacerBadge()'s comment
  // in sections/badges.mjs for why: without this, a row with fewer badges
  // stretches each tile larger to still fill 100% of the column width.
  const maxBadgeRow = Math.max(0, ...SLABS.filter((s) => s.badges).map((s) => (config[s.badges] ?? []).length))

  for (const slab of SLABS) {
    if (slab.badges) {
      const row = badgeList(config, icons, slab.badges).map((b) => ({ ...b, file: `badge-${b.key}.svg` }))
      for (const b of row) {
        outputs.push({ file: b.file, content: badge({ label: b.label, icon: b.icon, filled: b.filled, band: slab.band }) })
      }
      const spacers = Array.from(
        { length: maxBadgeRow - row.length },
        (_, i) => ({ file: `badge-${slab.badges}-spacer${i}.svg` }),
      )
      for (const s of spacers) {
        outputs.push({ file: s.file, content: spacerBadge({ band: slab.band }) })
      }
      // Equal percentage widths, joined with NO separator. Any whitespace
      // between the tags renders as a real space and splits the band; with
      // none, the badges' backgrounds meet and read as one continuous section
      // spanning the column edge to edge.
      const pct = (100 / (row.length + spacers.length)).toFixed(3)
      lines.push(
        row.map((x) => `<a href="${x.url}"><img src="${asset(x.file)}" alt="${x.label}" width="${pct}%"></a>`).join('') +
        spacers.map((s) => `<img src="${asset(s.file)}" alt="" width="${pct}%">`).join(''),
      )
      report.push({ file: `${slab.badges} badges`, kb: 0, h: 58, sections: row.length })
      continue
    }

    const parts = slab.sections.map((s) => wide.get(s)).filter(Boolean)
    if (!parts.length) continue

    const svg = composeDocument(parts, { title: `${config.name} — GitHub profile` })
    outputs.push({ file: slab.file, content: svg })

    const alt = parts.map((p) => p.name).join(', ')
    let img = `<img src="${asset(slab.file)}" alt="${alt}" width="100%">`

    // <picture> is the only responsive mechanism available here: media queries
    // cannot live inside an <img>, and GitHub strips style attributes. It does
    // allow <picture>/<source media>, so the phone gets a genuinely different
    // layout rather than the desktop one shrunk to 41%.
    //
    // Slabs opt out via `noNarrow`. The hero does: it is pure imagery with no
    // text to reflow, so a narrow variant would be visually identical while
    // duplicating its ~330KB of embedded art — which is precisely what the
    // size guard caught the first time this ran.
    if (!slab.noNarrow) {
      const narrowParts = slab.sections.map((s) => narrow.get(s)).filter(Boolean)
      const narrowFile = slab.file.replace(/\.svg$/, '-narrow.svg')
      outputs.push({
        file: narrowFile,
        content: composeDocument(narrowParts, { title: `${config.name} — GitHub profile` }),
      })
      img =
        `<picture>` +
        `<source media="(max-width: 500px)" srcset="${asset(narrowFile)}">` +
        img +
        `</picture>`
    }

    lines.push(slab.href ? `<a href="${slab.href}">${img}</a>` : img)

    report.push({ file: slab.file, kb: svg.length / 1024, h: parts.reduce((n, p) => n + p.height, 0), sections: parts.length })
  }

  /**
   * Visitor counter — the one thing on this page served live by somebody else.
   *
   * Counting real page views needs a server that sees each request, and a
   * static README has none. komarev.com/ghpvc is the long-standing free
   * shim: GitHub requests the badge image, their server counts the hit and
   * renders the number back. Trade-offs, stated plainly because they can't be
   * engineered away here:
   *   - it's a third party, so if it goes down the badge goes with it (the
   *     rest of the page is unaffected — everything else is a local file);
   *   - GitHub proxies images through camo and caches them, so the count
   *     lags and undercounts;
   *   - it necessarily sees the referrer of everyone who loads your profile.
   * Styled to the theme's amber so it doesn't read as a stray shields.io pill.
   * Set visitors.enabled=false in config to drop it entirely.
   */
  const v = config.visitors
  const visitors = v?.enabled
    ? `<p align="center"><img src="https://komarev.com/ghpvc/?username=${encodeURIComponent(config.username)}` +
      `&label=${encodeURIComponent(v.label)}&color=E8A33D&style=flat-square" alt="${v.label}"></p>`
    : ''

  const readme = [
    '<!-- GENERATED FILE — edit profile.config.json and run `npm run build`. -->',
    '',
    // Single newlines, NOT blank lines: blank lines would put each image in
    // its own <p> and add a 16px margin at every seam.
    lines.join('\n'),
    // The counter DOES want that blank line — it's a separate, centred element
    // rather than part of the seamless stack.
    ...(visitors ? ['', visitors] : []),
    '',
  ].join('\n')

  const draft = process.argv.includes('--draft')
  assertNoPlaceholders([{ name: 'README.md', content: readme },
    ...outputs.map((o) => ({ name: o.file, content: o.content }))], { draft })
  const total = assertBudget(outputs.map((o) => ({ name: o.file, bytes: o.content.length })))

  for (const o of outputs) await writeFile(join(root, 'assets', o.file), o.content, 'utf8')
  await writeFile(join(root, 'README.md'), readme, 'utf8')

  for (const r of report) {
    console.log(`  assets/${r.file.padEnd(14)} ${r.sections} sections  ${String(r.h).padStart(4)}px  ${r.kb.toFixed(1).padStart(6)} KB`)
  }
  console.log(`  ${'total'.padEnd(22)} ${(total / 1024).toFixed(1)} KB`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

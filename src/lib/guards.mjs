/**
 * Build guard rails.
 *
 * These run BEFORE anything is written, so a bad build never lands on disk.
 * Both exist because of things that actually went wrong:
 *
 *  - Six placeholder URLs sat in the output for several sessions. Publishing
 *    that profile would have shipped six dead social links.
 *  - The asset payload silently doubled to 1,092KB — every artwork was being
 *    embedded twice — and nothing complained. It was only caught by measuring
 *    on a hunch.
 */

/** Substrings that must never reach a published file. */
const PLACEHOLDERS = [/CHANGEME/i, /\bTODO:/]

/**
 * Throw if any generated file still contains placeholder text.
 *
 * Strict by default, because the whole point is that a profile with six dead
 * social links can never be published by accident. `npm run dev` passes
 * --draft to downgrade this to a warning, which is what you want while the
 * content is deliberately still mock.
 *
 * @param {{name: string, content: string}[]} files
 */
export function assertNoPlaceholders(files, { draft = false } = {}) {
  const hits = []
  for (const { name, content } of files) {
    for (const pattern of PLACEHOLDERS) {
      const m = content.match(pattern)
      if (m) hits.push(`${name}: ${m[0]}`)
    }
  }
  if (!hits.length) return

  const detail = hits.map((h) => `    ${h}`).join('\n')
  if (draft) {
    console.warn(`  ! ${hits.length} placeholder(s) still in the output (draft build):\n${detail}`)
    return
  }
  throw new Error(
    `placeholder text would have been published:\n${detail}` +
    `\n  Fill these in (profile.config.json), or use \`npm run dev\` while drafting.`
  )
}

/**
 * Warn, then fail, on total asset weight.
 *
 * The README is one blocking image per slab — there is no progressive reveal,
 * so bytes here are time a visitor spends looking at nothing.
 *
 * Real icons (src/icons.mjs) briefly pushed this over budget, and it's worth
 * recording why the ceiling ended up back where it started rather than
 * raised: skill-icon path data was getting embedded TWICE — once per build
 * width, since wide and narrow are separate self-contained SVG files that
 * can't share a <defs>. Rounding the coordinates to claw the bytes back
 * seemed obvious, but 24-unit-viewBox brand marks with hundreds of points
 * (rust, linux, postgresql) visibly corrupted at 1 and even 2 decimal places
 * — confirmed by actually rendering them, not just by the byte count looking
 * right. The real fix was structural: the narrow build never needed full
 * icon fidelity in the first place, so it falls back to the existing text
 * abbreviation instead (see skills.mjs). That removed the duplication
 * outright, and full-precision icons fit inside the original ceiling with no
 * compromise on the published brand geometry.
 *
 * Album art (src/albumart.mjs) got the same wide-only treatment pre-emptively
 * — no need to rediscover the duplication lesson twice — but even a single
 * copy of 5 real pixelated covers is ~15KB of genuinely new content on top of
 * everything above. Ceiling bumped 800KB → 815KB for exactly that, once,
 * after confirming there was no further structural waste left to remove.
 *
 * ── 815KB → 1010KB, for the "currently" clips ─────────────────────────────
 * The biggest move so far, and the reasoning is worth keeping because the
 * ORIGINAL premise for this ceiling has expired. It was set when the README
 * was two or three enormous slabs: "one blocking image, no progressive
 * reveal, so bytes are time the visitor spends looking at nothing." The page
 * is now seven slabs, and the hero sits alone on its own precisely so
 * everything below paints while it downloads. Total bytes still matter, but
 * they are no longer a single blocking wait.
 *
 * What was tried first, in order, before touching this number:
 *   - 25 frames of one clip cost 226KB across both builds. Sampled to 12,
 *     evenly rather than the first 12, so the punch still lands.
 *   - Palette cut 32 → 16 colours after comparing them side by side at real
 *     size: indistinguishable on flat-shaded sprite art.
 *   - A smaller 72px grid WAS tried and rejected — the face stops reading.
 *   - The phone build holds a single still frame instead of the full loop,
 *     which is most of the remaining saving.
 * That took one clip from 226KB to ~55KB. Four of them is ~220KB of real,
 * irreducible content, which is what this ceiling now allows for.
 *
 * If it needs to come back down later, the honest lever is the hero: 330KB
 * for four paintings is a third of the whole budget, and dropping it to 24
 * colours would likely save 40-50KB.
 *
 * @param {{name: string, bytes: number}[]} assets
 */
export function assertBudget(assets, { warn = 700_000, fail = 1_010_000 } = {}) {
  const total = assets.reduce((n, a) => n + a.bytes, 0)
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`

  if (total > fail) {
    const biggest = [...assets].sort((a, b) => b.bytes - a.bytes).slice(0, 3)
    throw new Error(
      `assets total ${kb(total)}, over the ${kb(fail)} ceiling.\n` +
      biggest.map((a) => `    ${a.name.padEnd(22)} ${kb(a.bytes)}`).join('\n') +
      `\n  Reduce COLORS in src/art.mjs, drop a painting, or raise the ceiling deliberately.`
    )
  }
  if (total > warn) {
    console.warn(`  ! assets ${kb(total)} — past the ${kb(warn)} warning line (ceiling ${kb(fail)})`)
  }
  return total
}

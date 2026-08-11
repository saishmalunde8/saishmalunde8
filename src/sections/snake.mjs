/**
 * Contributions — a snake that wanders the grid eating squares, the way
 * Platane/snk does it.
 *
 * ── Why eating and not painting ──────────────────────────────────────────
 * An earlier version painted the graph in. Eating is better for a reason
 * beyond taste: several places render a README image but never run its
 * animation (GitHub's mobile app, some editor previews). Those show whatever
 * the first frame is. Eating starts with the grid FULL, so they get the real
 * graph; painting started empty, so they got a blank box.
 *
 * ── The route ────────────────────────────────────────────────────────────
 * Worked out here at build time, never in the browser. The snake repeatedly
 * targets the nearest square it hasn't eaten and walks to it one cell at a
 * time. Because filled squares are scattered, that produces a weaving path
 * rather than tidy rows — which is the whole point of not using a sweep.
 *
 * Everything is expressed in GRID coordinates and converted to pixels at the
 * end, so the same route serves both the wide and narrow builds.
 *
 * ── Cost ─────────────────────────────────────────────────────────────────
 * One keyframe stop per step of the route, plus one @keyframes per filled
 * square. A shared track with per-cell delays isn't possible: each square
 * disappears at its own moment but they all reappear together at the loop, and
 * a delay would shift both.
 */
import { part, layout } from '../lib/svg.mjs'

const WEEKS = 53
const DAYS = 7
const GAP = 3

/**
 * Seeded random, so every build produces the SAME fake graph. Without this the
 * snapshot test would report a diff on every run and stop being useful.
 */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A believable graph: busier on weekdays, with streaks and quiet spells. */
function fakeGrid(seed) {
  const rand = rng(seed)
  const cells = []
  for (let x = 0; x < WEEKS; x++) {
    // A slow wave gives runs of busy and quiet weeks instead of even noise.
    const wave = 0.5 + 0.5 * Math.sin(x / 4.5 + rand() * 0.3)
    for (let y = 0; y < DAYS; y++) {
      const weekday = y > 0 && y < 6 ? 1 : 0.35
      const chance = 0.22 + wave * 0.55 * weekday
      const level = rand() < chance ? 1 + Math.floor(rand() * 4) : 0
      cells.push({ x, y, level })
    }
  }
  return cells
}

/**
 * Greedy nearest-neighbour route over the filled squares.
 *
 * Returns every position the head occupies, in order. Movement is one cell per
 * step, vertical first then horizontal — mixing the order is what stops the
 * path reading as a staircase.
 */
function route(cells) {
  const targets = cells.filter((c) => c.level > 0).map((c) => ({ x: c.x, y: c.y }))
  const eaten = new Set()
  const path = []
  let head = { x: -1, y: 3 }          // enters from off the left edge

  while (eaten.size < targets.length) {
    let best = null
    let bestD = Infinity
    for (const t of targets) {
      const key = `${t.x},${t.y}`
      if (eaten.has(key)) continue
      const d = Math.abs(t.x - head.x) + Math.abs(t.y - head.y)
      if (d < bestD) { bestD = d; best = t }
    }
    if (!best) break

    // Walk there. Stepping y first, then x, keeps the motion from looking like
    // a perfect diagonal staircase.
    while (head.y !== best.y) {
      head = { x: head.x, y: head.y + Math.sign(best.y - head.y) }
      path.push(head)
    }
    while (head.x !== best.x) {
      head = { x: head.x + Math.sign(best.x - head.x), y: head.y }
      path.push(head)
    }
    eaten.add(`${best.x},${best.y}`)
  }
  return path
}

export function snake(config, { band }) {
  const { cycleMs, body: bodyLen, seed } = config.snake
  const px = layout.padX

  const cells = fakeGrid(seed)
  const path = route(cells)

  // Cell size follows the available width, so the narrow build reflows without
  // this section needing to know anything about phones.
  const cell = Math.max(4, Math.floor((layout.width - px * 2 - (WEEKS - 1) * GAP) / WEEKS))
  const gridW = WEEKS * (cell + GAP) - GAP
  const x0 = Math.round((layout.width - gridW) / 2)
  // No section header here, so the grid starts near the top edge instead of
  // below where a kicker would sit — otherwise the band carries an obvious
  // empty strip above the squares.
  const y0 = 18
  const height = y0 + DAYS * (cell + GAP) - GAP + layout.padBottom + 6

  const at = (x, y) => [x0 + x * (cell + GAP), y0 + y * (cell + GAP)]

  // When the head first arrives at each square — that's when it gets eaten.
  const eatAt = new Map()
  path.forEach((p, i) => {
    const key = `${p.x},${p.y}`
    if (!eatAt.has(key)) eatAt.set(key, (i / path.length) * 100)
  })

  /* ---------- squares ---------- */
  const rects = []
  const keyframes = []
  const rules = []
  let n = 0

  for (const c of cells) {
    const [cx, cy] = at(c.x, c.y)

    // Every square gets an empty tile underneath, filled ones included. Eating
    // fades the colour away to reveal it, so a chewed square looks like an
    // ordinary quiet day rather than a hole punched in the band.
    rects.push(`<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="2" fill="var(--surface)"/>`)
    if (!c.level) continue

    const k = n++
    const t = eatAt.get(`${c.x},${c.y}`) ?? 100
    // Opacity carries the level, so one accent colour gives four steps and the
    // graph stays in the page's palette instead of GitHub's greens.
    const op = (0.3 + c.level * 0.175).toFixed(3)

    rects.push(`<rect class="k e${k}" x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="2" fill="var(--accent)" opacity="${op}"/>`)
    rules.push(`.e${k}{animation-name:e${k}}`)
    /**
     * Full at 0% — that is the frame non-animating viewers will see.
     *
     * Written minified, and this is the one place on the page where that's
     * worth doing: there are one of these per filled square, ~370 of them,
     * and the pretty-printed version was 42KB of a 145KB file — enough on its
     * own to push the whole page over the size ceiling. Grouped selectors
     * (`0%,12.3%{…}`) and a dropped leading zero cost nothing; the timings
     * keep one decimal, which at a 60-second cycle is 60ms of precision on an
     * event that is a square quietly fading.
     *
     * Sharing ONE keyframe across all squares and varying animation-delay was
     * the obvious alternative and is wrong here: a square eaten near t=0 would
     * sit at the far end of its shifted timeline and render as already-gone in
     * any viewer that freezes animation — exactly the t=0 rule this file is
     * built around. Per-square keyframes keep that correct.
     */
    const eaten = t.toFixed(1)
    const before = Math.max(0, t - 0.1).toFixed(1)
    keyframes.push(`@keyframes e${k}{0%,${before}%{opacity:${op.replace(/^0/, '')}}${eaten}%,100%{opacity:0}}`)
  }

  /* ---------- the snake ---------- */
  // One shared route; each segment runs it on a delay, which is what makes a
  // line of squares read as a body following a head.
  const stepPct = 100 / path.length
  // Minified for the same reason as the eat keyframes above — one stop per
  // step of the route, and the route is as long as the graph is full.
  const headKeyframes = `@keyframes crawl{${path.map((p, i) => {
    const [hx, hy] = at(p.x, p.y)
    return `${(i * stepPct).toFixed(2)}%{transform:translate(${hx}px,${hy}px)}`
  }).join('')}}`

  const segments = Array.from({ length: bodyLen }, (_, i) => {
    const lagMs = (i * cycleMs) / path.length
    return `<rect class="sn" style="animation-delay: -${(cycleMs - lagMs).toFixed(0)}ms; opacity: ${(1 - i * 0.13).toFixed(2)}"
        width="${cell}" height="${cell}" rx="${i === 0 ? 2 : 3}" fill="var(--accent2)"/>`
  }).join('\n  ')

  const css = `
  .k { animation-duration: ${cycleMs}ms; animation-timing-function: linear;
       animation-iteration-count: infinite }
${rules.join('')}
  .sn { animation: crawl ${cycleMs}ms linear infinite }
${headKeyframes}
${keyframes.join('')}
  /* Reduced motion: show the finished graph, no crawling. */
  @media (prefers-reduced-motion: reduce) {
    .k { animation: none }
    .sn { display: none }
  }`

  // Deliberately no kicker and no note: the graph is instantly recognisable
  // and needs no label, and a lone right-aligned note with no header to sit
  // beside reads as leftover. Both are one line to restore.
  const body = `  ${rects.join('\n  ')}
  ${segments}`

  return part({ name: 'snake', height, body, css, band })
}

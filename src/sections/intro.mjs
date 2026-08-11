/**
 * About section: one JS object literal holding everything about you — the
 * scalar bio fields plus principles and what you're currently learning —
 * beside a typewriter that types "hello" in each language, deletes it, and
 * moves on.
 *
 * `readingInTech` and `brokenAndFixed` were both here and are deliberately
 * removed for now, not just left empty — see the project memory on this
 * decision. Re-adding either is: restore its `listKey(...)` call in
 * objectLines() below (git history has the exact block) and its config in
 * profile.config.json.
 *
 * ── Everything is a key, not a box ─────────────────────────────────────────
 * The four list blocks were briefly rendered as their own cards below the
 * code object. They're now keys INSIDE it, which is the point: the whole
 * section is one readable object, and `principles: [ … ]` says what it is
 * without needing a heading above it. Nothing else on the page has to change
 * when you add a fifth principle — the object just gets longer.
 *
 * ── Two ways to fit a long value, picked per block ─────────────────────────
 * `currentlyLearning` wraps as JS concatenation — a character budget computed
 * from the LARGEST size the block is allowed, split across `'…' + '…'`
 * continuation lines. That's valid JavaScript, reads as deliberate, and means
 * the type never has to shrink to fit content.
 *
 * `principles` does NOT wrap — each one is meant to read as a single
 * sentence, and splitting it across lines fragmented that. It renders as one
 * line however long it runs, and the auto-fit safety net below (originally
 * built for a single unbreakable token like a URL) shrinks the WHOLE block's
 * type to whatever the longest line — wrapped or not — actually needs. A
 * long principle costs everyone else a slightly smaller font rather than
 * costing itself a broken sentence.
 *
 * ── How the typewriter works without JS ──────────────────────────────────
 * Not a clip-path animation. Every intermediate state is pre-rendered as its
 * own <text> — "H", "He", "Hel", … — and all of them share ONE keyframe track
 * that is visible for exactly 1/M of the cycle, each offset by a NEGATIVE
 * animation-delay. Exactly one frame is visible at any moment, so the string
 * appears to type itself.
 *
 * Chosen over animating a clipPath's width because it reuses the one
 * mechanism already proven to survive GitHub's <img> sandbox — plain opacity
 * keyframes — instead of betting on CSS geometry properties or SMIL.
 *
 * Text is split by GRAPHEME, not by code unit: नमस्ते and こんにちは would
 * otherwise tear apart mid-cluster and render as mojibake while typing.
 *
 * Holds are literally repeated frames, and the cursor rides along inside the
 * same <text> as a trailing tspan rather than being a positioned rect — so no
 * text measurement is needed anywhere, which is the thing we cannot do
 * reliably without font metrics.
 */
import { part, text, rrect, kicker, layout, esc } from '../lib/svg.mjs'
import { MONO_ADV_SAFE } from '../lib/metrics.mjs'

const CURSOR = '▏'   // U+258F, one-eighth block — the thinnest bar available

/**
 * Sans-stack advance for the two places in this file that estimate SANS
 * (not mono) text width: the status pills (weight 600, 10px) and the
 * typewriter's greeting sizer (weight 700, 18–38px). Both are bold display
 * text, a different weight/size regime from src/lib/metrics.mjs's SANS_ADV
 * (regular weight, 12–14px body text in starred.mjs), so this stays its own
 * constant rather than borrowing that one. It happens to share MONO_ADV_SAFE's
 * digits today — coincidence, not a link; re-measure before assuming it still
 * matches if either constant ever moves.
 */
const SANS_ADV_BOLD = 0.62

const graphemes = (s) =>
  [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)].map((g) => g.segment)

const IND = (n) => '  '.repeat(n)

/**
 * Status pills ("open to work", "open to collab"), right-aligned on the same
 * line as the ABOUT kicker.
 *
 * Laid out right to left so the row ends flush with the right margin whatever
 * the labels say — widths are estimated from character count, which is fine
 * for a pill that only has to be wider than its own text, and avoids needing
 * font metrics we can't get inside an <img>. Dropped entirely on the narrow
 * build: at 480px the kicker and two pills fight over the same line.
 */
function statusPills(labels = []) {
  if (!labels.length || layout.narrow) return ''
  const size = 10
  const H = 19
  const y = layout.kickerY - 14
  let right = layout.width - layout.padX

  return labels.slice().reverse().map((label) => {
    const w = Math.round(label.length * size * SANS_ADV_BOLD) + 30
    const x = right - w
    right = x - 8
    return [
      rrect(x, y, w, H, H / 2, 'surface', { stroke: 'border' }),
      `<circle cx="${x + 13}" cy="${y + H / 2}" r="3.5" fill="var(--accent)"/>`,
      text(label, { x: x + 21, y: y + 13, size, weight: 600, fill: 'muted' }),
    ].join('')
  }).reverse().join('\n  ')
}

/** Greedy break on spaces. A single word longer than the budget is left whole
 *  rather than hyphenated — it's a URL or an identifier, and breaking it would
 *  make it wrong rather than just wide. */
function chunk(value, budget) {
  const out = []
  let cur = ''
  for (const w of String(value).split(' ')) {
    const next = cur ? `${cur} ${w}` : w
    if (next.length > budget && cur) { out.push(cur); cur = w }
    else cur = next
  }
  if (cur) out.push(cur)
  return out
}

/**
 * `key: 'value',` as one or more token-coloured lines.
 *
 * `key` may be null, which emits a bare quoted string — that's how an array
 * element is written. Continuations are indented one level deeper and led
 * with `+`, so the result stays valid JavaScript however many lines it takes.
 *
 * ── `wrap: false` — one line when it CAN be, never a silent truncation ─────
 * Used for principles, which read as a single sentence and looked fragmented
 * split into `'…' + '…'` pieces. The auto-fit in intro() shrinks the whole
 * block's type to whatever the longest line needs — which is how an unwrapped
 * sentence usually fits fine at a slightly smaller size.
 *
 * "Usually" is the operative word: on the phone build the column is maybe
 * 400px, and a long sentence needs more room than exists even at the 10.5px
 * type floor — that floor is a readability limit, not a layout escape hatch.
 * `floorChars` is how many characters could ever fit at that floor, computed
 * once in intro() before any type size is chosen. A value under that count
 * renders as one line, full stop. A value OVER it falls through to the same
 * wrap path as `currentlyLearning` — still valid JavaScript, still legible —
 * rather than getting sliced with an ellipsis and quietly losing your words.
 * This is the exact failure the wrap mechanism was built to prevent in the
 * first place; `wrap: false` doesn't get to reintroduce it.
 */
function stringLines(depth, key, value, suffix, maxChars, { wrap = true, floorChars = Infinity } = {}) {
  const ind = IND(depth)
  const head = key ? `${key}: ` : ''

  if (!wrap) {
    // +2 for the quotes the wrap path also accounts for via its own budget.
    const fits = ind.length + head.length + value.length + 2 + suffix.length <= floorChars
    if (fits) {
      const body = `'${value}'`
      return [[[ind, 'muted'], ...(key ? [[head, 'accent2']] : []), [body, 'accent'], [suffix, 'muted']]]
    }
    // Doesn't fit even at the floor — fall through to wrapping below.
  }

  // Budget: the indent and key are fixed cost, then two quotes, the suffix,
  // and one space of slack so a line never ends flush against the box edge.
  const budget = maxChars - ind.length - head.length - 3 - suffix.length
  const contInd = IND(depth + 1)
  const contBudget = maxChars - contInd.length - 5 - suffix.length

  const parts = []
  let rest = String(value)
  let first = true
  while (rest.length) {
    const b = Math.max(8, first ? budget : contBudget)
    const [take, ...more] = chunk(rest, b)
    parts.push(take)
    rest = more.join(' ')
    first = false
  }

  return parts.map((p, i) => {
    const last = i === parts.length - 1
    // The trailing space lives INSIDE the quotes, so concatenating the parts
    // back together reproduces the original sentence exactly.
    const body = `'${p}${last ? '' : ' '}'`
    return i === 0
      ? [[ind, 'muted'], ...(key ? [[head, 'accent2']] : []), [body, 'accent'], [last ? suffix : '', 'muted']]
      // Indent is its OWN token — see the note on whitespace in objectLines().
      : [[contInd, 'muted'], ['+ ', 'muted'], [body, 'accent'], [last ? suffix : '', 'muted']]
  })
}

/**
 * Build the whole object literal as token-coloured lines.
 *
 * Each line is an array of [text, themeToken] pairs; the caller lays them out
 * left to right at a fixed monospace advance, which is the only way to get
 * per-token colour without measuring text.
 *
 * ── One rule: a token must never BEGIN with a space ────────────────────────
 * SVG collapses leading whitespace inside a <text> node, but the caller still
 * advances x by the full string length. So a token like `"   // hint"` keeps
 * its three characters of spacing in the maths and loses them on screen — the
 * comment slid left and sat flush against the `[],` before it. Indentation
 * therefore lives in its own whitespace-only token (which renders as nothing
 * but still moves x), and any padding is appended to the END of the token
 * before it, where collapsing is harmless.
 */
function objectLines(config, maxChars, floorChars) {
  const a = config.about
  const L = []

  L.push([['const ', 'accent2'], [`${a.varName} `, 'fg'], ['= {', 'muted']])

  for (const [k, v] of Object.entries(a.fields)) {
    L.push(...stringLines(1, k, v, ',', maxChars))
  }

  /**
   * An empty list renders as `key: [],` with a trailing comment naming what
   * belongs there — the same honesty as the dashed placeholder slots it
   * replaces, but in the object's own language, and it costs one line instead
   * of seventy pixels.
   */
  const listKey = (key, hint, items, render) => {
    L.push([['', 'muted']])          // blank spacer line
    if (!items.length) {
      L.push([[IND(1), 'muted'], [`${key}: `, 'accent2'], ['[],   ', 'muted'],
        [`// ${hint}`, 'muted']])
      return
    }
    L.push([[IND(1), 'muted'], [`${key}: `, 'accent2'], ['[', 'muted']])
    for (const item of items) L.push(...render(item))
    L.push([[IND(1), 'muted'], ['],', 'muted']])
  }

  listKey('principles', '3–5 opinions you actually hold',
    config.principles?.items ?? [],
    (p) => stringLines(2, null, p, ',', maxChars, { wrap: false, floorChars }))

  listKey('currentlyLearning', 'what you are working through right now',
    config.learning?.items ?? [],
    (it) => stringLines(2, null, it.label, ',', maxChars))

  L.push([['}', 'muted']])
  return L
}

export function intro(config, { band }) {
  const { hello: h } = config
  const px = layout.padX

  /**
   * Wide: bio 3/4 beside greetings 1/4. Narrow: stacked, because a quarter of
   * 480px is 120px and the greeting box would be narrower than the word in it.
   */
  const gutter = layout.narrow ? 12 : 24
  const usable = layout.width - px * 2
  const stacked = layout.narrow
  const leftW = stacked ? usable : Math.round((usable - gutter) * 0.75)
  const rightW = stacked ? usable : usable - leftW - gutter
  const rightX = stacked ? px : px + leftW + gutter

  /**
   * The code block sizes itself from its own content.
   *
   * Two things have to move together on the narrow build: text() silently
   * multiplies font sizes by layout.typeScale, so the per-character advance
   * used to place the coloured tokens must be scaled by exactly the same
   * factor — otherwise the tokens keep 13px spacing while rendering at 17.5px
   * and the line smears. The box height follows for the same reason.
   */
  const scale = layout.typeScale ?? 1
  /**
   * Monospace advance, per character, as a fraction of font-size.
   *
   * 0.565 was an assumption and it was wrong: measured for real via
   * getComputedTextLength() against the actual font stack in theme.mjs
   * (ui-monospace, SF Mono, Menlo, Consolas…), a real character comes out to
   * ~0.602em — a 6.6% underestimate. That doesn't sound like much, but the
   * `wrap: false` fit check in stringLines() compares against the box edge
   * with near-zero slack, so a line calculated to "just barely fit" was
   * actually running past it — visibly, in the About section, on real
   * viewers. 0.62 sits a further margin above the measured value: different
   * platforms resolve that font stack to different actual fonts (SF Mono on
   * macOS, Consolas on Windows, a generic fallback on Linux), and this number
   * has no way to know which one a given visitor's browser picked. Now
   * shared as MONO_ADV_SAFE in src/lib/metrics.mjs — see there for why this
   * number and the other ADV-like constants in this file deliberately stay
   * separate rather than all becoming the same value.
   */
  const ADV = MONO_ADV_SAFE
  const avail = leftW - 32

  // Wrap to what fits at the LARGEST size the block may use, so the auto-fit
  // below never actually has to shrink. Without this the longest principle
  // would set the type size for the entire object.
  const maxSize = 13 * scale
  const wrapChars = Math.max(24, Math.floor(avail / (maxSize * ADV)))

  // Auto-fit's floor, computed BEFORE any type size is chosen — see the
  // `wrap: false` note on stringLines(). A principle whose full sentence
  // wouldn't fit even at this smallest allowed size falls back to wrapping
  // rather than getting clipped once the size solver below lands on it.
  // Deliberately no Math.max(24, …) here unlike wrapChars: that floor exists
  // to keep the WRAP width sane, but this number is a fit/no-fit threshold —
  // padding it would tell a line it fits when it doesn't.
  /**
   * Smallest type the code block may shrink to.
   *
   * 10 rather than 10.5, and the 0.5px matters: the longest principle needs
   * 88 characters on one line, a 10.5 floor allows only 86, so the sentence
   * was being sent back to `'…' + '…'` wrapping — the exact thing principles
   * are set unwrapped to avoid. The block lands at 10.30px either way, and at
   * that size the line measures ~546px inside a 562px column, so the floor
   * was rejecting a line that comfortably fits.
   */
  const FLOOR_SIZE = 10
  const floorChars = Math.floor(avail / (FLOOR_SIZE * ADV))
  const lines = objectLines(config, wrapChars, floorChars)

  // Auto-fit stays as a safety net for the one case wrapping can't help: a
  // single unbreakable token (a URL, an identifier) longer than the budget.
  // `AVCaptureDevice.requestAccess` is 29 characters and cannot be split
  // without becoming wrong, so the type shrinks a little to accommodate it.
  const longest = Math.max(...lines.map((parts) => parts.reduce((n, [s]) => n + s.length, 0)))
  const codeSize = Math.max(FLOOR_SIZE, Math.min(maxSize, avail / (longest * ADV)))
  const lineH = Math.round(codeSize * 1.34)
  const codeH = 24 + lines.length * lineH + 14

  const greetH = stacked ? 132 : codeH
  const HEIGHT = layout.contentY +
    (stacked ? codeH + 12 + greetH : codeH) + layout.padBottom

  const top = layout.contentY

  /**
   * One <text> per line, one <tspan> per coloured token — the browser lays the
   * glyphs out itself.
   *
   * Each token used to be its own <text> placed at an x stepped by
   * `charCount * codeSize * ADV`, which meant ADV had to be exactly right or
   * the line drifted against its own glyphs. It never was: too small and the
   * tokens overlapped and the line ran past the box, too large and gaps opened
   * up — a trailing comma visibly floating away from the string it belonged
   * to. tspans flow inline, so spacing is whatever the actual font does and
   * there is nothing to drift.
   *
   * ADV survives above, but only to ESTIMATE how much text fits when choosing
   * the type size and the wrap width. There it is deliberately a slight
   * over-estimate (0.62 vs ~0.602 measured), which now just buys margin
   * instead of misplacing anything, and no clipping safety net is needed
   * because an over-estimate can only pick a size that is too small to
   * overflow.
   *
   * xml:space="preserve" keeps the leading indent: SVG collapses leading
   * whitespace by default, which is what forced the old code to carry
   * indentation as an invisible width-only token in the first place.
   */
  const codeLines = lines.map((parts, i) => {
    const y = top + 22 + i * lineH
    const spans = parts
      .filter(([str]) => str.length)
      .map(([str, fill]) => `<tspan fill="var(--${fill})">${esc(str)}</tspan>`)
      .join('')
    if (!spans) return ''
    return `<text x="${px + 16}" y="${y}" font-size="${codeSize.toFixed(2)}" ` +
      `class="mono" xml:space="preserve">${spans}</text>`
  }).filter(Boolean).join('\n  ')

  /* ---------- right: the typewriter ---------- */
  const { frameMs, holdFrames } = h.typewriter
  const cx = rightX + rightW / 2
  const greetTop = stacked ? top + codeH + 12 : top
  const midY = greetTop + greetH / 2

  // Build the full frame list across every greeting, in order.
  const seq = []
  for (const g of h.greetings) {
    const gs = graphemes(g.text)
    for (let i = 1; i <= gs.length; i++) seq.push({ s: gs.slice(0, i).join(''), lang: g.lang, cursor: true })
    // Hold the complete word, blinking the cursor every 4 frames.
    for (let k = 0; k < holdFrames; k++) seq.push({ s: g.text, lang: g.lang, cursor: k % 8 < 4 })
    // Delete it again, so the next language types into an empty line.
    for (let i = gs.length - 1; i >= 1; i--) seq.push({ s: gs.slice(0, i).join(''), lang: g.lang, cursor: true })
  }

  const M = seq.length
  const totalMs = M * frameMs
  const slot = 100 / M
  /**
   * Pick the largest size each greeting can wear without overflowing.
   *
   * The old version keyed off `s.length`, which is wrong twice over: it counts
   * UTF-16 code units, so नमस्ते scored 6 and got shrunk despite being four
   * visible clusters; and it treats every character as equally wide, so
   * こんにちは — five FULL-WIDTH glyphs — was sized as if it were "Hello".
   * That is exactly why some greetings came out smaller than others.
   *
   * Measuring by grapheme and weighting CJK/Hangul as roughly double-width
   * lets every greeting run as large as its own box allows.
   */
  const wide = /[ᄀ-ᇿ⺀-鿿ꥠ-꥿가-퟿豈-﫿＀-｠]/
  const estWidth = (s, size) =>
    graphemes(s).reduce((w, ch) => w + (wide.test(ch) ? 1.0 : SANS_ADV_BOLD) * size, 0)
  const maxTextW = rightW - 30          // side padding plus room for the cursor
  const sizeFor = (s) =>
    [38, 34, 30, 26, 22, 18].find((size) => estWidth(s, size) <= maxTextW) ?? 18

  /**
   * Thick caps at the top and bottom of the greeting box.
   *
   * Each cap is three stripes — band-blue, amber, deep-blue — mirrored top to
   * bottom, framing the animation without adding anything to read. The amber
   * ties back to the accent used in the contributions grid.
   *
   * The stripe scales with the box rather than being fixed at 6px: the object
   * literal beside it is now long, so the greeting column is tall, and a
   * 6px stripe left the box reading as mostly empty. Sized to fill roughly a
   * quarter of the column between the two caps — enough to answer the
   * whitespace without closing in on the word being typed. Clamped at both
   * ends so a short object doesn't produce a hairline and a very long one
   * doesn't produce a block.
   */
  const STRIPE = Math.round(Math.max(8, Math.min(34, greetH / 18)))
  const BAR = STRIPE * 3
  const cap = (y, order) => order.map((token, i) =>
    rrect(rightX, y + i * STRIPE, rightW, STRIPE, 0, token)).join('\n  ')
  const bars = [
    cap(greetTop, ['barA', 'accent', 'barB']),
    cap(greetTop + greetH - BAR, ['barB', 'accent', 'barA']),
  ].join('\n  ')

  /**
   * The cursor is a <tspan> rather than part of the string, for one reason:
   * a thin block glyph like ▏ is reliably present in monospace faces but often
   * missing from system-ui sans stacks, where it renders as tofu. A tspan lets
   * it carry its own font-family while still FLOWING inline after the text —
   * so we get a thin cursor without having to measure any text width.
   */
  const frames = seq.map((f, i) => `
  <g class="tw${i === 0 ? ' tw1' : ''}" style="animation-delay: -${i * frameMs}ms">
    <text x="${cx}" y="${midY + 2}" font-size="${sizeFor(f.s)}" font-weight="700" fill="var(--fg)" text-anchor="middle">${esc(f.s)}${f.cursor ? `<tspan class="cur">${CURSOR}</tspan>` : ''}</text>
    ${text(f.lang.toUpperCase(), { x: cx, y: midY + 30, size: 9, weight: 600, fill: 'muted', anchor: 'middle', extra: 'letter-spacing="2"' })}
  </g>`).join('')

  const css = `
  .cur { font-family: var(--font-mono); font-weight: 400 }
  .tw { opacity: 0; animation: twcycle ${totalMs}ms linear infinite }
  .tw1 { opacity: 1 }            /* static fallback if animation is ignored */
  @keyframes twcycle {
    0%                  { opacity: 1 }
    ${(slot * 0.999).toFixed(4)}% { opacity: 1 }
    ${slot.toFixed(4)}% { opacity: 0 }
    100%                { opacity: 0 }
  }
  @media (prefers-reduced-motion: reduce) { .tw { animation: none } }`

  const body = `  ${kicker('about')}
  ${statusPills(config.status)}
  ${rrect(px, top, leftW, codeH, 0, 'surface')}
  ${codeLines}
  ${rrect(rightX, greetTop, rightW, greetH, 0, 'surface')}
  ${bars}
  ${frames}`

  return part({ name: 'intro', height: HEIGHT, body, css, band })
}

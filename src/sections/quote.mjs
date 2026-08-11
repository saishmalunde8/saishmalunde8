/**
 * Two short text columns in one band.
 *
 * Kept as a single section on purpose: two 150px bands stacked would eat
 * 300px of page for very little, and left-then-right reads as one "small
 * text" beat rather than two.
 *
 * Both headings come from config (`quote.kicker`, `joke.kicker`) rather than
 * being hardcoded, so the pair can be whatever you want it to be — currently
 * "mindset currently" and "mental state" rather than the generic quote/joke
 * they started as. `quote.author` is optional: leave it empty for your own
 * words and the attribution line simply isn't drawn.
 */
import { part, text, rrect, kicker, layout, esc } from '../lib/svg.mjs'



export function quote(config, { band }) {
  const { quote: q, joke: j } = config
  const px = layout.padX
  const stacked = layout.narrow
  const colW = stacked ? layout.width - px * 2 : (layout.width - px * 2 - 24) / 2

  // Naive wrap — good enough for short mock strings at these widths.
  const wrap = (s, max) => {
    const out = []
    let line = ''
    for (const w of s.split(' ')) {
      if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w }
      else line += ' ' + w
    }
    if (line.trim()) out.push(line.trim())
    return out
  }

  /**
   * Self-sizing, deliberately.
   *
   * Both columns used fixed offsets and the attribution hung off HEIGHT - 30.
   * That only held at one specific height and one specific quote length —
   * tightening the section made the attribution collide with the last line of
   * the quote. Laying both columns out from their own content and taking the
   * taller of the two means the band grows or shrinks with whatever you write.
   *
   * ── Wrap width and leading are both solved, not fixed ──────────────────────
   * A hardcoded character count only holds at one width, and hardcoded leading
   * only holds at one type size. The narrow build enlarges every font by
   * layout.typeScale, so 40 characters that fit at 880px ran past the right
   * padding at 480px, and 24px of leading under 24.3px text had the lines
   * touching. ~0.5em average advance is a safe estimate for both faces here.
   *
   * ── Everything below is an ABSOLUTE y, never a height ─────────────────────
   * The stacked path used to mix the two: it measured the joke column from
   * layout.contentY (so the number already included the whole quote column
   * above it) and then used that same number as the joke box's height. With a
   * short mock quote the error was small enough to look like padding; with a
   * real four-sentence one the box grew a screen of empty space underneath.
   * Every name here is a y coordinate, and heights are only ever computed as
   * bottom − top.
   */
  const scale = layout.typeScale ?? 1
  const charsFor = (fontSize, pad) => Math.floor((colW - pad) / (fontSize * scale * 0.5))

  /**
   * The right column is set larger and centred both ways, with the punchline
   * larger still — it's two lines of comic timing, not body copy, and at 13px
   * left-aligned it read as a footnote next to the quote. The setup stays
   * deliberately below the punchline in size so the joke still lands second.
   */
  const J_SETUP = 18
  const J_PUNCH = 22

  const qLH = Math.round(24 * scale)
  const jLH = Math.round(J_PUNCH * scale * 1.5)
  // Breathing room between setup and punchline — the beat before the joke.
  const jGap = Math.round(J_PUNCH * scale * 0.7)

  // Text starts clear of the accent rule at x+20 — they were both on x+20, so
  // the rule was touching the first character of every line.
  const Q_TEXT_X = 38

  const qLines = wrap(q.text, charsFor(18, Q_TEXT_X + 20))
  const jSetup = wrap(j.setup, charsFor(J_SETUP, 40))
  const jPunch = wrap(j.punchline, charsFor(J_PUNCH, 40))

  const qBoxTop = layout.contentY
  const qTop = qBoxTop + 30
  const authorY = qTop + qLines.length * qLH + 6
  // No attribution line means no room reserved for one.
  const qBoxBottom = q.author ? authorY + 8 : authorY - 12

  /**
   * The joke block is centred VERTICALLY inside its box, not hung from the
   * top. Side by side, the box takes its height from the quote column next to
   * it, so anchoring the text to the top left a growing pool of dead space
   * underneath as the quote got longer. Measuring the block and centring it
   * means the two columns stay balanced whatever either one says.
   */
  const jContentH = jSetup.length * jLH + jGap + jPunch.length * jLH
  const jBoxTop = stacked ? qBoxBottom + 34 : layout.contentY
  // Minimum the joke needs on its own, used when it is the taller column.
  const jNeedH = jContentH + 44
  const jBoxH = stacked ? jNeedH : Math.max(qBoxBottom - qBoxTop, jNeedH)

  // First baseline sits one ascender below the centred block's top edge.
  const jTop = jBoxTop + (jBoxH - jContentH) / 2 + Math.round(J_PUNCH * scale * 0.8)
  const punchTop = jTop + jSetup.length * jLH + jGap

  const height = (stacked ? jBoxTop + jBoxH : layout.contentY + Math.max(qBoxBottom - qBoxTop, jBoxH)) + layout.padBottom
  const qBoxH = stacked ? qBoxBottom - qBoxTop : height - layout.contentY - layout.padBottom

  const jx = stacked ? px : px + colW + 24
  const jcx = jx + colW / 2
  const quoteLines = qLines.map((l, i) =>
    text(l, { x: px + Q_TEXT_X, y: qTop + i * qLH, size: 18, fill: 'fg', cls: 'serif' })).join('\n  ')
  const jokeSetup = jSetup.map((l, i) =>
    text(l, { x: jcx, y: jTop + i * jLH, size: J_SETUP, fill: 'fg', anchor: 'middle' })).join('\n  ')
  const jokePunch = jPunch.map((l, i) =>
    text(l, { x: jcx, y: punchTop + i * jLH, size: J_PUNCH, weight: 700, fill: 'accent', anchor: 'middle' })).join('\n  ')

  const body = `  ${kicker(q.kicker)}
  ${text(j.kicker.toUpperCase(), { x: jx, y: stacked ? jBoxTop - 12 : layout.kickerY, size: 11, weight: 700, fill: 'muted', extra: 'letter-spacing="2.5"' })}
  ${rrect(px, qBoxTop, colW, qBoxH, 10, 'surface')}
  ${rrect(jx, jBoxTop, colW, jBoxH, 10, 'surface')}
  <line x1="${px + 20}" y1="${qBoxTop + 12}" x2="${px + 20}" y2="${qBoxTop + qBoxH - 12}" stroke="var(--accent)" stroke-width="3" opacity="0.5"/>
  ${quoteLines}
  ${q.author ? text(`— ${q.author}`, { x: px + Q_TEXT_X, y: authorY, size: 12, fill: 'muted' }) : ''}
  ${jokeSetup}
  ${jokePunch}`

  return part({ name: 'quote', height, body, band })
}

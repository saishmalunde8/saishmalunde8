/**
 * Text-width ESTIMATES, in one place.
 *
 * SVG-in-<img> has no way to measure real glyph width — that depends on which
 * font the viewer's OS actually resolved the stack to (theme.mjs's fonts are
 * a stack of names, not one guaranteed font). Every section that needs to
 * know "will this string fit" multiplies character count × font-size × one
 * of these fractions instead of measuring.
 *
 * These three are NOT the same number, on purpose — collapsing them into one
 * shared constant would be the wrong fix, not a simplification. Mono and
 * proportional-sans fonts have genuinely different average advances, and mono
 * itself needs two different postures depending on what a wrong guess costs
 * in each caller:
 *
 *  - MONO_ADV_SAFE — used wherever an underestimate would let text overflow
 *    its box (intro.mjs: deciding whether a principle fits on one line).
 *    Deliberately padded above the measured value: getComputedTextLength()
 *    against the real font stack in theme.mjs measured ~0.602em, and
 *    different platforms resolve that stack to different actual fonts (SF
 *    Mono / Menlo on macOS, Consolas on Windows, a generic fallback on
 *    Linux) with no way to know which one a given visitor's browser picked.
 *    0.565 was tried first and was wrong — see intro.mjs for the incident
 *    this fixed (principles overflowing the About box).
 *
 *  - MONO_ADV_TIGHT — used where the estimate SOLVES a size from a fixed
 *    width rather than checking a fit (signature.mjs: the ASCII-art block
 *    letters must fill the available width, so padding the estimate the way
 *    MONO_ADV_SAFE does would just render the signature smaller than it
 *    needs to be — a cosmetic cost there, not an overflow).
 *
 *  - SANS_ADV — proportional sans stack, body text sizes (12–14px: starred
 *    repo names/descriptions). Deliberately generous in the same direction
 *    as MONO_ADV_SAFE: overshooting cuts a character early (invisible next
 *    to the ellipsis it clips to), undershooting pushes text through the
 *    edge of the card — real repo descriptions run 100–230 characters, and
 *    that was the bug this constant was written to fix.
 *
 * Before this file existed, three sections each carried their own private
 * `const ADV = …`, and two more copies of the same 0.62 literal were
 * hardcoded inline in intro.mjs (the status pills, the greeting sizer) with
 * no link back to the documented one above them. Nothing kept those five in
 * sync — changing one to fix a real overflow would silently leave the others
 * on stale numbers. Import from here instead of writing a new literal.
 */
export const MONO_ADV_SAFE = 0.62
export const MONO_ADV_TIGHT = 0.6
export const SANS_ADV = 0.54

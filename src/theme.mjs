/**
 * Theme tokens. Every generated SVG reads from here, so changing a colour
 * here changes it everywhere on the next build.
 *
 * Each colour is a [light, dark] pair. Sections emit BOTH into the SVG and
 * switch between them with an internal `@media (prefers-color-scheme: dark)`
 * rule — one file, correct in both GitHub themes.
 *
 * >>> MOCK PALETTE. Warm/amber, picked only so you can judge layout against
 * >>> something that isn't grey. Swap every hex below and rebuild. <<<
 */
export const theme = {
  /**
   * The colour of the page BEHIND the sections — GitHub's README card.
   * Section bands fade into this at their edges, which is what makes them
   * read as soft bands on the page instead of hard-edged boxes.
   * Must track GitHub exactly: #fff light, #0d1117 dark.
   */
  page: ['#FFFFFF', '#0D1117'],

  bg: ['#F7FAFD', '#0A0F1A'],
  surface: ['#FFFFFF', '#16213A'],
  border: ['#D7E1F0', '#25334D'],

  fg: ['#0F1726', '#E8EEF8'],
  muted: ['#5B6B85', '#8496B4'],

  accent: ['#E8A33D', '#F0B455'],
  accent2: ['#3B6FD4', '#6E9FEF'],
  barA: ['#A9C3E3', '#2B4070'],
  barB: ['#7E9DC8', '#1E2E52'],

  /** Section bands, alternated by position. */
  band1: ['#F4F8FD', '#070C16'],
  band2: ['#DFE9F7', '#121D33'],
  band3: ['#EDF3FC', '#0A1220'],
  band4: ['#D2E1F4', '#19294A'],
}

/**
 * Layout constants — MUTABLE, via setLayout().
 *
 * The page is built twice: wide (880) and narrow (480, for phones), and the
 * two are swapped with <picture media>. Sections read `layout.*` inside their
 * render function, so flipping these between passes reflows the entire page
 * without threading a width argument through every module.
 *
 * Safe because the build is single-threaded and completes one full pass before
 * starting the next.
 */
export const layout = {
  width: 880,      // authored width; GitHub renders it at ~684px (0.78 scale)
  narrow: false,
  radius: 0,
  padX: 32,
  hairline: 1.5,

  // Compact vertical rhythm. Tightened once the full page was assembled and
  // came out over three screens long.
  kickerY: 21,     // baseline of the small uppercase section label
  contentY: 38,    // where section content starts
  padBottom: 11,   // breathing room below the last element
}

/** Widths the page is built at. 480 lands ~1:1 on a phone's README column. */
export const WIDE = 880
export const NARROW = 480

/**
 * Switch the layout for the next build pass.
 *
 * Narrow gets tighter side padding but a LARGER type scale — the whole point
 * of the second build is that the wide layout, scaled down to a 360px phone
 * column, renders 13px body text at about 5px. Sections multiply their font
 * sizes by `layout.typeScale`.
 */
export function setLayout(width) {
  layout.width = width
  layout.narrow = width < 600
  layout.padX = layout.narrow ? 16 : 32
  layout.kickerY = layout.narrow ? 20 : 21
  layout.contentY = layout.narrow ? 36 : 38
  layout.typeScale = layout.narrow ? 1.35 : 1
  return layout
}

/**
 * SVG-in-<img> cannot fetch web fonts, so these MUST already exist on the
 * viewer's machine. If we ever need exact typography, the fix is embedding
 * a woff2 as a base64 data URI.
 */
export const fonts = {
  sans: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
  serif: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif",
}

/** Band token name for the Nth section, so ordering changes recolour cleanly. */
export const bandFor = (i) => `band${(i % 4) + 1}`

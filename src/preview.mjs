#!/usr/bin/env node
/**
 * Local preview harness.
 *
 *   node src/preview.mjs   →  writes preview.html, then open it
 *
 * Renders every built SVG the same way GitHub does — via <img src>, which is
 * the ONLY way to check this honestly. Opening an .svg file directly in a
 * browser is a different rendering mode (it allows things <img> forbids), so
 * a section can look perfect as a standalone file and break in the README.
 *
 * Shows light and dark side by side, since each SVG carries both themes.
 */
import { readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const files = (await readdir(join(root, 'assets'))).filter((f) => f.endsWith('.svg'))

// Cache-buster. Without it the browser happily serves the previous build's
// SVG and you "fix" bugs that are still there.
const v = Date.now()

const panel = (scheme) => `
  <section class="pane ${scheme}" style="color-scheme: ${scheme}">
    <h2>${scheme}</h2>
    ${files.map((f) => `<figure><img src="assets/${f}?v=${v}" alt="${f}"><figcaption>${f}</figcaption></figure>`).join('\n    ')}
  </section>`

const html = `<!doctype html>
<meta charset="utf-8">
<title>profile README preview</title>
<style>
  body { margin: 0; font: 14px system-ui, sans-serif; display: grid; grid-template-columns: 1fr 1fr }
  .pane { padding: 24px; min-height: 100vh }
  .pane.light { background: #fff; color: #1f2328 }
  .pane.dark  { background: #0d1117; color: #e6edf3 }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; opacity: .6; margin: 0 0 20px }
  figure { margin: 0 0 28px }
  img { width: 100%; display: block }
  figcaption { font-family: ui-monospace, monospace; font-size: 11px; opacity: .5; margin-top: 6px }
</style>
${panel('light')}
${panel('dark')}
`

await writeFile(join(root, 'preview.html'), html, 'utf8')
console.log(`preview.html — ${files.length} asset(s)`)

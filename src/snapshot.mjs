#!/usr/bin/env node
/**
 * Structural snapshot test.
 *
 *   npm run snapshot   → record the current output as the baseline
 *   npm test           → rebuild and diff against the baseline
 *
 * ── Why "structural" ─────────────────────────────────────────────────────
 * The real SVGs are ~550KB, almost all of it base64 artwork. Committing that
 * would make every art tweak a half-megabyte diff and the snapshot useless to
 * read. So each data: URI is replaced by a short hash of its bytes:
 *
 *   data:image/png;base64,iVBORw0KG…  →  data:image/png;base64,[sha256:1a2b3c4d]
 *
 * That keeps the baseline small and readable while still catching everything:
 * layout, coordinates, keyframes and CSS diff verbatim, and a changed painting
 * changes its hash.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * Three separate regressions shipped unnoticed and were found only by someone
 * happening to look at the right pixel: the quote attribution colliding with
 * its own text, one painting bleeding through another's letterbox bars, and a
 * white flash at the animation loop. All three would have shown up here as a
 * diff.
 */
import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ASSETS = join(root, 'assets')
const BASELINE = join(root, 'test/baseline')

/** Replace every base64 payload with a short stable hash of its bytes. */
function structural(svg) {
  return svg.replace(/data:image\/(\w+);base64,([A-Za-z0-9+/=]+)/g, (_, mime, b64) => {
    const hash = createHash('sha256').update(b64).digest('hex').slice(0, 8)
    return `data:image/${mime};base64,[sha256:${hash}]`
  })
}

async function collect() {
  const files = (await readdir(ASSETS)).filter((f) => f.endsWith('.svg')).sort()
  const out = new Map()
  for (const f of files) {
    out.set(f, structural(await readFile(join(ASSETS, f), 'utf8')))
  }
  out.set('README.md', await readFile(join(root, 'README.md'), 'utf8'))
  return out
}

async function record() {
  await rm(BASELINE, { recursive: true, force: true })
  await mkdir(BASELINE, { recursive: true })
  const files = await collect()
  for (const [name, content] of files) {
    await writeFile(join(BASELINE, name.replace(/\//g, '_')), content, 'utf8')
  }
  const bytes = [...files.values()].reduce((n, c) => n + c.length, 0)
  console.log(`baseline recorded — ${files.size} files, ${(bytes / 1024).toFixed(1)} KB`)
}

/** First differing line, with a little context — enough to see what moved. */
function firstDiff(a, b) {
  const la = a.split('\n')
  const lb = b.split('\n')
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}\n      baseline: ${(la[i] ?? '(missing)').trim().slice(0, 110)}\n      current:  ${(lb[i] ?? '(missing)').trim().slice(0, 110)}`
    }
  }
  return 'files differ in length only'
}

async function check() {
  let baseline
  try {
    baseline = await readdir(BASELINE)
  } catch {
    console.error('no baseline — run `npm run snapshot` first')
    process.exit(1)
  }

  const current = await collect()
  const problems = []

  for (const [name, content] of current) {
    const key = name.replace(/\//g, '_')
    if (!baseline.includes(key)) { problems.push(`+ ${name} is new`); continue }
    const was = await readFile(join(BASELINE, key), 'utf8')
    if (was !== content) problems.push(`~ ${name} changed at ${firstDiff(was, content)}`)
  }
  for (const key of baseline) {
    if (![...current.keys()].some((n) => n.replace(/\//g, '_') === key)) problems.push(`- ${key} disappeared`)
  }

  if (problems.length) {
    console.error(`snapshot drift (${problems.length}):\n` + problems.map((p) => `  ${p}`).join('\n'))
    console.error(`\n  If the change was intended: npm run snapshot`)
    process.exit(1)
  }
  console.log(`snapshot clean — ${current.size} files match`)
}

await (process.argv.includes('--record') ? record() : check())

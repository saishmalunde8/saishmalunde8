#!/usr/bin/env node
/**
 * Fetch real, public, no-token GitHub data for starred repos, stats, and
 * real line-of-code counts.
 *
 *   node src/livedata.mjs   →  data/starred.json, data/stats.json,
 *                              data/code.json
 *
 * ── Why these, and not a commits counter ────────────────────────────────────
 * Every endpoint here is public and needs no personal access token — the
 * same reasoning that kept the contribution-graph fetcher token-free before
 * it was simplified to demo data. An exact commit count genuinely isn't
 * available this way (it needs GraphQL + a token), which is why the stats
 * tile it used to occupy is now "forks earned" instead — summed from the
 * same /repos call that already gives stars, no extra request.
 */
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, extname } from 'node:path'
import { tmpdir } from 'node:os'

const run = promisify(execFile)
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://api.github.com'

async function getJSON(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GET ${path} — HTTP ${res.status}`)
  return res.json()
}

async function fetchStarred(login, limit) {
  const items = await getJSON(`/users/${login}/starred?per_page=${limit}&sort=created`)
  // Wrapped in an object, not returned as a bare array: main() does
  // `data.fetchedAt = ...` on whatever each job returns, and JSON.stringify
  // silently drops non-index properties set on an array — fetchedAt would
  // vanish with no error. Caught by actually reading the written file rather
  // than trusting the job reported "ok".
  return {
    repos: items.map((r) => ({
      name: r.full_name,
      desc: r.description ?? '',
      stars: formatCount(r.stargazers_count),
    })),
  }
}

async function fetchStats(login) {
  const user = await getJSON(`/users/${login}`)
  const repos = await getJSON(`/users/${login}/repos?per_page=100`)
  const starsEarned = repos.reduce((n, r) => n + r.stargazers_count, 0)
  const forksEarned = repos.reduce((n, r) => n + r.forks_count, 0)
  const years = ((Date.now() - new Date(user.created_at)) / (365.25 * 24 * 3600 * 1000))
  return {
    counters: [
      { value: String(user.public_repos), label: 'PUBLIC REPOS' },
      { value: formatCount(starsEarned), label: 'STARS EARNED' },
      { value: formatCount(forksEarned), label: 'FORKS EARNED' },
      { value: `${Math.max(1, Math.floor(years))} yrs`, label: 'ON GITHUB' },
    ],
  }
}

/**
 * Real line counts, by shallow-cloning every public repo and counting.
 *
 * ── Why cloning, and not the API ───────────────────────────────────────────
 * GitHub will tell you a repo's `size` (KB on disk, including git objects)
 * and its bytes-per-language, but never its line count. Bytes ÷ an assumed
 * average line length would be a guess dressed up as a number, and this page
 * has already dropped two sections for exactly that offence. A shallow clone
 * is the only way to count for real, and at `--depth 1` with no history it's
 * seconds per repo.
 *
 * ── What counts as a line ─────────────────────────────────────────────────
 * Only files git actually tracks, only extensions in CODE below, nothing over
 * 1MB, and nothing inside a vendored directory. Committed dependencies and
 * build output are somebody else's lines; counting them would inflate the
 * number by an order of magnitude and make it meaningless. Generated lockfiles
 * are excluded for the same reason.
 */
const CODE = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.swift', '.py', '.rb', '.go',
  '.rs', '.c', '.h', '.cpp', '.hpp', '.cc', '.m', '.mm', '.java', '.kt',
  '.sh', '.bash', '.zsh', '.sql', '.html', '.css', '.scss', '.vue', '.svelte',
  '.json', '.yml', '.yaml', '.toml', '.md', '.txt',
])
const VENDORED = /(^|\/)(node_modules|vendor|dist|build|Pods|\.build|third_party)\//
const LOCKFILE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Podfile\.lock|Cargo\.lock)$/
const MAX_FILE = 1_000_000

async function countRepo(cloneUrl, dir) {
  await run('git', ['clone', '--depth', '1', '--quiet', cloneUrl, dir])
  const { stdout } = await run('git', ['-C', dir, 'ls-files'], { maxBuffer: 32 * 1024 * 1024 })
  const files = stdout.split('\n').filter(Boolean)

  let lines = 0
  let counted = 0
  for (const rel of files) {
    if (VENDORED.test(rel) || LOCKFILE.test(rel) || !CODE.has(extname(rel).toLowerCase())) continue
    const full = join(dir, rel)
    try {
      if ((await stat(full)).size > MAX_FILE) continue
      const text = await readFile(full, 'utf8')
      // A trailing newline terminates the last line rather than starting a new
      // empty one, so count separators and add one only for a final partial.
      if (!text.length) continue
      lines += text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
      counted++
    } catch { /* unreadable or not valid UTF-8 — not a source file, skip */ }
  }
  return { lines, files: counted }
}

async function fetchCode(login) {
  const repos = await getJSON(`/users/${login}/repos?per_page=100&type=owner`)
  const usable = repos.filter((r) => !r.fork && !r.archived)

  const workRoot = join(tmpdir(), `readme-loc-${process.pid}`)
  await mkdir(workRoot, { recursive: true })

  let lines = 0
  let files = 0
  let scanned = 0
  try {
    for (const r of usable) {
      const dir = join(workRoot, r.name)
      try {
        const got = await countRepo(r.clone_url, dir)
        lines += got.lines
        files += got.files
        scanned++
        console.log(`    ${r.name.padEnd(28)} ${String(got.lines).padStart(8)} lines`)
      } catch (err) {
        // An empty repo has no default branch and `git clone` exits non-zero.
        // One unclonable repo shouldn't lose the whole total.
        console.warn(`    ${r.name.padEnd(28)} skipped — ${err.message.split('\n')[0]}`)
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
    }
  } finally {
    await rm(workRoot, { recursive: true, force: true })
  }

  // Most recent push across all repos — the "last pushed" line. `pushed_at`
  // comes from the same call, so this costs nothing extra.
  const latest = repos
    .filter((r) => r.pushed_at)
    .sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at))[0]

  return {
    lines, files, repos: scanned,
    lastPush: latest ? { repo: latest.name, at: latest.pushed_at } : null,
  }
}

function formatCount(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n)
}

async function main() {
  const config = JSON.parse(await readFile(join(root, 'profile.config.json'), 'utf8'))
  const login = config.username
  await mkdir(join(root, 'data'), { recursive: true })

  const jobs = [
    ['starred', () => fetchStarred(login, 4), 'data/starred.json'],
    ['stats', () => fetchStats(login), 'data/stats.json'],
    ['code', () => fetchCode(login), 'data/code.json'],
  ]

  for (const [name, fn, outPath] of jobs) {
    try {
      const data = await fn()
      data.fetchedAt = new Date().toISOString()
      await writeFile(join(root, outPath), JSON.stringify(data, null, 2))
      console.log(`  ${name.padEnd(10)} ok → ${outPath}`)
    } catch (err) {
      console.warn(`  ${name.padEnd(10)} FAILED — ${err.message} (section keeps its existing fallback)`)
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err); process.exit(1) })
}

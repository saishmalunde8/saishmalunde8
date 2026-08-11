#!/usr/bin/env node
/**
 * Append one signing to data/guestbook.json.
 *
 * Run by .github/workflows/guestbook.yml after stefanbuck/github-issue-parser
 * has pulled the message out of the Issue Form submission. Reads MESSAGE and
 * AUTHOR from the environment rather than parsing the issue body itself — the
 * parsing Action is a maintained, widely-used tool built specifically for
 * GitHub's "### <label>" issue-form format, which is safer to depend on than
 * a hand-rolled regex I have no way to test against a real form submission
 * (gh issue create bypasses the web form entirely, so there is no local way
 * to produce a genuine sample body to test a parser against).
 *
 * Newest entry first, capped at MAX_ENTRIES so the section — and the page —
 * don't grow without bound as more people sign.
 *
 * No "visitors" count in the output: the original mock had one (a fabricated
 * 1,284), but nothing here actually tracks page views — only real signings
 * are real data. guestbook.mjs shows entry count instead.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const MAX_ENTRIES = 6

async function main() {
  const message = (process.env.MESSAGE ?? '').trim()
  const author = (process.env.AUTHOR ?? '').trim()
  if (!message || !author) {
    throw new Error(`missing MESSAGE or AUTHOR env var (got message=${JSON.stringify(message)}, author=${JSON.stringify(author)})`)
  }

  const path = join(root, 'data/guestbook.json')
  let data = { entries: [] }
  try {
    data = JSON.parse(await readFile(path, 'utf8'))
  } catch { /* first ever signing */ }

  data.entries.unshift({
    name: author,
    message: message.length > 90 ? `${message.slice(0, 89)}…` : message,
    date: new Date().toISOString().slice(0, 10),
  })
  data.entries = data.entries.slice(0, MAX_ENTRIES)

  await mkdir(join(root, 'data'), { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2))
  console.log(`data/guestbook.json — added @${author}, ${data.entries.length} entries kept`)
}

main().catch((err) => { console.error(err); process.exit(1) })

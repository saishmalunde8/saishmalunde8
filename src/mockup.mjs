#!/usr/bin/env node
/**
 * Renders the built README inside a replica of the GitHub profile page, at
 * GitHub's real column widths, in both themes.
 *
 *   node src/mockup.mjs   →  mockup.html
 *
 * Why this exists: preview.mjs shows sections in isolation on a blank page,
 * which flatters them. What actually matters is how they read at ~750px
 * inside a bordered card, next to the avatar and above the pinned repos.
 * Section widths, vertical rhythm and contrast all look different there.
 *
 * Two caveats on what you are looking at:
 *  - The SVGs are shown via <img>, exactly as GitHub does. This browser
 *    freezes animations in that mode, so animated sections appear as their
 *    static t=0 frame. That frame is the real fallback, so it is worth
 *    judging — but check motion with `npm run preview` and opening the .svg
 *    directly.
 *  - Profile metadata below is pulled from the live GitHub API at build time.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(await readFile(join(root, 'profile.config.json'), 'utf8'))
const readme = await readFile(join(root, 'README.md'), 'utf8')

// Live profile facts, so the mockup is not lying about follower counts etc.
let user = { name: config.name, login: config.username, followers: 0, following: 0, public_repos: 0, bio: null }
try {
  const res = await fetch(`https://api.github.com/users/${config.username}`)
  if (res.ok) user = { ...user, ...(await res.json()) }
} catch {
  console.warn('! GitHub API unreachable — falling back to config values')
}

const v = Date.now() // cache-buster

/** Strip the generated-file banner and point assets at the local server. */
const body = readme
  .replace(/<!--[\s\S]*?-->/g, '')
  .replaceAll('src="assets/', `src="assets/`)
  .replace(/\.svg"/g, `.svg?v=${v}"`)
  .trim()

const icon = (d) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`
const PEOPLE = 'M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.672A1.5 1.5 0 0 0 11 5.5.75.75 0 0 1 11 4Z'

/** One full profile page in a given theme. */
const page = (scheme) => `
<div class="gh ${scheme}" style="color-scheme: ${scheme}">
  <div class="topbar"><span class="dot"></span><span class="dot"></span><span class="dot"></span>
    <span class="url">github.com/${user.login}</span></div>
  <div class="page">
    <aside class="side">
      <img class="avatar" src="https://avatars.githubusercontent.com/u/43239550?v=4" alt="">
      <h1 class="name">${user.name ?? user.login}</h1>
      <p class="login">${user.login}</p>
      ${user.bio ? `<p class="bio">${user.bio}</p>` : ''}
      <button class="btn">Edit profile</button>
      <p class="meta">${icon(PEOPLE)}
        <strong>${user.followers}</strong> followers · <strong>${user.following}</strong> following</p>
    </aside>
    <main class="main">
      <div class="readme-head"><span class="mono">${user.login}</span>/<span class="mono b">README</span>.md</div>
      <div class="readme">${body}</div>

      <h2 class="h">Pinned</h2>
      <div class="pins">${['repo-one', 'repo-two', 'repo-three', 'repo-four'].map((r) => `
        <div class="pin"><span class="pin-name">${r}</span>
          <p class="pin-desc">Placeholder — your real pinned repos sit here.</p>
          <p class="pin-meta"><span class="lang"></span> TypeScript</p></div>`).join('')}
      </div>

      <h2 class="h">${user.public_repos} contributions in the last year</h2>
      <div class="graph">${Array.from({ length: 53 * 7 }, (_, i) =>
        `<span class="cell l${[0, 0, 0, 1, 1, 2, 3, 4][(i * 7919) % 8]}"></span>`).join('')}
      </div>
    </main>
  </div>
</div>`

const html = (scheme) => `<!doctype html>
<meta charset="utf-8">
<title>${user.login} — profile mockup (${scheme})</title>
<style>
  * { box-sizing: border-box }
  body { margin: 0; font: 14px/1.5 -apple-system, system-ui, 'Segoe UI', sans-serif; background: #8b95a1 }

  .gh { --bg:#fff; --canvas:#fff; --border:#d1d9e0; --fg:#1f2328; --muted:#59636e;
        --btnbg:#f6f8fa; --link:#0969da; --c0:#ebedf0; --c1:#9be9a8; --c2:#40c463; --c3:#30a14e; --c4:#216e39;
        background: var(--canvas); color: var(--fg); margin: 0 auto 40px; max-width: 1280px }
  .gh.dark { --bg:#0d1117; --canvas:#0d1117; --border:#3d444d; --fg:#f0f6fc; --muted:#9198a1;
             --btnbg:#212830; --link:#4493f8; --c0:#151b23; --c1:#033a16; --c2:#196c2e; --c3:#2ea043; --c4:#56d364 }

  .topbar { display:flex; align-items:center; gap:6px; padding:10px 16px; background:var(--btnbg);
            border-bottom:1px solid var(--border) }
  .dot { width:11px; height:11px; border-radius:50%; background:var(--border) }
  .url { margin-left:12px; font:12px ui-monospace, monospace; color:var(--muted) }

  .page { display:grid; grid-template-columns:296px 1fr; gap:24px; padding:24px 32px 48px }
  .avatar { width:260px; height:260px; border-radius:50%; display:block; border:1px solid var(--border) }
  .name { font-size:26px; font-weight:600; margin:16px 0 0 }
  .login { font-size:20px; font-weight:300; color:var(--muted); margin:0 0 16px }
  .bio { margin:0 0 16px }
  .btn { width:100%; padding:5px 16px; font-size:14px; font-weight:500; border-radius:6px;
         border:1px solid var(--border); background:var(--btnbg); color:var(--fg); cursor:pointer }
  .meta { display:flex; align-items:center; gap:6px; color:var(--muted); margin:16px 0 0 }
  .meta strong { color:var(--fg); font-weight:600 }

  .readme-head { font-size:14px; color:var(--muted); margin-bottom:8px }
  .readme-head .mono { font-family:ui-monospace, monospace }
  .readme-head .b { color:var(--link) }
  .readme { border:1px solid var(--border); border-radius:6px; padding:32px; margin-bottom:32px }
  /* Deliberately NOT display:block. GitHub leaves README images inline, which
     is what produces the baseline gap between stacked slabs and lets badges
     flow in a row. Forcing block here would flatter the layout and hide the
     exact seam behaviour we are trying to judge. */
  /* Match GitHub's .markdown-body exactly and nothing more. In particular NO
     display:block and NO vertical-align — both of them collapse the baseline
     gap between stacked slabs, which would make the mockup claim a seamless
     join we cannot actually achieve on GitHub. */
  .readme img { max-width:100%; box-sizing:content-box; border-style:none }
  .readme p { margin:0 0 16px } .readme p:last-child { margin-bottom:0 }

  .h { font-size:16px; font-weight:400; color:var(--muted); margin:0 0 12px; font-weight:600 }
  .pins { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:32px }
  .pin { border:1px solid var(--border); border-radius:6px; padding:16px; min-height:120px }
  .pin-name { color:var(--link); font-weight:600 }
  .pin-desc { color:var(--muted); font-size:12px; margin:8px 0 16px }
  .pin-meta { color:var(--muted); font-size:12px; margin:0; display:flex; align-items:center; gap:6px }
  .lang { width:12px; height:12px; border-radius:50%; background:#3178c6; display:inline-block }

  .graph { display:grid; grid-template-rows:repeat(7, 11px); grid-auto-flow:column; gap:3px;
           border:1px solid var(--border); border-radius:6px; padding:16px; overflow-x:auto }
  .cell { width:11px; height:11px; border-radius:2px }
  .l0{background:var(--c0)} .l1{background:var(--c1)} .l2{background:var(--c2)}
  .l3{background:var(--c3)} .l4{background:var(--c4)}
  body { background: ${scheme === 'dark' ? '#010409' : '#8b95a1'} }
  .gh { margin-bottom: 0 }
</style>
${page(scheme)}
`

// One file per theme. A single stacked page is taller than any viewport,
// which makes side-by-side comparison a scrolling exercise instead of a
// glance — and screenshotting it reliably is worse.
for (const scheme of ['light', 'dark']) {
  await writeFile(join(root, `mockup-${scheme}.html`), html(scheme), 'utf8')
}
console.log(`mockup-light.html + mockup-dark.html — ${user.login}, ${user.followers} followers, ${user.public_repos} public repos`)

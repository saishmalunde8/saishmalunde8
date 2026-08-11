# How this project works

A complete guide to the machine that builds your GitHub profile page.

Written to be read cold — if you come back to this in a year having forgotten
everything, start at the top and you'll be productive by section 3.

> **Note on the filename.** This is the *project's* documentation. It can't be
> called `README.md`, because in this repo `README.md` is the finished product —
> the profile page itself. See section 2.

---

## Table of contents

1. [What this project is](#1-what-this-project-is)
2. [The one rule](#2-the-one-rule)
3. [The three commands you'll actually use](#3-the-three-commands-youll-actually-use)
4. [Cookbook — "I want to change X"](#4-cookbook--i-want-to-change-x)
5. [What actually happens when you run the build](#5-what-actually-happens-when-you-run-the-build)
6. [The map of every file](#6-the-map-of-every-file)
7. [Every command, explained](#7-every-command-explained)
8. [The two robots](#8-the-two-robots)
9. [The safety nets](#9-the-safety-nets)
10. [Why the code looks strange](#10-why-the-code-looks-strange)
11. [When something breaks](#11-when-something-breaks)
12. [Moving to the real profile](#12-moving-to-the-real-profile)
13. [Known rough edges](#13-known-rough-edges)

---

## 1. What this project is

### The problem it solves

A GitHub profile page is just a `README.md` file in a repo named after you.
GitHub renders it as markdown, which means you get headings, text, tables, and
images — and almost nothing else. No CSS. No JavaScript. No custom layout.

Most people work around this by pasting in badges from shields.io and stat
cards from other people's services. That works, but the page ends up looking
like everyone else's, and it depends on strangers' servers staying online.

This project takes a different route: **it draws the entire page as images that
you generate yourself.**

### The core idea

You write your content in one plain-text settings file. A program reads that
file and *draws* your profile — laying out text, boxes, colours, and animation
— and saves the result as a handful of `.svg` image files. Then it writes a
`README.md` that is basically just a list of those images stacked on top of
each other.

GitHub sees images and displays them. But because SVG is a text-based image
format that can contain its own styling and its own animation, what the visitor
actually sees is a rich, animated, custom-designed page.

### Why SVG specifically

SVG is the one image format GitHub allows that isn't just a grid of pixels.
An SVG file can contain:

- **Real text**, which stays sharp at any zoom level
- **Its own stylesheet**, including a dark-mode rule — so one file looks
  correct in both GitHub themes with no trickery
- **Its own animation**, which runs without JavaScript

That combination is what makes this possible at all. A PNG could not do any of
those three things.

### What it is not

It isn't a website, and there's no server involved. Every piece of the page is
a file sitting in this repo. (One deliberate exception: the visitor counter —
see section 13.)

---

## 2. The one rule

> ### 🚫 Never edit `README.md` by hand.

`README.md` is **output**, the same way a PDF is output from a Word document.
The build regenerates it from scratch every single time it runs, so any edit
you type into it is silently destroyed the next time anyone runs the build —
including the robot that runs automatically at 6:17 every morning.

The file even says so on its first line:

```
<!-- GENERATED FILE — edit profile.config.json and run `npm run build`. -->
```

The same applies to everything inside the `assets/` folder. Those `.svg` files
are all generated.

**Where you actually make changes:**

| To change | Edit this |
|---|---|
| Any text, link, or list on the page | `profile.config.json` |
| Colours, fonts, spacing | `src/theme.mjs` |
| How a section is drawn | the matching file in `src/sections/` |
| Which sections appear, and in what order | `src/build.mjs` |

99% of the time it's the first row. That's the whole point of the design.

---

## 3. The three commands you'll actually use

Run all of these from inside the project folder, in Terminal.

### Build the page

```bash
npm run build
```

Reads your settings, redraws every image, rewrites `README.md`. Takes about a
second. This is the command. Run it after every change.

It prints a summary so you can see what it made:

```
  assets/hero.svg       1 sections   495px   330.8 KB
  assets/intro.svg      1 sections   367px    91.0 KB
  ...
  total                  938.4 KB
```

### Look at it before you push

```bash
npm run mockup
```

Writes `mockup-light.html` and `mockup-dark.html`. Open either in a browser.

This is not just "the images on a blank page" — it's a **replica of your actual
GitHub profile page**, at GitHub's real column width, with a fake avatar,
sidebar, pinned repos and contribution graph around it. That matters, because
a section that looks great on its own can look cramped or off-balance once
it's sitting in a bordered card at 750 pixels wide.

Check both themes. Some people browse GitHub in dark mode and some don't, and
this page is built to handle both.

### Publish

```bash
git add -A
git commit -m "Update music tracks"
git push
```

Standard git. GitHub picks up the new `README.md` immediately.

### One more, worth knowing

```bash
npm test
```

Compares what the build just produced against a saved-known-good copy in
`test/baseline/`, and lists exactly what changed. It's your seatbelt: if you
edit a music track and this reports that the *guestbook* also moved, something
unintended happened.

When a change *is* intentional, you bless it as the new normal:

```bash
npm run snapshot
```

⚠️ **Right now this test always fails**, even when you've changed nothing. See
section 13 — it's a known bug with a known cause, not a real problem with your
edit.

---

## 4. Cookbook — "I want to change X"

Everything here lives in **`profile.config.json`**. It's a plain text file in
JSON format. Two rules of JSON, and they cause 90% of all errors:

1. **Every piece of text goes inside double quotes** — `"like this"`
2. **Commas separate items, but the last item in a list gets no comma**

After any edit: `npm run build`, then `npm run mockup` to eyeball it.

---

### Change a social link

Find the `socials` list:

```json
"socials": [
  { "label": "LinkedIn",  "icon": "linkedin",  "url": "#" },
  { "label": "X",         "icon": "x",         "url": "https://x.com/MaluSaDev" },
  ...
]
```

Replace the `"#"` with your real address. That's it.

**What `"#"` means:** a deliberate dead link. The badge still shows, but
clicking it does nothing. It's there instead of a made-up address so nobody
lands on a 404 page. When your LinkedIn is back, paste the real URL in.

**What `icon` means:** the name of a brand logo from a free library called
simple-icons. It's not free text — it has to be the library's exact name for
that brand (`nodedotjs`, not `node.js`). Verify with `npm run icons`, which
fails loudly on a bad name rather than silently leaving a blank badge.

---

### Add or remove a social link

You can, but **read this first**, because there's a trap.

All badges are drawn the same physical size. The build then stretches each one
to `100 ÷ (number of badges in the row)` percent of the page width, so they
tile edge to edge with no gaps and read as one continuous strip.

The side effect: **fewer badges in a row means each one renders bigger.**

Right now the top row has 6 badges (16.667% each) and the bottom row has 5
(20% each) — which is why the bottom row's badges are already noticeably
larger than the top row's. Remove one more from the bottom row and it grows
again.

**The safe move:** keep both rows at their current counts. To swap a link,
replace an entry rather than deleting it. To retire one without replacing it,
move a badge up or down so the counts stay balanced.

---

### Change the music tracks

```json
"music": {
  "tracks": [
    { "title": "Dirty Diana", "artist": "Michael Jackson" },
    ...
  ]
}
```

**Two steps, and the second is easy to forget:**

```bash
npm run albumart   # fetch the new cover art
npm run build      # redraw the page
```

`albumart` searches Apple's free iTunes API for each title + artist, downloads
the real cover, and pixelates it to match the page's art style. It also reads
the **real track length** from the same result — which is why durations aren't
written in the config. A number you type by hand can drift out of date or just
be wrong; a number fetched from the source can't.

If you skip `npm run albumart`, the new track appears with a generic music-note
symbol instead of its cover.

---

### Change what's in the starred section

**You don't.** It's automatic.

Every morning the robot fetches the last 4 repos you starred on GitHub and puts
them on the page. Star something new and it appears within a day. Nothing to
edit, nothing to commit.

The `"starred": { "repos": [] }` entry in the config is only a fallback for the
very first build before any data has been fetched.

---

### Change the About box

```json
"about": {
  "varName": "saish_malunde",
  "fields": {
    "pronouns": "he / him",
    "location": "Pune, Maharashtra, India",
    "timezone": "IST — UTC+5:30",
    "reading": "Psycho-Cybernetics",
    "watching": "Better Call Saul"
  }
}
```

The About box is drawn to look like a snippet of source code. `varName` is the
variable name at the top of it. Each entry under `fields` becomes one line.

You can add or remove lines freely — add `"listening": "..."` and a new line
appears. Keep the values reasonably short so they fit the box.

---

### Change principles or what you're learning

```json
"principles": {
  "items": [
    "The build should fail loudly for exactly the thing you'd otherwise ship silently.",
    ...
  ]
},
"learning": {
  "items": [
    { "label": "MCP servers: typed access to my own tools" },
    ...
  ]
}
```

Both render *inside* the About box, not as separate sections.

**On length:** the code tries hard to fit each principle on one line, shrinking
the type down to a floor of 10px before it gives up and wraps to a second line.
Long sentences will therefore either look slightly smaller than their
neighbours or wrap. Both are handled correctly — nothing will overflow the box
— but keeping them under about 85 characters keeps them visually even.

---

### Change the skills grid

```json
"skills": [
  { "abbr": "C+", "icon": "cplusplus" },
  ...
]
```

`icon` is the simple-icons brand name; `abbr` is the two-letter fallback shown
on phones, where full logos aren't rendered (a deliberate size saving).

After adding one:

```bash
npm run icons   # fetch the new logo — fails loudly on a bad brand name
npm run build
```

---

### Change the quote or the joke

```json
"quote": {
  "kicker": "mindset currently",
  "text": "You don't have ideas because you don't read...",
  "author": ""
},
"joke": {
  "kicker": "mental state 😉",
  "setup": "I haven't slept for ten days,",
  "punchline": "because that would be too long!"
}
```

`kicker` is the small uppercase label above it. `author` empty means no
attribution line is drawn.

---

### Change the greetings animation

```json
"hello": {
  "typewriter": { "frameMs": 45, "holdFrames": 14 },
  "greetings": [
    { "text": "Hello", "lang": "English" },
    ...
  ]
}
```

`frameMs` is milliseconds per typed character (lower = faster typing).
`holdFrames` is how long each finished word sits on screen before it deletes
itself.

Add or remove languages freely. The animation timing recalculates itself.

---

### Change the big block-letter signature

```json
"signature": {
  "art": [
    "███████╗ █████╗ ██╗███████╗...",
    ...
  ],
  "tagline": "thanks for scrolling all the way down"
}
```

⚠️ **Every line must contain exactly the same number of characters.** Each row
is centred independently, so if one is shorter the letters visibly stagger.

To generate a new one, search for an "ANSI Shadow" text-to-ASCII generator and
paste the output in. Count the characters before you commit.

---

### Turn a whole section off

```json
"sections": {
  "hero": true,
  "intro": true,
  "snake": true,
  ...
}
```

Flip any to `false`. The section vanishes and everything below slides up. The
background band colours automatically re-alternate so you never end up with two
same-coloured bands touching.

---

### Change the colours

That's `src/theme.mjs`, not the config file:

```js
accent: ['#E8A33D', '#F0B455'],
```

Every colour is a **pair**: `[light mode, dark mode]`. Both get written into
every SVG, and the image switches between them itself based on the visitor's
GitHub theme.

Change a colour here and it changes everywhere on the next build — nothing
hardcodes a hex value anywhere else.

---

## 5. What actually happens when you run the build

Step by step, in order.

### Step 1 — Read the settings

`src/build.mjs` loads `profile.config.json` into memory.

It also tries to load `icons/cache.json` (the brand logos). If that file is
missing, it shrugs and continues — badges fall back to plain text. This
tolerance is deliberate: someone who clones this repo fresh should be able to
build it immediately, without running every fetch step first.

### Step 2 — Ask each section to draw itself

There's a list in `build.mjs` called the **registry**:

```js
const REGISTRY = [
  ['hero', hero],
  ['intro', intro],
  ['snake', snake],
  ['starred', starred],
  ['skills', skills],
  ['stats', stats],
  ['currently', currently],
  ['music', music],
  ['guestbook', guestbook],
  ['quote', quote],
  ['signature', signature],
]
```

Each entry pairs a name with the function that draws it. The build walks this
list in order, skips anything switched off in `sections`, and asks the rest to
produce their drawing.

**Reordering this list reorders the page** — and the background bands
re-alternate automatically, because each section is handed the band colour for
*its position* rather than a colour baked into its own code.

Each section hands back a small package: its height, its drawing instructions,
and any styling it needs. Crucially, a section draws itself using coordinates
that start at zero — **it has no idea where it sits on the finished page.**
That's what makes reordering free.

### Step 3 — Do all of that twice

Once at **880 pixels wide** (desktop) and once at **480** (phone).

Here's why. If you take the desktop layout and shrink it to fit a phone's
360-pixel column, everything scales to 41% — and 13px body text becomes about
5px. Unreadable.

So the phone gets a genuinely different drawing: tighter margins, and all type
scaled up 35%. The `<picture>` tag in the README serves whichever one fits the
visitor's screen.

The mechanism is a shared settings object that the build flips between passes.
Sections read it while drawing, so they reflow themselves without anyone having
to pass a width into every function.

### Step 4 — Stack sections into slabs

Sections don't each become their own image. They're grouped:

```js
{ file: 'hero.svg',      sections: ['hero'] },
{ file: 'intro.svg',     sections: ['intro'] },
{ badges: 'socials' },
{ badges: 'links' },
{ file: 'main.svg',      sections: ['snake', 'starred', 'skills', 'stats'] },
{ file: 'loops.svg',     sections: ['currently', 'music'] },
{ file: 'guestbook.svg', sections: ['guestbook'] },
{ file: 'closing.svg',   sections: ['quote', 'signature'] },
```

**Why group them?** Because GitHub puts a 16-pixel gap under every image. Four
separate images means four visible seams. One image containing four sections
means zero seams — they butt together perfectly.

**Then why not one giant image?** Two reasons.

*The hero is alone on purpose.* At 330 KB it's by far the biggest file. On its
own slab, the rest of the page can load and paint while it's still downloading,
instead of the whole top of your profile sitting blank. Costs one seam, worth
it.

*The badges have to be separate.* Nothing inside an image can be clicked — you
can only wrap an entire image in a link. So every clickable badge must be its
own image file. Eleven badges, eleven files.

### Step 5 — Safety checks, before anything is saved

Two guards run on the finished output **while it's still in memory**:

- **Placeholder check** — refuses to publish if any file still contains
  `CHANGEME` or `TODO:`
- **Size check** — warns past 683.6 KB, hard-fails past 986.3 KB

The ordering is the point. Nothing is written to disk until both pass, so a
rejected build leaves your last good version completely intact rather than
half-overwriting it.

### Step 6 — Write the files

All the `.svg` files land in `assets/`, then `README.md` is written last.

That README is deliberately built with **single newlines between images, never
blank lines.** A blank line in markdown starts a new paragraph, and every
paragraph carries a 16-pixel margin — which would reintroduce the exact gaps
that grouping sections into slabs was meant to eliminate.

---

## 6. The map of every file

```
README.md              ← GENERATED. The profile page. Never edit.
HOW-IT-WORKS.md        ← this file
profile.config.json    ← the only file you normally edit
package.json           ← the list of commands

src/
  build.mjs            ← the conductor: runs everything, writes the output
  theme.mjs            ← all colours, fonts, sizes, spacing
  livedata.mjs         ← fetches live data from GitHub
  snapshot.mjs         ← the test
  preview.mjs          ← quick preview of sections in isolation
  mockup.mjs           ← realistic full-profile-page preview
  guestbook-append.mjs ← adds a new guestbook signature

  lib/
    svg.mjs            ← shared drawing helpers (text, boxes, labels)
    guards.mjs         ← the two safety checks

  sections/            ← one file per section of the page
    hero.mjs           ← the big pixel-art banner
    intro.mjs          ← the About box (biggest file here)
    snake.mjs          ← the contribution-graph snake
    starred.mjs        ← your recently starred repos
    skills.mjs         ← the technology grid
    stats.mjs          ← the numbers strip
    currently.mjs      ← the three animated clips
    music.mjs          ← the "on repeat" list
    guestbook.mjs      ← visitor signatures
    quote.mjs          ← quote and joke
    signature.mjs      ← the block-letter sign-off
    badges.mjs         ← the clickable link rows

  art.mjs              ← makes the hero pixel art
  clips.mjs            ← makes the animation frames
  spritesheet.mjs      ← slices a sprite sheet into frames
  icons.mjs            ← fetches brand logos
  albumart.mjs         ← fetches and pixelates album covers

assets/                ← GENERATED. All the .svg images.
data/                  ← GENERATED. Live data fetched from GitHub.
art/                   ← source art in, processed art out
icons/cache.json       ← the fetched brand logos
test/baseline/         ← the known-good copy the test compares against
.github/workflows/     ← the two robots
```

### The most important distinction

Some folders are **input** (you put things there) and some are **output** (the
programs write there, and you can safely delete and regenerate them):

| Input — yours | Output — regenerated |
|---|---|
| `profile.config.json` | `README.md` |
| `src/` | `assets/` |
| `art/src/`, `art/clips/` | `data/` |
| | `art/out/`, `art/clips-out/`, `art/albumart-out/` |
| | `icons/cache.json` |

---

## 7. Every command, explained

### The everyday ones

| Command | What it does | When |
|---|---|---|
| `npm run build` | Redraws everything | After every change |
| `npm run mockup` | Realistic profile-page preview | Before pushing |
| `npm test` | Reports what changed vs the baseline | Before pushing |
| `npm run snapshot` | Saves current output as the new baseline | After an intentional change |

### The occasional ones

| Command | What it does | When |
|---|---|---|
| `npm run preview` | Sections on a blank page, light and dark side by side | Judging one section's design |
| `npm run livedata` | Manually fetch GitHub data now, without waiting for the robot | Rare |
| `npm run dev` | Build, but only *warn* about placeholders instead of failing | While drafting |

### The heavy ones

These hit the network or shell out to `ffmpeg`. They're deliberately **not**
part of `npm run build`, which stays instant and works offline.

| Command | What it does | When |
|---|---|---|
| `npm run icons` | Fetch brand logos → `icons/cache.json` | After adding a skill or social |
| `npm run albumart` | Fetch + pixelate covers → `art/albumart-out/` | After changing music |
| `npm run art` | Process hero paintings → `art/out/` | After changing hero art |
| `npm run clips` | Process animation frames → `art/clips-out/` | After changing a clip |
| `npm run spritesheet` | Slice a sprite sheet into frames | When adding a new animation |

After any of these, run `npm run build` to pull the new material into the page.

**`preview` vs `mockup` — which one?**

`preview` shows sections isolated on a blank page. Good for judging one
section's design, flattering for the page as a whole.

`mockup` shows the real thing: correct column width, inside a bordered card,
surrounded by the sidebar and pinned repos. Use this before pushing. It's the
honest one.

---

## 8. The two robots

GitHub Actions — small programs GitHub runs for you on its own computers.

### Robot 1: the daily refresh

**File:** `.github/workflows/refresh.yml`
**Runs:** every day at 06:17 UTC, plus on demand from the Actions tab

What it does:

1. Fetches your last 4 starred repos
2. Fetches your repo/star/fork counts
3. **Shallow-clones every public repo you own and counts the actual lines of
   code** — GitHub's API will tell you a repo's size in kilobytes but never its
   line count, so counting for real is the only honest way
4. Rebuilds the page
5. Commits and pushes

**Why 06:17 and not midnight?** Everyone schedules jobs at :00, so GitHub's
queue is congested then and your job gets delayed. An odd minute runs on time.

**Why daily, not instant?** There's no notification for "you starred a repo."
The only alternative is polling constantly, which would mostly push commits for
nothing. A day is the resolution this data honestly deserves.

**Line counting is careful about what it counts:** only files git actually
tracks, only real source extensions, nothing over 1 MB, and nothing inside
`node_modules`, `vendor`, `dist`, `build`, `Pods`, or lockfiles. Committed
dependencies are somebody else's code — counting them would inflate the number
tenfold and make it meaningless.

### Robot 2: the guestbook

**File:** `.github/workflows/guestbook.yml`
**Runs:** when someone opens an issue labelled `guestbook`

The full flow:

1. Visitor clicks anywhere on the guestbook band on your profile
2. That opens a pre-filled GitHub issue form
3. They type a name and message, hit submit
4. The robot reads the form, appends the entry to `data/guestbook.json`
5. Rebuilds the page and pushes — **their message is now on your profile**
6. Comments "Thanks for signing! 🎉" on their issue
7. Closes the issue, so signings don't pile up as an open-issue graveyard

Round trip is about a minute. Fully automatic.

> #### ⚠️ The trap that caught us once
>
> GitHub Issue Forms apply a label **only if that label already exists in the
> repo.** If it doesn't, the label is silently dropped — no error to the
> submitter, nothing in the Actions log. The robot then correctly ignores the
> issue, because it has no `guestbook` label on it.
>
> That happened here with the very first real signature. It looked like the
> guestbook was broken; it was one missing label.
>
> **If a signature ever doesn't appear:** check that the `guestbook` label
> exists in the repo's label list. Then manually add it to the stray issue —
> the robot also listens for the "label added" event specifically as a recovery
> path, so it'll re-fire and pick the signature up.

---

## 9. The safety nets

Four layers, each added because something actually went wrong.

### The placeholder check

Refuses to build if any output still contains `CHANGEME` or `TODO:`.

**Why:** six placeholder URLs sat in the output for several sessions unnoticed.
Publishing that would have shipped six dead social links.

`npm run dev` downgrades this to a warning, for when the content is
deliberately still a draft.

### The size check

Warns past 683.6 KB, hard-fails past 986.3 KB.

**Why:** the asset payload silently doubled to over a megabyte once — every
artwork was being embedded twice, once per build width — and nothing
complained. It was found by measuring on a hunch.

The comment in `src/lib/guards.mjs` is unusually long on purpose. It records
every reduction that was tried before the ceiling was ever raised — sampling 25
animation frames down to 12, cutting the palette from 32 colours to 16,
serving a single still frame on phones instead of the full loop. Reading it
before raising the limit again is the point: **fix the cause, not the ceiling.**

### The width check

If the sections being stacked into one image weren't all drawn at the same
width, the build throws an error rather than guessing.

**Why:** this exact bug shipped once. The composer used to read the width at
the moment it ran — which was *after* the narrow pass had already changed it.
Desktop files came out containing an 880px layout while declaring themselves
480px wide, and every browser dutifully cropped away the right 45% of the page.
It was only caught by measuring the rendered image in a browser.

### The snapshot test

`npm test` rebuilds and diffs against `test/baseline/`.

**Why:** three regressions shipped unnoticed and were each found only by
someone happening to look at the right pixel — a quote attribution colliding
with its own text, one painting bleeding through another's letterbox bars, and
a white flash at the animation loop point. All three would have shown up here
as an obvious diff.

**The clever bit:** the real SVGs are mostly base64-encoded artwork. Storing
that verbatim would make every art tweak a half-megabyte unreadable diff. So
each embedded image is replaced by a short hash of its contents:

```
data:image/png;base64,iVBORw0KG…  →  data:image/png;base64,[sha256:1a2b3c4d]
```

The baseline stays small and human-readable, while still catching everything:
layout, coordinates, animation keyframes and CSS all diff literally, and a
changed painting changes its hash.

---

## 10. Why the code looks strange

Some of this code does things that look unnecessarily complicated. Each one is
working around a hard limit. Knowing them saves you from "fixing" something
that isn't broken.

### Images can't load anything external

When a browser displays an SVG through an `<img>` tag — which is how GitHub
does it — the image runs in a sandbox. It **can** use its own stylesheet and
its own animation. It **cannot** load a web font, fetch another image, or run
any JavaScript.

That's why every logo is embedded as raw shape data and every album cover is
embedded as base64 text directly inside the SVG. And it's why the fonts are
listed as system fonts — those already exist on the visitor's machine.

### The animation must look right frozen

Some renderers apply an SVG's animation but never advance it, freezing
everything at the very first moment.

So every animation must be **correct at time zero**. The rule the code follows:
anchor the visible, correct state at 0%, and let the animation only take things
away from there. Never build up to correct.

### GitHub strips `style` attributes

The obvious way to close the gap between stacked images is
`style="display:block"`. GitHub's markdown sanitiser deletes it.

The workaround is the percentage-width tiling described in section 4 — badges
drawn at identical sizes, given percentage widths that sum to 100%, and joined
with **absolutely no whitespace between the tags**, because even a single space
or newline renders as a real space and splits the band.

### Nothing inside an image is clickable

You can only wrap an entire image in a link. Image maps aren't on GitHub's
allowlist, and faking one needs `style`, which is stripped.

This is why each badge is a separate file, and why the guestbook's "Sign"
button is only a *picture* of a button — the actual click target is the whole
band, which is what the on-page text tells the visitor.

### Text width has to be estimated

The build has no way to measure how wide a piece of text will render, because
that depends on a font on someone else's machine. So it estimates: characters ×
font size × a constant.

If the estimate is too low, text overflows its box. Too high, and it truncates
text that would have fit. This has caused real bugs — the constant was once
0.565 when the true measured value was 0.602, and principles overflowed the
About box.

The permanent fix for the About box was to stop calculating positions at all
and let the renderer flow the text itself. Other sections still estimate.
**Nudge these numbers with care.**

### Sections know nothing about the page

Every section draws itself starting from coordinate zero, and is handed its
band colour rather than choosing one.

That's what makes the registry in `build.mjs` reorderable in one line, with
colours re-alternating automatically.

---

## 11. When something breaks

### "The build failed with `placeholder text would have been published`"

You've got `CHANGEME` or `TODO:` in the config. It names the file. Fill it in,
or use `npm run dev` if you're mid-draft.

### "The build failed with `assets total ... over the ceiling`"

You added too much artwork. It lists the three biggest files.

**Read the long comment in `src/lib/guards.mjs` before raising the limit.** It
lists the reductions already tried. There's currently about 48 KB of headroom.

### "`npm test` says things changed and I didn't change them"

Expected right now — see section 13. If the *only* thing it reports is the
"last pushed" line, ignore it. If it reports anything else, look closely.

### "A badge is blank"

The logo wasn't fetched. Run `npm run icons` — it fails loudly on a bad brand
name, which is the usual cause (`node.js` instead of `nodedotjs`).

### "A song has a generic music note instead of its cover"

You changed the tracks but didn't run `npm run albumart`. Run it, then rebuild.

### "The animation doesn't move when I preview it"

Probably a false alarm. The preview tools show SVGs through `<img>`, and some
browsers freeze animation in that mode. **This has produced false panic twice.**

To check motion honestly, open the `.svg` file *directly* in a browser rather
than through the preview page.

### "Text is overflowing its box"

The width estimate is too low for that string. Shorten the text, or carefully
adjust the constant in that section's file (search for `ADV`).

### "A guestbook signature didn't appear"

See the warning box in section 8. It's almost certainly the missing label.

### "JSON parse error"

You broke the config file's punctuation. Almost always one of:

- A missing comma between two entries
- An **extra** comma after the last entry in a list
- A missing closing `"` or `}` or `]`

Paste the file into any online JSON validator — it'll point at the exact
character.

---

## 12. Moving to the real profile

Right now everything lives in the test repo **`saishmalunde8/readme-lab`**.
It goes live when it moves to **`saishmalunde8/saishmalunde8`** — a repo named
exactly after your username, which is what makes GitHub display its README on
your profile page.

Before that move, three things must change:

1. **`profile.config.json` → `guestbook.signUrl`** currently points at
   `readme-lab`. Repoint it, or every visitor who signs your guestbook files an
   issue on the wrong repo.

2. **The `guestbook` label must be created in the new repo first.** See the
   warning box in section 8 — without it, every signature is silently dropped.

3. **The repo must be public**, and Settings → Actions must allow workflows to
   write to the repo, or both robots will fail on push.

Also worth knowing: the profile repo currently has GitHub's default "special
repository" README in it — or nothing at all. Check before pushing so you don't
have to resolve a conflict.

---

## 13. Known rough edges

Honest list of what's imperfect. None of it is urgent.

### The build isn't repeatable — and this breaks the test

The stats strip shows **"last pushed 9 min ago"**, calculated from the clock at
the moment the build runs. So every build produces a slightly different file,
even with no changes at all.

Two consequences:

- **`npm test` always fails.** It reports that line every single time. A test
  that always fails is a test you stop reading, which defeats its purpose.
- **The daily robot commits every day forever.** It has a check meant to skip
  days when nothing changed — that check can never pass, because this line
  always differs.

**The fix:** make that line coarse enough to be stable (a date, or rounded to
whole days). One small change in `src/sections/stats.mjs` fixes both symptoms.

### The two badge rows are different sizes

6 badges in the top row, 5 in the bottom. Since each row divides 100% by its
own count, the bottom row's badges render about 20% larger. Visible if you look
for it. See section 4.

### The width-estimate constants disagree

Three sections each carry their own guess: `0.62`, `0.6`, `0.54`. They should
be derived from the font each section actually uses, from one shared place.
Until then, changing one doesn't fix the others.

### Six links point nowhere

LinkedIn, YouTube, Website, Book a call, Résumé, and Coffee are all `"#"`. This
is deliberate and documented in the config — a visible badge that does nothing
beats a fake address that 404s. Fill them in as they become real.

### The snake is decorative

The contribution-graph snake animates over a generated pattern, not your real
contribution data. Real data needs a GitHub API token and a much heavier
pipeline. It reads as decoration, which is what it is.

### The visitor counter is somebody else's server

It's the one live, external thing on the page. Counting real page views needs a
server that sees each request, and a static README has none. The counter is a
free third-party image service (komarev) that counts the hit when GitHub loads
the badge.

The trade-offs, stated plainly because they can't be engineered away:

- If their service goes down, the badge breaks. Nothing else on the page is
  affected — everything else is a local file.
- GitHub caches images through its own proxy, so the count lags and undercounts.
- Their server necessarily sees who is loading your profile.

Set `visitors.enabled` to `false` in the config to remove it entirely.

### `hero.svg` is a third of the page weight

330 KB of the 938 KB total, for four paintings. It sits alone on its own slab
precisely so it doesn't block the rest of the page from loading. If space ever
gets tight again, dropping it from 32 to 24 colours would likely save 40–50 KB.

### The phone version of the About box is bigger than the desktop one

97.8 KB vs 94.7 KB. A curiosity with no visible effect. Not worth chasing.

### Scheduled workflows can be auto-disabled

GitHub turns off scheduled workflows after 60 days of repository inactivity. The
daily bot commit probably counts as activity, but that isn't certain. If it ever
happens GitHub emails you, and re-enabling is one button in the Actions tab.

---

## The 30-second version

- **Edit `profile.config.json`.** Never `README.md`.
- **`npm run build`** after every change.
- **`npm run mockup`** before pushing, and check both light and dark.
- **Changed music?** Run `npm run albumart` too.
- **Added a skill or social?** Run `npm run icons` too.
- **Starred repos and stats look after themselves.** Don't touch them.
- **Don't change how many badges are in a row** without reading section 4.

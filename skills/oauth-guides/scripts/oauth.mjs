#!/usr/bin/env node
// OAuth Guides skill: the guide library, a progress tracker, and the checks used to research new guides.
// No dependencies (Node 18+). Progress and local guides live in ./.oauth-guides (override with OAUTH_GUIDES_DIR).
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { fileURLToPath } from "node:url"

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const STATE_DIR = path.resolve(process.env.OAUTH_GUIDES_DIR ?? ".oauth-guides")
const SITE = "https://composio-fawn.vercel.app"
const COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback"
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
const TIMEOUT_MS = 12_000

// ── terminal output ────────────────────────────────────────────────────────────

const COLOR = (process.stdout.isTTY && !process.env.NO_COLOR) || !!process.env.FORCE_COLOR
const paint = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const bold = paint(1), dim = paint(2), green = paint(32), yellow = paint(33), red = paint(31), cyan = paint(36)
const WIDTH = Math.max(60, Math.min(process.stdout.columns || Number(process.env.COLUMNS) || 80, 100))
const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, "").length
const padEnd = (s, n) => s + " ".repeat(Math.max(0, n - visible(s)))
const cut = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s)
const rule = (ch = "─") => dim(ch.repeat(WIDTH))
const out = (...lines) => console.log(lines.join("\n"))

function wrap(text, indent = 0, first = "") {
  const max = WIDTH - indent
  const lines = []
  let line = ""
  for (const word of String(text).split(/\s+/)) {
    // Continuation lines are indented under the label, so every line gets the same width.
    if (line && visible(line) + 1 + visible(word) > max - visible(first)) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  const pad = " ".repeat(indent)
  return lines.map((l, i) => (i === 0 ? pad + first + l : pad + " ".repeat(visible(first)) + l)).join("\n")
}

function bar(done, total, width = 30) {
  const n = total ? Math.round((done / total) * width) : 0
  return green("█".repeat(n)) + dim("░".repeat(width - n))
}

function formatMinutes({ min, max }) {
  if (max === 0) return "—"
  if (max >= 120) {
    const h = (m) => String(Math.round((m / 60) * 10) / 10)
    return min === max ? `${h(max)} h` : `${h(min)}–${h(max)} h`
  }
  return min === max ? `${max} min` : `${min}–${max} min`
}
const formatWait = (w) => (w ? (w.summary ?? w.asStated) : "None")
const formatDate = (iso) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const daysSince = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

const WHO = { you: "you", agent: "agent", wait: "wait", "their-admin": "admin" }
const WHO_LONG = { you: "You", agent: "Your agent can do this", wait: "Provider's clock", "their-admin": "Your user's admin" }
// Same default as the site: "their admin" steps need a note the developer's users can forward.
const ADMIN_NOTE = "Draft a short note my users can forward to their admin: what to approve, where, and why. Use placeholders for my product name."
const REVIEW = { none: "Not required", optional: "Optional", required: "Required" }

function fail(message) {
  console.error(red(`✗ ${message}`))
  process.exit(1)
}

// ── guides and progress ────────────────────────────────────────────────────────

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const libraryDir = (kind) => path.join(SKILL_DIR, "data", kind)
const localDir = (kind) => path.join(STATE_DIR, kind)

function ensureStateDir() {
  for (const kind of ["guides", "probes"]) fs.mkdirSync(localDir(kind), { recursive: true })
  // Progress is per developer; keep it out of commits unless they choose otherwise.
  const ignore = path.join(STATE_DIR, ".gitignore")
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n")
}

function slugsIn(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : []
}

// Local guides (researched or imported) override library guides with the same slug.
function loadGuide(slug) {
  for (const [dir, origin] of [[localDir, "local"], [libraryDir, "library"]]) {
    const file = path.join(dir("guides"), `${slug}.json`)
    if (!fs.existsSync(file)) continue
    const probesFile = path.join(dir("probes"), `${slug}.json`)
    const probes = fs.existsSync(probesFile) ? readJson(probesFile).results : []
    return { guide: normalize(readJson(file)), probes, origin }
  }
  return null
}

function requireGuide(slug) {
  if (!slug) fail("Name a guide, e.g. github. Run `list` to see them.")
  const found = loadGuide(slug)
  if (!found) fail(`No guide "${slug}". Run \`list\`, or research it (see references/research.md).`)
  return found
}

function allGuides() {
  const slugs = new Set([...slugsIn(libraryDir("guides")), ...slugsIn(localDir("guides"))])
  return [...slugs].map(loadGuide).filter(Boolean).sort((a, b) => a.guide.name.localeCompare(b.guide.name))
}

// Fill the schema's defaults so rendering never trips on a missing array.
function normalize(g) {
  for (const s of g.steps) {
    for (const k of ["fields", "snippets", "warnings", "actions", "sources", "checks", "problems", "contacts"]) s[k] ??= []
    s.optional ??= false
    for (const x of [...s.warnings, ...s.problems]) x.sources ??= []
  }
  for (const c of g.contacts) {
    c.sources ??= []
    c.checks ??= []
  }
  return g
}

const progressFile = () => path.join(STATE_DIR, "progress.json")
function loadProgress() {
  return fs.existsSync(progressFile()) ? readJson(progressFile()) : { guides: {} }
}
function saveProgress(p) {
  ensureStateDir()
  fs.writeFileSync(progressFile(), JSON.stringify(p, null, 2) + "\n")
}
const stepsState = (progress, slug) => progress.guides[slug]?.steps ?? {}

const FINISHED = new Set(["done", "skipped"])
function summary(guide, states) {
  const finished = guide.steps.filter((s) => FINISHED.has(states[s.id]?.status)).length
  // Next = first step still open; waiting steps run on the provider's clock, so work continues past them.
  const next = guide.steps.find((s) => !states[s.id] || states[s.id].status === "blocked")
  return { finished, total: guide.steps.length, next }
}

// ── views ──────────────────────────────────────────────────────────────────────

function header(guide, states, origin) {
  const { finished, total } = summary(guide, states)
  const pct = total ? Math.round((finished / total) * 100) : 0
  const tag = origin === "local" ? dim("  · researched guide, not reviewed by a person") : ""
  return [
    ` ${bold(guide.name.toUpperCase())}  ${dim("·")}  ${guide.appType}${tag}`,
    wrap(guide.tagline, 1),
    "",
    ` ${bar(finished, total)}  ${bold(`${finished}/${total}`)} steps ${dim(`· ${pct}%`)}`,
    ` ${dim("Hands-on")} ${formatMinutes(guide.facts.handsOnMinutes)}  ${dim("· Approval wait")} ${formatWait(guide.facts.approvalWait)}  ${dim("· Review")} ${REVIEW[guide.facts.review]}  ${dim("· Cost")} ${guide.facts.cost.summary}`,
  ].join("\n")
}

function icon(status, isNext) {
  if (status === "done") return green("✓")
  if (status === "skipped") return dim("–")
  if (status === "blocked") return red("✗")
  if (status === "waiting") return yellow("◔")
  return isNext ? cyan("▸") : dim("○")
}

function stepRows(guide, states) {
  const { next } = summary(guide, states)
  const titleWidth = WIDTH - 36
  return guide.steps.flatMap((s, i) => {
    const st = states[s.id]
    const time = s.who === "wait" && s.wait ? formatWait(s.wait) : formatMinutes(s.minutes)
    const title = cut(s.title + (s.optional ? " (optional)" : ""), titleWidth)
    const styled = st?.status === "done" || st?.status === "skipped" ? dim(title) : s === next ? bold(title) : title
    const rows = [`  ${icon(st?.status, s === next)}  ${dim(String(i + 1).padStart(2))}  ${padEnd(styled, titleWidth)}  ${dim(WHO[s.who].padEnd(6))} ${dim(time)}`]
    if (st?.status === "blocked") rows.push(`         ${red("blocked:")} ${cut(st.note ?? "no reason given", WIDTH - 20)}`)
    if (st?.status === "waiting") {
      const d = daysSince(st.at)
      rows.push(`         ${yellow("waiting")} since ${formatDate(st.at)} (${d === 0 ? "today" : `${d} day${d === 1 ? "" : "s"}`})`)
      if (s.wait) rows.push(dim(`         provider says: ${cut(s.wait.asStated, WIDTH - 25)}`))
    }
    return rows
  })
}

function board(slug) {
  const { guide, origin } = requireGuide(slug)
  const states = stepsState(loadProgress(), slug)
  const { next, finished, total } = summary(guide, states)
  out(rule(), header(guide, states, origin), rule(), ...stepRows(guide, states), rule())
  if (finished === total) out(` ${green("✓ All steps finished.")} Your users can connect ${guide.name} with your own OAuth app.`)
  else if (next) out(` ${bold("Next")} → ${guide.steps.indexOf(next) + 1} · ${next.title}   ${dim(`(step ${slug} ${next.id})`)}`)
  else out(` ${yellow("Only waiting steps are left.")} Run \`done ${slug} <step-id>\` when the provider approves.`)
}

function list(query) {
  const progress = loadProgress()
  const q = query?.toLowerCase()
  const guides = allGuides().filter(({ guide }) => !q || guide.name.toLowerCase().includes(q) || guide.slug.includes(q))
  out(rule(), ` ${bold("OAuth app guides")} ${dim(`· ${guides.length} available · ${SITE}`)}`, rule())
  for (const { guide, origin } of guides) {
    const states = stepsState(progress, guide.slug)
    const { finished, total } = summary(guide, states)
    const started = Object.keys(states).length > 0
    const right = started ? `${bar(finished, total, 10)} ${finished}/${total}` : dim(`${total} steps`)
    out(
      `  ${padEnd(bold(cut(guide.name, 18)), 18)} ${dim(padEnd(guide.slug, 10))} ${padEnd(formatMinutes(guide.facts.handsOnMinutes), 11)} ${padEnd(cut(formatWait(guide.facts.approvalWait), 22), 22)} ${right}${origin === "local" ? dim("  local") : ""}`,
    )
  }
  if (!guides.length) out(`  No guide matches "${query}".`)
  out(rule(), dim(`  columns: name · slug · hands-on · approval wait · progress`))
  if (q && !guides.length)
    out(` Not in the library. Research it here (references/research.md), or generate it on the web and import the link:`, `   ${SITE}/new?app=${encodeURIComponent(query)}`)
}

function statusAll() {
  const progress = loadProgress()
  const started = Object.keys(progress.guides).filter((slug) => loadGuide(slug))
  if (!started.length) {
    out(" No guide started yet in this project.", "")
    return list()
  }
  for (const slug of started) board(slug)
}

function findStep(guide, slug, id, states) {
  if (!id || id === "next") {
    const { next } = summary(guide, states)
    if (!next) fail(`Nothing left to do in ${guide.name}. Run \`status ${slug}\`.`)
    return next
  }
  const step = guide.steps.find((s) => s.id === id) ?? guide.steps[Number(id) - 1]
  if (!step) fail(`No step "${id}" in ${guide.name}. Steps: ${guide.steps.map((s) => s.id).join(", ")}`)
  return step
}

function showStep(slug, id, lang) {
  const { guide, probes } = requireGuide(slug)
  const states = stepsState(loadProgress(), slug)
  const step = findStep(guide, slug, id, states)
  const n = guide.steps.indexOf(step) + 1
  const st = states[step.id]
  const sources = new Map(guide.sources.map((s) => [s.id, s]))
  const probeById = new Map(probes.map((p) => [p.id, p]))

  const meta = [WHO_LONG[step.who], step.who === "wait" && step.wait ? formatWait(step.wait) : formatMinutes(step.minutes), step.optional ? "optional" : null]
  out(rule("━"), ` ${dim(`${guide.name} · step ${n} of ${guide.steps.length}`)}`, ` ${bold(step.title)}`, ` ${cyan(meta.filter(Boolean).join(" · "))}`)
  if (st) out(` ${icon(st.status)} ${st.status} ${dim(`· ${formatDate(st.at)}`)}${st.note ? ` ${dim("·")} ${st.note}` : ""}`)
  out(rule("━"))
  if (step.when) out(wrap(step.when, 1, `${dim("When:")} `), "")
  if (step.wait) out(wrap(`"${step.wait.asStated}"`, 1, `${dim("Provider says:")} `), "")

  step.instructions.forEach((text, i) => out(wrap(text, 2, `${dim(`${i + 1}.`)} `)))
  const task = step.agentTask ?? (step.who === "their-admin" ? ADMIN_NOTE : null)
  if (task) out("", wrap(task, 1, `${cyan("◆ Agent can do:")} `))

  if (step.fields.length) {
    const w = Math.min(24, Math.max(...step.fields.map((f) => f.label.length)) + 2)
    out("", ` ${bold("Values")}`)
    for (const f of step.fields) {
      // A label too long for the column gets its value on the next line.
      out(f.label.length >= w ? `   ${dim(f.label)}\n   ${" ".repeat(w)} ${f.value}` : `   ${padEnd(dim(f.label), w)} ${f.value}`)
      if (f.hint) out(`   ${" ".repeat(w)} ${dim(f.hint)}`)
    }
  }
  if (step.check === "github-client-id")
    out("", ` ${bold("Check")} the Client ID (public, never the secret): ${dim(`check-github-client-id <client-id>`)}`)

  if (step.snippets.length) {
    const snip = step.snippets.find((s) => s.lang === lang) ?? step.snippets[0]
    const others = step.snippets.filter((s) => s !== snip).map((s) => s.lang)
    out("", ` ${bold("Code")} ${dim(`(${snip.lang}${others.length ? `; also ${others.join(", ")}: add --lang ${others[0]}` : ""})`)}`)
    out(...snip.code.split("\n").map((l) => `   ${dim("│")} ${l}`))
  }

  if (step.actions.length) {
    out("", ` ${bold("Open")}`)
    for (const a of step.actions) out(`   → ${a.label}  ${cyan(a.url)}`)
  }

  for (const w of step.warnings) {
    out("", wrap(w.text, 1, `${yellow("⚠")} `))
    if (w.unconfirmed) out(wrap(w.unconfirmed, 3, dim("Not confirmed: ")))
  }

  if (step.problems.length || contactsFor(guide, step).length)
    out("", ` ${bold("Stuck?")} ${step.problems.length} known problem${step.problems.length === 1 ? "" : "s"} and who to ask ${dim(`(help ${slug} ${step.id})`)}`)

  // Evidence footer: a fixed label column, like the step footer on the site.
  const label = (name, i) => (i ? " ".repeat(15) : ` ${dim(name.padEnd(13))} `)
  const checks = step.checks.map((id) => probeById.get(id)).filter(Boolean)
  out("", rule())
  checks.forEach((p, i) => out(`${label("Checked live", i)}${p.pass ? green("✓") : red("✗")} ${p.title}`))
  if (step.unconfirmed) out(wrap(step.unconfirmed, 15).replace(/^ {15}/, label("Not confirmed", 0)))
  step.sources.forEach((id, i) => {
    const s = sources.get(id)
    if (s) out(`${label("Sources", i)}${s.title}  ${dim(s.url)}`)
  })
  out(rule(), dim(` done ${slug} ${step.id} · block ${slug} ${step.id} "<reason>"${step.optional ? ` · skip ${slug} ${step.id}` : ""}${step.who === "wait" ? ` · waiting ${slug} ${step.id}` : ""}`))
}

function contactsFor(guide, step) {
  const ids = step.contacts.length ? step.contacts : guide.contacts.filter((c) => c.org === "provider").map((c) => c.id)
  return ids.map((id) => guide.contacts.find((c) => c.id === id)).filter(Boolean)
}

function help(slug, id) {
  const { guide } = requireGuide(slug)
  const step = findStep(guide, slug, id, stepsState(loadProgress(), slug))
  const sources = new Map(guide.sources.map((s) => [s.id, s]))
  out(rule(), ` ${bold(`Stuck on “${step.title}”?`)}`, rule())
  if (!step.problems.length) out(" No known problems recorded for this step.")
  for (const p of step.problems) {
    out("", wrap(p.q, 1, `${yellow("▸")} `))
    for (const a of p.a) out(wrap(a, 3, "• "))
    const cited = p.sources.map((s) => sources.get(s)).filter(Boolean)
    for (const s of cited) out(`   ${dim("Source:")} ${s.title}  ${dim(s.url)}`)
  }
  const contacts = contactsFor(guide, step)
  if (contacts.length) {
    out("", rule(), ` ${bold("Still stuck? Ask")}`)
    const w = Math.max(...contacts.map((c) => c.label.length)) + 2
    for (const c of contacts) out(`   ${padEnd(c.label, w)} ${cyan(c.target)}`, wrap(c.when, w + 3))
    out("", ` ${bold("Message to send")} ${dim("(fill in the <…> parts; never include the client secret)")}`)
    const body = [
      `Subject: Help with ${guide.name} OAuth app setup: ${step.title}`,
      "",
      "Hi,",
      `I'm setting up an OAuth app (${guide.appType}) so my users can connect ${guide.name} through Composio.`,
      `Step I'm stuck on: ${step.title}`,
      "What I did: <what you clicked or submitted>",
      "What happened: <exact error message or status>",
      "App / Client ID: <public ID, never the secret>",
      `Redirect URI: ${guide.composio.callbackUrl}`,
      "Thanks!",
    ]
    out(...body.map((l) => `   ${dim("│")} ${l}`))
  }
  out(rule())
}

function setStatus(status, slug, id, note) {
  const { guide } = requireGuide(slug)
  if (!id) fail(`Name the step, e.g. \`${status} ${slug} ${guide.steps[0].id}\`.`)
  const step = findStep(guide, slug, id, {})
  if (status === "blocked" && !note) fail("Say what's blocking it, e.g. block slack install \"Need a workspace admin\".")
  if (status === "waiting" && step.who !== "wait") fail(`"${step.title}" isn't a wait step. Use done or block.`)
  const progress = loadProgress()
  const entry = (progress.guides[slug] ??= { started: new Date().toISOString(), steps: {} })
  entry.version = guide.version
  entry.updated = new Date().toISOString()
  if (status === "todo") delete entry.steps[step.id]
  else entry.steps[step.id] = { status, at: new Date().toISOString(), ...(note ? { note } : {}) }
  saveProgress(progress)
  const verb = { done: green("✓ Done"), skipped: dim("– Skipped"), blocked: red("✗ Blocked"), waiting: yellow("◔ Waiting"), todo: "○ Reopened" }[status]
  out(` ${verb}: ${step.title}`)
  board(slug)
}

// ── GitHub Client ID check ─────────────────────────────────────────────────────

// GitHub's sign-in page names the app ("continue to <name>") only when the Client ID is real.
async function checkGithubClientId(clientId) {
  if (!/^[A-Za-z0-9._-]{10,40}$/.test(clientId ?? "")) fail("That doesn't look like a GitHub Client ID.")
  const res = await fetch(`https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=read:user`, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const raw = (await res.text()).match(/continue to <strong>([^<]+)<\/strong>/)?.[1]
  if (!raw) fail("GitHub doesn't recognise this Client ID.")
  const name = raw.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  out(` ${green("✓")} GitHub recognises this Client ID: ${bold(name)}`)
}

// ── research: probes, Composio lookup, validation, import ──────────────────────

function isPrivateAddress(ip) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:")
  }
  const [a, b] = ip.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

async function assertPublicHttps(raw) {
  const url = new URL(raw)
  if (url.protocol !== "https:") throw new Error("Only https URLs can be probed")
  if (isIP(url.hostname) || !url.hostname.includes(".")) throw new Error("Host must be a public domain")
  const addrs = await lookup(url.hostname, { all: true })
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Host resolves to a private address")
  return url
}

async function httpProbe({ url: raw, method = "GET", form, follow = true }) {
  let url = await assertPublicHttps(raw)
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      method,
      redirect: "manual",
      headers: { "User-Agent": UA, Accept: "text/html,application/json;q=0.9,*/*;q=0.8", ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body: form ? new URLSearchParams(form) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const location = res.headers.get("location")
    if (follow && location && res.status >= 300 && res.status < 400 && method === "GET") {
      url = await assertPublicHttps(new URL(location, url).toString())
      continue
    }
    const body = (await res.text()).slice(0, 300_000)
    const title = body.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1]?.trim() ?? null
    return { status: res.status, finalUrl: url.toString(), location, contentType: res.headers.get("content-type"), title, body }
  }
  throw new Error("Too many redirects")
}

const result = (id, title, request, expect, observed, pass) => ({ id, title, request, expect, observed, pass, ranAt: new Date().toISOString() })

function probesFile(slug) {
  return path.join(localDir("probes"), `${slug}.json`)
}
function saveProbe(slug, r) {
  ensureStateDir()
  const file = probesFile(slug)
  const data = fs.existsSync(file) ? readJson(file) : { guide: slug, results: [] }
  data.results = [...data.results.filter((p) => p.id !== r.id), r]
  data.ranAt = r.ranAt
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n")
}
const showProbe = (r) => out(` ${r.pass ? green("✓ PASS") : red("✗ FAIL")}  ${bold(r.id)} · ${r.title}`, dim(`   ${r.request}`), `   expected ${r.expect}`, `   observed ${r.observed}`)

function parseFlags(args) {
  const flags = { _: [] }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (!a.startsWith("--")) {
      flags._.push(a)
      continue
    }
    const key = a.slice(2)
    if (key === "no-follow") flags[key] = true
    else (flags[key] ??= []).push(args[++i])
  }
  return flags
}

// Pass/fail is decided here from the response, so a guide can only cite what reality confirmed.
async function probe(slug, args) {
  const f = parseFlags(args)
  const id = f.id?.[0], title = f.title?.[0], url = f.url?.[0]
  if (!slug || !id || !title || !url)
    fail('Usage: probe <slug> --id <id> --title "<what it shows>" --url <https-url> [--post key=value] [--status 400,401] [--contains text] [--lacks text] [--location text] [--final text] [--no-follow]')
  if (!/^[a-z0-9-]+$/.test(id) || id.startsWith("composio-")) fail("Probe ids are lowercase-with-dashes; composio-* ids are reserved.")
  const form = f.post ? Object.fromEntries(f.post.map((kv) => kv.split(/=(.*)/s).slice(0, 2))) : undefined
  const expect = {
    status: f.status?.[0]?.split(",").map(Number),
    contains: f.contains ?? [],
    lacks: f.lacks ?? [],
    location: f.location?.[0],
    final: f.final?.[0],
  }
  const expectText =
    [
      expect.status ? `HTTP ${expect.status.join("/")}` : null,
      ...expect.contains.map((s) => `contains "${s}"`),
      ...expect.lacks.map((s) => `lacks "${s}"`),
      expect.location ? `redirects to …${expect.location}…` : null,
      expect.final ? `ends at …${expect.final}…` : null,
    ]
      .filter(Boolean)
      .join(", ") || "responds"
  const request = `${form ? "POST" : "GET"} ${url}`
  let r
  try {
    const res = await httpProbe({ url, method: form ? "POST" : "GET", form, follow: !f["no-follow"] })
    const failures = []
    if (expect.status && !expect.status.includes(res.status)) failures.push(`status ${res.status}`)
    for (const s of expect.contains) if (!res.body.includes(s)) failures.push(`body lacks "${s}"`)
    for (const s of expect.lacks) if (res.body.includes(s)) failures.push(`body contains "${s}"`)
    if (expect.location && !(res.location ?? "").includes(expect.location)) failures.push(`location "${res.location ?? "none"}"`)
    if (expect.final && !res.finalUrl.includes(expect.final)) failures.push(`final URL ${res.finalUrl}`)
    const json = res.contentType?.includes("json") ? res.body.slice(0, 160) : null
    const observed = [`HTTP ${res.status}`, res.location ? `→ ${res.location.slice(0, 100)}` : null, json ?? (res.title ? `"${res.title.slice(0, 80)}"` : null), failures.length ? `(${failures.join("; ")})` : null]
      .filter(Boolean)
      .join(" · ")
    r = result(id, title, request, expectText, observed, failures.length === 0)
  } catch (e) {
    r = result(id, title, request, expectText, `failed: ${e.message}`, false)
  }
  saveProbe(slug, r)
  showProbe(r)
}

// Composio's dashboard sends real routes to login with ?next=<path> and 404s unknown ones.
async function dashboardRoute(p) {
  const res = await fetch(`https://dashboard.composio.dev${p}`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
  const location = res.headers.get("location")
  const next = location ? new URL(location, "https://dashboard.composio.dev").searchParams.get("next") : null
  return { code: res.status, keepsPath: next === p }
}

async function settle(fn, id, title, request, expect) {
  try {
    return await fn()
  } catch (e) {
    return result(id, title, request, expect, `failed: ${e.message}`, false)
  }
}

// Composio toolkit lookup plus the Composio checks every guide can cite.
async function toolkit(slug, toolkitSlug) {
  if (!slug || !toolkitSlug) fail("Usage: toolkit <guide-slug> <composio-toolkit-slug>   e.g. toolkit pipedrive pipedrive")
  const clean = toolkitSlug.toLowerCase().replace(/[^a-z0-9_-]/g, "")
  const docUrl = `https://docs.composio.dev/toolkits/${clean}.md`
  const res = await fetch(docUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const md = res.ok ? (await res.text()).slice(0, 6000) : ""
  const managed = /Composio-managed OAuth available\?\*\*\s*Yes/i.test(md) ? "yes" : /Composio-managed OAuth available\?\*\*\s*No/i.test(md) ? "no" : "unknown"
  const setupGuide = md.match(/\((https:\/\/composio\.dev\/auth\/[a-z0-9_-]+)\)/)?.[1]

  const route = res.ok ? await dashboardRoute(`/toolkits/${clean}`) : { code: 0, keepsPath: false }
  const checks = await Promise.all([
    result(
      "composio-toolkit-page",
      `Composio ${clean} toolkit deep link exists`,
      `GET https://dashboard.composio.dev/toolkits/${clean}`,
      "Login redirect that keeps the path",
      res.ok ? `HTTP ${route.code}${route.keepsPath ? ", next= kept" : ""}` : `no toolkit docs (HTTP ${res.status})`,
      route.keepsPath,
    ),
    settle(
      async () => {
        const r = await fetch(COMPOSIO_CALLBACK, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
        return result("composio-callback", "Composio callback URL is live", `GET ${COMPOSIO_CALLBACK}`, "Responds (redirect), not 404", `HTTP ${r.status}`, r.status !== 404 && r.status < 500)
      },
      "composio-callback", "Composio callback URL is live", `GET ${COMPOSIO_CALLBACK}`, "Responds (redirect), not 404",
    ),
    settle(
      async () => {
        const r = await fetch("https://discord.gg/composio", { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
        return result("composio-discord", "Composio Discord invite resolves", "GET https://discord.gg/composio", "Redirects to a Discord invite", `HTTP ${r.status}`, r.status >= 300 && r.status < 400)
      },
      "composio-discord", "Composio Discord invite resolves", "GET https://discord.gg/composio", "Redirects to a Discord invite",
    ),
  ])
  for (const c of checks) saveProbe(slug, c)

  out(rule(), ` ${bold("Composio toolkit")} ${clean}`, rule())
  if (!res.ok) out(` ${yellow("Not found")} at ${docUrl}. Try another slug (e.g. zoho_crm, googlecalendar); if none exists, say so in the tagline.`)
  else {
    out(`   ${padEnd(dim("Name"), 18)} ${md.match(/^# (.+)$/m)?.[1]?.trim() ?? clean}`)
    out(`   ${padEnd(dim("Auth"), 18)} ${md.match(/\*\*Auth:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? "unknown"}`)
    out(`   ${padEnd(dim("Managed OAuth app"), 18)} ${managed}  ${dim("→ composio.managedAvailable")}`)
    out(`   ${padEnd(dim("Docs"), 18)} ${docUrl.replace(/\.md$/, "")}`)
    if (setupGuide) out(`   ${padEnd(dim("Setup guide"), 18)} ${setupGuide}  ${dim("(read it, but trust the provider's docs when they disagree)")}`)
  }
  out("", ` ${bold("Checks recorded")} ${dim(`(${path.relative(process.cwd(), probesFile(slug))})`)}`)
  for (const c of checks) out(`   ${c.pass ? green("✓") : red("✗")} ${padEnd(c.id, 26)} ${dim(c.observed)}`)
}

// A small JSON Schema check against references/guide.schema.json (generated from the site's zod schema).
function checkSchema(schema, v, at, errors) {
  if (schema.anyOf) {
    if (!schema.anyOf.some((s) => { const e = []; checkSchema(s, v, at, e); return !e.length }))
      errors.push(`${at}: doesn't match any allowed shape`)
    return
  }
  const t = schema.type
  const typeOk =
    t === undefined ||
    (t === "object" ? v !== null && typeof v === "object" && !Array.isArray(v)
      : t === "array" ? Array.isArray(v)
      : t === "integer" ? Number.isInteger(v)
      : t === "null" ? v === null
      : typeof v === t)
  if (!typeOk) return errors.push(`${at}: expected ${t}`)
  if (schema.enum && !schema.enum.includes(v)) errors.push(`${at}: must be one of ${schema.enum.join(", ")}`)
  if (typeof v === "string") {
    if (schema.minLength !== undefined && v.length < schema.minLength) errors.push(`${at}: empty`)
    if (schema.maxLength !== undefined && v.length > schema.maxLength) errors.push(`${at}: ${v.length} characters (max ${schema.maxLength})`)
    if (schema.pattern && !new RegExp(schema.pattern).test(v)) errors.push(`${at}: doesn't match ${schema.pattern}`)
    if (schema.format === "uri" && !v.startsWith("https://")) errors.push(`${at}: must be an https URL`)
  }
  if (typeof v === "number") {
    if (schema.minimum !== undefined && v < schema.minimum) errors.push(`${at}: below ${schema.minimum}`)
    if (schema.exclusiveMinimum !== undefined && v <= schema.exclusiveMinimum) errors.push(`${at}: must be above ${schema.exclusiveMinimum}`)
  }
  if (Array.isArray(v)) {
    if (schema.minItems !== undefined && v.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems}`)
    if (schema.maxItems !== undefined && v.length > schema.maxItems) errors.push(`${at}: at most ${schema.maxItems} allowed`)
    if (schema.items) v.forEach((item, i) => checkSchema(schema.items, item, `${at}[${i}]`, errors))
  }
  if (t === "object") {
    for (const key of schema.required ?? []) if (!(key in v)) errors.push(`${at}.${key}: missing`)
    for (const [key, sub] of Object.entries(schema.properties ?? {})) if (key in v) checkSchema(sub, v[key], `${at}.${key}`, errors)
  }
}

// The same rules the site enforces on every guide (guide-schema.ts superRefine), plus cited checks must have passed.
function guideErrors(guide, probes) {
  const errors = []
  checkSchema(readJson(path.join(SKILL_DIR, "references", "guide.schema.json")), guide, "guide", errors)
  try {
    crossChecks(normalize(structuredClone(guide)), probes, errors)
  } catch {
    // The shape is too broken for cross-checks; the schema errors say why.
  }
  return errors
}

function crossChecks(g, probes, errors) {
  const sourceIds = new Set(g.sources.map((s) => s.id))
  const contactIds = new Set(g.contacts.map((c) => c.id))
  const passed = new Set(probes.filter((p) => p.pass).map((p) => p.id))
  const known = new Set(probes.map((p) => p.id))
  const checkCited = (where, ids) => {
    for (const id of ids) {
      if (!known.has(id)) errors.push(`${where} cites check "${id}" that never ran (run it with probe)`)
      else if (!passed.has(id)) errors.push(`${where} cites check "${id}" that failed: fix the claim, don't cite it`)
    }
  }
  if (g.composio.callbackUrl !== COMPOSIO_CALLBACK) errors.push(`composio.callbackUrl must be ${COMPOSIO_CALLBACK}`)
  if (g.facts.approvalWait && !g.facts.approvalWait.summary) errors.push("facts.approvalWait needs a short summary")
  if (!contactIds.has("composio-discord")) errors.push('contacts must include "composio-discord" (copy it from the GitHub guide)')
  for (const c of g.contacts) {
    if (c.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.target)) errors.push(`Contact "${c.label}" is not a valid email`)
    if (c.kind === "page" && !/^https:\/\//.test(c.target)) errors.push(`Contact "${c.label}" must be an https URL`)
    if (!c.sources.length && !c.checks.length) errors.push(`Contact "${c.label}" needs a source or a live check`)
    for (const id of c.sources) if (!sourceIds.has(id)) errors.push(`Contact "${c.label}" cites unknown source "${id}"`)
    checkCited(`Contact "${c.label}"`, c.checks)
  }
  const stepIds = new Set()
  for (const s of g.steps) {
    if (stepIds.has(s.id)) errors.push(`Duplicate step id: ${s.id}`)
    stepIds.add(s.id)
    if (!s.sources.length && !s.checks.length && !s.unconfirmed) errors.push(`"${s.title}" has no source, live check, or unconfirmed note`)
    for (const w of s.warnings) if (!w.sources.length && !w.unconfirmed) errors.push(`Warning in "${s.title}" needs a source or an unconfirmed note`)
    if (s.who === "wait" && !s.wait) errors.push(`Wait step "${s.title}" needs a wait duration`)
    for (const c of s.contacts) if (!contactIds.has(c)) errors.push(`"${s.title}" offers unknown contact "${c}"`)
    for (const id of [...s.sources, ...s.warnings.flatMap((w) => w.sources), ...s.problems.flatMap((p) => p.sources)])
      if (!sourceIds.has(id)) errors.push(`"${s.title}" cites unknown source "${id}"`)
    checkCited(`"${s.title}"`, s.checks)
  }
}

function validate(slug) {
  if (!slug) fail("Usage: validate <slug>   (checks .oauth-guides/guides/<slug>.json)")
  const file = path.join(localDir("guides"), `${slug}.json`)
  if (!fs.existsSync(file)) fail(`Write the guide to ${path.relative(process.cwd(), file)} first.`)
  let guide
  try {
    guide = readJson(file)
  } catch (e) {
    fail(`Not valid JSON: ${e.message}`)
  }
  const probes = fs.existsSync(probesFile(slug)) ? readJson(probesFile(slug)).results : []
  const errors = guideErrors(guide, probes)
  if (guide.slug !== slug) errors.push(`slug is "${guide.slug}" but the file is ${slug}.json`)
  if (errors.length) {
    out(` ${red(`✗ ${errors.length} problem${errors.length === 1 ? "" : "s"}`)} in ${path.relative(process.cwd(), file)}`, ...errors.slice(0, 40).map((e) => `   • ${e}`))
    process.exit(1)
  }
  out(` ${green("✓ Valid")}: ${guide.name}, ${guide.steps.length} steps, ${guide.sources.length} sources, ${probes.filter((p) => p.pass).length} passing checks.`, "")
  board(slug)
}

// Saves a guide generated on the web (a share link carries the whole guide in its #fragment) or a JSON file.
function importGuide(arg) {
  if (!arg) fail(`Usage: import <share link from ${SITE}/new> | <guide.json>`)
  let payload
  try {
    if (arg.includes("#")) {
      const b64 = arg.slice(arg.indexOf("#") + 1).replace(/-/g, "+").replace(/_/g, "/")
      payload = JSON.parse(zlib.inflateRawSync(Buffer.from(b64, "base64")).toString("utf8"))
    } else {
      const data = readJson(arg)
      payload = data.guide ? data : { guide: data, probes: [] }
    }
  } catch (e) {
    fail(`Couldn't read that guide: ${e.message}`)
  }
  const { guide, probes = [] } = payload
  const errors = guideErrors(guide, probes)
  if (errors.length) fail(`That guide doesn't pass validation:\n${errors.slice(0, 20).map((e) => `   • ${e}`).join("\n")}`)
  ensureStateDir()
  fs.writeFileSync(path.join(localDir("guides"), `${guide.slug}.json`), JSON.stringify(guide, null, 2) + "\n")
  fs.writeFileSync(probesFile(guide.slug), JSON.stringify({ guide: guide.slug, ranAt: payload.generatedAt ?? new Date().toISOString(), results: probes }, null, 2) + "\n")
  out(` ${green("✓ Imported")} ${guide.name} → ${path.relative(process.cwd(), path.join(localDir("guides"), `${guide.slug}.json`))}`, "")
  board(guide.slug)
}

// ── entry ──────────────────────────────────────────────────────────────────────

const USAGE = `${bold("oauth.mjs")} · OAuth app setup guides with progress tracking

 ${bold("Follow a guide")}
   list [query]                    guides in the library and this project
   status [slug]                   progress board (every started guide if no slug)
   step <slug> [step-id|next]      one step in full ${dim("[--lang python|bash]")}
   help <slug> <step-id>           known problems, who to ask, a message to send
   done | skip | todo <slug> <step-id>
   block <slug> <step-id> "<reason>"
   waiting <slug> <step-id>        a review or approval clock has started
   check-github-client-id <id>     confirm GitHub recognises a Client ID

 ${bold("Add a guide")}
   import <share-link | file.json> save a guide generated at ${SITE}/new
   toolkit <slug> <toolkit>        Composio lookup + Composio checks (research)
   probe <slug> --id … --title … --url …   record a live check (research)
   validate <slug>                 check .oauth-guides/guides/<slug>.json

 Progress lives in ${path.relative(process.cwd(), STATE_DIR) || "."}/progress.json`

const [cmd, ...args] = process.argv.slice(2)
const flags = parseFlags(args)
const rest = flags._
switch (cmd) {
  case "list":
    list(rest.join(" ") || undefined)
    break
  case "status":
    if (rest[0]) board(rest[0])
    else statusAll()
    break
  case "step":
    showStep(rest[0], rest[1], flags.lang?.[0])
    break
  case "help":
    help(rest[0], rest[1])
    break
  case "done":
  case "todo":
    setStatus(cmd, rest[0], rest[1], rest.slice(2).join(" ") || undefined)
    break
  case "skip":
    setStatus("skipped", rest[0], rest[1], rest.slice(2).join(" ") || undefined)
    break
  case "block":
    setStatus("blocked", rest[0], rest[1], rest.slice(2).join(" ") || undefined)
    break
  case "waiting":
    setStatus("waiting", rest[0], rest[1], rest.slice(2).join(" ") || undefined)
    break
  case "check-github-client-id":
    await checkGithubClientId(rest[0])
    break
  case "import":
    importGuide(rest[0])
    break
  case "toolkit":
    await toolkit(rest[0], rest[1])
    break
  case "probe":
    await probe(args[0], args.slice(1))
    break
  case "validate":
    validate(rest[0])
    break
  default:
    out(USAGE)
    if (cmd && cmd !== "help" && cmd !== "--help") process.exit(1)
}

import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import type { ProbeResult } from "@/lib/guide-schema"

export const COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback"

const MAX_BODY = 300_000
const TIMEOUT_MS = 12_000
// Some consoles (e.g. Microsoft Entra) 403 unknown user agents.
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase()
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:")
  }
  const [a, b] = ip.split(".").map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
}

// The agent picks the URLs, so only public https hosts are allowed.
async function assertPublicHttps(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== "https:") throw new Error("Only https URLs can be probed")
  if (isIP(url.hostname) || url.hostname === "localhost" || !url.hostname.includes(".")) throw new Error("Host must be a public domain")
  const addrs = await lookup(url.hostname, { all: true })
  if (addrs.some((a) => isPrivateAddress(a.address))) throw new Error("Host resolves to a private address")
  return url
}

export type ProbeRequest = {
  url: string
  method?: "GET" | "POST"
  form?: Record<string, string>
  follow_redirects?: boolean
}

export type ProbeResponse = {
  status: number
  finalUrl: string
  location: string | null
  contentType: string | null
  title: string | null
  body: string
}

export async function httpProbe(req: ProbeRequest): Promise<ProbeResponse> {
  let url = await assertPublicHttps(req.url)
  const follow = req.follow_redirects ?? true
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      method: req.method ?? "GET",
      redirect: "manual",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
        ...(req.form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      },
      body: req.form ? new URLSearchParams(req.form) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const location = res.headers.get("location")
    if (follow && location && res.status >= 300 && res.status < 400 && (req.method ?? "GET") === "GET") {
      url = await assertPublicHttps(new URL(location, url).toString())
      continue
    }
    const text = (await res.text()).slice(0, MAX_BODY)
    const title = text.match(/<title[^>]*>([^<]{0,200})<\/title>/i)?.[1]?.trim() ?? null
    return { status: res.status, finalUrl: url.toString(), location, contentType: res.headers.get("content-type"), title, body: text }
  }
  throw new Error("Too many redirects")
}

export type ProbeExpect = {
  status?: number[]
  body_contains?: string[]
  body_lacks?: string[]
  location_contains?: string
  final_url_contains?: string
}

// Pass/fail is decided here from the response, never by the model.
export function judge(res: ProbeResponse, expect: ProbeExpect) {
  const failures: string[] = []
  if (expect.status?.length && !expect.status.includes(res.status)) failures.push(`status ${res.status} not in [${expect.status.join(", ")}]`)
  for (const s of expect.body_contains ?? []) if (!res.body.includes(s)) failures.push(`body lacks "${s}"`)
  for (const s of expect.body_lacks ?? []) if (res.body.includes(s)) failures.push(`body contains "${s}"`)
  if (expect.location_contains && !(res.location ?? "").includes(expect.location_contains))
    failures.push(`location "${res.location ?? "none"}" lacks "${expect.location_contains}"`)
  if (expect.final_url_contains && !res.finalUrl.includes(expect.final_url_contains)) failures.push(`final URL lacks "${expect.final_url_contains}"`)
  return failures
}

export function describeExpect(expect: ProbeExpect) {
  const parts = [
    expect.status?.length ? `HTTP ${expect.status.join("/")}` : null,
    ...(expect.body_contains ?? []).map((s) => `contains "${s}"`),
    ...(expect.body_lacks ?? []).map((s) => `lacks "${s}"`),
    expect.location_contains ? `redirects to …${expect.location_contains}…` : null,
    expect.final_url_contains ? `ends at …${expect.final_url_contains}…` : null,
  ].filter(Boolean)
  return parts.join(", ") || "responds"
}

export function observe(res: ProbeResponse) {
  const json = res.contentType?.includes("json") ? res.body.slice(0, 160) : null
  return [`HTTP ${res.status}`, res.location ? `→ ${res.location.slice(0, 100)}` : null, json ?? (res.title ? `"${res.title.slice(0, 80)}"` : null)]
    .filter(Boolean)
    .join(" · ")
}

// Composio's dashboard sends real routes to login with ?next=<path> and 404s unknown ones.
async function dashboardRoute(path: string) {
  const res = await fetch(`https://dashboard.composio.dev${path}`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
  const location = res.headers.get("location")
  const next = location ? new URL(location, "https://dashboard.composio.dev").searchParams.get("next") : null
  return { code: res.status, keepsPath: next === path }
}

function result(id: string, title: string, request: string, expect: string, observed: string, pass: boolean): ProbeResult {
  return { id, title, request, expect, observed, pass, ranAt: new Date().toISOString() }
}

// The same Composio checks every library guide carries, so generated guides can cite them too.
export async function composioBaseProbes(): Promise<ProbeResult[]> {
  const settle = async (fn: () => Promise<ProbeResult>, id: string, title: string, request: string, expect: string) => {
    try {
      return await fn()
    } catch (e) {
      return result(id, title, request, expect, `failed: ${(e as Error).message}`, false)
    }
  }
  return Promise.all([
    settle(
      async () => {
        const r = await fetch(COMPOSIO_CALLBACK, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
        return result("composio-callback", "Composio callback URL is live", `GET ${COMPOSIO_CALLBACK}`, "Responds (redirect), not 404", `HTTP ${r.status}`, r.status !== 404 && r.status < 500)
      },
      "composio-callback", "Composio callback URL is live", `GET ${COMPOSIO_CALLBACK}`, "Responds (redirect), not 404",
    ),
    settle(
      async () => {
        const html = await (await fetch("https://dashboard.composio.dev/login", { signal: AbortSignal.timeout(TIMEOUT_MS) })).text()
        const ok = /href="\/sign-up/.test(html)
        return result("composio-dashboard-login", "Composio sign-up is on the login page", "GET https://dashboard.composio.dev/login", "Sign-in page with a sign-up link", ok ? "sign-up link present" : "no sign-up link", ok)
      },
      "composio-dashboard-login", "Composio sign-up is on the login page", "GET https://dashboard.composio.dev/login", "Sign-in page with a sign-up link",
    ),
    settle(
      async () => {
        const r = await dashboardRoute("/~/project/settings/api-keys")
        return result("composio-api-keys-page", "API keys deep link exists", "GET https://dashboard.composio.dev/~/project/settings/api-keys", "Login redirect that keeps the path", `HTTP ${r.code}${r.keepsPath ? ", next= kept" : ""}`, r.keepsPath)
      },
      "composio-api-keys-page", "API keys deep link exists", "GET https://dashboard.composio.dev/~/project/settings/api-keys", "Login redirect that keeps the path",
    ),
    settle(
      async () => {
        const r = await fetch("https://discord.gg/composio", { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) })
        return result("composio-discord", "Composio Discord invite resolves", "GET https://discord.gg/composio", "Redirects to a Discord invite", `HTTP ${r.status}`, r.status >= 300 && r.status < 400)
      },
      "composio-discord", "Composio Discord invite resolves", "GET https://discord.gg/composio", "Redirects to a Discord invite",
    ),
  ])
}

export type ToolkitInfo = {
  slug: string
  exists: boolean
  name?: string
  auth?: string
  managed?: boolean
  docUrl: string
  setupGuideUrl?: string
}

// Reads Composio's public toolkit page: whether the toolkit exists and whether Composio manages its OAuth app.
export async function composioToolkit(slug: string): Promise<{ info: ToolkitInfo; probe: ProbeResult }> {
  const clean = slug.toLowerCase().replace(/[^a-z0-9_-]/g, "")
  const docUrl = `https://docs.composio.dev/toolkits/${clean}.md`
  const res = await fetch(docUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const md = res.ok ? (await res.text()).slice(0, 6000) : ""
  const info: ToolkitInfo = {
    slug: clean,
    exists: res.ok,
    name: md.match(/^# (.+)$/m)?.[1]?.trim(),
    auth: md.match(/\*\*Auth:\*\*\s*([^\n]+)/)?.[1]?.trim(),
    managed: /Composio-managed OAuth available\?\*\*\s*Yes/i.test(md) ? true : /Composio-managed OAuth available\?\*\*\s*No/i.test(md) ? false : undefined,
    docUrl: docUrl.replace(/\.md$/, ""),
    setupGuideUrl: md.match(/\((https:\/\/composio\.dev\/auth\/[a-z0-9_-]+)\)/)?.[1],
  }
  const route = res.ok ? await dashboardRoute(`/toolkits/${clean}`) : { code: 0, keepsPath: false }
  const probe = result(
    "composio-toolkit-page",
    `Composio ${clean} toolkit deep link exists`,
    `GET https://dashboard.composio.dev/toolkits/${clean}`,
    "Login redirect that keeps the path",
    res.ok ? `HTTP ${route.code}${route.keepsPath ? ", next= kept" : ""}` : `no toolkit docs (HTTP ${res.status})`,
    route.keepsPath,
  )
  return { info, probe }
}

import { COMPOSIO_CALLBACK, composioProbes, json, page, status } from "./_lib.mjs"

// 32 characters, the documented client ID length. No app uses it.
const FAKE_CLIENT_ID = "fakefakefakefakefakefakefakefake"
const AUTH = "https://auth.atlassian.com"
const DOC_3LO = "https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/"

const authorizeUrl =
  `${AUTH}/authorize?audience=api.atlassian.com&client_id=${FAKE_CLIENT_ID}` +
  `&scope=${encodeURIComponent("read:jira-work offline_access")}` +
  `&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}&state=probe&response_type=code&prompt=consent`

// Collapse a page to plain text so doc phrases match across markup.
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/\s+/g, " ")

async function docHas(url, phrases) {
  const { code, html } = await page(url)
  const t = text(html)
  const missing = phrases.filter((p) => !t.includes(p))
  return { code, missing }
}

const docProbe = (id, title, url, phrases, expect) => ({
  id,
  title,
  request: `GET ${url}`,
  expect,
  run: async () => {
    const r = await docHas(url, phrases)
    return {
      observed: `HTTP ${r.code}; ${r.missing.length ? `missing: ${r.missing.join(" | ")}` : "all phrases present"}`,
      pass: r.code === 200 && r.missing.length === 0,
    }
  },
})

const probes = [
  ...composioProbes("jira"),
  {
    id: "atl-console",
    title: "Atlassian developer console exists",
    request: "GET https://developer.atlassian.com/console/myapps/",
    expect: 'HTTP 200, page titled "Developer console"',
    run: async () => {
      const { code, html } = await page("https://developer.atlassian.com/console/myapps/")
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "no title"
      return { observed: `HTTP ${code}; "${title}"`, pass: code === 200 && title === "Developer console" }
    },
  },
  {
    id: "atl-oidc-endpoints",
    title: "Atlassian authorize and token endpoints",
    request: `GET ${AUTH}/.well-known/openid-configuration`,
    expect: "authorize at auth.atlassian.com/authorize, token at /oauth/token",
    run: async () => {
      const { code, body } = await json(`${AUTH}/.well-known/openid-configuration`)
      const ok = body?.authorization_endpoint === `${AUTH}/authorize` && body?.token_endpoint === `${AUTH}/oauth/token`
      return { observed: `HTTP ${code}; authorize ${body?.authorization_endpoint}; token ${body?.token_endpoint}`, pass: ok }
    },
  },
  {
    id: "atl-authorize-signin-first",
    title: "Authorize asks for sign-in before checking the app",
    request: `GET ${authorizeUrl}`,
    expect: "302 to id.atlassian.com/login even with an unknown client_id",
    run: async () => {
      const res = await fetch(authorizeUrl, { redirect: "manual" })
      const loc = res.headers.get("location") ?? ""
      const toLogin = loc.startsWith("https://id.atlassian.com/login")
      return { observed: `HTTP ${res.status}; ${toLogin ? "to id.atlassian.com/login" : loc || "no redirect"}`, pass: res.status === 302 && toLogin }
    },
  },
  {
    id: "atl-refresh-rejected",
    title: "Token endpoint rejects a bad refresh token",
    request: `POST ${AUTH}/oauth/token (grant_type=refresh_token, bogus values)`,
    expect: "HTTP 403 with an error body",
    run: async () => {
      const res = await fetch(`${AUTH}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_type: "refresh_token", client_id: FAKE_CLIENT_ID, client_secret: "wrong", refresh_token: "wrong" }),
      })
      const body = await res.json().catch(() => ({}))
      return { observed: `HTTP ${res.status}; ${body.error}: ${body.error_description}`, pass: res.status === 403 && !!body.error }
    },
  },
  {
    id: "atl-accessible-resources",
    title: "accessible-resources needs a bearer token",
    request: "GET https://api.atlassian.com/oauth/token/accessible-resources (no token)",
    expect: "HTTP 401",
    run: async () => {
      const code = await status("https://api.atlassian.com/oauth/token/accessible-resources")
      return { observed: `HTTP ${code}`, pass: code === 401 }
    },
  },
  docProbe(
    "atl-doc-refresh-rotation",
    "3LO doc: rotating refresh tokens, 90-day inactivity",
    DOC_3LO,
    ["Inactivity expiry time 90 days", "add offline_access to the scope parameter", "Unknown or invalid refresh token"],
    "States 90-day inactivity expiry and offline_access",
  ),
  docProbe(
    "atl-doc-distribution",
    "3LO doc: private by default, unreviewed warning",
    DOC_3LO,
    ["it's private by default", "Enable sharing", "has not yet been reviewed by Atlassian"],
    "Says apps start private and users see a not-reviewed warning",
  ),
  docProbe(
    "atl-doc-no-customer-apps",
    "3LO doc: don't make customers create apps",
    DOC_3LO,
    ["instruct customers to create individual 3LO apps", "Build a single, distributable 3LO app"],
    "Forbids asking customers to create their own 3LO apps",
  ),
  docProbe(
    "atl-doc-grant-types",
    "3LO doc: account vs resource-level grants",
    DOC_3LO,
    ["Account-level grant", "Resource-level grant", "requires the user to select the site"],
    "Lists both grant types and per-site consent",
  ),
  docProbe(
    "atl-site-admin-kb",
    "Site admin authorization KB article",
    "https://support.atlassian.com/atlassian-cloud/kb/your-site-admin-must-authorize-this-app-error-in-atlassian-cloud-apps/",
    ["Your site admin must authorize this app", "Connected apps"],
    "Describes the site admin error and Connected apps fix",
  ),
  docProbe(
    "atl-marketplace-approval-time",
    "Marketplace approval time is published",
    "https://developer.atlassian.com/platform/marketplace/app-approval-guidelines/",
    ["Approvals take 10-15 business days"],
    "States 10-15 business days",
  ),
  docProbe(
    "atl-dev-support",
    "Developer and Marketplace support page",
    "https://developer.atlassian.com/support",
    ["Developer and Marketplace support", "Ecosystem Support Request"],
    "Support page with Ecosystem Support Request",
  ),
  {
    id: "atl-community",
    title: "Atlassian Developer Community is live",
    request: "GET https://community.developer.atlassian.com/",
    expect: 'HTTP 200, "The Atlassian Developer Community"',
    run: async () => {
      const { code, html } = await page("https://community.developer.atlassian.com/")
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "no title"
      return { observed: `HTTP ${code}; "${title}"`, pass: code === 200 && /Atlassian Developer Community/.test(title) }
    },
  },
]

export default probes

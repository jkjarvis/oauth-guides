import { COMPOSIO_CALLBACK, composioProbes, page, status } from "./_lib.mjs"

// Minimal manifest the guide links to: Composio's callback plus user-token scopes
// (Composio's Slack toolkit acts as the signed-in user).
export const MANIFEST = {
  display_information: { name: "Your App Name" },
  oauth_config: {
    redirect_urls: [COMPOSIO_CALLBACK],
    scopes: {
      user: [
        "channels:read",
        "channels:history",
        "groups:read",
        "groups:history",
        "im:read",
        "im:history",
        "mpim:read",
        "mpim:history",
        "chat:write",
        "users:read",
        "reactions:write",
        "search:read",
      ],
    },
  },
  settings: { token_rotation_enabled: false },
}
export const MANIFEST_URL = `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(MANIFEST))}`

const FAKE_CLIENT_ID = "1111111111.2222222222"
// tracked=1 skips Slack's JS bounce page and returns the real redirect.
const authorizeUrl = (id) =>
  `https://slack.com/oauth/v2/authorize?client_id=${id}&user_scope=channels:read&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}&tracked=1`

async function docHas(url, needles) {
  const { code, html } = await page(url)
  const missing = needles.filter((n) => !html.includes(n))
  return { observed: `HTTP ${code}${missing.length ? `; missing: ${missing.join(", ")}` : "; all phrases found"}`, pass: code === 200 && missing.length === 0 }
}

const probes = [
  ...composioProbes("slack"),
  {
    id: "apps-page",
    title: "Slack app settings page loads",
    request: "GET https://api.slack.com/apps?new_app=1",
    expect: 'HTTP 200, "Slack API: Applications" page',
    run: async () => {
      const { code, html } = await page("https://api.slack.com/apps?new_app=1")
      const ok = code === 200 && html.includes("Slack API: Applications")
      return { observed: `HTTP ${code}${ok ? ", Applications page" : ""}`, pass: ok }
    },
  },
  {
    id: "manifest-link",
    title: "Prefilled manifest link loads",
    request: `GET ${MANIFEST_URL}`,
    expect: "HTTP 200 Applications page (prefill shows after sign-in)",
    run: async () => {
      const { code, html } = await page(MANIFEST_URL)
      const ok = code === 200 && html.includes("Slack API: Applications")
      return { observed: `HTTP ${code}, ${MANIFEST_URL.length} chars`, pass: ok }
    },
  },
  {
    id: "authorize-signin",
    title: "Authorize sends signed-out users to sign-in",
    request: `GET ${authorizeUrl(FAKE_CLIENT_ID)}`,
    expect: "302 to workspace-signin, even for a fake client_id",
    run: async () => {
      const res = await fetch(authorizeUrl(FAKE_CLIENT_ID), { redirect: "manual" })
      const loc = res.headers.get("location") ?? ""
      const ok = res.status === 302 && loc.includes("/workspace-signin") && loc.includes(FAKE_CLIENT_ID)
      return { observed: `HTTP ${res.status} → ${loc.split("?")[0] || "(none)"}`, pass: ok }
    },
  },
  {
    id: "token-fake-code",
    title: "Token exchange checks the code first",
    request: "POST https://slack.com/api/oauth.v2.access (fake client_id, secret, code)",
    expect: "error: invalid_code",
    run: async () => {
      const res = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: FAKE_CLIENT_ID, client_secret: "wrong", code: "wrong" }),
      })
      const body = await res.json()
      return { observed: `ok: ${body.ok}, error: ${body.error}`, pass: body.ok === false && body.error === "invalid_code" }
    },
  },
  {
    id: "oidc-discovery",
    title: "OIDC is Sign in with Slack only",
    request: "GET https://slack.com/.well-known/openid-configuration",
    expect: "Issuer https://slack.com, scopes openid/profile/email",
    run: async () => {
      const res = await fetch("https://slack.com/.well-known/openid-configuration")
      const d = await res.json()
      const ok = d.issuer === "https://slack.com" && d.scopes_supported?.join(" ") === "openid profile email"
      return { observed: `issuer ${d.issuer}; scopes ${d.scopes_supported?.join(" ")}`, pass: ok }
    },
  },
  {
    id: "rate-limit-changelog",
    title: "Non-Marketplace rate limit notice is live",
    request: "GET https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps.md",
    expect: "Mentions 1 request per minute and 15 objects",
    run: () =>
      docHas("https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps.md", [
        "1 request per minute",
        "15 objects",
        "will not be applied to existing installations",
      ]),
  },
  {
    id: "history-reference-tier",
    title: "conversations.history reference still says Tier 3",
    request: "GET https://docs.slack.dev/reference/methods/conversations.history.md",
    expect: "Lists Tier 3 and limit max 999, no non-Marketplace note",
    run: async () => {
      const { code, html } = await page("https://docs.slack.dev/reference/methods/conversations.history.md")
      const tier3 = html.includes("Tier 3")
      const note = /non-Marketplace|unlisted/i.test(html)
      return { observed: `HTTP ${code}; Tier 3: ${tier3}; non-Marketplace note: ${note}`, pass: code === 200 && tier3 && !note }
    },
  },
  {
    id: "marketplace-install-requirement",
    title: "Marketplace needs 10 active installs",
    request: "GET https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement.md",
    expect: "Says at least 10 installations on active workspaces",
    run: () =>
      docHas("https://docs.slack.dev/changelog/2026/09/01/slack-marketplace-install-requirement.md", [
        "at least 10 installations on active workspaces",
        "entire duration of the review",
      ]),
  },
  {
    id: "marketplace-review-timeline",
    title: "Marketplace review timeline is published",
    request: "GET https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide.md",
    expect: "Up to 10 business days, then up to 10 weeks",
    run: () =>
      docHas("https://docs.slack.dev/slack-marketplace/slack-marketplace-review-guide.md", [
        "up to 10 business days",
        "up to 10 weeks for new submissions",
        "10 or more active workspaces",
      ]),
  },
  {
    id: "distribution-doc",
    title: "Public distribution steps are published",
    request: "GET https://docs.slack.dev/app-management/distribution.md",
    expect: "Mentions Manage Distribution and Activate Public Distribution",
    run: () =>
      docHas("https://docs.slack.dev/app-management/distribution.md", ["Manage Distribution", "Activate Public Distribution"]),
  },
  {
    id: "composio-slack-faq",
    title: "Composio Slack FAQ covers admin approval",
    request: "GET https://docs.composio.dev/toolkits/slack.md",
    expect: "Mentions Require approved apps and Marketplace setting",
    run: () =>
      docHas("https://docs.composio.dev/toolkits/slack.md", ["Require approved apps", "Require apps from Slack Marketplace"]),
  },
  {
    id: "slack-support-page",
    title: "Slack support request page resolves",
    request: "GET https://slack.com/help/requests/new",
    expect: "Redirects to the help request form, not 404",
    run: async () => {
      const code = await status("https://slack.com/help/requests/new")
      const { code: final, url } = await page("https://slack.com/help/requests/new")
      return { observed: `HTTP ${code} → ${final} ${url}`, pass: code < 400 && final === 200 && url.includes("/help/requests/new") }
    },
  },
]

export default probes

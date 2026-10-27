import { COMPOSIO_CALLBACK, composioProbes, json, page } from "./_lib.mjs"

// A client ID no Linear OAuth app uses.
const FAKE_CLIENT_ID = "fakefakefake0000"
const TOKEN_URL = "https://api.linear.app/oauth/token"

async function tokenError(params) {
  return json(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: FAKE_CLIENT_ID, client_secret: "wrong", ...params }),
  })
}

async function docText(url) {
  const { code, html } = await page(url)
  return { code, text: html.replace(/\s+/g, " ") }
}

const probes = [
  ...composioProbes("linear"),
  {
    id: "oauth-metadata",
    title: "OAuth endpoints and refresh grant published",
    request: "GET https://api.linear.app/.well-known/oauth-authorization-server",
    expect: "authorize at linear.app/oauth/authorize, token at api.linear.app/oauth/token, refresh_token grant",
    run: async () => {
      const { code, body } = await json("https://api.linear.app/.well-known/oauth-authorization-server")
      const ok =
        body?.authorization_endpoint === "https://linear.app/oauth/authorize" &&
        body?.token_endpoint === TOKEN_URL &&
        (body?.grant_types_supported ?? []).includes("refresh_token")
      return { observed: `HTTP ${code}; grants: ${(body?.grant_types_supported ?? []).join(", ") || "none"}`, pass: ok }
    },
  },
  {
    id: "token-unknown-client",
    title: "Wrong client credentials are rejected",
    request: `POST ${TOKEN_URL} (unknown client_id, wrong secret, grant_type=authorization_code)`,
    expect: "error: invalid_client",
    run: async () => {
      const { code, body } = await tokenError({ grant_type: "authorization_code", code: "wrong", redirect_uri: COMPOSIO_CALLBACK })
      return { observed: `HTTP ${code}; error: ${body?.error ?? "none"}`, pass: body?.error === "invalid_client" }
    },
  },
  {
    id: "refresh-unknown-client",
    title: "Refresh uses the same token endpoint",
    request: `POST ${TOKEN_URL} (unknown client_id, grant_type=refresh_token)`,
    expect: "error: invalid_client",
    run: async () => {
      const { code, body } = await tokenError({ grant_type: "refresh_token", refresh_token: "wrong" })
      return { observed: `HTTP ${code}; error: ${body?.error ?? "none"}`, pass: body?.error === "invalid_client" }
    },
  },
  {
    id: "token-lifetime-doc",
    title: "Docs: 24-hour tokens since April 1, 2026",
    request: "GET https://linear.app/developers/oauth-2-0-authentication.md",
    expect: "Says all apps moved to refresh tokens on April 1, 2026 and access tokens last 24 hours",
    run: async () => {
      const { code, text } = await docText("https://linear.app/developers/oauth-2-0-authentication.md")
      const migrated = /migrated to the new refresh token system on April 1, 2026/.test(text)
      const day = /access token is valid for 24 hours/.test(text)
      return {
        observed: `HTTP ${code}; April 1, 2026 ${migrated ? "stated" : "missing"}; 24 hours ${day ? "stated" : "missing"}`,
        pass: code === 200 && migrated && day,
      }
    },
  },
  {
    id: "public-distribution-doc",
    title: "Docs: apps are private by default",
    request: "GET https://linear.app/developers/oauth-app-manifests.md",
    expect: "distribution allows private or public; default private",
    run: async () => {
      const { code, text } = await docText("https://linear.app/developers/oauth-app-manifests.md")
      const ok = /Allowed values: `private`, `public`/.test(text) && /Default: `private`/.test(text)
      return { observed: `HTTP ${code}; ${ok ? "private default stated" : "statement missing"}`, pass: code === 200 && ok }
    },
  },
  {
    id: "admin-page-doc",
    title: "Docs: OAuth apps need workspace admin",
    request: "GET https://linear.app/docs/api-and-webhooks.md",
    expect: "OAuth applications live in Settings > Administration > API, admin only",
    run: async () => {
      const { code, text } = await docText("https://linear.app/docs/api-and-webhooks.md")
      const ok =
        /Create and manage webhooks and OAuth applications in _Settings > Administration > API._ Admin permissions/.test(text)
      return { observed: `HTTP ${code}; ${ok ? "admin requirement stated" : "statement missing"}`, pass: code === 200 && ok }
    },
  },
  {
    id: "linear-support-page",
    title: "Linear Contact support page is live",
    request: "GET https://linear.app/contact/support",
    expect: "Page titled 'Contact support – Linear' listing support@linear.app",
    run: async () => {
      const { code, html } = await page("https://linear.app/contact/support")
      const title = /<title>Contact support – Linear<\/title>/.test(html)
      const email = /support@linear\.app/.test(html)
      return {
        observed: `HTTP ${code}; title ${title ? "matches" : "missing"}; support@linear.app ${email ? "listed" : "missing"}`,
        pass: code === 200 && title && email,
      }
    },
  },
  {
    id: "linear-slack",
    title: "Linear community Slack link resolves",
    request: "GET https://linear.app/join-slack",
    expect: "Page links a join.slack.com invite",
    run: async () => {
      const { code, html } = await page("https://linear.app/join-slack")
      const invite = html.match(/join\.slack\.com\/t\/([a-z0-9-]+)/)?.[1]
      return { observed: `HTTP ${code}; ${invite ? `invite to ${invite}` : "no invite"}`, pass: code === 200 && Boolean(invite) }
    },
  },
  {
    id: "directory-contact-doc",
    title: "Docs: directory submissions go to integrations@",
    request: "GET https://linear.app/developers/integration-directory.md",
    expect: "Mentions integrations@linear.app and the submission form",
    run: async () => {
      const { code, text } = await docText("https://linear.app/developers/integration-directory.md")
      const ok = /integrations@linear\.app/.test(text) && /Submit your integration/.test(text)
      return { observed: `HTTP ${code}; ${ok ? "email and form present" : "missing"}`, pass: code === 200 && ok }
    },
  },
]

export default probes

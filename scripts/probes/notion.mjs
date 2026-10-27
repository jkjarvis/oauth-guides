import { COMPOSIO_CALLBACK, composioProbes, json, page, status } from "./_lib.mjs"

// A well-formed client ID that no Notion connection uses.
const FAKE_CLIENT_ID = "00000000-0000-0000-0000-000000000000"
const TOKEN_URL = "https://api.notion.com/v1/oauth/token"
const authorizeUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${FAKE_CLIENT_ID}&response_type=code&owner=user&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}`

async function tokenError(body) {
  return json(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${FAKE_CLIENT_ID}:wrong`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })
}

// Notion's web app answers real routes with 200 and unknown ones with 404.
async function routeVsControl(url, controlUrl) {
  const [code, control] = await Promise.all([status(url), status(controlUrl)])
  return { observed: `HTTP ${code}; control HTTP ${control}`, pass: code === 200 && control === 404 }
}

async function docText(url) {
  const { code, html } = await page(url)
  return { code, text: html.replace(/\s+/g, " ") }
}

const probes = [
  ...composioProbes("notion"),
  {
    id: "developer-portal",
    title: "Developer portal connections page exists",
    request: "GET https://app.notion.com/developers/connections (control: /developers/zzznotreal)",
    expect: "200; control 404s",
    run: () => routeVsControl("https://app.notion.com/developers/connections", "https://app.notion.com/developers/zzznotreal"),
  },
  {
    id: "marketplace-dashboard",
    title: "Marketplace listing dashboard exists",
    request: "GET https://www.notion.so/profile/connections (control: /profile/zzznotreal)",
    expect: "200; control 404s",
    run: () => routeVsControl("https://www.notion.so/profile/connections", "https://www.notion.so/profile/zzznotreal"),
  },
  {
    id: "authorize-signin-first",
    title: "Authorize URL goes to the install page first",
    request: `GET ${authorizeUrl}`,
    expect: "302 to app.notion.com/install-integration, client_id kept, no error yet",
    run: async () => {
      const res = await fetch(authorizeUrl, { redirect: "manual" })
      const loc = res.headers.get("location") ?? ""
      const ok =
        res.status === 302 &&
        loc.startsWith("https://app.notion.com/install-integration") &&
        loc.includes(FAKE_CLIENT_ID) &&
        !/error=/.test(loc)
      return { observed: `HTTP ${res.status} → ${loc.split("?")[0] || "no location"}`, pass: ok }
    },
  },
  {
    id: "token-unknown-client",
    title: "Wrong client credentials are rejected",
    request: `POST ${TOKEN_URL} (Basic auth, unknown client ID, wrong secret, grant_type=authorization_code)`,
    expect: "401 error: invalid_client",
    run: async () => {
      const { code, body } = await tokenError({ grant_type: "authorization_code", code: "wrong", redirect_uri: COMPOSIO_CALLBACK })
      return { observed: `HTTP ${code}; error: ${body?.error ?? "none"}`, pass: code === 401 && body?.error === "invalid_client" }
    },
  },
  {
    id: "refresh-unknown-client",
    title: "Refresh uses the same token endpoint",
    request: `POST ${TOKEN_URL} (Basic auth, unknown client ID, grant_type=refresh_token)`,
    expect: "401 error: invalid_client",
    run: async () => {
      const { code, body } = await tokenError({ grant_type: "refresh_token", refresh_token: "nrt_wrong" })
      return { observed: `HTTP ${code}; error: ${body?.error ?? "none"}`, pass: code === 401 && body?.error === "invalid_client" }
    },
  },
  {
    id: "scope-fixed-doc",
    title: "Docs say installation scope can't change",
    request: "GET https://developers.notion.com/guides/get-started/public-connections.md",
    expect: "Says installation scope can't be changed afterward",
    run: async () => {
      const { code, text } = await docText("https://developers.notion.com/guides/get-started/public-connections.md")
      const fixed = /Installation scope is set once, at creation time, and can't be changed afterward/.test(text)
      return { observed: `HTTP ${code}; ${fixed ? "statement present" : "statement missing"}`, pass: code === 200 && fixed }
    },
  },
  {
    id: "auth-url-review-doc",
    title: "Docs tie the Authorization URL to review",
    request: "GET https://developers.notion.com/guides/get-started/authorization.md",
    expect: "Says the Authorization URL field populates after review submission",
    run: async () => {
      const { code, text } = await docText("https://developers.notion.com/guides/get-started/authorization.md")
      const said = /Authorization URL field populates after a public connection is submitted for review/.test(text)
      return { observed: `HTTP ${code}; ${said ? "statement present" : "statement missing"}`, pass: code === 200 && said }
    },
  },
  {
    id: "notion-help-contact",
    title: "Notion Help Center offers support contact",
    request: "GET https://www.notion.com/help",
    expect: "200 with a 'Reach out to Notion support' option",
    run: async () => {
      const { code, html } = await page("https://www.notion.com/help")
      const has = /Reach out to Notion support/.test(html)
      return { observed: `HTTP ${code}; ${has ? "support option present" : "no support option"}`, pass: code === 200 && has }
    },
  },
  {
    id: "notion-devs-slack",
    title: "Notion Devs Slack invite resolves",
    request: "GET https://join.slack.com/t/notiondevs/shared_invite/zt-3u9oid9q8-HLUBmMVWYK~g9HFo4U4raA",
    expect: "Redirects to notiondevs.slack.com",
    run: async () => {
      const res = await fetch("https://join.slack.com/t/notiondevs/shared_invite/zt-3u9oid9q8-HLUBmMVWYK~g9HFo4U4raA", {
        redirect: "manual",
      })
      const loc = res.headers.get("location") ?? ""
      return {
        observed: `HTTP ${res.status} → ${loc.split("?")[0].slice(0, 60) || "no location"}`,
        pass: res.status >= 300 && res.status < 400 && loc.includes("notiondevs.slack.com"),
      }
    },
  },
]

export default probes

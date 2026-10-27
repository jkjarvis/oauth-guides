import { COMPOSIO_CALLBACK, composioProbes, json, page } from "./_lib.mjs"

// No Dropbox app uses this key.
const FAKE_APP_KEY = "fakefakefake123"
const DEV_GUIDE = "https://docs.dropboxapi.com/dropbox-api/docs/developer-resources/developer-guide"
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

const authorizeUrl = (key) =>
  `https://www.dropbox.com/oauth2/authorize?client_id=${key}&response_type=code&token_access_type=offline` +
  `&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}`

// Plain text with curly quotes flattened, so doc phrases match across markup.
const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;|’/g, "'")
    .replace(/\s+/g, " ")

const docProbe = (id, title, url, phrases, expect) => ({
  id,
  title,
  request: `GET ${url}`,
  expect,
  run: async () => {
    const { code, html } = await page(url, { headers: { "User-Agent": BROWSER_UA } })
    const t = text(html)
    const missing = phrases.filter((p) => !t.includes(p))
    return {
      observed: `HTTP ${code}; ${missing.length ? `missing: ${missing.join(" | ")}` : "all phrases present"}`,
      pass: code === 200 && missing.length === 0,
    }
  },
})

// Dropbox sends signed-out users to /login?cont=<page>, which shows the page exists behind sign-in.
async function loginRedirect(url) {
  const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": BROWSER_UA } })
  const loc = res.headers.get("location") ?? ""
  const cont = loc ? new URL(loc, "https://www.dropbox.com").searchParams.get("cont") : null
  return { code: res.status, keeps: cont === url }
}

const probes = [
  ...composioProbes("dropbox"),
  {
    id: "dbx-app-console",
    title: "App Console exists behind sign-in",
    request: "GET https://www.dropbox.com/developers/apps",
    expect: "Redirect to /login with cont= pointing back to the App Console",
    run: async () => {
      const r = await loginRedirect("https://www.dropbox.com/developers/apps")
      return { observed: `HTTP ${r.code}${r.keeps ? ", cont= kept" : ""}`, pass: r.keeps }
    },
  },
  {
    id: "dbx-oidc-endpoints",
    title: "Dropbox authorize and token endpoints",
    request: "GET https://www.dropbox.com/.well-known/openid-configuration",
    expect: "authorize on www.dropbox.com, token on api.dropboxapi.com",
    run: async () => {
      const { code, body } = await json("https://www.dropbox.com/.well-known/openid-configuration")
      const ok =
        body?.authorization_endpoint === "https://www.dropbox.com/oauth2/authorize" &&
        body?.token_endpoint === "https://api.dropboxapi.com/oauth2/token"
      return { observed: `HTTP ${code}; authorize ${body?.authorization_endpoint}; token ${body?.token_endpoint}`, pass: ok }
    },
  },
  {
    id: "dbx-authorize-unknown-key",
    title: "Unknown App key fails before sign-in",
    request: `GET ${authorizeUrl(FAKE_APP_KEY)}`,
    expect: "302 to /oauth2/authorize_error with error_name=unknown_client_id",
    run: async () => {
      const res = await fetch(authorizeUrl(FAKE_APP_KEY), { redirect: "manual", headers: { "User-Agent": BROWSER_UA } })
      const loc = res.headers.get("location") ?? ""
      const err = loc ? new URL(loc, "https://www.dropbox.com").searchParams.get("error_name") : null
      return { observed: `HTTP ${res.status}; error_name=${err ?? "none"}`, pass: res.status === 302 && err === "unknown_client_id" }
    },
  },
  {
    id: "dbx-token-bad-client",
    title: "Wrong key or secret is rejected by name",
    request: "POST https://api.dropboxapi.com/oauth2/token (unknown key, wrong secret)",
    expect: "400 invalid_client: Invalid client_id or client_secret",
    run: async () => {
      const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "wrong",
          client_id: FAKE_APP_KEY,
          client_secret: "wrong",
          redirect_uri: COMPOSIO_CALLBACK,
        }),
      })
      const body = await res.json().catch(() => ({}))
      return {
        observed: `HTTP ${res.status}; ${body.error}`,
        pass: res.status === 400 && /^invalid_client/.test(body.error ?? ""),
      }
    },
  },
  docProbe(
    "dbx-doc-dev-status",
    "Developer guide: development status limits",
    DEV_GUIDE,
    ["Enable additional users", "up to 500 total Dropbox users", "you will have two weeks to apply for and receive production status approval"],
    "States 500-user cap and the 2-week deadline after 50 users",
  ),
  docProbe(
    "dbx-doc-production",
    "Developer guide: production review rules",
    DEV_GUIDE,
    ["it will not be reviewed until your app has linked with at least 50 Dropbox users", "you can't change its name", "Request early review"],
    "Review waits for 50 users; name locks in production",
  ),
  docProbe(
    "dbx-doc-dev-tools",
    "Developer guide: developer tools need own keys",
    DEV_GUIDE,
    ["those developers must still sign up for their own Dropbox app key"],
    "Wrapping platforms' developers must use their own app key",
  ),
  docProbe(
    "dbx-doc-offline",
    "token_access_type=offline returns a refresh token",
    "https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization",
    ["token_access_type", "long-lived refresh_token", "defaults to online"],
    "Documents offline access and the online default",
  ),
  docProbe(
    "dbx-doc-scope-changes",
    "Scope changes don't touch existing grants",
    "https://dropbox.tech/developers/customizing-scopes-in-oauth-flow",
    ["preexisting grant doesn't automatically get that additional scope added"],
    "Blog says existing grants keep their old scopes",
  ),
  docProbe(
    "dbx-doc-free",
    "Dropbox API is free for developers",
    "https://www.dropbox.com/developers/support",
    ["There's no cost to you as the developer"],
    "Support FAQ says the API is free",
  ),
  {
    id: "dbx-contact",
    title: "API support contact form exists",
    request: "GET https://www.dropbox.com/developers/contact",
    expect: "Redirect to /login with cont= pointing back to the form",
    run: async () => {
      const r = await loginRedirect("https://www.dropbox.com/developers/contact")
      return { observed: `HTTP ${r.code}${r.keeps ? ", cont= kept" : ""}`, pass: r.keeps }
    },
  },
  {
    id: "dbx-forum",
    title: "Dropbox API support forum is live",
    request: "GET https://community.dropbox.com/en/categories/dropbox-api-support-feedback",
    expect: 'HTTP 200, "Dropbox API Support and Feedback"',
    run: async () => {
      const { code, url, html } = await page("https://community.dropbox.com/en/categories/dropbox-api-support-feedback", {
        headers: { "User-Agent": BROWSER_UA },
      })
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "no title"
      return { observed: `HTTP ${code}; ${url}; "${title}"`, pass: code === 200 && /Dropbox API Support/.test(title) }
    },
  },
]

export default probes

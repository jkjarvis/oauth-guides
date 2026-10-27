import { COMPOSIO_CALLBACK, composioProbes, json, page } from "./_lib.mjs"

const FAKE_CLIENT_ID = "fakefakefake0000"
const DOCS = "https://developers.zoom.us/docs"

// Fetches a docs page (Zoom serves .md versions) and reports which phrases it contains.
async function docHas(url, phrases) {
  const { code, html } = await page(url)
  const missing = phrases.filter((p) => !html.includes(p))
  return {
    observed: `HTTP ${code}; ${missing.length ? `missing: ${missing.map((m) => `"${m}"`).join(", ")}` : "all phrases found"}`,
    pass: code === 200 && missing.length === 0,
  }
}

const authorizeUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${FAKE_CLIENT_ID}&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}`

const STARTER_SCOPES = [
  "user:read:user",
  "meeting:read:meeting",
  "meeting:read:list_meetings",
  "meeting:write:meeting",
  "meeting:update:meeting",
  "meeting:delete:meeting",
  "cloud_recording:read:list_user_recordings",
]

const probes = [
  ...composioProbes("zoom"),
  {
    id: "marketplace-up",
    title: "Zoom App Marketplace is reachable",
    request: "GET https://marketplace.zoom.us/",
    expect: "HTTP 200",
    run: async () => {
      const { code } = await page("https://marketplace.zoom.us/")
      return { observed: `HTTP ${code}`, pass: code === 200 }
    },
  },
  {
    id: "create-app-doc",
    title: "Build flow labels match the docs",
    request: `GET ${DOCS}/integrations/create.md`,
    expect: "Build an app, General app, OAuth allow lists, Local Test, Add App Now",
    run: () =>
      docHas(`${DOCS}/integrations/create.md`, [
        "Build an app",
        "General app",
        "Admin-managed",
        "User-managed",
        "OAuth allow lists",
        "Local Test",
        "Add App Now",
      ]),
  },
  {
    id: "authorize-signin-first",
    title: "Authorize URL sends users to sign in first",
    request: `GET ${authorizeUrl}`,
    expect: "302 to zoom.us/oauth/signin, even for an unknown client ID",
    run: async () => {
      const res = await fetch(authorizeUrl, { redirect: "manual" })
      const loc = res.headers.get("location") ?? ""
      return {
        observed: `HTTP ${res.status} → ${loc.split("?")[0] || "no redirect"}`,
        pass: res.status === 302 && /zoom\.us\/oauth\/signin/.test(loc),
      }
    },
  },
  {
    id: "token-unknown-client",
    title: "Wrong client ID or secret is rejected",
    request: "POST https://zoom.us/oauth/token (Basic auth with fake client, fake code)",
    expect: 'invalid_client: "Invalid client_id or client_secret"',
    run: async () => {
      const { code, body } = await json("https://zoom.us/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${FAKE_CLIENT_ID}:wrong`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ grant_type: "authorization_code", code: "wrong", redirect_uri: COMPOSIO_CALLBACK }),
      })
      return {
        observed: `HTTP ${code}; ${body?.error}: ${body?.reason}`,
        pass: body?.error === "invalid_client" && /Invalid client_id or client_secret/.test(body?.reason ?? ""),
      }
    },
  },
  {
    id: "token-lifetimes",
    title: "Access 1 hour, refresh 90 days",
    request: `GET ${DOCS}/integrations/oauth.md`,
    expect: "Says access tokens expire after one hour and refresh tokens after 90 days",
    run: () => docHas(`${DOCS}/integrations/oauth.md`, ["expire after one hour", "Refresh tokens expire after 90 days"]),
  },
  {
    id: "granular-scopes",
    title: "Starter granular scopes exist",
    request: `GET ${DOCS}/integrations/oauth-scopes-granular.md`,
    expect: `Lists ${STARTER_SCOPES.length} starter scopes`,
    run: () => docHas(`${DOCS}/integrations/oauth-scopes-granular.md`, STARTER_SCOPES.map((s) => `\`${s}\``)),
  },
  {
    id: "classic-scopes-legacy",
    title: "Classic scopes are for existing apps",
    request: `GET ${DOCS}/integrations/oauth-scopes.md`,
    expect: "Says existing apps keep the macro scopes, now called classic",
    run: () => docHas(`${DOCS}/integrations/oauth-scopes.md`, ["Existing apps will continue to use the previously available macro scopes"]),
  },
  {
    id: "beta-sharing-rules",
    title: "Beta sharing: approval, 4 weeks, caps",
    request: `GET ${DOCS}/distribute/sharing-private-and-beta-apps.md`,
    expect: "Request to Share, 3-4 business days, 4 weeks, caps of 10 and 100",
    run: () =>
      docHas(`${DOCS}/distribute/sharing-private-and-beta-apps.md`, [
        "Request to Share",
        "3-4 business days",
        "4 weeks",
        "account-level application is 10",
        "user-level application is 100",
        "integration.testers@zoom.us",
      ]),
  },
  {
    id: "review-process",
    title: "Review includes OWASP security testing",
    request: `GET ${DOCS}/distribute/app-review-process.md`,
    expect: "Technical Design, OWASP Top 10, private and beta apps skip review",
    run: () =>
      docHas(`${DOCS}/distribute/app-review-process.md`, [
        "Technical Design",
        "OWASP Top 10",
        "Private and beta",
        "do not require review",
      ]),
  },
  {
    id: "submission-test-account",
    title: "Submission asks for reviewer test credentials",
    request: `GET ${DOCS}/distribute/app-submission/submit-apps-review.md`,
    expect: "Test account section; first submissions use the Production Client ID",
    run: () =>
      docHas(`${DOCS}/distribute/app-submission/submit-apps-review.md`, [
        "Test account and credentials",
        "Production Client ID",
        "test plan",
      ]),
  },
  {
    id: "domain-verification",
    title: "OAuth redirect domain must be verified",
    request: `GET ${DOCS}/distribute/app-submission/verify-domains.md`,
    expect: "Redirect URL for OAuth is checked; manual approval via devForum within 48 hours",
    run: () =>
      docHas(`${DOCS}/distribute/app-submission/verify-domains.md`, [
        "Redirect URL for OAuth",
        "Request manual approval from Zoom Support",
        "within 48 hours",
      ]),
  },
  {
    id: "zoom-devforum",
    title: "Zoom devForum Marketplace category exists",
    request: "GET https://devforum.zoom.us/categories.json",
    expect: "Category marketplace with id 19",
    run: async () => {
      const { code, body } = await json("https://devforum.zoom.us/categories.json")
      const cat = body?.category_list?.categories?.find((c) => c.slug === "marketplace")
      return { observed: `HTTP ${code}; ${cat ? `marketplace id ${cat.id}` : "no marketplace category"}`, pass: cat?.id === 19 }
    },
  },
]

export default probes

import { COMPOSIO_CALLBACK, composioProbes, dashboardRoute, json, page } from "./_lib.mjs"

// Graph API Explorer's App ID. It is public (it appears in every Explorer URL),
// so it stands in for "a real, valid App ID" that has not registered Composio's callback.
const REAL_APP_ID = "145634995501895"
const FAKE_APP_ID = "1000000000000001"
// Leading zeros make the ID malformed; the dialog rejects these before sign-in.
const MALFORMED_APP_ID = "0000000000000001"
const GRAPH_VERSION = "v26.0"

const dialogUrl = (id) =>
  `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?client_id=${id}&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}&scope=pages_show_list&state=probe`

async function location(url) {
  const res = await fetch(url, { redirect: "manual" })
  return { code: res.status, location: res.headers.get("location") ?? "" }
}

// Graph errors come back localised by IP; locale=en_US pins the English wording.
async function graphError(params) {
  const qs = new URLSearchParams({ ...params, locale: "en_US" })
  const { body } = await json(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${qs}`)
  return body?.error ?? null
}

async function titleOf(url) {
  const { code, html } = await page(url)
  return { code, title: html.match(/<title[^>]*>([^<]+)/)?.[1]?.trim() ?? "" }
}

const probes = [
  ...composioProbes("facebook"),
  {
    id: "composio-instagram-toolkit-page",
    title: "Composio instagram toolkit deep link exists",
    request: "GET https://dashboard.composio.dev/toolkits/instagram",
    expect: "Login redirect that keeps the path",
    run: async () => {
      const r = await dashboardRoute("/toolkits/instagram")
      return { observed: `HTTP ${r.code}${r.keepsPath ? ", next= kept" : ""}`, pass: r.keepsPath }
    },
  },
  {
    id: "graph-latest-version",
    title: `Latest Graph API version is ${GRAPH_VERSION}`,
    request: "GET https://developers.facebook.com/docs/graph-api/changelog",
    expect: `Changelog says the latest version is ${GRAPH_VERSION}`,
    run: async () => {
      const { html } = await page("https://developers.facebook.com/docs/graph-api/changelog")
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
      const v = text.match(/latest Graph API version is:?\s*(v\d+\.\d+)/i)?.[1] ?? null
      return { observed: v ? `latest: ${v}` : "version not found", pass: v === GRAPH_VERSION }
    },
  },
  {
    id: "dialog-malformed-app",
    title: "Malformed App ID is rejected by the login dialog",
    request: `GET ${dialogUrl(MALFORMED_APP_ID)}`,
    expect: "Redirect to /oauth/error/ with PLATFORM__INVALID_APP_ID",
    run: async () => {
      const r = await location(dialogUrl(MALFORMED_APP_ID))
      const err = new URL(r.location || "https://x.invalid").searchParams.get("error_code")
      return { observed: `HTTP ${r.code}, error_code=${err}`, pass: err === "PLATFORM__INVALID_APP_ID" }
    },
  },
  {
    id: "dialog-defers-check",
    title: "Dialog checks well-formed App IDs only after sign-in",
    request: `GET ${dialogUrl(FAKE_APP_ID)} and ${dialogUrl(REAL_APP_ID)}`,
    expect: "Both an unknown and a real App ID redirect to login.php",
    run: async () => {
      const fake = await location(dialogUrl(FAKE_APP_ID))
      const real = await location(dialogUrl(REAL_APP_ID))
      const ok = [fake, real].every((r) => r.location.includes("/login.php"))
      return { observed: `unknown → ${fake.location.includes("/login.php") ? "login.php" : "other"}; real → ${real.location.includes("/login.php") ? "login.php" : "other"}`, pass: ok }
    },
  },
  {
    id: "token-unknown-client",
    title: "Unknown App ID fails token exchange",
    request: `GET https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token (fake client_id)`,
    expect: "OAuthException code 101: Missing or invalid client id.",
    run: async () => {
      const e = await graphError({ client_id: FAKE_APP_ID, client_secret: "wrong", redirect_uri: COMPOSIO_CALLBACK, code: "wrong" })
      return { observed: e ? `code ${e.code}: ${e.message}` : "no error", pass: e?.code === 101 }
    },
  },
  {
    id: "token-unregistered-redirect",
    title: "Unregistered redirect URI fails with Can't load URL",
    request: `GET https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token (real app, Composio callback not registered)`,
    expect: "OAuthException code 191: Can't load URL: The domain of this URL isn't included…",
    run: async () => {
      const e = await graphError({ client_id: REAL_APP_ID, client_secret: "wrong", redirect_uri: COMPOSIO_CALLBACK, code: "wrong" })
      const ok = e?.code === 191 && /^Can't load URL/.test(e.message)
      return { observed: e ? `code ${e.code}: ${e.message.slice(0, 90)}` : "no error", pass: ok }
    },
  },
  {
    id: "token-wrong-secret",
    title: "Wrong App Secret is rejected",
    request: `GET https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token (real app, wrong secret, client_credentials)`,
    expect: "OAuthException code 1: Error validating client secret.",
    run: async () => {
      const e = await graphError({ client_id: REAL_APP_ID, client_secret: "wrong", grant_type: "client_credentials" })
      return { observed: e ? `code ${e.code}: ${e.message}` : "no error", pass: e?.code === 1 && /client secret/i.test(e.message) }
    },
  },
  {
    id: "oidc-id-token-only",
    title: "Facebook OIDC discovery is id_token only",
    request: "GET https://www.facebook.com/.well-known/openid-configuration",
    expect: "200; response_types has no code flow, so Composio uses plain OAuth 2.0",
    run: async () => {
      const { code, body } = await json("https://www.facebook.com/.well-known/openid-configuration")
      const types = body?.response_types_supported ?? []
      return { observed: `HTTP ${code}; response_types: ${types.join(", ")}`, pass: code === 200 && !types.includes("code") }
    },
  },
  {
    id: "ig-token-unknown-client",
    title: "Instagram Login rejects an unknown Instagram App ID",
    request: "POST https://api.instagram.com/oauth/access_token (fake client_id)",
    expect: 'error_message: "Invalid platform app"',
    run: async () => {
      const { body } = await json("https://api.instagram.com/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: FAKE_APP_ID,
          client_secret: "wrong",
          grant_type: "authorization_code",
          redirect_uri: COMPOSIO_CALLBACK,
          code: "wrong",
        }),
      })
      const msg = body?.error_message ?? "no error"
      return { observed: `error_message: ${msg}`, pass: msg === "Invalid platform app" }
    },
  },
  {
    id: "pages-usecase-doc",
    title: "Pages use-case doc names FLfB Settings → Redirect URI",
    request: "GET https://developers.facebook.com/documentation/pages-api/create-an-app.md",
    expect: "Mentions Manage everything on your Page, Facebook Login for Business, Redirect URI",
    run: async () => {
      const { code, html } = await page("https://developers.facebook.com/documentation/pages-api/create-an-app.md")
      const ok = ["Manage everything on your Page", "Facebook Login for Business", "Redirect URI", "Check URI"].every((s) => html.includes(s))
      return { observed: `HTTP ${code}; ${ok ? "all labels present" : "labels missing"}`, pass: ok }
    },
  },
  {
    id: "app-review-decision-wording",
    title: "App Review guide promises a decision within a week",
    request: "GET https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide.md",
    expect: 'Contains "receive a decision" … "within a week"',
    run: async () => {
      const { code, html } = await page(
        "https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide.md",
      )
      const ok = /receive a decision\]?\([^)]*\)?\s*within a week|receive a decision[^.]*within a week/i.test(html)
      return { observed: `HTTP ${code}; ${ok ? "wording present" : "wording missing"}`, pass: ok }
    },
  },
  {
    id: "meta-support-page",
    title: "Meta Developer Support page resolves",
    request: "GET https://developers.facebook.com/support/",
    expect: 'Title "Developer Support"',
    run: async () => {
      const r = await titleOf("https://developers.facebook.com/support/")
      return { observed: `HTTP ${r.code}; ${r.title}`, pass: r.code === 200 && /Developer Support/.test(r.title) }
    },
  },
  {
    id: "meta-bug-tool",
    title: "Meta bug-reporting tool resolves",
    request: "GET https://developers.facebook.com/support/bugs/",
    expect: 'Title "Platform Bug Reports"',
    run: async () => {
      const r = await titleOf("https://developers.facebook.com/support/bugs/")
      return { observed: `HTTP ${r.code}; ${r.title}`, pass: r.code === 200 && /Platform Bug Reports/.test(r.title) }
    },
  },
  {
    id: "meta-business-direct-support",
    title: "Meta Business direct support link exists",
    request: "GET https://business.facebook.com/direct-support/",
    expect: "Redirects to Business login with the path kept in next=",
    run: async () => {
      const r = await location("https://business.facebook.com/direct-support/")
      const next = r.location ? new URL(r.location, "https://business.facebook.com").searchParams.get("next") : null
      return { observed: `HTTP ${r.code}; next=${next}`, pass: r.code === 302 && next === "https://business.facebook.com/direct-support/" }
    },
  },
  {
    id: "meta-community-forum",
    title: "Meta Developer Community Forum resolves",
    request: "GET https://developers.facebook.com/community/",
    expect: 'Title "Developer Community Forum"',
    run: async () => {
      const r = await titleOf("https://developers.facebook.com/community/")
      return { observed: `HTTP ${r.code}; ${r.title}`, pass: r.code === 200 && /Developer Community Forum/.test(r.title) }
    },
  },
]

export default probes

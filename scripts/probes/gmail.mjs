import { COMPOSIO_CALLBACK, composioProbes, json, page, status } from "./_lib.mjs"

// Google Cloud SDK's (gcloud) installed-app client ID. It is public (shipped in the
// open-source gcloud CLI), so it stands in for "a real client that never registered
// Composio's callback". We only open the authorize URL; no secret, no sign-in.
const REAL_CLIENT_ID = "32555940559.apps.googleusercontent.com"
const FAKE_CLIENT_ID = "000000000000-fakefakefake.apps.googleusercontent.com"
const GMAIL_SEND = "https://www.googleapis.com/auth/gmail.send"

const authorizeUrl = (id, scope = GMAIL_SEND) =>
  `https://accounts.google.com/o/oauth2/v2/auth?client_id=${id}&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}&response_type=code&scope=${encodeURIComponent(scope)}`

// Google redirects authorize errors to /signin/oauth/error?authError=<base64url protobuf>.
// The error name (e.g. invalid_client) is a plain string inside that blob.
async function authorizeError(url) {
  const res = await fetch(url, { redirect: "manual" })
  const location = res.headers.get("location")
  if (!location) return `HTTP ${res.status}, no redirect`
  const blob = new URL(location).searchParams.get("authError")
  if (!blob) return `redirect without authError (${new URL(location).pathname})`
  const decoded = Buffer.from(blob.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1")
  return decoded.match(/[a-z_]{6,}/)?.[0] ?? "unreadable authError"
}

// Page text with tags stripped and whitespace collapsed, for wording checks.
async function text(url) {
  const { code, html } = await page(url, { headers: { "Accept-Language": "en-US" } })
  const t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
  return { code, t }
}

// Checks that a doc page still says each phrase (Google's own wording).
function wording(id, title, url, phrases) {
  return {
    id,
    title,
    request: `GET ${url}`,
    expect: phrases.map((p) => `"${p}"`).join(" + "),
    run: async () => {
      const { code, t } = await text(url)
      const missing = phrases.filter((p) => !t.toLowerCase().includes(p.toLowerCase()))
      return {
        observed: missing.length ? `HTTP ${code}; missing: ${missing.join(" | ")}` : `HTTP ${code}; all phrases present`,
        pass: code === 200 && missing.length === 0,
      }
    },
  }
}

const probes = [
  ...composioProbes("gmail"),
  {
    id: "oidc-discovery",
    title: "Google OIDC discovery lists the OAuth endpoints",
    request: "GET https://accounts.google.com/.well-known/openid-configuration",
    expect: "issuer accounts.google.com, /o/oauth2/v2/auth, oauth2.googleapis.com/token",
    run: async () => {
      const { code, body } = await json("https://accounts.google.com/.well-known/openid-configuration")
      const ok =
        body?.issuer === "https://accounts.google.com" &&
        body?.authorization_endpoint === "https://accounts.google.com/o/oauth2/v2/auth" &&
        body?.token_endpoint === "https://oauth2.googleapis.com/token"
      return { observed: `HTTP ${code}; issuer ${body?.issuer}; token ${body?.token_endpoint}`, pass: ok }
    },
  },
  {
    id: "gmail-api-scopes",
    title: "Gmail API exists and lists its scopes",
    request: "GET https://gmail.googleapis.com/$discovery/rest?version=v1",
    expect: "Discovery doc for gmail v1 with gmail.send, gmail.readonly, gmail.modify",
    run: async () => {
      const { code, body } = await json("https://gmail.googleapis.com/$discovery/rest?version=v1")
      const scopes = Object.keys(body?.auth?.oauth2?.scopes ?? {})
      const want = ["gmail.send", "gmail.readonly", "gmail.modify"].map((s) => `https://www.googleapis.com/auth/${s}`)
      const ok = body?.name === "gmail" && want.every((s) => scopes.includes(s))
      return { observed: `HTTP ${code}; ${body?.name} ${body?.version}; ${scopes.length} scopes`, pass: ok }
    },
  },
  {
    id: "scope-tiers",
    title: "Gmail scope tiers match the guide",
    request: "GET https://developers.google.com/workspace/gmail/api/auth/scopes",
    expect: "labels non-sensitive; send sensitive; readonly, modify, compose restricted",
    run: async () => {
      const { code, t } = await text("https://developers.google.com/workspace/gmail/api/auth/scopes")
      const s = t.indexOf("Sensitive scopes Scope code")
      const r = t.indexOf("Restricted scopes Scope code")
      const end = t.indexOf("indicate their sensitivity")
      if (s < 0 || r < 0 || end < 0) return { observed: `HTTP ${code}; scope tables not found`, pass: false }
      const nonSensitive = t.slice(0, s)
      const sensitive = t.slice(s, r)
      const restricted = t.slice(r, end)
      const has = (sec, scope) => sec.includes(`https://www.googleapis.com/auth/${scope} `)
      const checks = {
        "labels:non-sensitive": has(nonSensitive, "gmail.labels"),
        "send:sensitive": has(sensitive, "gmail.send"),
        "readonly:restricted": has(restricted, "gmail.readonly"),
        "modify:restricted": has(restricted, "gmail.modify"),
        "compose:restricted": has(restricted, "gmail.compose"),
        "mail.google.com:restricted": restricted.includes("https://mail.google.com/"),
      }
      const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
      return { observed: failed.length ? `mismatch: ${failed.join(", ")}` : "all six tiers as expected", pass: failed.length === 0 }
    },
  },
  {
    id: "authorize-unknown-client",
    title: "Unknown client ID fails with invalid_client",
    request: `GET ${authorizeUrl(FAKE_CLIENT_ID)}`,
    expect: "Redirect to /signin/oauth/error carrying invalid_client",
    run: async () => {
      const err = await authorizeError(authorizeUrl(FAKE_CLIENT_ID))
      return { observed: `authError: ${err}`, pass: err === "invalid_client" }
    },
  },
  {
    id: "authorize-redirect-mismatch",
    title: "Unregistered redirect URI fails by name",
    request: `GET ${authorizeUrl(REAL_CLIENT_ID, "openid")}`,
    expect: "Redirect to /signin/oauth/error carrying redirect_uri_mismatch",
    run: async () => {
      const err = await authorizeError(authorizeUrl(REAL_CLIENT_ID, "openid"))
      return { observed: `authError: ${err}`, pass: err === "redirect_uri_mismatch" }
    },
  },
  {
    id: "token-unknown-client",
    title: "Token endpoint rejects unknown clients by name",
    request: "POST https://oauth2.googleapis.com/token (fake client_id and secret)",
    expect: "error: invalid_client",
    run: async () => {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "wrong",
          client_id: FAKE_CLIENT_ID,
          client_secret: "wrong",
          redirect_uri: COMPOSIO_CALLBACK,
        }),
      })
      let body = {}
      try {
        body = await res.json()
      } catch {}
      return { observed: `HTTP ${res.status}; error: ${body.error ?? "none"}`, pass: body.error === "invalid_client" }
    },
  },
  {
    id: "cloud-console",
    title: "Google Cloud console is reachable",
    request: "GET https://console.cloud.google.com/apis/credentials",
    expect: "Redirects to Google sign-in, keeping the console path",
    run: async () => {
      const res = await fetch("https://console.cloud.google.com/apis/credentials", { redirect: "manual" })
      const location = res.headers.get("location") ?? ""
      const keeps = location.includes("accounts.google.com") && location.includes("console.cloud.google.com/apis/credentials")
      return { observed: `HTTP ${res.status}${keeps ? ", sign-in with continue= kept" : ""}`, pass: keeps }
    },
  },
  {
    id: "verification-center",
    title: "Verification Center link from Google's docs resolves",
    request: "GET https://console.developers.google.com/auth/verification",
    expect: "Redirects to console.cloud.google.com/auth/verification",
    run: async () => {
      const res = await fetch("https://console.developers.google.com/auth/verification", { redirect: "manual" })
      const location = res.headers.get("location") ?? ""
      return {
        observed: `HTTP ${res.status} → ${location.slice(0, 80)}`,
        pass: location.startsWith("https://console.cloud.google.com/auth/verification"),
      }
    },
  },
  wording(
    "testing-refresh-7-days",
    "Testing-mode refresh tokens expire in 7 days",
    "https://developers.google.com/identity/protocols/oauth2",
    ['publishing status of "Testing" is issued a refresh token expiring in 7 days'],
  ),
  wording(
    "test-user-cap",
    "Testing mode allows up to 100 test users",
    "https://support.google.com/cloud/answer/15549945?hl=en",
    ["limited to up to 100 test users", "expire seven days from the time of consent"],
  ),
  wording(
    "unverified-user-cap",
    "Unverified apps are capped at 100 new users",
    "https://support.google.com/cloud/answer/7454865?hl=en",
    ["100 new users in total", "unverified app"],
  ),
  wording(
    "client-secret-once",
    "Client secret is shown only at creation",
    "https://support.google.com/cloud/answer/15549257?hl=en",
    ["client secret will only be shown after you create the client", "Add Secret"],
  ),
  wording(
    "brand-review-time",
    "Brand verification timing as stated",
    "https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification",
    ["typically takes a few minutes", "usually takes 2-3 business days"],
  ),
  wording(
    "sensitive-review-time",
    "Sensitive scope review timing as stated",
    "https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification",
    ["typically takes 3-5 business days", "Unlisted"],
  ),
  wording(
    "restricted-review-time",
    "Restricted scope review timing as stated",
    "https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification",
    ["can potentially take several weeks", "annual security assessment"],
  ),
  wording(
    "faq-estimates",
    "Verification FAQ estimates and fee statement",
    "https://support.google.com/cloud/answer/13463817?hl=en",
    ["10 Business days", "6 weeks", "Google does not charge the developer any fees for security assessment"],
  ),
  wording(
    "casa-page",
    "CASA framework page resolves",
    "https://appdefensealliance.dev/casa",
    ["Cloud Application Security Assessment"],
  ),
  {
    id: "oauth-help-center",
    title: "OAuth App Verification Help Center resolves",
    request: "GET https://support.google.com/cloud/answer/13463073?hl=en",
    expect: "HTTP 200 with the help center title",
    run: async () => {
      const { code, t } = await text("https://support.google.com/cloud/answer/13463073?hl=en")
      const ok = code === 200 && t.includes("OAuth App Verification Help Center")
      return { observed: `HTTP ${code}${ok ? ", title present" : ""}`, pass: ok }
    },
  },
  {
    id: "cloud-support-page",
    title: "Google Cloud support page resolves",
    request: "GET https://cloud.google.com/support",
    expect: "HTTP 200",
    run: async () => {
      const code = await status("https://cloud.google.com/support")
      return { observed: `HTTP ${code}`, pass: code === 200 }
    },
  },
]

export default probes

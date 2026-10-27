import { COMPOSIO_CALLBACK, composioProbes, json, page, status } from "./_lib.mjs"

// A random GUID that no app registration uses.
const FAKE_CLIENT_ID = "3f1c2a9e-7b4d-4e8a-9c21-5d6e7f8a9b0c"
// Microsoft Graph's own app ID. Public and confidential, so a wrong secret
// gets the same answer your app gets.
const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000"
// Microsoft's portals block non-browser user agents with a 403.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"

const LOGIN = "https://login.microsoftonline.com"

async function tokenError(tenant, clientId) {
  const res = await fetch(`${LOGIN}/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: "wrong",
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  })
  const body = await res.json()
  return { code: body.error_codes?.[0] ?? null, error: body.error, description: body.error_description ?? "" }
}

const authorizeUrl = `${LOGIN}/common/oauth2/v2.0/authorize?client_id=${FAKE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}&scope=${encodeURIComponent("offline_access User.Read Mail.Read")}`

const probes = [
  ...composioProbes("outlook"),
  {
    id: "oidc-common",
    title: "Multi-tenant sign-in endpoints exist",
    request: `GET ${LOGIN}/common/v2.0/.well-known/openid-configuration`,
    expect: "common authorize + token endpoints; issuer has a {tenantid} slot",
    run: async () => {
      const { code, body } = await json(`${LOGIN}/common/v2.0/.well-known/openid-configuration`)
      const ok =
        body?.authorization_endpoint === `${LOGIN}/common/oauth2/v2.0/authorize` &&
        body?.token_endpoint === `${LOGIN}/common/oauth2/v2.0/token` &&
        /\{tenantid\}/.test(body?.issuer ?? "")
      return { observed: `HTTP ${code}; issuer ${body?.issuer ?? "missing"}`, pass: ok }
    },
  },
  {
    id: "authorize-signin-first",
    title: "Authorize page asks for sign-in first",
    request: `GET ${authorizeUrl}`,
    expect: "Sign-in page, no AADSTS error before a user signs in",
    run: async () => {
      const { code, html } = await page(authorizeUrl, { headers: { "User-Agent": BROWSER_UA } })
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "no title"
      const aadsts = html.match(/AADSTS\d+/)?.[0]
      return {
        observed: `HTTP ${code}; "${title}"${aadsts ? `; ${aadsts}` : "; no AADSTS code"}`,
        pass: code === 200 && /sign in/i.test(title) && !aadsts,
      }
    },
  },
  {
    id: "token-wrong-secret",
    title: "Wrong secret is rejected by code",
    request: `POST ${LOGIN}/organizations/oauth2/v2.0/token (real app ID, wrong secret)`,
    expect: "AADSTS7000215, hinting at the secret Value vs Secret ID",
    run: async () => {
      const r = await tokenError("organizations", GRAPH_APP_ID)
      const hint = /value, not the client secret ID/i.test(r.description)
      return {
        observed: `${r.error}: AADSTS${r.code}${hint ? ", says use the Value not the Secret ID" : ""}`,
        pass: r.code === 7000215 && hint,
      }
    },
  },
  {
    id: "token-unknown-client",
    title: "Unknown client ID is rejected by code",
    request: `POST ${LOGIN}/consumers/oauth2/v2.0/token (random client_id)`,
    expect: "AADSTS700016: application not found",
    run: async () => {
      const r = await tokenError("consumers", FAKE_CLIENT_ID)
      return { observed: `${r.error}: AADSTS${r.code}`, pass: r.code === 700016 }
    },
  },
  {
    id: "adminconsent-endpoint",
    title: "Admin consent URL opens a sign-in page",
    request: `GET ${LOGIN}/organizations/adminconsent?client_id=${FAKE_CLIENT_ID}`,
    expect: "200 sign-in page (the admin signs in first)",
    run: async () => {
      const { code, html } = await page(`${LOGIN}/organizations/adminconsent?client_id=${FAKE_CLIENT_ID}`, {
        headers: { "User-Agent": BROWSER_UA },
      })
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "no title"
      return { observed: `HTTP ${code}; "${title}"`, pass: code === 200 && /sign in/i.test(title) }
    },
  },
  {
    id: "entra-admin-center",
    title: "Microsoft Entra admin center is reachable",
    request: "GET https://entra.microsoft.com/ (browser user agent)",
    expect: "HTTP 200",
    run: async () => {
      const code = await status("https://entra.microsoft.com/", { headers: { "User-Agent": BROWSER_UA } })
      return { observed: `HTTP ${code}`, pass: code === 200 }
    },
  },
  {
    id: "managed-consent-policy",
    title: "Managed consent policy blocks Mail.Read",
    request: "GET https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies",
    expect: "Microsoft-managed policy's EXCEPT list includes Mail.Read and Calendars.Read",
    run: async () => {
      const { code, html } = await page(
        "https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/manage-app-consent-policies",
      )
      const section = html.match(/Let Microsoft manage your consent settings[\s\S]{0,4000}/)?.[0] ?? ""
      const text = section.replace(/<[^>]+>/g, "")
      const mail = /\bMail\.Read,/.test(text)
      const cal = /\bCalendars\.Read,/.test(text)
      return {
        observed: `HTTP ${code}; Mail.Read ${mail ? "listed" : "missing"}; Calendars.Read ${cal ? "listed" : "missing"}`,
        pass: code === 200 && mail && cal,
      }
    },
  },
  {
    id: "qa-entra-tag",
    title: "Microsoft Q&A Entra ID tag is live",
    request: "GET https://learn.microsoft.com/en-us/answers/tags/455/microsoft-security-entra-entra-id",
    expect: "200, tag page titled Microsoft Entra ID",
    run: async () => {
      const { code, html } = await page("https://learn.microsoft.com/en-us/answers/tags/455/microsoft-security-entra-entra-id", {
        headers: { "User-Agent": BROWSER_UA },
      })
      const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "no title"
      return { observed: `HTTP ${code}; "${title}"`, pass: code === 200 && /Entra ID/.test(title) }
    },
  },
  {
    id: "partner-center-support",
    title: "Partner Center support page resolves",
    request: "GET https://learn.microsoft.com/en-us/partner-center/support/report-problems-with-partner-center",
    expect: "200, describes Contact Support in Partner Center",
    run: async () => {
      const { code, html } = await page(
        "https://learn.microsoft.com/en-us/partner-center/support/report-problems-with-partner-center",
      )
      return { observed: `HTTP ${code}`, pass: code === 200 && /Contact Support/.test(html) }
    },
  },
]

export default probes

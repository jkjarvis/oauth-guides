import { COMPOSIO_CALLBACK, composioProbes, json, page } from "./_lib.mjs"

const FAKE_CLIENT_ID = "00000000-0000-0000-0000-000000000000"
const DOCS = "https://developers.hubspot.com/docs/apps"

// Fetches a docs page (HubSpot serves .md versions) and reports which phrases it contains.
async function docHas(url, phrases) {
  const { code, html } = await page(url)
  const missing = phrases.filter((p) => !html.includes(p))
  return {
    observed: `HTTP ${code}; ${missing.length ? `missing: ${missing.map((m) => `"${m}"`).join(", ")}` : "all phrases found"}`,
    pass: code === 200 && missing.length === 0,
  }
}

async function tokenError(body) {
  return json("https://api.hubapi.com/oauth/v3/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  })
}

const authorizeUrl = `https://app.hubspot.com/oauth/authorize?client_id=${FAKE_CLIENT_ID}&scope=oauth&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}`

const probes = [
  ...composioProbes("hubspot"),
  {
    id: "cli-on-npm",
    title: "HubSpot CLI is published on npm",
    request: "GET https://registry.npmjs.org/@hubspot/cli/latest",
    expect: "A version at or above 8.16.0 (the docs' recommended version)",
    run: async () => {
      const { code, body } = await json("https://registry.npmjs.org/@hubspot/cli/latest")
      const [major, minor] = (body?.version ?? "0.0").split(".").map(Number)
      return { observed: `HTTP ${code}; latest ${body?.version ?? "missing"}`, pass: major > 8 || (major === 8 && minor >= 16) }
    },
  },
  {
    id: "create-app-doc",
    title: "Create-an-app doc uses hs project create",
    request: `GET ${DOCS}/developer-platform/build-apps/create-an-app.md`,
    expect: "Mentions hs project create, hs project upload and Client credentials",
    run: () =>
      docHas(`${DOCS}/developer-platform/build-apps/create-an-app.md`, [
        "hs project create",
        "hs project upload",
        "Client credentials",
      ]),
  },
  {
    id: "legacy-apps-closed",
    title: "Legacy public apps can't be created",
    request: `GET ${DOCS}/legacy-apps/public-apps/overview.md`,
    expect: 'Says legacy public apps "can no longer be created"',
    run: () => docHas(`${DOCS}/legacy-apps/public-apps/overview.md`, ["can no longer be created"]),
  },
  {
    id: "redirect-https-rule",
    title: "Redirect URLs must use HTTPS",
    request: `GET ${DOCS}/developer-platform/build-apps/app-configuration.md`,
    expect: "redirectUrls rule says HTTPS (localhost excepted)",
    run: () => docHas(`${DOCS}/developer-platform/build-apps/app-configuration.md`, ["redirectUrls", "Must use HTTPS", "requiredScopes", "optionalScopes"]),
  },
  {
    id: "authorize-signin-first",
    title: "Authorize URL loads the sign-in app",
    request: `GET ${authorizeUrl}`,
    expect: "HTTP 200 oauth-ui page; client ID is checked only after sign-in",
    run: async () => {
      const { code, html } = await page(authorizeUrl)
      const ui = /__hsipltan = "oauth-ui"/.test(html)
      return { observed: `HTTP ${code}${ui ? "; oauth-ui app" : "; no oauth-ui marker"}`, pass: code === 200 && ui }
    },
  },
  {
    id: "token-endpoint-v3",
    title: "Token endpoint is /oauth/v3/token",
    request: "POST https://api.hubapi.com/oauth/v3/token (fake client, fake code)",
    expect: "400 invalid_request with HubSpot status BAD_AUTH_CODE",
    run: async () => {
      const { code, body } = await tokenError({
        grant_type: "authorization_code",
        client_id: FAKE_CLIENT_ID,
        client_secret: "wrong",
        code: "wrong",
        redirect_uri: COMPOSIO_CALLBACK,
      })
      return { observed: `HTTP ${code}; ${body?.error}: ${body?.status}`, pass: code === 400 && body?.status === "BAD_AUTH_CODE" }
    },
  },
  {
    id: "refresh-bad-token",
    title: "Bad refresh token is rejected by name",
    request: "POST https://api.hubapi.com/oauth/v3/token (grant_type=refresh_token, fake token)",
    expect: "400 with status BAD_REFRESH_TOKEN",
    run: async () => {
      const { code, body } = await tokenError({
        grant_type: "refresh_token",
        client_id: FAKE_CLIENT_ID,
        client_secret: "wrong",
        refresh_token: "wrong",
      })
      return { observed: `HTTP ${code}; ${body?.status}`, pass: code === 400 && body?.status === "BAD_REFRESH_TOKEN" }
    },
  },
  {
    id: "install-limits",
    title: "Install limits: 10 private, 25 unlisted",
    request: `GET ${DOCS}/developer-platform/build-apps/manage-apps-in-hubspot.md`,
    expect: "States 10 allowlisted accounts and 25 accounts before listing",
    run: () =>
      docHas(`${DOCS}/developer-platform/build-apps/manage-apps-in-hubspot.md`, [
        "up to 10 allowlisted accounts",
        "up to 25 accounts",
        "currently has access to",
        "Begin publishing",
        "I accept the risk",
      ]),
  },
  {
    id: "solutions-partner-cap",
    title: "Solutions Partner private cap is 100",
    request: "GET https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits",
    expect: "Changelog says 25 until listed and 100 for Solution Partners",
    run: () =>
      docHas("https://developers.hubspot.com/changelog/new-marketplace-distribution-app-install-limits", [
        "25 installs",
        "100",
        "Solution",
      ]),
  },
  {
    id: "listing-requirements",
    title: "Listing needs 3 active installs",
    request: `GET ${DOCS}/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements.md`,
    expect: "Three active installs; initial review within 10 business days",
    run: () =>
      docHas(`${DOCS}/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements.md`, [
        "three active",
        "10 business days",
        "60 days",
      ]),
  },
  {
    id: "ai-connector-rule",
    title: "AI connectors need user-level permissions",
    request: `GET ${DOCS}/developer-platform/list-apps/listing-your-app/marketplace-restrictions.md`,
    expect: "Says such apps must enforce user-level permissions",
    run: () =>
      docHas(`${DOCS}/developer-platform/list-apps/listing-your-app/marketplace-restrictions.md`, [
        "must enforce user-level permissions",
        "Standard OAuth tokens are not sufficient",
      ]),
  },
  {
    id: "hubspot-dev-forum",
    title: "HubSpot points developers to its forum",
    request: "GET https://developers.hubspot.com/community",
    expect: "Links to community.hubspot.com/c/develop-build-integrate/58",
    run: () => docHas("https://developers.hubspot.com/community", ["community.hubspot.com/c/develop-build-integrate/58"]),
  },
]

export default probes

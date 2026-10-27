import { COMPOSIO_CALLBACK, composioProbes, page, status } from "./_lib.mjs"

// GitHub CLI's OAuth App client ID. It is public (shipped in the gh source),
// so it stands in for "a real, valid Client ID".
const REAL_CLIENT_ID = "178c6fc778ccc68e1d6a"
const FAKE_CLIENT_ID = "fakefakefake00000000"

const authorizeUrl = (id) =>
  `https://github.com/login/oauth/authorize?client_id=${id}&scope=repo&redirect_uri=${encodeURIComponent(COMPOSIO_CALLBACK)}`

async function pageAppName(url) {
  const { html } = await page(url)
  return html.match(/continue to <strong>([^<]+)<\/strong>/)?.[1] ?? null
}

async function tokenError(clientId) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: "wrong", code: "wrong" }),
  })
  return (await res.json()).error ?? `HTTP ${res.status}`
}

const probes = [
  ...composioProbes("github"),
  {
    id: "authorize-valid-client",
    title: "Valid Client ID shows the app name",
    request: `GET ${authorizeUrl(REAL_CLIENT_ID)}`,
    expect: 'Sign-in page says "continue to <app name>"',
    run: async () => {
      const name = await pageAppName(authorizeUrl(REAL_CLIENT_ID))
      return { observed: name ? `continue to "${name}"` : "no app name on page", pass: name !== null }
    },
  },
  {
    id: "authorize-unknown-client",
    title: "Unknown Client ID shows no app name",
    request: `GET ${authorizeUrl(FAKE_CLIENT_ID)}`,
    expect: "Generic sign-in page, no app name",
    run: async () => {
      const name = await pageAppName(authorizeUrl(FAKE_CLIENT_ID))
      return { observed: name ? `continue to "${name}"` : "generic sign-in page", pass: name === null }
    },
  },
  {
    id: "token-wrong-secret",
    title: "Wrong secret is rejected by name",
    request: "POST https://github.com/login/oauth/access_token (real client_id, wrong secret)",
    expect: "error: incorrect_client_credentials",
    run: async () => {
      const err = await tokenError(REAL_CLIENT_ID)
      return { observed: `error: ${err}`, pass: err === "incorrect_client_credentials" }
    },
  },
  {
    id: "token-unknown-client",
    title: "Unknown Client ID returns Not Found",
    request: "POST https://github.com/login/oauth/access_token (fake client_id)",
    expect: "error: Not Found",
    run: async () => {
      const err = await tokenError(FAKE_CLIENT_ID)
      return { observed: `error: ${err}`, pass: err === "Not Found" }
    },
  },
  {
    id: "new-app-page",
    title: "Registration page exists",
    request: "GET https://github.com/settings/applications/new",
    expect: "Redirects to sign-in (page needs a logged-in user)",
    run: async () => {
      const code = await status("https://github.com/settings/applications/new")
      return { observed: `HTTP ${code}`, pass: code === 302 }
    },
  },
  {
    id: "no-oidc",
    title: "No OIDC discovery document",
    request: "GET https://github.com/.well-known/openid-configuration",
    expect: "404: plain OAuth 2.0, no ID tokens",
    run: async () => {
      const code = await status("https://github.com/.well-known/openid-configuration")
      return { observed: `HTTP ${code}`, pass: code === 404 }
    },
  },
  {
    id: "github-support-page",
    title: "GitHub Support contact page resolves",
    request: "GET https://support.github.com/contact",
    expect: "Redirects to the support request page",
    run: async () => {
      const code = await status("https://support.github.com/contact")
      return { observed: `HTTP ${code}`, pass: code >= 200 && code < 400 }
    },
  },
]

export default probes

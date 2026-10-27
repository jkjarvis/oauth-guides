// Runs credential-free checks against GitHub and Composio, and writes the results
// to src/data/probes/github.json. The guide cites these as "tested" evidence.
// Usage: npm run probe
import { writeFile, mkdir } from "node:fs/promises"

// GitHub CLI's OAuth App client ID. It is public (shipped in the gh source),
// so it stands in for "a real, valid Client ID".
const REAL_CLIENT_ID = "178c6fc778ccc68e1d6a"
const FAKE_CLIENT_ID = "fakefakefake00000000"
const CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback"

const authorizeUrl = (id) =>
  `https://github.com/login/oauth/authorize?client_id=${id}&scope=repo&redirect_uri=${encodeURIComponent(CALLBACK)}`

async function pageAppName(url) {
  const res = await fetch(url, { redirect: "follow" })
  const html = await res.text()
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

async function status(url) {
  const res = await fetch(url, { redirect: "manual" })
  return res.status
}

// Composio's dashboard sends real routes to login with ?next=<path> and 404s unknown ones,
// so a login redirect that keeps the path shows the deep link exists.
async function dashboardRoute(path) {
  const res = await fetch(`https://dashboard.composio.dev${path}`, { redirect: "manual" })
  const location = res.headers.get("location")
  const next = location ? new URL(location, "https://dashboard.composio.dev").searchParams.get("next") : null
  return { code: res.status, keepsPath: next === path }
}

const probes = [
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
    id: "composio-callback",
    title: "Composio callback URL is live",
    request: `GET ${CALLBACK}`,
    expect: "Responds (redirect), not 404",
    run: async () => {
      const code = await status(CALLBACK)
      return { observed: `HTTP ${code}`, pass: code !== 404 && code < 500 }
    },
  },
  {
    id: "composio-dashboard-login",
    title: "Composio sign-up is on the login page",
    request: "GET https://dashboard.composio.dev/login",
    expect: "Sign-in page with a sign-up link",
    run: async () => {
      const html = await (await fetch("https://dashboard.composio.dev/login")).text()
      const hasSignUp = /href="\/sign-up/.test(html)
      return { observed: hasSignUp ? "sign-up link present" : "no sign-up link", pass: hasSignUp }
    },
  },
  {
    id: "composio-api-keys-page",
    title: "API keys deep link exists",
    request: "GET https://dashboard.composio.dev/~/project/settings/api-keys",
    expect: "Login redirect that keeps the path",
    run: async () => {
      const r = await dashboardRoute("/~/project/settings/api-keys")
      return { observed: `HTTP ${r.code}${r.keepsPath ? ", next= kept" : ""}`, pass: r.keepsPath }
    },
  },
  {
    id: "composio-github-toolkit-page",
    title: "GitHub toolkit deep link exists",
    request: "GET https://dashboard.composio.dev/toolkits/github (control: /toolkits)",
    expect: "Login redirect that keeps the path; control 404s",
    run: async () => {
      const r = await dashboardRoute("/toolkits/github")
      const control = await dashboardRoute("/toolkits")
      return {
        observed: `HTTP ${r.code}${r.keepsPath ? ", next= kept" : ""}; control HTTP ${control.code}`,
        pass: r.keepsPath && control.code === 404,
      }
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
]

const ranAt = new Date().toISOString()
const results = []
for (const p of probes) {
  let outcome
  try {
    outcome = await p.run()
  } catch (e) {
    outcome = { observed: `failed: ${e.message}`, pass: false }
  }
  results.push({ id: p.id, title: p.title, request: p.request, expect: p.expect, ...outcome, ranAt })
  console.log(`${outcome.pass ? "PASS" : "FAIL"}  ${p.id}  ${outcome.observed}`)
}

await mkdir("src/data/probes", { recursive: true })
await writeFile("src/data/probes/github.json", JSON.stringify({ guide: "github", ranAt, results }, null, 2) + "\n")

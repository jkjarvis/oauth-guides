// Shared helpers for credential-free probes. Each provider file in this folder
// exports a default array of { id, title, request, expect, run } objects.

export const COMPOSIO_CALLBACK = "https://backend.composio.dev/api/v3/toolkits/auth/callback"

// HTTP status without following redirects.
export async function status(url, init = {}) {
  const res = await fetch(url, { redirect: "manual", ...init })
  return res.status
}

// Final status and body after following redirects.
export async function page(url, init = {}) {
  const res = await fetch(url, { redirect: "follow", ...init })
  return { code: res.status, url: res.url, html: await res.text() }
}

export async function json(url, init = {}) {
  const res = await fetch(url, init)
  let body = null
  try {
    body = await res.json()
  } catch {}
  return { code: res.status, body }
}

// Composio's dashboard sends real routes to login with ?next=<path> and 404s unknown ones,
// so a login redirect that keeps the path shows the deep link exists.
export async function dashboardRoute(path) {
  const res = await fetch(`https://dashboard.composio.dev${path}`, { redirect: "manual" })
  const location = res.headers.get("location")
  const next = location ? new URL(location, "https://dashboard.composio.dev").searchParams.get("next") : null
  return { code: res.status, keepsPath: next === path }
}

// Probes every guide shares: Composio's callback, sign-up, API keys page, and the toolkit deep link.
export function composioProbes(toolkit) {
  return [
    {
      id: "composio-callback",
      title: "Composio callback URL is live",
      request: `GET ${COMPOSIO_CALLBACK}`,
      expect: "Responds (redirect), not 404",
      run: async () => {
        const code = await status(COMPOSIO_CALLBACK)
        return { observed: `HTTP ${code}`, pass: code !== 404 && code < 500 }
      },
    },
    {
      id: "composio-dashboard-login",
      title: "Composio sign-up is on the login page",
      request: "GET https://dashboard.composio.dev/login",
      expect: "Sign-in page with a sign-up link",
      run: async () => {
        const { html } = await page("https://dashboard.composio.dev/login")
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
      id: "composio-toolkit-page",
      title: `Composio ${toolkit} toolkit deep link exists`,
      request: `GET https://dashboard.composio.dev/toolkits/${toolkit} (control: /toolkits)`,
      expect: "Login redirect that keeps the path; control 404s",
      run: async () => {
        const r = await dashboardRoute(`/toolkits/${toolkit}`)
        const control = await dashboardRoute("/toolkits")
        return {
          observed: `HTTP ${r.code}${r.keepsPath ? ", next= kept" : ""}; control HTTP ${control.code}`,
          pass: r.keepsPath && control.code === 404,
        }
      },
    },
    {
      id: "composio-discord",
      title: "Composio Discord invite resolves",
      request: "GET https://discord.gg/composio",
      expect: "Redirects to a Discord invite",
      run: async () => {
        const code = await status("https://discord.gg/composio")
        return { observed: `HTTP ${code}`, pass: code >= 300 && code < 400 }
      },
    },
  ]
}

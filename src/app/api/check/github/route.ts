import type { NextRequest } from "next/server"

// Checks a GitHub OAuth App Client ID without credentials: GitHub's sign-in page
// names the app ("continue to <name>") only when the Client ID is real.
// The client secret is never sent here.
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("client_id")?.trim() ?? ""
  if (!/^[A-Za-z0-9._-]{10,40}$/.test(clientId)) {
    return Response.json({ valid: false, reason: "That doesn't look like a Client ID." }, { status: 400 })
  }

  const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&scope=read:user`
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-store" })
    const html = await res.text()
    const raw = html.match(/continue to <strong>([^<]+)<\/strong>/)?.[1]
    const appName = raw ? decodeEntities(raw) : null
    return Response.json(
      appName
        ? { valid: true, appName, checkedAt: new Date().toISOString() }
        : { valid: false, reason: "GitHub doesn't recognise this Client ID.", checkedAt: new Date().toISOString() },
    )
  } catch {
    return Response.json({ valid: false, reason: "Couldn't reach GitHub. Try again." }, { status: 502 })
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

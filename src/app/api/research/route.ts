import type { NextRequest } from "next/server"
import { runResearch, type ResearchEvent } from "@/lib/research/agent"

export const maxDuration = 300

// Each run costs real money, so cap it per instance. Best effort: limits reset when an instance recycles.
const MAX_CONCURRENT = 4
const MAX_PER_IP_PER_HOUR = 6
let running = 0
const recent = new Map<string, number[]>()

function allow(ip: string) {
  const hourAgo = Date.now() - 3_600_000
  const hits = (recent.get(ip) ?? []).filter((t) => t > hourAgo)
  if (hits.length >= MAX_PER_IP_PER_HOUR) return false
  recent.set(ip, [...hits, Date.now()])
  return true
}

// Streams research progress as newline-delimited JSON events.
export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "The research agent isn't configured yet (missing ANTHROPIC_API_KEY)." }, { status: 503 })
  }
  const body = (await request.json().catch(() => null)) as { app?: unknown } | null
  const app = typeof body?.app === "string" ? body.app.trim() : ""
  if (app.length < 2 || app.length > 120) {
    return Response.json({ error: "Enter an app name or website (2–120 characters)." }, { status: 400 })
  }

  if (running >= MAX_CONCURRENT) {
    return Response.json({ error: "The research agent is busy with other guides. Try again in a few minutes." }, { status: 429 })
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!allow(ip)) {
    return Response.json({ error: "You've generated several guides in the last hour. Try again later." }, { status: 429 })
  }

  running++
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ResearchEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"))
      try {
        await runResearch(app, emit, request.signal)
      } catch (e) {
        emit({ type: "error", message: (e as Error).message || "Research failed." })
      } finally {
        running--
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}

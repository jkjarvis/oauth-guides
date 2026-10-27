import type { NextRequest } from "next/server"
import { runResearch, type ResearchEvent } from "@/lib/research/agent"

export const maxDuration = 300

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

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ResearchEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"))
      try {
        await runResearch(app, emit, request.signal)
      } catch (e) {
        emit({ type: "error", message: (e as Error).message || "Research failed." })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}

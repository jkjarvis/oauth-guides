import { Guide, ProbeResult, type ProbeResult as Probe } from "@/lib/guide-schema"
import { z } from "zod"

// A shared guide lives entirely in the link's #fragment (compressed), so sharing needs no storage
// and the fragment never reaches a server.
const Payload = z.object({ guide: Guide, probes: z.array(ProbeResult), generatedAt: z.string().optional() })
export type SharePayload = z.infer<typeof Payload>

function toBase64Url(bytes: Uint8Array) {
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function fromBase64Url(s: string) {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export async function encodeShare(guide: Guide, probes: Probe[], generatedAt: string) {
  // Only the checks the guide cites travel with it.
  const cited = new Set([...guide.steps.flatMap((s) => s.checks), ...guide.contacts.flatMap((c) => c.checks)])
  const json = JSON.stringify({ guide, probes: probes.filter((p) => cited.has(p.id)), generatedAt })
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream("deflate-raw"))
  return toBase64Url(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export async function decodeShare(fragment: string): Promise<SharePayload> {
  const stream = new Blob([fromBase64Url(fragment)]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  return Payload.parse(JSON.parse(await new Response(stream).text()))
}

import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { Guide, type ProbeResult } from "@/lib/guide-schema"
import { SYSTEM_PROMPT, userMessage } from "@/lib/research/prompt"
import {
  COMPOSIO_CALLBACK,
  composioBaseProbes,
  composioToolkit,
  describeExpect,
  httpProbe,
  judge,
  observe,
  type ToolkitInfo,
} from "@/lib/research/probe"

export type ResearchEvent =
  | { type: "status"; message: string }
  | { type: "toolkit"; info: ToolkitInfo }
  | { type: "search"; query: string }
  | { type: "read"; url: string; title?: string; ok: boolean }
  | { type: "probe"; result: ProbeResult }
  | { type: "submit"; ok: boolean; errors: string[] }
  | { type: "done"; guide: Guide; probes: ProbeResult[]; seconds: number }
  | { type: "error"; message: string }

const MODEL = "claude-opus-5-5"
// Vercel functions here stop at 300s; ask for a submission early enough to finish.
const SOFT_DEADLINE_MS = 190_000
const HARD_DEADLINE_MS = 285_000
const MAX_TURNS = 40
const MAX_PROBES = 16
const MAX_SUBMITS = 4

const COMPOSIO_DISCORD = {
  id: "composio-discord",
  label: "Composio Discord",
  org: "composio",
  kind: "page",
  target: "https://discord.gg/composio",
  when: "Auth config, connection, or tool errors inside Composio.",
  checks: ["composio-discord"],
}

const ProbeInput = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(60),
  title: z.string().min(1).max(60),
  url: z.string().url(),
  method: z.enum(["GET", "POST"]).optional(),
  form: z.record(z.string(), z.string()).optional(),
  follow_redirects: z.boolean().optional(),
  expect: z.object({
    status: z.array(z.number().int()).optional(),
    body_contains: z.array(z.string().min(1)).max(5).optional(),
    body_lacks: z.array(z.string().min(1)).max(5).optional(),
    location_contains: z.string().optional(),
    final_url_contains: z.string().optional(),
  }),
})

const guideJsonSchema = (() => {
  const schema = z.toJSONSchema(Guide, { io: "input" }) as Record<string, unknown>
  delete schema.$schema
  return schema
})()

const tools: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 10 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 24, max_content_tokens: 16000 },
  {
    name: "composio_toolkit",
    description: "Look up a Composio toolkit by slug: whether it exists, its auth type, whether Composio offers a managed OAuth app, and Composio's setup page for the provider.",
    input_schema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "http_probe",
    description:
      "Run one credential-free HTTP check against a public https URL and record it as live evidence. The server decides pass/fail from `expect`. Returns status, redirect location, title and the start of the body. Use stable kebab-case ids; cite passing ids in steps[].checks.",
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "kebab-case, unique per run" },
        title: { type: "string", description: "What the check shows, max 60 chars, e.g. 'Fake client_id gets invalid_client'" },
        url: { type: "string" },
        method: { type: "string", enum: ["GET", "POST"] },
        form: { type: "object", additionalProperties: { type: "string" }, description: "Form body for POST (fake values only)" },
        follow_redirects: { type: "boolean", description: "Default true (GET only)" },
        expect: {
          type: "object",
          properties: {
            status: { type: "array", items: { type: "integer" } },
            body_contains: { type: "array", items: { type: "string" } },
            body_lacks: { type: "array", items: { type: "string" } },
            location_contains: { type: "string" },
            final_url_contains: { type: "string" },
          },
        },
      },
      required: ["id", "title", "url", "expect"],
    },
  },
  {
    name: "submit_guide",
    description: "Submit the finished guide. The server validates it (schema, cited checks passed, cited sources were fetched) and returns errors to fix, or accepts it.",
    eager_input_streaming: true,
    input_schema: { type: "object", properties: { guide: guideJsonSchema }, required: ["guide"] },
  },
]

function normalizeUrl(u: string) {
  try {
    const url = new URL(u)
    url.hash = ""
    return (url.origin + url.pathname).replace(/\.md$/, "").replace(/\/$/, "").toLowerCase() + url.search
  } catch {
    return u
  }
}

type Session = {
  probes: Map<string, ProbeResult>
  fetched: Set<string>
  toolkit?: ToolkitInfo
}

function validateSubmission(raw: unknown, session: Session, today: string): { guide?: Guide; errors: string[] } {
  const input = (raw as { guide?: Record<string, unknown> })?.guide
  if (!input || typeof input !== "object") return { errors: ["Missing `guide` object"] }
  // Fields the server owns, so the model can't get them wrong.
  const draft = {
    ...input,
    version: 1,
    lastVerified: today,
    composio: { ...(input.composio as object), callbackUrl: COMPOSIO_CALLBACK },
    contacts: [
      ...((input.contacts as { id: string }[] | undefined) ?? []).filter((c) => c.id !== "composio-discord"),
      COMPOSIO_DISCORD,
    ],
  }
  const parsed = Guide.safeParse(draft)
  if (!parsed.success) {
    return { errors: parsed.error.issues.slice(0, 30).map((i) => `${i.path.join(".") || "(guide)"}: ${i.message}`) }
  }
  const g = parsed.data
  const errors: string[] = []
  const cited = [...g.steps.flatMap((s) => s.checks.map((id) => [s.title, id] as const)), ...g.contacts.flatMap((c) => c.checks.map((id) => [c.label, id] as const))]
  for (const [where, id] of cited) {
    const p = session.probes.get(id)
    if (!p) errors.push(`"${where}" cites check "${id}", which was never run`)
    else if (!p.pass) errors.push(`"${where}" cites check "${id}", which FAILED (${p.observed}). Fix the claim instead of citing it.`)
  }
  for (const s of g.sources) {
    if (!session.fetched.has(normalizeUrl(s.url))) errors.push(`Source "${s.title}" (${s.url}) was not fetched in this session. Fetch it or remove it.`)
  }
  return errors.length ? { errors } : { guide: g, errors }
}

export async function runResearch(app: string, emit: (e: ResearchEvent) => void, signal?: AbortSignal) {
  const started = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const client = new Anthropic()
  const session: Session = { probes: new Map(), fetched: new Set() }
  let submits = 0
  let probesRun = 0
  let nudged = false

  emit({ type: "status", message: "Checking Composio's callback and dashboard" })
  for (const p of await composioBaseProbes()) {
    session.probes.set(p.id, p)
    emit({ type: "probe", result: p })
  }
  emit({ type: "status", message: `Researching ${app}` })

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userMessage(app, today) }]

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) throw new Error("Cancelled")
    if (Date.now() - started > HARD_DEADLINE_MS) throw new Error("Ran out of time before the guide passed validation. Try again; runs usually finish in 2–4 minutes.")

    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "high" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools,
        messages,
      },
      { signal },
    )

    stream.on("contentBlock", (block) => {
      if (block.type === "server_tool_use") {
        const input = block.input as { query?: string; url?: string }
        if (block.name === "web_search" && input.query) emit({ type: "search", query: input.query })
      } else if (block.type === "web_fetch_tool_result") {
        const c = block.content
        if (c.type === "web_fetch_result") {
          session.fetched.add(normalizeUrl(c.url))
          const title = c.content.title ?? undefined
          emit({ type: "read", url: c.url, title, ok: true })
        } else {
          emit({ type: "read", url: "", ok: false })
        }
      }
    })

    const message = await stream.finalMessage()
    messages.push({ role: "assistant", content: message.content })

    if (message.stop_reason === "pause_turn") continue
    if (message.stop_reason === "refusal") throw new Error("The model declined this request.")
    if (message.stop_reason === "max_tokens") throw new Error("The guide was too long to finish. Try again.")

    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
    if (toolUses.length === 0) {
      if (submits > 0 && session.probes.size) break
      messages.push({ role: "user", content: "You haven't submitted an accepted guide yet. Finish the research and call submit_guide." })
      continue
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
    let accepted: Guide | undefined
    for (const t of toolUses) {
      const content = await runTool(t, session, today, {
        onProbe: (r) => emit({ type: "probe", result: r }),
        onToolkit: (info) => emit({ type: "toolkit", info }),
        onSubmit: (ok, errors) => emit({ type: "submit", ok, errors }),
        countProbe: () => ++probesRun <= MAX_PROBES,
        countSubmit: () => ++submits <= MAX_SUBMITS,
        accept: (g) => (accepted = g),
      })
      results.push({ type: "tool_result", tool_use_id: t.id, ...content })
    }
    messages.push({ role: "user", content: results })

    if (accepted) {
      const probes = [...session.probes.values()]
      emit({ type: "done", guide: accepted, probes, seconds: Math.round((Date.now() - started) / 1000) })
      return
    }

    if (!nudged && Date.now() - started > SOFT_DEADLINE_MS) {
      nudged = true
      messages.push({
        role: "system",
        content: "Time is nearly up. Stop researching now and call submit_guide with what you have; put anything unverified in unconfirmed notes.",
      })
    }
  }
  throw new Error("The agent didn't produce a valid guide. Try again.")
}

async function runTool(
  t: Anthropic.Beta.BetaToolUseBlock,
  session: Session,
  today: string,
  hooks: {
    onProbe: (r: ProbeResult) => void
    onToolkit: (info: ToolkitInfo) => void
    onSubmit: (ok: boolean, errors: string[]) => void
    countProbe: () => boolean
    countSubmit: () => boolean
    accept: (g: Guide) => void
  },
): Promise<{ content: string; is_error?: boolean }> {
  try {
    if (t.name === "composio_toolkit") {
      const slug = z.object({ slug: z.string().min(1).max(60) }).parse(t.input).slug
      const { info, probe } = await composioToolkit(slug)
      if (info.exists) {
        session.toolkit = info
        session.probes.set(probe.id, probe)
        session.fetched.add(normalizeUrl(info.docUrl))
        hooks.onToolkit(info)
        hooks.onProbe(probe)
      }
      return { content: JSON.stringify({ ...info, deepLinkCheck: info.exists ? { id: probe.id, pass: probe.pass } : null }) }
    }

    if (t.name === "http_probe") {
      const input = ProbeInput.safeParse(t.input)
      if (!input.success) return { content: `Invalid input: ${input.error.issues.map((i) => i.message).join("; ")}`, is_error: true }
      if (!hooks.countProbe()) return { content: "Probe limit reached. Submit the guide with the checks you have.", is_error: true }
      const { id, title, expect, ...req } = input.data
      const request = `${req.method ?? "GET"} ${req.url}${req.form ? " (form: " + Object.keys(req.form).join(", ") + ")" : ""}`
      let result: ProbeResult
      let detail: object
      try {
        const res = await httpProbe(req)
        session.fetched.add(normalizeUrl(res.finalUrl))
        session.fetched.add(normalizeUrl(req.url))
        const failures = judge(res, expect)
        result = { id, title, request, expect: describeExpect(expect), observed: observe(res), pass: failures.length === 0, ranAt: new Date().toISOString() }
        detail = { pass: result.pass, failures, status: res.status, location: res.location, finalUrl: res.finalUrl, title: res.title, body: res.body.slice(0, 1500) }
      } catch (e) {
        result = { id, title, request, expect: describeExpect(expect), observed: `failed: ${(e as Error).message}`, pass: false, ranAt: new Date().toISOString() }
        detail = { pass: false, error: (e as Error).message }
      }
      session.probes.set(id, result)
      hooks.onProbe(result)
      return { content: JSON.stringify(detail) }
    }

    if (t.name === "submit_guide") {
      if (!hooks.countSubmit()) return { content: "Submission limit reached.", is_error: true }
      const { guide, errors } = validateSubmission(t.input, session, today)
      hooks.onSubmit(!!guide, errors)
      if (guide) {
        hooks.accept(guide)
        return { content: "Accepted." }
      }
      return { content: `Not accepted. Fix these and submit again:\n- ${errors.join("\n- ")}`, is_error: true }
    }

    return { content: `Unknown tool ${t.name}`, is_error: true }
  } catch (e) {
    return { content: `Tool failed: ${(e as Error).message}`, is_error: true }
  }
}

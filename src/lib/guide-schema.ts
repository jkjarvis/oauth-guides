import { z } from "zod"

// Short text keeps guides scannable: pointers, not paragraphs.
const Short = z.string().min(1).max(140)
const Title = z.string().min(1).max(60)

export const EvidenceKind = z.enum(["tested", "sourced", "uncertain"])

export const Evidence = z.object({
  kind: EvidenceKind,
  sources: z.array(z.string()).default([]),
  probes: z.array(z.string()).default([]),
  note: Short.optional(),
})

export const Range = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
})

// Approval wait keeps the provider's own unit ("3–5 business days") instead of a false-precise number.
export const Wait = Range.extend({
  unit: z.enum(["minutes", "hours", "days", "business_days", "weeks"]),
  openEnded: z.boolean().default(false),
  asStated: Short,
})

export const Field = z.object({
  label: Title,
  value: z.string().min(1),
  hint: Short.optional(),
  copy: z.boolean().default(true),
})

export const Snippet = z.object({
  lang: z.enum(["ts", "python", "bash"]),
  code: z.string().min(1),
})

export const Step = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: Title,
  who: z.enum(["you", "agent", "wait"]),
  minutes: Range,
  optional: z.boolean().default(false),
  when: Short.optional(),
  actions: z.array(z.object({ label: Title, url: z.url() })).max(2).default([]),
  fields: z.array(Field).default([]),
  pointers: z.array(Short).max(5).default([]),
  check: z.enum(["github-client-id"]).optional(),
  snippets: z.array(Snippet).default([]),
  evidence: Evidence,
})

export const Item = z.object({
  title: Title,
  detail: Short,
  evidence: Evidence,
})

export const Blocker = Item.extend({
  owner: z.enum(["you", "your users"]),
  fix: Short,
})

export const Source = z.object({
  id: z.string(),
  title: Title,
  url: z.url(),
})

export const Guide = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: Title,
    version: z.number().int().positive(),
    lastVerified: z.iso.date(),
    tagline: Short,
    appType: Title,
    composio: z.object({
      toolkit: z.string(),
      managedAvailable: z.boolean(),
      authScheme: z.string(),
      callbackUrl: z.url(),
    }),
    facts: z.object({
      handsOnMinutes: Range,
      approvalWait: Wait.nullable(),
      review: z.enum(["none", "optional", "required"]),
      cost: z.object({ usdPerYear: z.number().nonnegative(), asStated: Short }),
    }),
    requirements: z.array(Item),
    steps: z.array(Step).min(1),
    traps: z.array(Item),
    blockers: z.array(Blocker),
    // Checks we could not run, e.g. ones that need an account or credentials.
    unverified: z.array(z.object({ title: Title, detail: Short })).default([]),
    sources: z.array(Source),
  })
  .superRefine((g, ctx) => {
    const sourceIds = new Set(g.sources.map((s) => s.id))
    const stepIds = new Set<string>()
    for (const s of g.steps) {
      if (stepIds.has(s.id)) ctx.addIssue({ code: "custom", message: `Duplicate step id: ${s.id}` })
      stepIds.add(s.id)
    }
    const evidence = [
      ...g.steps.map((s) => [s.title, s.evidence] as const),
      ...[...g.requirements, ...g.traps, ...g.blockers].map((i) => [i.title, i.evidence] as const),
    ]
    for (const [title, ev] of evidence) {
      for (const id of ev.sources) {
        if (!sourceIds.has(id)) ctx.addIssue({ code: "custom", message: `"${title}" cites unknown source "${id}"` })
      }
      if (ev.kind === "sourced" && ev.sources.length === 0)
        ctx.addIssue({ code: "custom", message: `"${title}" is marked sourced but cites nothing` })
      if (ev.kind === "tested" && ev.probes.length === 0)
        ctx.addIssue({ code: "custom", message: `"${title}" is marked tested but names no probe` })
      if (ev.kind === "uncertain" && !ev.note)
        ctx.addIssue({ code: "custom", message: `"${title}" is uncertain but does not say why` })
    }
  })

export const ProbeResult = z.object({
  id: z.string(),
  title: Title,
  request: z.string(),
  expect: Short,
  observed: z.string(),
  pass: z.boolean(),
  ranAt: z.iso.datetime(),
})

export const ProbeRun = z.object({
  guide: z.string(),
  ranAt: z.iso.datetime(),
  results: z.array(ProbeResult),
})

export type Guide = z.infer<typeof Guide>
export type Step = z.infer<typeof Step>
export type Evidence = z.infer<typeof Evidence>
export type ProbeRun = z.infer<typeof ProbeRun>
export type ProbeResult = z.infer<typeof ProbeResult>
export type Wait = z.infer<typeof Wait>

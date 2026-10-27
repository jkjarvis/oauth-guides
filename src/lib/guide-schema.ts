import { z } from "zod"

// Short text keeps guides scannable: instructions, not paragraphs.
const Short = z.string().min(1).max(160)
const Title = z.string().min(1).max(60)

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

// Something easy to get wrong in this step. Either backed by a source or marked unconfirmed.
export const Warning = z.object({
  text: Short,
  sources: z.array(z.string()).default([]),
  unconfirmed: Short.optional(),
})

export const Step = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: Title,
  who: z.enum(["you", "agent", "wait"]),
  minutes: Range,
  optional: z.boolean().default(false),
  when: Short.optional(),
  instructions: z.array(Short).min(1).max(8),
  fields: z.array(Field).default([]),
  check: z.enum(["github-client-id"]).optional(),
  snippets: z.array(Snippet).default([]),
  warnings: z.array(Warning).default([]),
  actions: z.array(z.object({ label: Title, url: z.url() })).max(2).default([]),
  // Where the step's facts come from: docs we read, and live checks we ran.
  sources: z.array(z.string()).default([]),
  checks: z.array(z.string()).default([]),
  unconfirmed: Short.optional(),
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
    steps: z.array(Step).min(1),
    sources: z.array(Source),
  })
  .superRefine((g, ctx) => {
    const sourceIds = new Set(g.sources.map((s) => s.id))
    const stepIds = new Set<string>()
    for (const s of g.steps) {
      if (stepIds.has(s.id)) ctx.addIssue({ code: "custom", message: `Duplicate step id: ${s.id}` })
      stepIds.add(s.id)
      if (s.sources.length === 0 && s.checks.length === 0 && !s.unconfirmed)
        ctx.addIssue({ code: "custom", message: `"${s.title}" has no source, live check, or unconfirmed note` })
      for (const w of s.warnings) {
        if (w.sources.length === 0 && !w.unconfirmed)
          ctx.addIssue({ code: "custom", message: `Warning in "${s.title}" needs a source or an unconfirmed note` })
      }
      for (const id of [...s.sources, ...s.warnings.flatMap((w) => w.sources)]) {
        if (!sourceIds.has(id)) ctx.addIssue({ code: "custom", message: `"${s.title}" cites unknown source "${id}"` })
      }
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
export type Source = z.infer<typeof Source>
export type ProbeRun = z.infer<typeof ProbeRun>
export type ProbeResult = z.infer<typeof ProbeResult>
export type Wait = z.infer<typeof Wait>

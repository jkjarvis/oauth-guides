import { z } from "zod"

// Short text keeps guides scannable: instructions, not paragraphs.
const Short = z.string().min(1).max(160)
const Title = z.string().min(1).max(60)
// Guides can arrive through share links, so every link must be plain https.
const HttpsUrl = z.url().refine((u) => u.startsWith("https://"), "must be an https URL")

export const Range = z.object({
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
})

// Approval wait keeps the provider's own unit ("3–5 business days") instead of a false-precise number.
export const Wait = Range.extend({
  unit: z.enum(["minutes", "hours", "days", "business_days", "weeks"]),
  openEnded: z.boolean().default(false),
  asStated: Short,
  // Short form for cards and chips ("3–8 weeks"); asStated keeps the provider's exact wording.
  summary: z.string().min(1).max(24).optional(),
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

// Our own explanation of a problem people hit in this step, shown before any "ask the provider" option.
export const Problem = z.object({
  q: z.string().min(1).max(100),
  a: z.array(Short).min(1).max(4),
  sources: z.array(z.string()).default([]),
})

export const Step = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: Title,
  // you: hands-on work · agent: an agent or this site can do it · wait: the provider's clock
  // their-admin: someone in your user's organization has to act (e.g. admin consent)
  who: z.enum(["you", "agent", "wait", "their-admin"]),
  minutes: Range,
  wait: Wait.optional(),
  optional: z.boolean().default(false),
  when: Short.optional(),
  instructions: z.array(Short).min(1).max(8),
  fields: z.array(Field).default([]),
  check: z.enum(["github-client-id"]).optional(),
  // The part of a hands-on step a coding agent can do (edit a config file, run a CLI). Agent steps don't need it.
  agentTask: Short.optional(),
  snippets: z.array(Snippet).default([]),
  warnings: z.array(Warning).default([]),
  actions: z.array(z.object({ label: Title, url: HttpsUrl })).max(2).default([]),
  // Where the step's facts come from: docs we read, and live checks we ran.
  sources: z.array(z.string()).default([]),
  checks: z.array(z.string()).default([]),
  unconfirmed: Short.optional(),
  problems: z.array(Problem).max(5).default([]),
  // Support contacts (ids) to offer for this step; defaults to the guide's provider contacts.
  contacts: z.array(z.string()).default([]),
})

export const Contact = z.object({
  id: z.string(),
  label: Title,
  org: z.enum(["provider", "composio"]),
  kind: z.enum(["email", "page"]),
  target: z.string().min(3),
  when: Short,
  sources: z.array(z.string()).default([]),
  checks: z.array(z.string()).default([]),
})

export const Source = z.object({
  id: z.string(),
  title: Title,
  url: HttpsUrl,
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
      callbackUrl: HttpsUrl,
    }),
    facts: z.object({
      handsOnMinutes: Range,
      approvalWait: Wait.nullable(),
      review: z.enum(["none", "optional", "required"]),
      cost: z.object({ usdPerYear: z.number().nonnegative(), asStated: Short, summary: z.string().min(1).max(24) }),
    }),
    steps: z.array(Step).min(1),
    contacts: z.array(Contact).min(1),
    sources: z.array(Source),
  })
  .superRefine((g, ctx) => {
    const sourceIds = new Set(g.sources.map((s) => s.id))
    const contactIds = new Set(g.contacts.map((c) => c.id))
    if (g.facts.approvalWait && !g.facts.approvalWait.summary)
      ctx.addIssue({ code: "custom", message: "facts.approvalWait needs a short summary" })
    for (const c of g.contacts) {
      if (c.kind === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.target))
        ctx.addIssue({ code: "custom", message: `Contact "${c.label}" is not a valid email` })
      if (c.kind === "page" && !/^https:\/\//.test(c.target))
        ctx.addIssue({ code: "custom", message: `Contact "${c.label}" must be an https URL` })
      if (c.sources.length === 0 && c.checks.length === 0)
        ctx.addIssue({ code: "custom", message: `Contact "${c.label}" needs a source or a live check` })
      for (const id of c.sources) {
        if (!sourceIds.has(id)) ctx.addIssue({ code: "custom", message: `Contact "${c.label}" cites unknown source "${id}"` })
      }
    }
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
      if (s.who === "wait" && !s.wait) ctx.addIssue({ code: "custom", message: `Wait step "${s.title}" needs a wait duration` })
      for (const c of s.contacts) {
        if (!contactIds.has(c)) ctx.addIssue({ code: "custom", message: `"${s.title}" offers unknown contact "${c}"` })
      }
      for (const id of [...s.sources, ...s.warnings.flatMap((w) => w.sources), ...s.problems.flatMap((p) => p.sources)]) {
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
export type Contact = z.infer<typeof Contact>
export type ProbeRun = z.infer<typeof ProbeRun>
export type ProbeResult = z.infer<typeof ProbeResult>
export type Wait = z.infer<typeof Wait>

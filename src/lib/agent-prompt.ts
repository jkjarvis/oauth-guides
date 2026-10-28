import type { Guide, Step } from "@/lib/guide-schema"

// Every "their admin" step needs the same thing from the developer: something their users can forward.
const ADMIN_NOTE = "Draft a short note my users can forward to their admin: what to approve, where, and why. Use placeholders for my product name."

// The part of a step a coding agent can do, when the step itself doesn't say "agent".
export function agentTaskFor(step: Step) {
  return step.agentTask ?? (step.who === "their-admin" ? ADMIN_NOTE : undefined)
}

// Steps whose result a coding agent can produce. The site checks GitHub Client IDs itself, so that step has no prompt.
export function agentCanHelp(step: Step) {
  return Boolean(agentTaskFor(step)) || (step.who === "agent" && !step.check)
}

// Built from the step's own data, so prompts stay in sync with the guide and need no extra copy.
export function agentPrompt(guide: Guide, step: Step) {
  const n = guide.steps.indexOf(step) + 1
  const lines = [
    `I'm setting up my own ${guide.name} OAuth app (${guide.appType}) for Composio, instead of Composio's managed app. Help me with step ${n} of ${guide.steps.length}: "${step.title}".`,
    "",
    `Your task: ${agentTaskFor(step) ?? step.title}`,
    "",
    "The step, from the guide:",
    ...step.instructions.map((t, i) => `${i + 1}. ${t}`),
  ]
  if (step.fields.length) lines.push("", "Values:", ...step.fields.map((f) => `- ${f.label}: ${f.value}${f.hint ? ` (${f.hint})` : ""}`))
  for (const s of step.snippets) lines.push("", `Reference code (${s.lang}):`, "```" + s.lang, s.code, "```")
  lines.push(
    "",
    "Rules:",
    ...(step.snippets.some((s) => s.lang !== "bash")
      ? ["- Adapt the code to my project: find where it creates the Composio client or session, or where its routes live, and match its language and style."]
      : []),
    ...(step.snippets.some((s) => s.lang === "bash")
      ? ["- Say what each command does before running it. Stop and hand over to me when one asks for a login or key."]
      : []),
    "- Never ask me for, print, or write my client secret. Use environment variables that I fill in myself.",
    "- Where something needs my product details or a decision from me, leave a clearly marked placeholder and list them at the end.",
    "- When you're done, tell me what you changed and what I still need to do by hand.",
    `- If the oauth-guides skill is installed, mark this step done with it afterwards (done ${guide.slug} ${step.id}).`,
  )
  return lines.join("\n")
}

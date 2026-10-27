import githubGuide from "@/data/guides/github.json"
import githubProbes from "@/data/probes/github.json"
import { Guide, ProbeRun, type Evidence } from "@/lib/guide-schema"
export { formatMinutes, formatWait } from "@/lib/format"

// Parsing at import time means a malformed guide fails the build, not the page.
const guides = [Guide.parse(githubGuide)]
const probeRuns: Record<string, ProbeRun> = { github: ProbeRun.parse(githubProbes) }

export const planned = ["Slack", "Gmail", "Microsoft Outlook", "Meta"]

export function listGuides() {
  return guides
}

export function getGuide(slug: string) {
  return guides.find((g) => g.slug === slug)
}

export function getProbes(slug: string) {
  return probeRuns[slug]
}

export function allEvidence(g: Guide): Evidence[] {
  return [
    ...g.steps.map((s) => s.evidence),
    ...[...g.requirements, ...g.traps, ...g.blockers].map((i) => i.evidence),
  ]
}

export function evidenceCounts(g: Guide) {
  const counts = { tested: 0, sourced: 0, uncertain: 0 }
  for (const e of allEvidence(g)) counts[e.kind]++
  return counts
}

export function uncertainItems(g: Guide) {
  return [
    ...g.steps.map((s) => ({ title: s.title, evidence: s.evidence })),
    ...[...g.requirements, ...g.traps, ...g.blockers],
  ].filter((i) => i.evidence.kind === "uncertain")
}

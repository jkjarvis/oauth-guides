import githubGuide from "@/data/guides/github.json"
import githubProbes from "@/data/probes/github.json"
import { Guide, ProbeRun } from "@/lib/guide-schema"
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

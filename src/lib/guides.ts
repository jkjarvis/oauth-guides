import githubGuide from "@/data/guides/github.json"
import githubProbes from "@/data/probes/github.json"
import slackGuide from "@/data/guides/slack.json"
import slackProbes from "@/data/probes/slack.json"
import gmailGuide from "@/data/guides/gmail.json"
import gmailProbes from "@/data/probes/gmail.json"
import outlookGuide from "@/data/guides/outlook.json"
import outlookProbes from "@/data/probes/outlook.json"
import metaGuide from "@/data/guides/meta.json"
import metaProbes from "@/data/probes/meta.json"
import notionGuide from "@/data/guides/notion.json"
import notionProbes from "@/data/probes/notion.json"
import linearGuide from "@/data/guides/linear.json"
import linearProbes from "@/data/probes/linear.json"
import jiraGuide from "@/data/guides/jira.json"
import jiraProbes from "@/data/probes/jira.json"
import dropboxGuide from "@/data/guides/dropbox.json"
import dropboxProbes from "@/data/probes/dropbox.json"
import hubspotGuide from "@/data/guides/hubspot.json"
import hubspotProbes from "@/data/probes/hubspot.json"
import zoomGuide from "@/data/guides/zoom.json"
import zoomProbes from "@/data/probes/zoom.json"
import { Guide, ProbeRun } from "@/lib/guide-schema"
export { formatMinutes, formatWait } from "@/lib/format"

// Parsing at import time means a malformed guide fails the build, not the page.
const entries = [
  { guide: githubGuide, probes: githubProbes },
  { guide: slackGuide, probes: slackProbes },
  { guide: gmailGuide, probes: gmailProbes },
  { guide: outlookGuide, probes: outlookProbes },
  { guide: metaGuide, probes: metaProbes },
  { guide: notionGuide, probes: notionProbes },
  { guide: linearGuide, probes: linearProbes },
  { guide: jiraGuide, probes: jiraProbes },
  { guide: dropboxGuide, probes: dropboxProbes },
  { guide: hubspotGuide, probes: hubspotProbes },
  { guide: zoomGuide, probes: zoomProbes },
].map(({ guide, probes }) => {
  const g = Guide.parse(guide)
  const run = ProbeRun.parse(probes)
  const results = new Map(run.results.map((r) => [r.id, r]))
  for (const id of [...g.steps.flatMap((s) => s.checks), ...g.contacts.flatMap((c) => c.checks)]) {
    const r = results.get(id)
    if (!r) throw new Error(`${g.slug}: cites live check "${id}", which has no probe result`)
    if (!r.pass) throw new Error(`${g.slug}: cites live check "${id}", which failed (${r.observed})`)
  }
  return { guide: g, probes: run }
})


export function listGuides() {
  return entries.map((e) => e.guide)
}

export function getGuide(slug: string) {
  return entries.find((e) => e.guide.slug === slug)?.guide
}

export function getProbes(slug: string) {
  return entries.find((e) => e.guide.slug === slug)?.probes
}

// Validates guides against the schema and checks every cited live check exists and passed.
// Usage: npm run validate            (all guides)
//        npm run validate -- slack   (one guide)
import { readdir, readFile } from "node:fs/promises"
import { Guide, ProbeRun } from "../src/lib/guide-schema"

const guideDir = "src/data/guides"
const all = (await readdir(guideDir)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
const slugs = process.argv.length > 2 ? process.argv.slice(2) : all

let errors = 0
for (const slug of slugs) {
  const problems: string[] = []
  const parsed = Guide.safeParse(JSON.parse(await readFile(`${guideDir}/${slug}.json`, "utf8")))
  if (!parsed.success) {
    for (const issue of parsed.error.issues) problems.push(`${issue.path.join(".") || "(guide)"}: ${issue.message}`)
  } else {
    let probes: ProbeRun | null = null
    try {
      probes = ProbeRun.parse(JSON.parse(await readFile(`src/data/probes/${slug}.json`, "utf8")))
    } catch {
      problems.push(`no probe results at src/data/probes/${slug}.json (run: npm run probe -- ${slug})`)
    }
    if (probes) {
      const byId = new Map(probes.results.map((r) => [r.id, r]))
      const cited = [
        ...parsed.data.steps.flatMap((s) => s.checks.map((c) => [s.title, c] as const)),
        ...parsed.data.contacts.flatMap((c) => c.checks.map((id) => [c.label, id] as const)),
      ]
      for (const [where, id] of cited) {
        const r = byId.get(id)
        if (!r) problems.push(`"${where}" cites check "${id}", which has no probe`)
        else if (!r.pass) problems.push(`"${where}" cites check "${id}", which FAILED: ${r.observed}`)
      }
    }
  }
  errors += problems.length
  console.log(problems.length ? `✗ ${slug}\n  ${problems.join("\n  ")}` : `✓ ${slug}`)
}
process.exitCode = errors ? 1 : 0

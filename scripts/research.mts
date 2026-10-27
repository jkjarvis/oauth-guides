// Runs the research agent from the terminal and saves the result.
// Usage: npm run research -- "Xero" [out.json]
import { writeFile } from "node:fs/promises"
import { runResearch, type ResearchEvent } from "../src/lib/research/agent"

const app = process.argv[2]
const out = process.argv[3] ?? `research-${app?.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`
if (!app) throw new Error('Usage: npm run research -- "<app name or website>" [out.json]')

const events: ResearchEvent[] = []
const t0 = Date.now()
await runResearch(app, (e) => {
  events.push(e)
  const s = ((Date.now() - t0) / 1000).toFixed(0).padStart(4)
  if (e.type === "status") console.log(`${s}s  ${e.message}`)
  if (e.type === "toolkit") console.log(`${s}s  toolkit ${e.info.slug}: exists=${e.info.exists} managed=${e.info.managed}`)
  if (e.type === "search") console.log(`${s}s  search  ${e.query}`)
  if (e.type === "read") console.log(`${s}s  read    ${e.ok ? e.url : "(fetch failed)"}`)
  if (e.type === "probe") console.log(`${s}s  probe   ${e.result.pass ? "PASS" : "FAIL"} ${e.result.id}  ${e.result.observed}`)
  if (e.type === "submit") console.log(`${s}s  submit  ${e.ok ? "accepted" : "rejected:\n          - " + e.errors.join("\n          - ")}`)
  if (e.type === "done") console.log(`${s}s  done    ${e.guide.steps.length} steps in ${e.seconds}s`)
}).catch((e) => console.error("ERROR", e.message))
await writeFile(out, JSON.stringify(events, null, 2))
console.log(`events → ${out}`)

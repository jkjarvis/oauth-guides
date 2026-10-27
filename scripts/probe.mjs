// Runs credential-free probes for one or more guides and writes src/data/probes/<slug>.json.
// Guides cite these results as "Checked live" evidence.
// Usage: npm run probe            (every guide with a file in scripts/probes/)
//        npm run probe -- slack   (one guide)
import { mkdir, readdir, writeFile } from "node:fs/promises"

const dir = new URL("./probes/", import.meta.url)
const all = (await readdir(dir)).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).map((f) => f.slice(0, -4))
const slugs = process.argv.length > 2 ? process.argv.slice(2) : all

let failed = 0
for (const slug of slugs) {
  const { default: probes } = await import(new URL(`${slug}.mjs`, dir))
  const ranAt = new Date().toISOString()
  const results = []
  console.log(`\n${slug}`)
  for (const p of probes) {
    let outcome
    try {
      outcome = await p.run()
    } catch (e) {
      outcome = { observed: `failed: ${e.message}`, pass: false }
    }
    if (!outcome.pass) failed++
    results.push({ id: p.id, title: p.title, request: p.request, expect: p.expect, ...outcome, ranAt })
    console.log(`  ${outcome.pass ? "PASS" : "FAIL"}  ${p.id}  ${outcome.observed}`)
  }
  await mkdir("src/data/probes", { recursive: true })
  await writeFile(`src/data/probes/${slug}.json`, JSON.stringify({ guide: slug, ranAt, results }, null, 2) + "\n")
}

if (failed) {
  console.log(`\n${failed} probe(s) failed`)
  process.exitCode = 1
}

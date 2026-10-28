// Bundles the guide library into the agent skill and publishes it for install.
//   skills/oauth-guides/data/        guides + live checks (committed, so the repo holds a ready skill)
//   skills/oauth-guides/references/guide.schema.json   generated from the site's zod schema
//   public/skills/oauth-guides.tar.gz                   what the install command downloads
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { z } from "zod"
import { Guide } from "../src/lib/guide-schema"

const root = path.resolve(import.meta.dirname, "..")
const skill = path.join(root, "skills", "oauth-guides")

for (const kind of ["guides", "probes"]) {
  const from = path.join(root, "src", "data", kind)
  const to = path.join(skill, "data", kind)
  fs.rmSync(to, { recursive: true, force: true })
  fs.mkdirSync(to, { recursive: true })
  for (const file of fs.readdirSync(from).filter((f) => f.endsWith(".json"))) fs.copyFileSync(path.join(from, file), path.join(to, file))
}

const schema = z.toJSONSchema(Guide, { io: "input" })
fs.writeFileSync(path.join(skill, "references", "guide.schema.json"), JSON.stringify(schema, null, 2) + "\n")

const publicDir = path.join(root, "public", "skills")
fs.mkdirSync(publicDir, { recursive: true })
// COPYFILE_DISABLE keeps macOS metadata files out of the archive.
execFileSync("tar", ["-czf", path.join(publicDir, "oauth-guides.tar.gz"), "-C", path.join(root, "skills"), "oauth-guides"], {
  env: { ...process.env, COPYFILE_DISABLE: "1" },
})
console.log(`skill bundled: ${fs.readdirSync(path.join(skill, "data", "guides")).length} guides → public/skills/oauth-guides.tar.gz`)

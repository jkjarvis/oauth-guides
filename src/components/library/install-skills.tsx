"use client"

import { Download, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton } from "@/components/guide/copy-button"

const SITE = "https://oauth-guides-xi.vercel.app"
const TARBALL = `${SITE}/skills/oauth-guides.tar.gz`
const install = (dir: string) => `mkdir -p ${dir} && curl -fsSL ${TARBALL} | tar -xz -C ${dir}`

// Claude Code reads ~/.claude/skills; Codex reads ~/.agents/skills.
const AGENTS = [
  { id: "claude", label: "Claude Code", command: install("~/.claude/skills"), invoke: "/oauth-guides" },
  { id: "codex", label: "Codex", command: install("~/.agents/skills"), invoke: "$oauth-guides" },
  { id: "other", label: "Other agents", command: install("<skills-dir>"), invoke: null },
]

// A trimmed sample of what the skill prints, so people know what they're getting.
const PREVIEW = `────────────────────────────────────────────────────────
 SLACK  ·  Slack app (OAuth v2)
 ███████████░░░░░░░░░░░░░░░░░░░  4/11 steps · 36%
────────────────────────────────────────────────────────
  ✓   3  Copy the Client ID and Client Secret     you
  ✓   4  Activate public distribution (optional)  you
  ▸   5  Create a Composio auth config            you
  ○   6  Use the auth config in your agent        agent
  ○   7  Connect a test workspace                 you
  ✗   8  Get workspace admin approval (optional)  admin
         blocked: Need a workspace admin
────────────────────────────────────────────────────────
 Next → 5 · Create a Composio auth config`

export function InstallSkills() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <Terminal />
        Use in your agent
      </DialogTrigger>
      <DialogContent className="gap-5 p-5 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-base">Use these guides in your coding agent</DialogTitle>
          <DialogDescription>
            One skill with every guide. Your agent walks you through one step at a time, does the parts it can, and saves your progress in{" "}
            <code className="font-mono text-xs">.oauth-guides/</code> in your project. It can also research a provider that isn&apos;t in the
            library.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="claude">
          <TabsList>
            {AGENTS.map((a) => (
              <TabsTrigger key={a.id} value={a.id}>
                {a.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {AGENTS.map((a) => (
            <TabsContent key={a.id} value={a.id} className="space-y-3">
              {a.id === "other" && (
                <p className="text-xs text-muted-foreground">
                  For any agent that supports Agent Skills: replace <code className="font-mono">&lt;skills-dir&gt;</code> with the folder it
                  loads skills from.
                </p>
              )}
              <div className="flex items-start gap-2 rounded-lg border bg-muted/40 py-2 pr-2 pl-3">
                <code className="flex-1 font-mono text-xs leading-relaxed break-all">{a.command}</code>
                <CopyButton value={a.command} label="Copy install command" />
              </div>
              <p className="text-xs text-muted-foreground">
                Then ask: <span className="text-foreground">&ldquo;Set up my own Slack OAuth app for Composio&rdquo;</span>
                {a.invoke && (
                  <>
                    {" "}
                    or type <code className="font-mono text-foreground">{a.invoke}</code>
                  </>
                )}
                .
              </p>
            </TabsContent>
          ))}
        </Tabs>

        <pre className="overflow-x-auto rounded-lg bg-foreground px-4 py-3 font-mono text-[11px] leading-snug text-background">{PREVIEW}</pre>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Needs Node 18+. No CLI to install: the skill runs one bundled script with no dependencies.</span>
          <a href={TARBALL} className="inline-flex items-center gap-1 hover:text-foreground">
            <Download className="size-3.5" />
            Download
          </a>
        </div>
      </DialogContent>
    </Dialog>
  )
}

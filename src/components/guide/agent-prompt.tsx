"use client"

import { useState } from "react"
import { Bot, Check, ChevronDown, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { agentPrompt, agentTaskFor } from "@/lib/agent-prompt"
import type { Guide, Step } from "@/lib/guide-schema"

export function AgentPrompt({ guide, step }: { guide: Guide; step: Step }) {
  const [copied, setCopied] = useState(false)
  const prompt = agentPrompt(guide, step)
  const task = agentTaskFor(step)
  return (
    <details className="group rounded-lg border border-info/30 bg-info/5">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Bot className="mt-0.5 size-4 shrink-0 text-info" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">{task ? "Your coding agent can help" : "Your coding agent can do this"}</p>
            {task && <p className="text-muted-foreground">{task}</p>}
          </div>
          <Button
            size="sm"
            className="self-start sm:self-center"
            onClick={async (e) => {
              // Copy without toggling the preview.
              e.preventDefault()
              try {
                await navigator.clipboard.writeText(prompt)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              } catch {}
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        </div>
        <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 sm:mt-2" aria-label="Show prompt" />
      </summary>
      <pre className="mx-4 mb-4 max-h-72 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {prompt}
      </pre>
    </details>
  )
}

"use client"

import { Bot, Hourglass, User } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { Evidence, Guide, Step } from "@/lib/guide-schema"

const WHO = {
  you: { label: "You", icon: User, className: "text-foreground" },
  agent: { label: "Agent", icon: Bot, className: "text-info" },
  wait: { label: "Wait", icon: Hourglass, className: "text-warning" },
} as const

export function WhoChip({ who }: { who: Step["who"] }) {
  const { label, icon: Icon, className } = WHO[who]
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium", className)}>
      <Icon className="size-3" />
      {label}
    </span>
  )
}

const EVIDENCE = {
  tested: { label: "Tested", dot: "bg-success" },
  sourced: { label: "Sourced", dot: "bg-info" },
  uncertain: { label: "Uncertain", dot: "bg-warning" },
} as const

export function EvidenceDot({ kind }: { kind: Evidence["kind"] }) {
  return <span className={cn("inline-block size-1.5 rounded-full", EVIDENCE[kind].dot)} />
}

export function EvidenceBadge({ evidence, sources }: { evidence: Evidence; sources: Guide["sources"] }) {
  const cited = evidence.sources.map((id) => sources.find((s) => s.id === id)).filter((s) => s !== undefined)
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex cursor-default items-center gap-1.5 font-mono text-[11px] text-muted-foreground" />
        }
      >
        <EvidenceDot kind={evidence.kind} />
        {EVIDENCE[evidence.kind].label}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-1">
        {evidence.probes.length > 0 && <span>Probes: {evidence.probes.join(", ")}</span>}
        {cited.map((s) => (
          <span key={s.id}>{s.title}</span>
        ))}
        {evidence.note && <span className="opacity-80">{evidence.note}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

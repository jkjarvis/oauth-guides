import { Bot, Hourglass, User } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Step } from "@/lib/guide-schema"

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

import { Badge } from "@/components/ui/badge"
import { GuideSteps } from "@/components/guide/guide-steps"
import { formatMinutes, formatWait } from "@/lib/format"
import type { Guide, ProbeResult } from "@/lib/guide-schema"

const REVIEW_LABEL = { none: "Not required", optional: "Optional", required: "Required" } as const

// One layout for library guides and generated ones.
export function GuideView({
  guide,
  probes,
  storageKey,
  actions,
  notice,
  dateLabel = "Verified",
}: {
  guide: Guide
  probes: ProbeResult[]
  storageKey?: string
  actions?: React.ReactNode
  notice?: React.ReactNode
  dateLabel?: string
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{guide.name}</h1>
          <p className="max-w-3xl text-muted-foreground">{guide.tagline}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{guide.appType}</Badge>
            <Badge variant="outline">Composio toolkit: {guide.composio.toolkit}</Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {guide.composio.managedAvailable ? "Composio-managed app also available" : "No Composio-managed app"}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              {dateLabel} {formatDate(guide.lastVerified)}
            </Badge>
          </div>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      {notice}

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
        <Fact label="Hands-on time" value={formatMinutes(guide.facts.handsOnMinutes)} />
        <Fact label="Approval wait" value={formatWait(guide.facts.approvalWait)} detail={guide.facts.approvalWait?.asStated} />
        <Fact label="Provider review" value={REVIEW_LABEL[guide.facts.review]} />
        <Fact label="Cost" value={guide.facts.cost.summary} detail={guide.facts.cost.asStated} />
      </dl>

      <GuideSteps guide={guide} probes={probes} storageKey={storageKey} />
    </div>
  )
}

function Fact({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="space-y-1 bg-card px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight">{value}</dd>
      {detail && detail !== value && <dd className="text-xs text-muted-foreground">{detail}</dd>}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

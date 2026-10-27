import Link from "next/link"
import { ArrowRight, Clock, Hourglass, Wallet } from "lucide-react"
import { EvidenceDot } from "@/components/guide/labels"
import { evidenceCounts, formatMinutes, formatWait, listGuides, planned } from "@/lib/guides"

export default function LibraryPage() {
  const guides = listGuides()
  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Get your own OAuth app ready</h1>
        <p className="max-w-2xl text-muted-foreground">
          Per-provider guides for registering an OAuth app, getting it approved, and plugging it into Composio.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Guides</h2>
        <div className="grid grid-cols-3 gap-4">
          {guides.map((g) => {
            const counts = evidenceCounts(g)
            return (
              <Link
                key={g.slug}
                href={`/${g.slug}`}
                className="group flex flex-col justify-between gap-5 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{g.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-success">
                      <span className="size-1.5 rounded-full bg-success" />
                      Ready
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{g.tagline}</p>
                </div>
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <Stat icon={Clock} label="Hands-on" value={formatMinutes(g.facts.handsOnMinutes)} />
                  <Stat icon={Hourglass} label="Wait" value={formatWait(g.facts.approvalWait)} />
                  <Stat icon={Wallet} label="Cost" value={g.facts.cost.asStated} />
                </dl>
                <div className="flex items-center justify-between border-t pt-3 font-mono text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><EvidenceDot kind="tested" />{counts.tested}</span>
                    <span className="flex items-center gap-1"><EvidenceDot kind="sourced" />{counts.sourced}</span>
                    <span className="flex items-center gap-1"><EvidenceDot kind="uncertain" />{counts.uncertain}</span>
                  </span>
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </div>
              </Link>
            )
          })}
          {planned.map((name) => (
            <div key={name} className="flex flex-col justify-between gap-5 rounded-xl border border-dashed p-5 text-muted-foreground">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{name}</span>
                <span className="text-xs">In research</span>
              </div>
              <p className="text-sm">Guide coming next.</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="flex items-center gap-1 text-muted-foreground"><Icon className="size-3" />{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

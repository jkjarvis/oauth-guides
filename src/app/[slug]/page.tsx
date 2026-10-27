import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowUpRight, CircleCheck, CircleX, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StepTracker } from "@/components/guide/step-tracker"
import { EvidenceBadge, EvidenceDot } from "@/components/guide/labels"
import { ShareButton } from "@/components/guide/share-button"
import {
  evidenceCounts,
  formatMinutes,
  formatWait,
  getGuide,
  getProbes,
  listGuides,
  uncertainItems,
} from "@/lib/guides"

export function generateStaticParams() {
  return listGuides().map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const guide = getGuide((await params).slug)
  return guide ? { title: guide.name, description: guide.tagline } : {}
}

const REVIEW_LABEL = { none: "Not required", optional: "Optional listing", required: "Required" } as const

export default async function GuidePage({ params }: PageProps<"/[slug]">) {
  const guide = getGuide((await params).slug)
  if (!guide) notFound()
  const probes = getProbes(guide.slug)
  const counts = evidenceCounts(guide)

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <nav className="text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Library</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{guide.name}</span>
        </nav>
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">{guide.name}</h1>
            <p className="text-muted-foreground">{guide.tagline}</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{guide.appType}</Badge>
              <Badge variant="outline">Composio toolkit: {guide.composio.toolkit}</Badge>
              <Badge variant="outline" className="text-muted-foreground">Verified {formatDate(guide.lastVerified)}</Badge>
            </div>
          </div>
          <ShareButton />
        </div>
      </div>

      <dl className="grid grid-cols-4 divide-x rounded-xl border bg-card">
        <Fact label="Hands-on time" value={formatMinutes(guide.facts.handsOnMinutes)} />
        <Fact label="Approval wait" value={formatWait(guide.facts.approvalWait)} />
        <Fact label="Provider review" value={REVIEW_LABEL[guide.facts.review]} />
        <Fact label="Cost" value={guide.facts.cost.asStated} />
      </dl>

      <Tabs defaultValue="setup" className="gap-6">
        <TabsList>
          <TabsTrigger value="setup">Setup</TabsTrigger>
          <TabsTrigger value="evidence">
            Evidence
            <span className="ml-1 font-mono text-xs text-muted-foreground">{counts.tested + counts.sourced + counts.uncertain}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="setup">
          <div className="grid grid-cols-[1fr_320px] items-start gap-6">
            <StepTracker guide={guide} />
            <aside className="space-y-4">
              <SideCard title="Before you start">
                {guide.requirements.map((r) => (
                  <Row key={r.title} title={r.title} detail={r.detail} />
                ))}
              </SideCard>
              <SideCard title="Blockers">
                {guide.blockers.map((b) => (
                  <div key={b.title} className="space-y-1 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{b.title}</span>
                      <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{b.owner}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{b.detail}</p>
                    <p className="text-xs">
                      <span className="text-success">Fix:</span> {b.fix}
                    </p>
                  </div>
                ))}
              </SideCard>
              <SideCard title="Watch out">
                {guide.traps.map((t) => (
                  <div key={t.title} className="space-y-1 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <EvidenceBadge evidence={t.evidence} sources={guide.sources} />
                    </div>
                    <p className="text-xs text-muted-foreground">{t.detail}</p>
                  </div>
                ))}
              </SideCard>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <CountCard kind="tested" count={counts.tested} detail="Checked live by a probe" />
            <CountCard kind="sourced" count={counts.sourced} detail="Backed by official docs" />
            <CountCard kind="uncertain" count={counts.uncertain} detail="Unconfirmed or conflicting" />
          </div>

          {probes && (
            <section className="rounded-xl border bg-card">
              <header className="flex items-center justify-between border-b px-5 py-3">
                <h2 className="text-sm font-semibold">Probes</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  ran {formatDateTime(probes.ranAt)} · npm run probe
                </span>
              </header>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-2 font-medium">Check</th>
                    <th className="px-5 py-2 font-medium">Expected</th>
                    <th className="px-5 py-2 font-medium">Observed</th>
                    <th className="px-5 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {probes.results.map((p) => (
                    <tr key={p.id} className="align-top">
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.title}</div>
                        <div className="mt-0.5 max-w-sm truncate font-mono text-[11px] text-muted-foreground" title={p.request}>
                          {p.request}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.expect}</td>
                      <td className="px-5 py-3 font-mono text-xs">{p.observed}</td>
                      <td className="px-5 py-3">
                        {p.pass ? (
                          <span className="inline-flex items-center gap-1 text-success"><CircleCheck className="size-4" />Pass</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-destructive"><CircleX className="size-4" />Fail</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <div className="grid grid-cols-2 gap-6">
            <SideCard title="Couldn't verify">
              {uncertainItems(guide).length + guide.unverified.length === 0 && (
                <p className="py-2.5 text-sm text-muted-foreground">Nothing open.</p>
              )}
              {uncertainItems(guide).map((u) => (
                  <div key={u.title} className="flex gap-2 py-2.5">
                    <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                    <div>
                      <div className="text-sm font-medium">{u.title}</div>
                      <p className="text-xs text-muted-foreground">{u.evidence.note}</p>
                    </div>
                  </div>
              ))}
              {guide.unverified.map((u) => (
                <div key={u.title} className="flex gap-2 py-2.5">
                  <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                  <div>
                    <div className="text-sm font-medium">{u.title}</div>
                    <p className="text-xs text-muted-foreground">{u.detail}</p>
                  </div>
                </div>
              ))}
            </SideCard>
            <SideCard title="Sources">
              {guide.sources.map((s) => (
                <a key={s.id} href={s.url} target="_blank" rel="noreferrer" className="flex items-center justify-between py-2 text-sm hover:text-foreground">
                  <span>{s.title}</span>
                  <ArrowUpRight className="size-3.5 text-muted-foreground" />
                </a>
              ))}
            </SideCard>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1 px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tracking-tight">{value}</dd>
    </div>
  )
}

function SideCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <h2 className="border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">{title}</h2>
      <div className="divide-y px-4">{children}</div>
    </section>
  )
}

function Row({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="py-2.5">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function CountCard({ kind, count, detail }: { kind: "tested" | "sourced" | "uncertain"; count: number; detail: string }) {
  return (
    <div className="rounded-xl border bg-card px-5 py-4">
      <div className="flex items-center gap-2 text-xs capitalize text-muted-foreground">
        <EvidenceDot kind={kind} />
        {kind}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{count}</div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" })
}

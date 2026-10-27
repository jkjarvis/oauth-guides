import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { GuideSteps } from "@/components/guide/guide-steps"
import { ShareButton } from "@/components/guide/share-button"
import { formatMinutes, formatWait, getGuide, getProbes, listGuides } from "@/lib/guides"

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

      <GuideSteps guide={guide} probes={getProbes(guide.slug)?.results ?? []} />
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

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

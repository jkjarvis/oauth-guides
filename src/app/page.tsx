import { LibraryGrid } from "@/components/library/library-grid"
import { formatMinutes, formatWait, listGuides } from "@/lib/guides"

export default function LibraryPage() {
  const guides = listGuides().map((g) => ({
    slug: g.slug,
    name: g.name,
    tagline: g.tagline,
    handsOn: formatMinutes(g.facts.handsOnMinutes),
    wait: formatWait(g.facts.approvalWait),
    cost: g.facts.cost.summary,
    steps: g.steps.length,
    review: g.facts.review,
  }))
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">Get your own OAuth app ready</h1>
        <p className="max-w-2xl text-muted-foreground">
          Per-provider guides for registering an OAuth app, getting it approved, and plugging it into Composio.
        </p>
      </div>
      <LibraryGrid guides={guides} />
    </div>
  )
}

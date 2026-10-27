"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Clock, Hourglass, Search, Sparkles, Wallet } from "lucide-react"
import { Input } from "@/components/ui/input"

export type GuideCard = {
  slug: string
  name: string
  tagline: string
  handsOn: string
  wait: string
  cost: string
  steps: number
  review: "none" | "optional" | "required"
}

export function LibraryGrid({ guides }: { guides: GuideCard[] }) {
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = q ? guides.filter((g) => g.name.toLowerCase().includes(q) || g.slug.includes(q)) : guides

  return (
    <div className="space-y-6">
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="library-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find an app, e.g. Slack"
          className="h-10 pl-9 text-base"
          autoComplete="off"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {shown.map((g) => (
          <Link
            key={g.slug}
            href={`/${g.slug}`}
            className="group flex flex-col justify-between gap-5 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30"
          >
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{g.name}</span>
                <ReviewTag review={g.review} />
              </div>
              <p className="text-sm text-muted-foreground">{g.tagline}</p>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <Stat icon={Clock} label="Hands-on" value={g.handsOn} />
              <Stat icon={Hourglass} label="Wait" value={g.wait} />
              <Stat icon={Wallet} label="Cost" value={g.cost} />
            </dl>
            <div className="flex items-center justify-between border-t pt-3 font-mono text-[11px] text-muted-foreground">
              <span>{g.steps} steps</span>
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}

        <Link
          href={q ? `/new?app=${encodeURIComponent(query.trim())}` : "/new"}
          className="group flex flex-col justify-between gap-5 rounded-xl border border-dashed p-5 transition-colors hover:border-foreground/30"
        >
          <div className="space-y-1.5">
            <span className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-info" />
              {q && shown.length === 0 ? `Generate a guide for “${query.trim()}”` : "Not in the list?"}
            </span>
            <p className="text-sm text-muted-foreground">
              An agent researches the provider&apos;s docs, runs live checks, and writes a guide in this format. About 3 minutes.
            </p>
          </div>
          <div className="flex items-center justify-between border-t pt-3 font-mono text-[11px] text-muted-foreground">
            <span>Generate a guide</span>
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </div>
    </div>
  )
}

function ReviewTag({ review }: { review: GuideCard["review"] }) {
  const tag = {
    none: { label: "No review", className: "text-success" },
    optional: { label: "Review optional", className: "text-muted-foreground" },
    required: { label: "Review required", className: "text-warning" },
  }[review]
  return <span className={`shrink-0 text-xs ${tag.className}`}>{tag.label}</span>
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <dt className="flex items-center gap-1 text-muted-foreground">
        <Icon className="size-3" />
        {label}
      </dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

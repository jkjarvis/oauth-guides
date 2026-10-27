import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { GuideView } from "@/components/guide/guide-view"
import { ShareButton } from "@/components/guide/share-button"
import { getGuide, getProbes, listGuides } from "@/lib/guides"

export function generateStaticParams() {
  return listGuides().map((g) => ({ slug: g.slug }))
}

export async function generateMetadata({ params }: PageProps<"/[slug]">): Promise<Metadata> {
  const guide = getGuide((await params).slug)
  return guide ? { title: guide.name, description: guide.tagline } : {}
}

export default async function GuidePage({ params }: PageProps<"/[slug]">) {
  const guide = getGuide((await params).slug)
  if (!guide) notFound()

  return (
    <div className="space-y-4">
      <nav className="text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Library</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{guide.name}</span>
      </nav>
      <GuideView guide={guide} probes={getProbes(guide.slug)?.results ?? []} actions={<ShareButton />} />
    </div>
  )
}

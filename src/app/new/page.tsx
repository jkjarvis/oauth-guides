import type { Metadata } from "next"
import { Suspense } from "react"
import { ResearchApp } from "@/components/research/research-app"

export const metadata: Metadata = { title: "Generate a guide", description: "Research an OAuth provider that isn't in the library." }

export default function NewGuidePage() {
  return (
    <Suspense>
      <ResearchApp />
    </Suspense>
  )
}

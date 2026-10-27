import type { Metadata } from "next"
import { SharedGuide } from "@/components/research/shared-guide"

export const metadata: Metadata = { title: "Shared guide", description: "A generated OAuth app guide." }

export default function SharedGuidePage() {
  return <SharedGuide />
}

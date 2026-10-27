"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CircleAlert, Loader2 } from "lucide-react"
import { GuideView } from "@/components/guide/guide-view"
import { GeneratedNotice } from "@/components/research/research-app"
import { ShareButton } from "@/components/guide/share-button"
import { decodeShare, type SharePayload } from "@/lib/share"

type State = { status: "loading" } | { status: "ready"; payload: SharePayload } | { status: "invalid" }

// Renders a generated guide carried in the link's #fragment.
export function SharedGuide() {
  const [state, setState] = useState<State>({ status: "loading" })

  useEffect(() => {
    const load = () => {
      const fragment = window.location.hash.slice(1)
      if (!fragment) return Promise.resolve<State>({ status: "invalid" })
      return decodeShare(fragment)
        .then((payload): State => ({ status: "ready", payload }))
        .catch((): State => ({ status: "invalid" }))
    }
    load().then(setState)
    const onHash = () => load().then(setState)
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  if (state.status === "loading")
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Opening shared guide
      </p>
    )
  if (state.status === "invalid")
    return (
      <div className="mx-auto max-w-xl space-y-3 rounded-lg border px-5 py-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CircleAlert className="size-4 text-destructive" />
          This share link is incomplete or damaged.
        </p>
        <p className="text-muted-foreground">
          Ask for the link again, or{" "}
          <Link href="/new" className="underline underline-offset-4">
            generate a new guide
          </Link>
          .
        </p>
      </div>
    )

  const { guide, probes } = state.payload
  return (
    <GuideView
      guide={guide}
      probes={probes}
      storageKey={`oauth-guides:generated:${guide.slug}`}
      actions={<ShareButton keepHash />}
      notice={<GeneratedNotice passed={probes.filter((p) => p.pass).length} />}
    />
  )
}

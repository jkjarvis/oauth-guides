"use client"

import { useState } from "react"
import { Check, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"

export function ShareButton() {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(window.location.href.split("#")[0])
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {copied ? <Check className="text-success" /> : <Link2 />}
      {copied ? "Link copied" : "Copy link"}
    </Button>
  )
}

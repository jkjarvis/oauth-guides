"use client"

import { useState } from "react"
import { CircleCheck, CircleX, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Result = { valid: true; appName: string } | { valid: false; reason: string }

export function ClientIdCheck({ onValid }: { onValid: () => void }) {
  const [clientId, setClientId] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Result | null>(null)

  async function check(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/check/github?client_id=${encodeURIComponent(clientId)}`)
      const data: Result = await res.json()
      setResult(data)
      if (data.valid) onValid()
    } catch {
      setResult({ valid: false, reason: "Couldn't run the check. Try again." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={check} className="flex gap-2">
        <Input
          id="github-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="Paste Client ID, e.g. Ov23li…"
          className="max-w-xs font-mono text-xs"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="outline" disabled={loading || clientId.trim().length < 10}>
          {loading && <Loader2 className="animate-spin" />}
          Check
        </Button>
      </form>
      {result?.valid && (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4" />
          Valid. Users will see “continue to <strong className="font-semibold">{result.appName}</strong>”.
        </p>
      )}
      {result && !result.valid && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleX className="size-4" />
          {result.reason}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Client ID only. Never paste your secret here.</p>
    </div>
  )
}

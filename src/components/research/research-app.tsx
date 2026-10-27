"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Check, CircleAlert, CircleCheck, CircleX, FileText, Link2, Loader2, Search, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { GuideView } from "@/components/guide/guide-view"
import { encodeShare } from "@/lib/share"
import type { Guide, ProbeResult } from "@/lib/guide-schema"
import type { ResearchEvent } from "@/lib/research/agent"

type Run =
  | { state: "idle" }
  | { state: "running"; app: string; events: ResearchEvent[]; started: number }
  | { state: "done"; app: string; events: ResearchEvent[]; guide: Guide; probes: ProbeResult[]; seconds: number; generatedAt: string }
  | { state: "error"; app: string; events: ResearchEvent[]; message: string }

export function ResearchApp() {
  const params = useSearchParams()
  const [app, setApp] = useState(params.get("app") ?? "")
  const [run, setRun] = useState<Run>({ state: "idle" })
  const abort = useRef<AbortController | null>(null)

  async function start(e?: React.FormEvent) {
    e?.preventDefault()
    const name = app.trim()
    if (name.length < 2) return
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    const events: ResearchEvent[] = []
    setRun({ state: "running", app: name, events: [], started: Date.now() })

    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ app: name }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null)
        setRun({ state: "error", app: name, events, message: body?.error ?? `Request failed (HTTP ${res.status}).` })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.trim()) continue
          const event = JSON.parse(line) as ResearchEvent
          events.push(event)
          if (event.type === "done") {
            setRun({ state: "done", app: name, events: [...events], guide: event.guide, probes: event.probes, seconds: event.seconds, generatedAt: new Date().toISOString() })
            return
          }
          if (event.type === "error") {
            setRun({ state: "error", app: name, events: [...events], message: event.message })
            return
          }
          setRun((r) => (r.state === "running" ? { ...r, events: [...events] } : r))
        }
      }
      setRun({ state: "error", app: name, events, message: "The connection closed before the guide was ready. Try again." })
    } catch (err) {
      if ((err as Error).name === "AbortError") return
      setRun({ state: "error", app: name, events, message: "Couldn't reach the research agent. Check your connection and try again." })
    }
  }

  function cancel() {
    abort.current?.abort()
    setRun({ state: "idle" })
  }

  if (run.state === "done") return <Result run={run} onNew={() => setRun({ state: "idle" })} />

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Generate a guide</h1>
        <p className="text-muted-foreground">
          For an app that isn&apos;t in the library. An agent reads the provider&apos;s docs, runs live checks, and writes a guide in the same format. Takes about
          3 minutes.
        </p>
      </div>

      <form onSubmit={start} className="flex gap-2">
        <Input
          id="research-app"
          value={app}
          onChange={(e) => setApp(e.target.value)}
          placeholder="App name or website, e.g. Xero or pipedrive.com"
          className="h-10 text-base"
          disabled={run.state === "running"}
          autoFocus
        />
        {run.state === "running" ? (
          <Button type="button" variant="outline" className="h-10" onClick={cancel}>
            <X />
            Cancel
          </Button>
        ) : (
          <Button type="submit" className="h-10" disabled={app.trim().length < 2}>
            <Sparkles />
            Generate
          </Button>
        )}
      </form>

      {run.state === "error" && (
        <div className="flex gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="space-y-1">
            <p className="font-medium">Couldn&apos;t generate a guide for {run.app}</p>
            <p className="text-muted-foreground">{run.message}</p>
          </div>
        </div>
      )}

      {run.state !== "idle" && <Activity events={run.events} running={run.state === "running"} started={run.state === "running" ? run.started : undefined} />}
    </div>
  )
}

function Activity({ events, running, started }: { events: ResearchEvent[]; running: boolean; started?: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])

  const toolkit = events.find((e): e is Extract<ResearchEvent, { type: "toolkit" }> => e.type === "toolkit")?.info
  const searches = events.filter((e): e is Extract<ResearchEvent, { type: "search" }> => e.type === "search")
  const reads = events.filter((e): e is Extract<ResearchEvent, { type: "read" }> => e.type === "read" && e.ok)
  const probes = events.filter((e): e is Extract<ResearchEvent, { type: "probe" }> => e.type === "probe")
  const submits = events.filter((e): e is Extract<ResearchEvent, { type: "submit" }> => e.type === "submit")
  const elapsed = started ? Math.floor((now - started) / 1000) : 0
  const phase = submits.length
    ? "Checking the guide"
    : probes.length > 6
      ? "Running live checks"
      : reads.length
        ? "Reading the provider's docs"
        : searches.length
          ? "Searching for official docs"
          : "Starting"

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex items-center justify-between border-b px-5 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          {running ? <Loader2 className="size-4 animate-spin text-info" /> : <Check className="size-4 text-muted-foreground" />}
          {running ? phase : "Research log"}
        </div>
        {running && <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatElapsed(elapsed)}</span>}
      </header>
      <div className="grid gap-6 p-5 sm:grid-cols-2">
        <Group title="Composio">
          {toolkit ? (
            <Row icon={<CircleCheck className="size-3.5 text-success" />}>
              {toolkit.name ?? toolkit.slug} toolkit · {toolkit.managed ? "managed app available" : toolkit.managed === false ? "bring your own app" : "auth unknown"}
            </Row>
          ) : (
            <Row icon={<Loader2 className="size-3.5 text-muted-foreground" />}>Looking up the toolkit</Row>
          )}
        </Group>
        <Group title={`Searches (${searches.length})`}>
          {searches.map((s) => (
            <Row key={s.query} icon={<Search className="size-3.5 text-muted-foreground" />}>
              {s.query}
            </Row>
          ))}
        </Group>
        <Group title={`Pages read (${reads.length})`}>
          {reads.map((r) => (
            <Row key={r.url} icon={<FileText className="size-3.5 text-muted-foreground" />}>
              <a href={r.url} target="_blank" rel="noreferrer" className="hover:underline">
                {r.title || shortUrl(r.url)}
              </a>
            </Row>
          ))}
        </Group>
        <Group title={`Live checks (${probes.filter((p) => p.result.pass).length}/${probes.length} passed)`}>
          {probes.map((p) => (
            <Row key={p.result.id} icon={p.result.pass ? <CircleCheck className="size-3.5 text-success" /> : <CircleX className="size-3.5 text-destructive" />}>
              <span title={`${p.result.request}\n→ ${p.result.observed}`}>{p.result.title}</span>
            </Row>
          ))}
        </Group>
      </div>
      {submits.length > 0 && (
        <div className="space-y-1 border-t px-5 py-3 text-sm">
          {submits.map((s, i) =>
            s.ok ? (
              <Row key={i} icon={<CircleCheck className="size-3.5 text-success" />}>
                Guide passed validation
              </Row>
            ) : (
              <Row key={i} icon={<CircleAlert className="size-3.5 text-warning" />}>
                Draft {i + 1} sent back with {s.errors.length} issue{s.errors.length === 1 ? "" : "s"} to fix
              </Row>
            ),
          )}
        </div>
      )}
    </section>
  )
}

function Result({ run, onNew }: { run: Extract<Run, { state: "done" }>; onNew: () => void }) {
  const [copied, setCopied] = useState(false)
  const reads = run.events.filter((e) => e.type === "read" && e.ok).length
  const passed = run.probes.filter((p) => p.pass).length

  async function share() {
    const fragment = await encodeShare(run.guide, run.probes, run.generatedAt)
    const url = `${window.location.origin}/g#${fragment}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt("Copy this link", url)
    }
  }

  return (
    <div className="space-y-6">
      <GuideView
        guide={run.guide}
        probes={run.probes}
        storageKey={`oauth-guides:generated:${run.guide.slug}`}
        actions={
          <>
            <Button variant="outline" onClick={onNew}>
              New guide
            </Button>
            <Button onClick={share}>
              {copied ? <Check /> : <Link2 />}
              {copied ? "Link copied" : "Copy share link"}
            </Button>
          </>
        }
        notice={<GeneratedNotice reads={reads} passed={passed} seconds={run.seconds} />}
      />
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-5 py-3 text-sm font-medium">How this guide was researched</summary>
        <div className="border-t">
          <Activity events={run.events} running={false} />
        </div>
      </details>
    </div>
  )
}

export function GeneratedNotice({ reads, passed, seconds }: { reads?: number; passed: number; seconds?: number }) {
  return (
    <div className="flex gap-2.5 rounded-lg border border-info/30 bg-info/5 px-4 py-3 text-sm">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-info" />
      <p>
        <span className="font-medium">Generated by an AI agent{seconds ? ` in ${formatElapsed(seconds)}` : ""}</span>
        <span className="text-muted-foreground">
          {" "}
          from {reads !== undefined ? `${reads} pages and ` : ""}
          {passed} passing live checks. No person has reviewed it yet. Each step lists its sources, and anything the agent couldn&apos;t verify is marked
          &ldquo;Not confirmed&rdquo;.
        </span>
      </p>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      <ul className="max-h-56 space-y-1 overflow-y-auto pr-1 text-sm">{children}</ul>
    </div>
  )
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex min-w-0 items-start gap-2">
      <span className="mt-1 shrink-0">{icon}</span>
      <span className="min-w-0 break-words">{children}</span>
    </li>
  )
}

function shortUrl(u: string) {
  try {
    const url = new URL(u)
    return url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "")
  } catch {
    return u
  }
}

function formatElapsed(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}


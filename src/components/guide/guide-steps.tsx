"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  Circle,
  CircleDashed,
  RotateCcw,
  TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton } from "@/components/guide/copy-button"
import { ClientIdCheck } from "@/components/guide/client-id-check"
import { WhoChip } from "@/components/guide/labels"
import { formatMinutes } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Guide, ProbeResult, Step } from "@/lib/guide-schema"

type Status = "done" | "blocked" | "skipped"
type ProgressMap = Record<string, { status: Status; at: string }>

// Progress lives in this browser only, keyed by step id so guide updates keep finished steps.
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  window.addEventListener("storage", onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener("storage", onChange)
  }
}

function readStorage(key: string) {
  try {
    return localStorage.getItem(key) ?? ""
  } catch {
    return ""
  }
}

function useProgress(slug: string) {
  const key = `oauth-guides:${slug}`
  // null on the server and during hydration, so the first paint matches the static HTML.
  const raw = useSyncExternalStore(subscribe, () => readStorage(key), () => null)
  const progress = useMemo<ProgressMap>(() => {
    try {
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  }, [raw])

  function save(next: ProgressMap) {
    try {
      localStorage.setItem(key, JSON.stringify(next))
    } catch {}
    listeners.forEach((l) => l())
  }

  return { progress, loaded: raw !== null, save }
}

const LANG_LABEL = { ts: "TypeScript", python: "Python", bash: "Shell" } as const

export function GuideSteps({ guide, probes }: { guide: Guide; probes: ProbeResult[] }) {
  const { progress, loaded, save } = useProgress(guide.slug)
  // null follows the first unfinished step.
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const isFinished = (id: string) => ["done", "skipped"].includes(progress[id]?.status ?? "")
  const current = guide.steps.find((s) => !isFinished(s.id))
  const finishedCount = guide.steps.filter((s) => isFinished(s.id)).length
  const selected = guide.steps.find((s) => s.id === selectedId) ?? current ?? guide.steps[guide.steps.length - 1]
  const index = guide.steps.indexOf(selected)

  function setStatus(step: Step, status: Status | null, { advance = true } = {}) {
    const next = { ...progress }
    if (status) next[step.id] = { status, at: new Date().toISOString() }
    else delete next[step.id]
    save(next)
    if (advance) setSelectedId(null)
  }

  return (
    <div className="grid grid-cols-[260px_1fr] items-start gap-8">
      <nav className="sticky top-20 space-y-4" aria-label="Steps">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">Steps</span>
            <span className="font-mono tabular-nums text-muted-foreground">
              {finishedCount}/{guide.steps.length} done
            </span>
          </div>
          <Progress value={loaded ? Math.round((finishedCount / guide.steps.length) * 100) : 0} className="h-1" />
        </div>
        <ol className="space-y-0.5">
          {guide.steps.map((step, i) => {
            const state = progress[step.id]?.status
            const active = step.id === selected.id
            return (
              <li key={step.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(step.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <StatusIcon state={state} current={step.id === current?.id} />
                  <span className="w-4 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className={cn("flex-1 leading-snug", state === "done" && "line-through decoration-muted-foreground/40")}>
                    {step.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => save({})} disabled={finishedCount === 0 && !Object.keys(progress).length}>
          <RotateCcw />
          Reset progress
        </Button>
      </nav>

      <StepView
        key={selected.id}
        step={selected}
        index={index}
        total={guide.steps.length}
        state={progress[selected.id]?.status}
        at={progress[selected.id]?.at}
        guide={guide}
        probes={probes}
        onStatus={(s, opts) => setStatus(selected, s, opts)}
        onGo={(i) => setSelectedId(guide.steps[i].id)}
      />
    </div>
  )
}

function StepView({
  step,
  index,
  total,
  state,
  at,
  guide,
  probes,
  onStatus,
  onGo,
}: {
  step: Step
  index: number
  total: number
  state?: Status
  at?: string
  guide: Guide
  probes: ProbeResult[]
  onStatus: (s: Status | null, opts?: { advance?: boolean }) => void
  onGo: (i: number) => void
}) {
  const sources = step.sources.map((id) => guide.sources.find((s) => s.id === id)).filter((s) => s !== undefined)
  const checks = step.checks.map((id) => probes.find((p) => p.id === id)).filter((p) => p !== undefined)
  const finished = state === "done" || state === "skipped"

  return (
    <article className="min-w-0 rounded-xl border bg-card">
      <div className="space-y-6 p-8">
        <header className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">
              Step {index + 1} of {total}
            </span>
            <WhoChip who={step.who} />
            {step.minutes.max > 0 && <span className="font-mono tabular-nums">{formatMinutes(step.minutes)}</span>}
            {step.optional && <span className="rounded-full border px-2 py-0.5">Optional</span>}
            {state === "blocked" && <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">Blocked</span>}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{step.title}</h2>
          {step.when && <p className="text-sm text-muted-foreground">{step.when}</p>}
        </header>

        <ol className="space-y-2.5">
          {step.instructions.map((text, i) => (
            <li key={text} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted font-mono text-[11px] text-muted-foreground">
                {i + 1}
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ol>

        {step.fields.length > 0 && (
          <dl className="divide-y rounded-lg border bg-background text-sm">
            {step.fields.map((f) => (
              <div key={f.label} className="grid grid-cols-[220px_1fr_auto] items-center gap-3 px-4 py-2.5">
                <dt className="text-muted-foreground">{f.label}</dt>
                <dd className="min-w-0">
                  <span className={cn("break-all", f.copy && "font-mono text-xs")}>{f.value}</span>
                  {f.hint && <span className="block text-xs text-muted-foreground">{f.hint}</span>}
                </dd>
                {f.copy ? <CopyButton value={f.value} label={`Copy ${f.label}`} /> : <span className="size-6" />}
              </div>
            ))}
          </dl>
        )}

        {step.check === "github-client-id" && (
          <ClientIdCheck onValid={() => state !== "done" && onStatus("done", { advance: false })} />
        )}

        {step.snippets.length > 0 && (
          <Tabs defaultValue={step.snippets[0].lang}>
            <TabsList>
              {step.snippets.map((s) => (
                <TabsTrigger key={s.lang} value={s.lang}>
                  {LANG_LABEL[s.lang]}
                </TabsTrigger>
              ))}
            </TabsList>
            {step.snippets.map((s) => (
              <TabsContent key={s.lang} value={s.lang} className="relative">
                <pre className="overflow-x-auto rounded-lg border bg-background p-4 font-mono text-xs leading-relaxed">{s.code}</pre>
                <span className="absolute top-2 right-2">
                  <CopyButton value={s.code} label="Copy code" />
                </span>
              </TabsContent>
            ))}
          </Tabs>
        )}

        {step.actions.length > 0 && (
          <div className="flex gap-2">
            {step.actions.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-muted"
              >
                {a.label}
                <ArrowUpRight className="size-3.5" />
              </a>
            ))}
          </div>
        )}

        {step.warnings.length > 0 && (
          <div className="space-y-2">
            {step.warnings.map((w) => (
              <div key={w.text} className="flex gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                <div className="space-y-1">
                  <p>{w.text}</p>
                  {w.unconfirmed && <p className="text-xs text-muted-foreground">Not confirmed: {w.unconfirmed}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-8 py-4">
        <div className="flex items-center gap-2">
          {finished ? (
            <>
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CircleCheck className="size-4" />
                {state === "done" ? "Done" : "Skipped"} · {at && formatWhen(at)}
              </span>
              <Button variant="ghost" size="sm" onClick={() => onStatus(null, { advance: false })}>
                Undo
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => onStatus("done")}>
                <Check />
                Mark done
              </Button>
              {state === "blocked" ? (
                <Button variant="outline" onClick={() => onStatus(null, { advance: false })}>
                  Unblock
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => onStatus("blocked", { advance: false })}>
                  <Ban />
                  I&apos;m blocked
                </Button>
              )}
              {step.optional && (
                <Button variant="ghost" onClick={() => onStatus("skipped")}>
                  Skip
                </Button>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled={index === 0} onClick={() => onGo(index - 1)}>
            <ArrowLeft />
            Back
          </Button>
          <Button variant="ghost" size="sm" disabled={index === total - 1} onClick={() => onGo(index + 1)}>
            Next
            <ArrowRight />
          </Button>
        </div>
      </div>

      {(sources.length > 0 || checks.length > 0 || step.unconfirmed) && (
        <footer className="space-y-3 border-t bg-muted/30 px-8 py-5 text-sm">
          {checks.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">Checked live</h3>
              <ul className="space-y-1">
                {checks.map((c) => (
                  <li key={c.id} className="flex items-center gap-2" title={`${c.request}\n→ ${c.observed}`}>
                    {c.pass ? <CircleCheck className="size-3.5 text-success" /> : <CircleAlert className="size-3.5 text-destructive" />}
                    <span>{c.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.unconfirmed && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">Not confirmed</h3>
              <p className="flex gap-2">
                <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {step.unconfirmed}
              </p>
            </div>
          )}
          {sources.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">Sources</h3>
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                {sources.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                      {s.title}
                      <ArrowUpRight className="size-3" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </footer>
      )}
    </article>
  )
}

function StatusIcon({ state, current }: { state?: Status; current: boolean }) {
  const base = "size-4 shrink-0"
  if (state === "done")
    return (
      <span className={cn(base, "grid place-items-center rounded-full bg-success text-background")}>
        <Check className="size-2.5" strokeWidth={3.5} />
      </span>
    )
  if (state === "blocked") return <TriangleAlert className={cn(base, "text-warning")} />
  if (state === "skipped") return <CircleDashed className={cn(base, "text-muted-foreground")} />
  if (current)
    return (
      <span className={cn(base, "grid place-items-center rounded-full border-2 border-info")}>
        <span className="size-1.5 rounded-full bg-info" />
      </span>
    )
  return <Circle className={cn(base, "text-muted-foreground/50")} />
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

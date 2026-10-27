"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import { ArrowUpRight, Ban, Check, ChevronDown, Circle, CircleDashed, RotateCcw, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton } from "@/components/guide/copy-button"
import { ClientIdCheck } from "@/components/guide/client-id-check"
import { EvidenceBadge, WhoChip } from "@/components/guide/labels"
import { formatMinutes } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Guide, Step } from "@/lib/guide-schema"

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

export function StepTracker({ guide }: { guide: Guide }) {
  const { progress, loaded, save } = useProgress(guide.slug)
  const [open, setOpen] = useState<Set<string>>(new Set())

  const isFinished = (id: string) => ["done", "skipped"].includes(progress[id]?.status ?? "")
  const current = guide.steps.find((s) => !isFinished(s.id))
  const finishedCount = guide.steps.filter((s) => isFinished(s.id)).length
  const percent = Math.round((finishedCount / guide.steps.length) * 100)

  function setStatus(step: Step, status: Status | null, { keepOpen = false } = {}) {
    const next = { ...progress }
    if (status) next[step.id] = { status, at: new Date().toISOString() }
    else delete next[step.id]
    save(next)
    // Collapse so the next unfinished step opens, unless the user needs to see a result here.
    setOpen(keepOpen ? (prev) => new Set(prev).add(step.id) : new Set())
  }

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="rounded-xl border bg-card">
      <div className="space-y-3 border-b p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Steps</h2>
            <p className="text-sm text-muted-foreground">
              {current ? (
                <>
                  Next: <span className="text-foreground">{current.title}</span>
                </>
              ) : (
                <span className="text-success">All steps done. Your users can connect.</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {finishedCount}/{guide.steps.length} done
            </span>
            <Button variant="ghost" size="xs" onClick={() => save({})} disabled={finishedCount === 0 && !Object.keys(progress).length}>
              <RotateCcw />
              Reset
            </Button>
          </div>
        </div>
        <Progress value={loaded ? percent : 0} className="h-1" />
      </div>

      <ol className="relative">
        {guide.steps.map((step, i) => {
          const state = progress[step.id]?.status
          const isCurrent = step.id === current?.id
          const expanded = open.has(step.id) || (isCurrent && open.size === 0)
          return (
            <li key={step.id} className={cn("relative border-b last:border-b-0", isCurrent && "bg-muted/40")}>
              {i < guide.steps.length - 1 && <span className="absolute top-9 bottom-0 left-[29px] w-px bg-border" />}
              <button
                type="button"
                onClick={() => toggle(step.id)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
                aria-expanded={expanded}
              >
                <StatusIcon state={state} current={isCurrent} />
                <span className={cn("flex-1 text-sm font-medium", state === "done" && "text-muted-foreground line-through decoration-muted-foreground/40")}>
                  {step.title}
                  {step.optional && <span className="ml-2 text-xs font-normal text-muted-foreground">optional</span>}
                </span>
                <WhoChip who={step.who} />
                <span className="w-16 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatMinutes(step.minutes)}</span>
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
              </button>

              {expanded && (
                <div className="space-y-4 pr-5 pb-5 pl-[52px]">
                  {step.when && <p className="text-xs text-warning">{step.when}</p>}

                  {step.pointers.length > 0 && (
                    <ul className="space-y-1.5 text-sm">
                      {step.pointers.map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                          {p}
                        </li>
                      ))}
                    </ul>
                  )}

                  {step.fields.length > 0 && (
                    <dl className="divide-y rounded-lg border bg-background text-sm">
                      {step.fields.map((f) => (
                        <div key={f.label} className="grid grid-cols-[200px_1fr_auto] items-center gap-3 px-3 py-2">
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
                    <ClientIdCheck onValid={() => state !== "done" && setStatus(step, "done", { keepOpen: true })} />
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
                          <pre className="overflow-x-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed">{s.code}</pre>
                          <span className="absolute top-2 right-2">
                            <CopyButton value={s.code} label="Copy code" />
                          </span>
                        </TabsContent>
                      ))}
                    </Tabs>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-2">
                      {state === "done" || state === "skipped" ? (
                        <>
                          <span className="text-xs text-muted-foreground">
                            {state === "done" ? "Done" : "Skipped"} · {formatWhen(progress[step.id].at)}
                          </span>
                          <Button variant="ghost" size="sm" onClick={() => setStatus(step, null)}>
                            Undo
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" onClick={() => setStatus(step, "done")}>
                            <Check />
                            Mark done
                          </Button>
                          {state === "blocked" ? (
                            <Button variant="outline" size="sm" onClick={() => setStatus(step, null)}>
                              Unblock
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => setStatus(step, "blocked")}>
                              <Ban />
                              Blocked
                            </Button>
                          )}
                          {step.optional && (
                            <Button variant="ghost" size="sm" onClick={() => setStatus(step, "skipped")}>
                              Skip
                            </Button>
                          )}
                        </>
                      )}
                      {step.actions.map((a) => (
                        <a
                          key={a.url}
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                        >
                          {a.label}
                          <ArrowUpRight className="size-3.5" />
                        </a>
                      ))}
                    </div>
                    <EvidenceBadge evidence={step.evidence} sources={guide.sources} />
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function StatusIcon({ state, current }: { state?: Status; current: boolean }) {
  const base = "relative z-10 size-[18px] shrink-0 rounded-full bg-card"
  if (state === "done")
    return (
      <span className={cn(base, "grid place-items-center bg-success text-background")}>
        <Check className="size-3" strokeWidth={3} />
      </span>
    )
  if (state === "blocked") return <TriangleAlert className={cn(base, "text-warning")} />
  if (state === "skipped") return <CircleDashed className={cn(base, "text-muted-foreground")} />
  if (current)
    return (
      <span className={cn(base, "grid place-items-center border-2 border-info")}>
        <span className="size-1.5 rounded-full bg-info" />
      </span>
    )
  return <Circle className={cn(base, "text-muted-foreground/50")} />
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

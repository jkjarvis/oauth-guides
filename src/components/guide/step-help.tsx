"use client"

import { useState } from "react"
import { ArrowUpRight, Check, ChevronRight, Copy, LifeBuoy, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CopyButton } from "@/components/guide/copy-button"
import type { Contact, Guide, Step } from "@/lib/guide-schema"

// Our explanation comes first; contacting the provider is the fallback.
export function StepHelp({ guide, step }: { guide: Guide; step: Step }) {
  const contacts: Contact[] = step.contacts.length
    ? step.contacts.map((id) => guide.contacts.find((c) => c.id === id)).filter((c) => c !== undefined)
    : guide.contacts.filter((c) => c.org === "provider")
  const message = draftMessage(guide, step)

  if (step.problems.length === 0 && contacts.length === 0) return null

  return (
    <section className="rounded-lg border">
      <h3 className="flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <LifeBuoy className="size-4 text-muted-foreground" />
        Stuck on this step?
      </h3>

      {step.problems.length > 0 && (
        <div className="divide-y px-4 pb-1">
          {step.problems.map((p) => (
            <details key={p.q} className="group py-2.5">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                {p.q}
              </summary>
              <ul className="mt-2 space-y-1 pl-6 text-sm text-muted-foreground">
                {p.a.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground" />
                    {line}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}

      {contacts.length > 0 && (
        <details className="group border-t bg-muted/30 px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            {step.problems.length > 0 ? "Still stuck? " : ""}Ask {contacts.map((c) => c.label).join(" or ")}
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">Copy the message below so they have the details.</p>
            <div className="space-y-2">
              {contacts.map((c) => (
                <ContactRow key={c.id} contact={c} message={message} />
              ))}
            </div>
            <MessageDraft message={message} />
          </div>
        </details>
      )}
    </section>
  )
}

function ContactRow({ contact, message }: { contact: Contact; message: { subject: string; body: string } }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium">{contact.label}</div>
        <div className="text-xs text-muted-foreground">{contact.when}</div>
      </div>
      {contact.kind === "email" ? (
        <div className="flex items-center gap-1">
          <span className="font-mono text-xs select-all">{contact.target}</span>
          <CopyButton value={contact.target} label="Copy email address" />
          <a
            href={`mailto:${contact.target}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`}
            className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
          >
            <Mail className="size-3.5" />
            Email
          </a>
        </div>
      ) : (
        <a
          href={contact.target}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
        >
          Open
          <ArrowUpRight className="size-3.5" />
        </a>
      )}
    </div>
  )
}

function MessageDraft({ message }: { message: { subject: string; body: string } }) {
  const [copied, setCopied] = useState(false)
  const text = `${message.subject}\n\n${message.body}`
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Ready-to-send message</span>
        <Button
          variant="ghost"
          size="xs"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {}
          }}
        >
          {copied ? <Check className="text-success" /> : <Copy />}
          {copied ? "Copied" : "Copy message"}
        </Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border bg-background p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {text}
      </pre>
    </div>
  )
}

function draftMessage(guide: Guide, step: Step) {
  const subject = `Help with ${guide.name} OAuth app setup: ${step.title}`
  const body = [
    "Hi,",
    "",
    `I'm setting up an OAuth app (${guide.appType}) so my users can connect ${guide.name} through Composio.`,
    "",
    `Step I'm stuck on: ${step.title}`,
    "What I did: <what you clicked or submitted>",
    "What happened: <exact error message or status>",
    "App / Client ID: <public ID, never the secret>",
    `Redirect URI: ${guide.composio.callbackUrl}`,
    "",
    "Thanks!",
  ].join("\n")
  return { subject, body }
}

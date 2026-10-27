import type { Wait } from "@/lib/guide-schema"

export function formatMinutes({ min, max }: { min: number; max: number }) {
  if (max === 0) return "—"
  // Past two hours, minutes stop being readable ("30–540 min" → "0.5–9 h").
  if (max >= 120) {
    const h = (m: number) => String(Math.round((m / 60) * 10) / 10)
    return min === max ? `${h(max)} h` : `${h(min)}–${h(max)} h`
  }
  return min === max ? `${max} min` : `${min}–${max} min`
}

export function formatWait(wait: Wait | null) {
  return wait ? (wait.summary ?? wait.asStated) : "None"
}

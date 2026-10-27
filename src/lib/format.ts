import type { Wait } from "@/lib/guide-schema"

export function formatMinutes({ min, max }: { min: number; max: number }) {
  if (max === 0) return "—"
  return min === max ? `${max} min` : `${min}–${max} min`
}

export function formatWait(wait: Wait | null) {
  return wait ? wait.asStated : "None"
}

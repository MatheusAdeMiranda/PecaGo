import { Badge } from "@/components/ui/badge"
import { getStatusMeta } from "@/lib/format"
import { cn } from "@/lib/utils"

const toneClasses = {
  info: "bg-[#16324a]/10 text-[#16324a] ring-[#16324a]/10",
  accent: "bg-[#b55a22]/12 text-[#8e4517] ring-[#b55a22]/10",
  success: "bg-emerald-600/12 text-emerald-700 ring-emerald-600/10",
  danger: "bg-red-700/10 text-red-700 ring-red-700/10",
} as const

export function StatusBadge({ status }: { status: string }) {
  const meta = getStatusMeta(status)

  return (
    <Badge
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-[0.14em] uppercase ring-1",
        toneClasses[meta.tone as keyof typeof toneClasses]
      )}
    >
      {meta.label}
    </Badge>
  )
}

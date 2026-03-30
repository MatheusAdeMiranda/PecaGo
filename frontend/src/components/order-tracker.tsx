import type { OrderStatus } from "@/lib/api"
import { ORDER_TRACK_STEPS, getTrackerStatus } from "@/lib/format"
import { cn } from "@/lib/utils"

export function OrderTracker({ status }: { status: OrderStatus }) {
  const currentStatus = getTrackerStatus(status)
  const currentIndex = ORDER_TRACK_STEPS.findIndex((step) => step.key === currentStatus)
  const activeIndex = currentIndex >= 0 ? currentIndex : 0

  return (
    <div className="grid gap-3">
      {ORDER_TRACK_STEPS.map((step, index) => {
        const isDone = index < activeIndex
        const isActive = step.key === currentStatus

        return (
          <div
            key={step.key}
            className={cn(
              "grid grid-cols-[42px_1fr] gap-3 rounded-2xl border px-4 py-3 transition-colors",
              isDone && "border-emerald-600/20 bg-emerald-50",
              isActive && "border-[#b55a22]/30 bg-[#fff4eb]",
              !isDone && !isActive && "border-[#d7e0e8] bg-white"
            )}
          >
            <div
              className={cn(
                "grid size-10 place-items-center rounded-full text-sm font-bold",
                isDone && "bg-emerald-600 text-white",
                isActive && "bg-[#b55a22] text-white",
                !isDone && !isActive && "bg-[#16324a]/10 text-[#16324a]"
              )}
            >
              {index + 1}
            </div>
            <div>
              <div className="font-semibold text-[#12202d]">{step.title}</div>
              <div className="mt-1 text-sm leading-6 text-slate-600">{step.description}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

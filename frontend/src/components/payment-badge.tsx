import { cn } from "@/lib/utils"
import type { PaymentStatus } from "@/lib/api"

const CONFIG: Record<PaymentStatus, { label: string; className: string }> = {
  pending:  { label: "Aguardando pagamento", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Pago",                 className: "bg-green-100 text-green-700" },
  rejected: { label: "Pagamento recusado",   className: "bg-red-100 text-red-700" },
  refunded: { label: "Estornado",            className: "bg-slate-100 text-slate-500" },
}

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.pending
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", className)}>
      {label}
    </span>
  )
}

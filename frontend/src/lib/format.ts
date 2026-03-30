import type { OrderStatus, UserRole } from "@/lib/api"

export const ORDER_TRACK_STEPS = [
  {
    key: "accepted",
    title: "Pedido aceito",
    description: "Loja confirmou o pedido e abriu a jornada.",
  },
  {
    key: "preparing",
    title: "Separacao",
    description: "Itens sendo preparados para despacho.",
  },
  {
    key: "in_delivery",
    title: "Em rota",
    description: "Corrida em andamento ate oficina ou cliente.",
  },
  {
    key: "delivered",
    title: "Concluido",
    description: "Entrega finalizada com sucesso.",
  },
] as const

const STATUS_META = {
  pending: { label: "Aguardando", tone: "info" },
  accepted: { label: "Aceito", tone: "info" },
  preparing: { label: "Separando", tone: "accent" },
  in_delivery: { label: "Em rota", tone: "accent" },
  delivered: { label: "Concluido", tone: "success" },
  cancelled: { label: "Cancelado", tone: "danger" },
} as const

const ROLE_LABELS: Record<UserRole, string> = {
  store: "Loja",
  customer: "Cliente",
  mechanic: "Mecanico",
  delivery: "Entrega",
}

export function currency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0))
}

export function formatClock(date: Date | string | number = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export function formatDate(date: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date))
}

export function formatToken(token: string) {
  if (!token) {
    return "Nenhum token ainda."
  }

  if (token.length < 22) {
    return token
  }

  return `${token.slice(0, 14)}...${token.slice(-10)}`
}

export function getStatusMeta(status: OrderStatus | string) {
  return STATUS_META[status as OrderStatus] ?? {
    label: status || "Sem status",
    tone: "info",
  }
}

export function getTrackerStatus(status: OrderStatus) {
  return status === "pending" ? "accepted" : status
}

export function getRoleLabel(role: UserRole) {
  return ROLE_LABELS[role]
}

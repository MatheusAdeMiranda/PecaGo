import { useEffect, useRef, useState } from "react"
import { Bell } from "lucide-react"

import { api } from "@/lib/api"
import { formatClock } from "@/lib/format"
import { cn } from "@/lib/utils"

interface NotificationItem {
  id: number
  type: string
  payload: { order_id: number; message: string }
  read: boolean
  created_at: string
}

const POLL_INTERVAL_MS = 15_000

export function NotificationBell({ token }: { token: string }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const panelRef = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => !n.read).length

  // polling a cada 15 s
  useEffect(() => {
    if (!token) return
    let cancelled = false

    async function fetchNotifications() {
      try {
        const data = await api<NotificationItem[]>("/notifications", {}, token)
        if (!cancelled) setNotifications(data)
      } catch {
        // silencioso — não interrompe a sessão
      }
    }

    fetchNotifications()
    const id = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [token])

  // fecha ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  async function markAsRead(id: number) {
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" }, token)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      )
    } catch {
      // silencioso
    }
  }

  async function markAllRead() {
    try {
      await api("/notifications/read-all", { method: "POST" }, token)
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    } catch {
      // silencioso
    }
  }

  if (!token) return null

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen((v) => !v)}
        className="relative grid size-10 place-items-center rounded-full border border-[#d7e0e8] bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#16324a]"
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#b55a22] text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 overflow-hidden rounded-[20px] border border-[#d7e0e8] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[#d7e0e8] px-4 py-3">
            <span className="text-sm font-semibold text-[#12202d]">Notificações</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-[#16324a] hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                Nenhuma notificação ainda.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markAsRead(n.id)}
                  className={cn(
                    "w-full border-b border-[#d7e0e8] px-4 py-3 text-left text-sm transition-colors last:border-0 hover:bg-slate-50",
                    !n.read && "bg-[#f0f5fa]"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("leading-5 text-slate-600", !n.read && "font-semibold text-[#12202d]")}>
                      {n.payload.message}
                    </span>
                    {!n.read && (
                      <span className="mt-1 size-2 shrink-0 rounded-full bg-[#b55a22]" />
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {formatClock(n.created_at)}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

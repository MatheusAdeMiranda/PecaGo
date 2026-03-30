import { startTransition, useCallback, useEffect, useState } from "react"

import { api, type DemoSeedResponse, type SummaryResponse } from "@/lib/api"

export function useDemoSummary(intervalMs = 20000) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSeeding, setIsSeeding] = useState(false)
  const [seedNote, setSeedNote] = useState("")
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  const refreshSummary = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setIsLoading(true)
    }

    try {
      const data = await api<SummaryResponse>("/demo/summary")
      startTransition(() => {
        setSummary(data)
        setUpdatedAt(Date.now())
      })
      return data
    } finally {
      if (!silent) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    void refreshSummary()

    if (!intervalMs) {
      return undefined
    }

    const timer = window.setInterval(() => {
      void refreshSummary({ silent: true })
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [intervalMs, refreshSummary])

  const seedDemo = useCallback(async () => {
    setIsSeeding(true)

    try {
      const data = await api<DemoSeedResponse>("/demo/seed", {
        method: "POST",
      })

      startTransition(() => {
        setSummary(data)
        setUpdatedAt(Date.now())
        setSeedNote(
          `${data.message}. Store ID ${data.store_id ?? 1}, produtos ${
            data.product_ids?.join(", ") ?? "1, 2, 3"
          }, pedido #${data.demo_order_id ?? 1}.`
        )
      })

      return data
    } finally {
      setIsSeeding(false)
    }
  }, [])

  return {
    summary,
    isLoading,
    isSeeding,
    seedNote,
    updatedAt,
    refreshSummary,
    seedDemo,
  }
}

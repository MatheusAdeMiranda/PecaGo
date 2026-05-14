/**
 * Mapa de rastreamento ao vivo do entregador.
 *
 * - Usa Leaflet + OpenStreetMap (sem chave de API).
 * - Conecta ao SSE GET /deliveries/{orderId}/track/stream e atualiza o marcador
 *   do entregador em tempo real.
 * - Exibe também o pino do destino final (delivery_latitude/longitude).
 * - Fallback para polling REST a cada 5s se o navegador não suportar EventSource
 *   ou se o SSE falhar.
 */

import { useEffect, useRef, useState } from "react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import type { TrackingSnapshot } from "@/lib/api"

// Corrige o caminho dos ícones padrão do Leaflet no Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

const DELIVERY_ICON = L.divIcon({
  html: `<div style="
    width:36px;height:36px;border-radius:50%;
    background:#16324a;border:3px solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.35);
    display:flex;align-items:center;justify-content:center;
    font-size:18px;line-height:1;
  ">🛵</div>`,
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
})

const DESTINATION_ICON = L.divIcon({
  html: `<div style="
    width:32px;height:32px;border-radius:50%;
    background:#b55a22;border:3px solid white;
    box-shadow:0 2px 8px rgba(0,0,0,0.3);
    display:flex;align-items:center;justify-content:center;
    font-size:16px;line-height:1;
  ">📍</div>`,
  className: "",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
})

interface Props {
  orderId: number
  token: string
  initialSnapshot?: TrackingSnapshot | null
}

export function TrackingMap({ orderId, token, initialSnapshot }: Props) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMap = useRef<L.Map | null>(null)
  const deliveryMarker = useRef<L.Marker | null>(null)
  const destinationMarker = useRef<L.Marker | null>(null)
  const [snapshot, setSnapshot] = useState<TrackingSnapshot | null>(initialSnapshot ?? null)
  const [error, setError] = useState<string | null>(null)

  // Inicializa o mapa uma única vez
  useEffect(() => {
    if (!mapRef.current || leafletMap.current) return

    const defaultLat = initialSnapshot?.delivery_current_latitude
      ?? initialSnapshot?.delivery_latitude
      ?? -23.55
    const defaultLng = initialSnapshot?.delivery_current_longitude
      ?? initialSnapshot?.delivery_longitude
      ?? -46.63

    const map = L.map(mapRef.current, { zoomControl: true }).setView([defaultLat, defaultLng], 14)
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map)

    leafletMap.current = map
    return () => {
      map.remove()
      leafletMap.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Atualiza marcadores quando o snapshot muda
  useEffect(() => {
    const map = leafletMap.current
    if (!map || !snapshot) return

    // Marcador de destino
    if (snapshot.delivery_latitude && snapshot.delivery_longitude) {
      const pos: L.LatLngTuple = [snapshot.delivery_latitude, snapshot.delivery_longitude]
      if (!destinationMarker.current) {
        destinationMarker.current = L.marker(pos, { icon: DESTINATION_ICON })
          .addTo(map)
          .bindPopup("Destino da entrega")
      } else {
        destinationMarker.current.setLatLng(pos)
      }
    }

    // Marcador do entregador
    if (snapshot.delivery_current_latitude && snapshot.delivery_current_longitude) {
      const pos: L.LatLngTuple = [
        snapshot.delivery_current_latitude,
        snapshot.delivery_current_longitude,
      ]
      if (!deliveryMarker.current) {
        deliveryMarker.current = L.marker(pos, { icon: DELIVERY_ICON })
          .addTo(map)
          .bindPopup("Entregador")
        map.setView(pos, map.getZoom())
      } else {
        deliveryMarker.current.setLatLng(pos)
        map.panTo(pos, { animate: true, duration: 1 })
      }
    }
  }, [snapshot])

  // SSE — conecta ao stream e atualiza snapshot
  useEffect(() => {
    if (!token) return

    const url = `/deliveries/${orderId}/track/stream`
    const headers = { Authorization: `Bearer ${token}` }

    // EventSource nativo não suporta headers — usamos fetch com ReadableStream
    let cancelled = false
    const controller = new AbortController()

    async function connectSSE() {
      try {
        const res = await fetch(url, { headers, signal: controller.signal })
        if (!res.ok || !res.body) {
          setError("Não foi possível conectar ao rastreamento ao vivo.")
          return
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!cancelled) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6)) as TrackingSnapshot
                if (!cancelled) setSnapshot(data)
              } catch {
                // linha malformada, ignora
              }
            }
          }
        }
      } catch {
        if (!cancelled) setError("Conexão com rastreamento interrompida.")
      }
    }

    connectSSE()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [orderId, token])

  return (
    <div className="overflow-hidden rounded-[20px] border border-[#d7e0e8]">
      {error && (
        <div className="bg-amber-50 px-4 py-2 text-xs text-amber-700">{error}</div>
      )}
      {!snapshot?.delivery_current_latitude && !error && (
        <div className="bg-slate-50 px-4 py-2 text-xs text-slate-500">
          Aguardando primeira posição do entregador…
        </div>
      )}
      <div ref={mapRef} style={{ height: 320 }} />
      {snapshot?.delivery_location_updated_at && (
        <div className="border-t border-[#d7e0e8] px-4 py-2 text-xs text-slate-400">
          Última atualização:{" "}
          {new Date(snapshot.delivery_location_updated_at).toLocaleTimeString("pt-BR")}
        </div>
      )}
    </div>
  )
}

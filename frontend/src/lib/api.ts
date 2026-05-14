export type UserRole = "store" | "customer" | "mechanic" | "delivery"

export type OrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "in_delivery"
  | "delivered"
  | "cancelled"

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface UserRead {
  id: number
  name: string
  email: string
  role: UserRole
  latitude: number | null
  longitude: number | null
  created_at: string
}

export interface Metrics {
  stores: number
  products: number
  orders: number
  delivery_users: number
  available_deliveries: number
  in_delivery: number
  delivered: number
  low_stock: number
  gross_volume: number
}

export interface SummaryOrder {
  id: number
  status: OrderStatus
  total_amount: number
  delivery_address: string
  store_name: string
  customer_name: string
}

export interface FeaturedProduct {
  id: number
  name: string
  price: number
  stock: number
  store_name: string
}

export interface SummaryResponse {
  metrics: Metrics
  recent_orders: SummaryOrder[]
  featured_products: FeaturedProduct[]
  demo_users: {
    store: string
    customer: string
    delivery: string
  }
}

export interface DemoSeedResponse extends SummaryResponse {
  message: string
  store_id?: number
  product_ids?: number[]
  demo_order_id?: number
}

export interface StoreRead {
  id: number
  owner_id: number
  name: string
  address: string
  city: string
  latitude: number
  longitude: number
  created_at: string
}

export interface ProductRead {
  id: number
  store_id: number
  name: string
  sku: string
  brand: string | null
  vehicle_model: string | null
  description: string | null
  price: number
  stock: number
  image_url: string | null
  created_at: string
}

export interface ProductSearchResult extends ProductRead {
  store_name: string
  city: string
  distance_score: number
}

export interface OrderItemRead {
  id: number
  product_id: number
  quantity: number
  unit_price: number
  product_name: string
}

export interface OrderRead {
  id: number
  customer_id: number
  store_id: number
  delivery_person_id: number | null
  status: OrderStatus
  delivery_address: string
  delivery_latitude: number | null
  delivery_longitude: number | null
  notes: string | null
  total_amount: number
  created_at: string
  items: OrderItemRead[]
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "")

function buildUrl(path: string) {
  return path.startsWith("http") ? path : `${API_BASE}${path}`
}

export function getStoredToken() {
  if (typeof window === "undefined") {
    return ""
  }

  return window.localStorage.getItem("access_token") ?? ""
}

export function setStoredToken(token: string) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem("access_token", token)
}

export function clearStoredToken() {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.removeItem("access_token")
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(options.headers ?? undefined)

  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json")
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(buildUrl(path), {
    ...options,
    headers,
  })

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data
        ? String((data as { detail: unknown }).detail)
        : "Erro na requisicao"
    throw new Error(detail)
  }

  return data as T
}

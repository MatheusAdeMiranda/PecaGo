import { useDeferredValue, useState, type ReactNode } from "react"
import {
  ClipboardList,
  PackagePlus,
  RefreshCcw,
  Search,
  Store,
  Truck,
  UserRound,
  Warehouse,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"

import { OrderTracker } from "@/components/order-tracker"
import { useSession } from "@/components/session-provider"
import { StatusBadge } from "@/components/status-badge"
import { SurfaceCard } from "@/components/surface-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useDemoSummary } from "@/hooks/use-demo-summary"
import {
  api,
  type OrderRead,
  type OrderStatus,
  type ProductRead,
  type ProductSearchResult,
  type UserRole,
} from "@/lib/api"
import { currency, formatClock, formatDate, formatToken, getRoleLabel } from "@/lib/format"

type StageId = "setup" | "store" | "customer" | "delivery"
type StatusOption = {
  value: OrderStatus
  label: string
}

const stageMeta: Array<{
  id: StageId
  title: string
  kicker: string
  description: string
  icon: typeof UserRound
}> = [
  {
    id: "setup",
    title: "Setup",
    kicker: "Entrada na jornada",
    description: "Perfis, autenticacao e preparacao do ambiente demo.",
    icon: UserRound,
  },
  {
    id: "store",
    title: "Loja",
    kicker: "Seller flow",
    description: "Cadastro da loja e publicacao do estoque.",
    icon: Store,
  },
  {
    id: "customer",
    title: "Cliente",
    kicker: "Buyer flow",
    description: "Busca de pecas, criacao do pedido e historico.",
    icon: Wrench,
  },
  {
    id: "delivery",
    title: "Entrega",
    kicker: "Last mile",
    description: "Atribuicao da corrida e atualizacao de status.",
    icon: Truck,
  },
]

const STATUS_OPTIONS_BY_ROLE: Record<UserRole, StatusOption[]> = {
  store: [
    { value: "accepted", label: "Aceitar pedido" },
    { value: "preparing", label: "Marcar como separacao" },
    { value: "cancelled", label: "Cancelar pedido" },
  ],
  customer: [],
  mechanic: [],
  delivery: [
    { value: "delivered", label: "Marcar como entregue" },
    { value: "cancelled", label: "Cancelar entrega" },
  ],
}
const EMPTY_STATUS_OPTIONS: StatusOption[] = []

function scrollToSection(sectionId: StageId) {
  document.getElementById(sectionId)?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  })
}

function StageCard({
  index,
  title,
  description,
  icon: Icon,
  onClick,
}: {
  index: number
  title: string
  description: string
  icon: typeof UserRound
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full grid-cols-[44px_1fr] gap-3 rounded-[22px] border border-[#d7e0e8] bg-slate-50 p-4 text-left transition-colors hover:border-[#16324a]/20 hover:bg-white"
    >
      <div className="grid size-11 place-items-center rounded-full bg-[#16324a] text-white">
        <Icon className="size-4" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#16324a]/8 px-2 py-0.5 text-[11px] font-semibold tracking-[0.12em] text-[#16324a] uppercase">
            Etapa {index}
          </span>
          <span className="font-semibold text-[#12202d]">{title}</span>
        </div>
        <div className="mt-2 text-sm leading-6 text-slate-500">{description}</div>
      </div>
    </button>
  )
}

function SectionCard({
  id,
  kicker,
  title,
  description,
  chips,
  children,
}: {
  id: StageId
  kicker: string
  title: string
  description: string
  chips: string[]
  children: ReactNode
}) {
  return (
    <SurfaceCard id={id} className="defer-render scroll-mt-28 p-6 md:p-7">
      <div>
        <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
          {kicker}
        </div>
        <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-[#16324a]/6 px-3 py-1 text-xs font-semibold text-slate-500"
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="mt-5">{children}</div>
    </SurfaceCard>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="rounded-[24px] border border-[#d7e0e8] bg-slate-50 p-5">
      <div className="font-heading text-2xl font-bold text-[#12202d]">{title}</div>
      <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  )
}

export function ConsolePage() {
  const { summary, isLoading, isSeeding, seedNote, updatedAt, refreshSummary, seedDemo } =
    useDemoSummary(15000)
  const { token, user, login, refreshSession } = useSession()

  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([])
  const [myOrders, setMyOrders] = useState<OrderRead[]>([])
  const [availableDeliveries, setAvailableDeliveries] = useState<OrderRead[]>([])

  const [registerForm, setRegisterForm] = useState({
    name: "Loja Centro",
    email: "loja.nova@demo.com",
    password: "123456",
    role: "store" as UserRole,
  })
  const [loginForm, setLoginForm] = useState({ email: "store@demo.com", password: "123456" })
  const [storeForm, setStoreForm] = useState({
    name: "AutoPecas Centro",
    address: "Rua das Oficinas, 100",
    city: "Sao Paulo",
    latitude: "-23.550520",
    longitude: "-46.633308",
  })
  const [productForm, setProductForm] = useState({
    name: "Pastilha de Freio Dianteira",
    sku: "PF-001",
    brand: "Bosch",
    vehicleModel: "Gol",
    price: "189.90",
    stock: "8",
  })
  const [lastProductId, setLastProductId] = useState<number | null>(null)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [searchForm, setSearchForm] = useState({ query: "freio", city: "Sao Paulo" })
  const [orderForm, setOrderForm] = useState({
    storeId: "",
    productId: "",
    quantity: "1",
    address: "Av. Paulista, 1000",
    notes: "Pedido criado no console React.",
  })
  const [deliveryForm, setDeliveryForm] = useState({
    assignOrderId: "",
    statusOrderId: "1",
    statusValue: "accepted" as OrderStatus,
  })

  const deferredSearchResults = useDeferredValue(searchResults)
  const deferredMyOrders = useDeferredValue(myOrders)
  const deferredDeliveries = useDeferredValue(availableDeliveries)

  const lastSyncAt = updatedAt ? formatClock(updatedAt) : ""
  const latestOrder = summary?.recent_orders[0]
  const statusOptions = user ? STATUS_OPTIONS_BY_ROLE[user.role] : EMPTY_STATUS_OPTIONS
  const selectedStatusValue = statusOptions.some((option) => option.value === deliveryForm.statusValue)
    ? deliveryForm.statusValue
    : (statusOptions[0]?.value ?? deliveryForm.statusValue)

  function primeOrderFields({
    storeId,
    productId,
    orderId,
    statusValue,
    target,
  }: {
    storeId?: number
    productId?: number
    orderId?: number
    statusValue?: OrderStatus
    target?: StageId
  }) {
    setOrderForm((current) => ({
      ...current,
      storeId: storeId ? String(storeId) : current.storeId,
      productId: productId ? String(productId) : current.productId,
    }))
    setDeliveryForm((current) => ({
      ...current,
      assignOrderId: orderId ? String(orderId) : current.assignOrderId,
      statusOrderId: orderId ? String(orderId) : current.statusOrderId,
      statusValue: statusValue ?? current.statusValue,
    }))

    if (target) {
      scrollToSection(target)
    }
  }

  async function syncBoard(message?: string) {
    await Promise.all([refreshSummary(), refreshSession()])
    if (message) {
      toast.success(message)
    }
  }

  async function handle(action: () => Promise<void>, fallback: string) {
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallback)
    }
  }

  return (
    <div className="space-y-6">
      <SurfaceCard className="overflow-hidden border-white/15 bg-[linear-gradient(135deg,rgba(15,34,52,0.98),rgba(24,52,77,0.96))] p-7 text-white md:p-8">
        <div className="space-y-6">
          <div className="inline-flex w-fit rounded-full bg-[#b55a22]/18 px-4 py-2 text-sm font-semibold text-[#ffd8bf]">
            Operacao ao vivo
          </div>
          <div>
            <h1 className="max-w-[12ch] font-heading text-5xl leading-[0.92] font-bold md:text-7xl">
              Console guiado, pronto para demo.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200 md:text-lg">
              O roteiro agora fica mais claro: entrar com o perfil certo, publicar estoque,
              criar o pedido e concluir a entrega com menos atrito visual.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={isSeeding}
              className="h-11 rounded-2xl bg-[#b55a22] px-5 text-white hover:bg-[#8e4517]"
              onClick={() =>
                handle(async () => {
                  const data = await seedDemo()
                  primeOrderFields({
                    storeId: data.store_id,
                    productId: data.product_ids?.[0],
                    orderId: data.demo_order_id,
                    statusValue: "preparing",
                    target: "setup",
                  })
                  toast.success("Demo pronta para o roteiro.")
                }, "Nao foi possivel preparar a demo.")
              }
            >
              {isSeeding ? "Preparando demo..." : "Popular dados demo"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              className="h-11 rounded-2xl border-white/15 bg-white/10 px-5 text-white hover:bg-white/16"
              onClick={() =>
                handle(() => syncBoard("Console sincronizado."), "Falha ao sincronizar o console.")
              }
            >
              <RefreshCcw className="size-4" />
              Atualizar sessao
            </Button>
            <a
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-[#16324a] transition-colors hover:bg-slate-100"
            >
              Voltar para a home
            </a>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            {stageMeta.map(({ id, title, description, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className="rounded-[22px] border border-white/10 bg-white/6 p-4 text-left transition-colors hover:bg-white/10"
              >
                <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">
                  <Icon className="size-3.5" />
                  {title}
                </div>
                <div className="mt-3 font-heading text-xl font-bold text-white">{description}</div>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-200">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2">
              <span className="size-2 rounded-full bg-[#ffd8bf]" />
              {lastSyncAt ? `Snapshot sincronizado as ${lastSyncAt}` : "Aguardando sincronizacao"}
            </span>
            {seedNote ? <span className="text-slate-300">{seedNote}</span> : null}
          </div>
        </div>
      </SurfaceCard>

      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <SurfaceCard className="p-5">
            <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
              Roteiro
            </div>
            <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">Etapas da demo</h2>
            <div className="mt-4 space-y-3">
              {stageMeta.map((stage, index) => (
                <StageCard
                  key={stage.id}
                  index={index + 1}
                  title={stage.title}
                  description={stage.description}
                  icon={stage.icon}
                  onClick={() => scrollToSection(stage.id)}
                />
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
              Atalhos demo
            </div>
            <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">
              Entrar mais rapido
            </h2>
            <div className="mt-4 grid gap-2">
              {[
                ["Loja demo", "store@demo.com"],
                ["Cliente demo", "customer@demo.com"],
                ["Entrega demo", "delivery@demo.com"],
              ].map(([label, email]) => (
                <Button
                  key={email}
                  type="button"
                  variant="outline"
                  className="justify-start rounded-2xl border-[#d7e0e8] bg-white"
                  onClick={() => {
                    setLoginForm({ email, password: "123456" })
                    scrollToSection("setup")
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="mt-4 rounded-[22px] border border-dashed border-[#d7e0e8] bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-500">
              {user ? (
                <>
                  <div className="font-semibold text-[#12202d]">
                    Logado como {user.name} ({getRoleLabel(user.role)})
                  </div>
                  <div className="mt-2 font-mono text-xs">{formatToken(token)}</div>
                </>
              ) : (
                "Nenhum login ativo. Use os atalhos acima para preencher o formulario."
              )}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-5">
            <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
              Snapshot
            </div>
            <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">
              Operacao atual
            </h2>
            <div className="mt-4 space-y-4">
              <div className="rounded-[22px] border border-[#d7e0e8] bg-white p-4">
                {latestOrder ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-[#12202d]">Pedido #{latestOrder.id}</span>
                      <StatusBadge status={latestOrder.status} />
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-500">
                      {currency(latestOrder.total_amount)}
                      <br />
                      {latestOrder.delivery_address}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-slate-500">Nenhum pedido recente ainda.</div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <div className="rounded-[22px] border border-[#d7e0e8] bg-white p-4">
                  <div className="font-heading text-3xl font-bold text-[#12202d]">
                    {summary?.metrics.orders ?? 0}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">Pedidos no MVP</div>
                </div>
                <div className="rounded-[22px] border border-[#d7e0e8] bg-white p-4">
                  <div className="font-heading text-3xl font-bold text-[#12202d]">
                    {summary?.metrics.available_deliveries ?? 0}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">Aguardando entregador</div>
                </div>
                <div className="rounded-[22px] border border-[#d7e0e8] bg-white p-4">
                  <div className="font-heading text-3xl font-bold text-[#12202d]">
                    {summary?.metrics.in_delivery ?? 0}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">Em rota</div>
                </div>
              </div>

              <OrderTracker status={latestOrder?.status ?? "accepted"} />
            </div>
          </SurfaceCard>
        </aside>
        <div className="space-y-5">
          <SectionCard
            id="setup"
            kicker="Entrada na jornada"
            title="Setup"
            description="Cadastre perfis novos ou entre com as credenciais demo para destravar o fluxo."
            chips={["Criar perfis", "Salvar token", "Validar sessao"]}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="Registrar usuario"
                description="Crie novos perfis se quiser fugir dos dados demonstrativos."
              >
                <Label htmlFor="register-name">Nome</Label>
                <Input
                  id="register-name"
                  value={registerForm.name}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <Label htmlFor="register-email">Email</Label>
                <Input
                  id="register-email"
                  type="email"
                  value={registerForm.email}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <Label htmlFor="register-password">Senha</Label>
                <Input
                  id="register-password"
                  type="password"
                  value={registerForm.password}
                  onChange={(event) =>
                    setRegisterForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
                <Label>Perfil</Label>
                <Select
                  value={registerForm.role}
                  onValueChange={(value) =>
                    setRegisterForm((current) => ({ ...current, role: value as UserRole }))
                  }
                >
                  <SelectTrigger className="h-11 w-full rounded-2xl border-[#d7e0e8] bg-white">
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">store</SelectItem>
                    <SelectItem value="customer">customer</SelectItem>
                    <SelectItem value="mechanic">mechanic</SelectItem>
                    <SelectItem value="delivery">delivery</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      await api("/auth/register", {
                        method: "POST",
                        body: JSON.stringify(registerForm),
                      })
                      await syncBoard("Usuario criado com sucesso.")
                    }, "Falha ao registrar usuario.")
                  }
                >
                  Registrar
                </Button>
              </Panel>

              <Panel
                title="Login"
                description="O token fica salvo no navegador para as acoes autenticadas."
              >
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  value={loginForm.email}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <Label htmlFor="login-password">Senha</Label>
                <Input
                  id="login-password"
                  type="password"
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm((current) => ({ ...current, password: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      await login(loginForm.email, loginForm.password)
                      toast.success("Login realizado com sucesso.")
                    }, "Credenciais invalidas.")
                  }
                >
                  Entrar
                </Button>
              </Panel>
            </div>
          </SectionCard>

          <SectionCard
            id="store"
            kicker="Seller flow"
            title="Loja"
            description="Cadastre o ponto de venda e publique o produto que vai alimentar o pedido."
            chips={["Criar loja", "Publicar estoque", "Preparar oferta"]}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="Criar loja"
                description="Use com um usuario do tipo store autenticado."
              >
                <Label htmlFor="store-name">Nome da loja</Label>
                <Input
                  id="store-name"
                  value={storeForm.name}
                  onChange={(event) =>
                    setStoreForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <Label htmlFor="store-address">Endereco</Label>
                <Input
                  id="store-address"
                  value={storeForm.address}
                  onChange={(event) =>
                    setStoreForm((current) => ({ ...current, address: event.target.value }))
                  }
                />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="store-city">Cidade</Label>
                    <Input
                      id="store-city"
                      value={storeForm.city}
                      onChange={(event) =>
                        setStoreForm((current) => ({ ...current, city: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store-lat">Latitude</Label>
                    <Input
                      id="store-lat"
                      value={storeForm.latitude}
                      onChange={(event) =>
                        setStoreForm((current) => ({ ...current, latitude: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="store-lng">Longitude</Label>
                    <Input
                      id="store-lng"
                      value={storeForm.longitude}
                      onChange={(event) =>
                        setStoreForm((current) => ({ ...current, longitude: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      await api(
                        "/stores",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            ...storeForm,
                            latitude: Number(storeForm.latitude),
                            longitude: Number(storeForm.longitude),
                          }),
                        },
                        token
                      )
                      await syncBoard("Loja cadastrada com sucesso.")
                    }, "Nao foi possivel cadastrar a loja.")
                  }
                >
                  <Warehouse className="size-4" />
                  Cadastrar loja
                </Button>
              </Panel>

              <Panel
                title="Cadastrar produto"
                description="Publique o item que sera usado na demonstracao."
              >
                <Label htmlFor="product-name">Nome</Label>
                <Input
                  id="product-name"
                  value={productForm.name}
                  onChange={(event) =>
                    setProductForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="product-sku">SKU</Label>
                    <Input
                      id="product-sku"
                      value={productForm.sku}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, sku: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-brand">Marca</Label>
                    <Input
                      id="product-brand"
                      value={productForm.brand}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, brand: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-vehicle">Modelo</Label>
                    <Input
                      id="product-vehicle"
                      value={productForm.vehicleModel}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          vehicleModel: event.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="product-price">Preco</Label>
                    <Input
                      id="product-price"
                      value={productForm.price}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, price: event.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="product-stock">Estoque</Label>
                    <Input
                      id="product-stock"
                      value={productForm.stock}
                      onChange={(event) =>
                        setProductForm((current) => ({ ...current, stock: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Imagem do produto</Label>
                  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-[#d7e0e8] bg-white p-4 text-sm text-slate-500 transition-colors hover:border-[#16324a]/30 hover:bg-slate-50">
                    {imagePreview ? (
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="mb-2 h-24 w-auto rounded-xl object-cover"
                      />
                    ) : (
                      <span className="mb-1 text-xs">Clique para selecionar JPEG, PNG ou WebP (max 5 MB)</span>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null
                        setImageFile(file)
                        setImagePreview(file ? URL.createObjectURL(file) : null)
                      }}
                    />
                    <span className="text-xs font-semibold text-[#16324a]">
                      {imageFile ? imageFile.name : "Selecionar imagem (opcional)"}
                    </span>
                  </label>
                </div>
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      const created = await api<ProductRead>(
                        "/products",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            name: productForm.name,
                            sku: productForm.sku,
                            brand: productForm.brand,
                            vehicle_model: productForm.vehicleModel,
                            price: Number(productForm.price),
                            stock: Number(productForm.stock),
                          }),
                        },
                        token
                      )
                      setLastProductId(created.id)
                      if (imageFile) {
                        const form = new FormData()
                        form.append("file", imageFile)
                        await api(`/products/${created.id}/image`, { method: "POST", body: form }, token)
                      }
                      await syncBoard("Produto cadastrado com sucesso.")
                    }, "Nao foi possivel cadastrar o produto.")
                  }
                >
                  <PackagePlus className="size-4" />
                  Publicar produto
                </Button>
                {lastProductId && (
                  <div className="space-y-2">
                    <Label>Trocar imagem (produto #{lastProductId})</Label>
                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-[#d7e0e8] bg-white px-4 py-3 text-sm text-slate-500 hover:border-[#16324a]/30 hover:bg-slate-50">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            handle(async () => {
                              const form = new FormData()
                              form.append("file", file)
                              await api(`/products/${lastProductId}/image`, { method: "POST", body: form }, token)
                              setImagePreview(URL.createObjectURL(file))
                              toast.success("Imagem atualizada.")
                            }, "Falha ao enviar imagem.")
                          }
                        }}
                      />
                      <span className="font-semibold text-[#16324a]">Enviar nova imagem</span>
                    </label>
                  </div>
                )}
              </Panel>
            </div>
          </SectionCard>

          <SectionCard
            id="customer"
            kicker="Buyer flow"
            title="Cliente"
            description="Encontre a peca, alimente o formulario do pedido e acompanhe o historico."
            chips={["Buscar pecas", "Criar pedido", "Ler historico"]}
          >
            <div className="grid gap-4 xl:grid-cols-3">
              <Panel
                title="Buscar pecas"
                description="Busca por nome, SKU, marca ou modelo em estoque."
              >
                <Label htmlFor="search-query">Busca</Label>
                <Input
                  id="search-query"
                  value={searchForm.query}
                  onChange={(event) =>
                    setSearchForm((current) => ({ ...current, query: event.target.value }))
                  }
                />
                <Label htmlFor="search-city">Cidade</Label>
                <Input
                  id="search-city"
                  value={searchForm.city}
                  onChange={(event) =>
                    setSearchForm((current) => ({ ...current, city: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      const params = new URLSearchParams({
                        q: searchForm.query,
                        city: searchForm.city,
                      })
                      setSearchResults(
                        await api<ProductSearchResult[]>(`/products/search?${params.toString()}`)
                      )
                    }, "Falha ao buscar produtos.")
                  }
                >
                  <Search className="size-4" />
                  Buscar
                </Button>

                <div className="space-y-3">
                  {deferredSearchResults.length ? (
                    deferredSearchResults.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-2xl border border-[#d7e0e8] bg-white p-4 text-sm text-slate-600"
                      >
                        {item.image_url && (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="mb-3 h-28 w-full rounded-xl object-cover"
                          />
                        )}
                        <div className="font-semibold text-[#12202d]">{item.name}</div>
                        <div className="mt-1">
                          Loja {item.store_id} | {currency(item.price)}
                        </div>
                        <div className="mt-1">
                          Estoque {item.stock} | {item.store_name}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 rounded-2xl border-[#d7e0e8]"
                          onClick={() =>
                            primeOrderFields({
                              storeId: item.store_id,
                              productId: item.id,
                              target: "customer",
                            })
                          }
                        >
                          Usar no pedido
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#d7e0e8] bg-white px-4 py-3 text-sm text-slate-500">
                      Os resultados aparecem aqui depois da busca.
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                title="Criar pedido"
                description="Entre como customer ou mechanic para criar a compra."
              >
                <Label htmlFor="order-store-id">Store ID</Label>
                <Input
                  id="order-store-id"
                  value={orderForm.storeId}
                  onChange={(event) =>
                    setOrderForm((current) => ({ ...current, storeId: event.target.value }))
                  }
                />
                <Label htmlFor="order-product-id">Product ID</Label>
                <Input
                  id="order-product-id"
                  value={orderForm.productId}
                  onChange={(event) =>
                    setOrderForm((current) => ({ ...current, productId: event.target.value }))
                  }
                />
                <Label htmlFor="order-quantity">Quantidade</Label>
                <Input
                  id="order-quantity"
                  value={orderForm.quantity}
                  onChange={(event) =>
                    setOrderForm((current) => ({ ...current, quantity: event.target.value }))
                  }
                />
                <Label htmlFor="order-address">Endereco</Label>
                <Input
                  id="order-address"
                  value={orderForm.address}
                  onChange={(event) =>
                    setOrderForm((current) => ({ ...current, address: event.target.value }))
                  }
                />
                <Label htmlFor="order-notes">Observacoes</Label>
                <Textarea
                  id="order-notes"
                  value={orderForm.notes}
                  onChange={(event) =>
                    setOrderForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      const order = await api<OrderRead>(
                        "/orders",
                        {
                          method: "POST",
                          body: JSON.stringify({
                            store_id: Number(orderForm.storeId),
                            delivery_address: orderForm.address,
                            notes: orderForm.notes,
                            items: [
                              {
                                product_id: Number(orderForm.productId),
                                quantity: Number(orderForm.quantity),
                              },
                            ],
                          }),
                        },
                        token
                      )
                      primeOrderFields({
                        orderId: order.id,
                        statusValue: "accepted",
                        target: "delivery",
                      })
                      await syncBoard(`Pedido #${order.id} criado.`)
                    }, "Nao foi possivel criar o pedido.")
                  }
                >
                  <PackagePlus className="size-4" />
                  Criar pedido
                </Button>
              </Panel>

              <Panel
                title="Meus pedidos"
                description="Lista os pedidos do usuario autenticado."
              >
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-[#d7e0e8]"
                  onClick={() =>
                    handle(async () => {
                      setMyOrders(await api<OrderRead[]>("/orders/my", {}, token))
                    }, "Nao foi possivel listar os pedidos.")
                  }
                >
                  <ClipboardList className="size-4" />
                  Carregar pedidos
                </Button>

                <div className="space-y-3">
                  {deferredMyOrders.length ? (
                    deferredMyOrders.map((order) => (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-[#d7e0e8] bg-white p-4 text-sm text-slate-600"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#12202d]">Pedido #{order.id}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <div className="mt-1">
                          {currency(order.total_amount)} | {formatDate(order.created_at)}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 rounded-2xl border-[#d7e0e8]"
                          onClick={() =>
                            primeOrderFields({
                              orderId: order.id,
                              statusValue: "preparing",
                              target: "delivery",
                            })
                          }
                        >
                          Usar no tracking
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#d7e0e8] bg-white px-4 py-3 text-sm text-slate-500">
                      Carregue o historico para ver os pedidos dessa sessao.
                    </div>
                  )}
                </div>
              </Panel>
            </div>
          </SectionCard>

          <SectionCard
            id="delivery"
            kicker="Last mile"
            title="Entrega"
            description="Assuma a corrida e mova o pedido pelas etapas operacionais."
            chips={["Listar corridas", "Assumir entrega", "Atualizar status"]}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="Entregas disponiveis"
                description="Entre como delivery para assumir corridas."
              >
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl border-[#d7e0e8]"
                  onClick={() =>
                    handle(async () => {
                      setAvailableDeliveries(await api<OrderRead[]>("/deliveries/available", {}, token))
                    }, "Nao foi possivel listar as entregas.")
                  }
                >
                  <Truck className="size-4" />
                  Listar entregas
                </Button>
                <Label htmlFor="assign-order-id">Order ID</Label>
                <Input
                  id="assign-order-id"
                  value={deliveryForm.assignOrderId}
                  onChange={(event) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      assignOrderId: event.target.value,
                    }))
                  }
                />
                <Button
                  type="button"
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      const order = await api<OrderRead>(
                        "/deliveries/assign",
                        {
                          method: "POST",
                          body: JSON.stringify({ order_id: Number(deliveryForm.assignOrderId) }),
                        },
                        token
                      )
                      primeOrderFields({
                        orderId: order.id,
                        statusValue: "delivered",
                        target: "delivery",
                      })
                      await syncBoard(`Pedido #${order.id} assumido.`)
                    }, "Nao foi possivel assumir a entrega.")
                  }
                >
                  Assumir entrega
                </Button>

                <div className="space-y-3">
                  {deferredDeliveries.length ? (
                    deferredDeliveries.map((order) => (
                      <div
                        key={order.id}
                        className="rounded-2xl border border-[#d7e0e8] bg-white p-4 text-sm text-slate-600"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-[#12202d]">Pedido #{order.id}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <div className="mt-1">{order.delivery_address}</div>
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3 rounded-2xl border-[#d7e0e8]"
                          onClick={() =>
                            primeOrderFields({
                              orderId: order.id,
                              statusValue: "in_delivery",
                              target: "delivery",
                            })
                          }
                        >
                          Preparar atribuicao
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-[#d7e0e8] bg-white px-4 py-3 text-sm text-slate-500">
                      As corridas aparecem aqui depois da consulta.
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                title="Atualizar status"
                description="A loja aceita e prepara. A entrega conclui ou cancela a corrida ja assumida."
              >
                <Label htmlFor="status-order-id">Order ID</Label>
                <Input
                  id="status-order-id"
                  value={deliveryForm.statusOrderId}
                  onChange={(event) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      statusOrderId: event.target.value,
                    }))
                  }
                />
                <Label>Novo status</Label>
                <Select
                  value={selectedStatusValue}
                  onValueChange={(value) =>
                    setDeliveryForm((current) => ({
                      ...current,
                      statusValue: value as OrderStatus,
                    }))
                  }
                >
                  <SelectTrigger
                    disabled={!statusOptions.length}
                    className="h-11 w-full rounded-2xl border-[#d7e0e8] bg-white"
                  >
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.length ? (
                      statusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="accepted" disabled>
                        Entre como store ou delivery
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  disabled={!statusOptions.length}
                  className="h-11 rounded-2xl bg-[#16324a] text-white hover:bg-[#0d2234]"
                  onClick={() =>
                    handle(async () => {
                      const order = await api<OrderRead>(
                        `/orders/${Number(deliveryForm.statusOrderId)}/status`,
                        {
                          method: "PATCH",
                          body: JSON.stringify({ status: selectedStatusValue }),
                        },
                        token
                      )
                      await syncBoard(`Pedido #${order.id} atualizado para ${order.status}.`)
                    }, "Nao foi possivel atualizar o status.")
                  }
                >
                  Atualizar status
                </Button>

                <div className="rounded-2xl border border-[#d7e0e8] bg-white p-4 text-sm text-slate-600">
                  {latestOrder ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-[#12202d]">Radar #{latestOrder.id}</span>
                        <StatusBadge status={latestOrder.status} />
                      </div>
                      <div className="mt-2">
                        {currency(latestOrder.total_amount)}
                        <br />
                        {latestOrder.delivery_address}
                      </div>
                    </>
                  ) : (
                    "Aguardando o primeiro pedido."
                  )}
                </div>
              </Panel>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  )
}

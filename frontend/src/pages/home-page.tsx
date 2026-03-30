import { type ReactNode } from "react"
import {
  ArrowRight,
  Boxes,
  Clock3,
  Gauge,
  MapPinned,
  PackageCheck,
  RefreshCcw,
  ShieldCheck,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Warehouse,
  Wrench,
} from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { OrderTracker } from "@/components/order-tracker"
import { useSession } from "@/components/session-provider"
import { StatusBadge } from "@/components/status-badge"
import { SurfaceCard } from "@/components/surface-card"
import { Button, buttonVariants } from "@/components/ui/button"
import { useDemoSummary } from "@/hooks/use-demo-summary"
import { currency, formatClock, formatDate, formatToken, getRoleLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

const emptyMetrics = {
  stores: 0,
  products: 0,
  orders: 0,
  delivery_users: 0,
  available_deliveries: 0,
  in_delivery: 0,
  delivered: 0,
  low_stock: 0,
  gross_volume: 0,
}

function StatTile({
  label,
  value,
  foot,
  dark = false,
}: {
  label: string
  value: string | number
  foot: string
  dark?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-[22px] border p-4",
        dark
          ? "border-white/10 bg-white/6 text-white"
          : "border-[#d7e0e8] bg-white text-[#12202d]"
      )}
    >
      <div className={cn("text-sm", dark ? "text-slate-300" : "text-slate-500")}>{label}</div>
      <div className="mt-3 font-heading text-4xl leading-none font-bold">{value}</div>
      <div className={cn("mt-2 text-sm leading-6", dark ? "text-slate-300" : "text-slate-500")}>
        {foot}
      </div>
    </div>
  )
}

function InfoCard({
  title,
  children,
  className,
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-[22px] border border-[#d7e0e8] bg-white p-4", className)}>
      <div className="font-semibold text-[#12202d]">{title}</div>
      <div className="mt-3 text-sm leading-6 text-slate-600">{children}</div>
    </div>
  )
}

function PersonaCard({
  title,
  copy,
  stat,
  icon: Icon,
}: {
  title: string
  copy: string
  stat: string
  icon: typeof Store
}) {
  return (
    <SurfaceCard className="p-6">
      <div className="grid size-12 place-items-center rounded-2xl bg-[#16324a]/8 text-[#16324a]">
        <Icon className="size-5" />
      </div>
      <div className="mt-5 font-heading text-3xl font-bold text-[#12202d]">{title}</div>
      <p className="mt-2 text-sm leading-7 text-slate-600">{copy}</p>
      <div className="mt-5 rounded-[20px] border border-[#d7e0e8] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
        {stat}
      </div>
    </SurfaceCard>
  )
}

export function HomePage() {
  const { summary, isLoading, isSeeding, seedNote, updatedAt, refreshSummary, seedDemo } =
    useDemoSummary()
  const { token, user, refreshSession } = useSession()

  const metrics = summary?.metrics ?? emptyMetrics
  const latestOrder = summary?.recent_orders[0]
  const featuredProducts = summary?.featured_products ?? []
  const demoUsers = summary?.demo_users ?? {
    store: "store@demo.com / 123456",
    customer: "customer@demo.com / 123456",
    delivery: "delivery@demo.com / 123456",
  }
  const lastSyncAt = updatedAt ? formatClock(updatedAt) : ""

  async function handleSeed() {
    try {
      await seedDemo()
      toast.success("Dados demo preparados com sucesso.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel popular a demo.")
    }
  }

  async function handleRefresh() {
    try {
      await Promise.all([refreshSummary(), refreshSession()])
      toast.success("Painel sincronizado.")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel atualizar o painel.")
    }
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <SurfaceCard className="overflow-hidden border-white/15 bg-[linear-gradient(135deg,rgba(12,27,43,0.99),rgba(24,52,77,0.96))] text-white">
          <div className="space-y-6 p-7 md:p-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-[#b55a22]/18 px-4 py-2 text-sm font-semibold text-[#ffd8bf]">
              <ShieldCheck className="size-4" />
              Marketplace de autopecas com operacao em tempo real
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-5">
                <div>
                  <h1 className="max-w-[9ch] font-heading text-5xl leading-[0.88] font-bold md:text-7xl">
                    A peca certa, na hora critica.
                  </h1>
                  <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200 md:text-lg">
                    A Home agora apresenta o PecaGo como produto premium: proposta clara,
                    leitura operacional e caminho direto para a demo executiva no console.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    disabled={isSeeding}
                    className="h-11 rounded-2xl bg-[#b55a22] px-5 text-white hover:bg-[#8e4517]"
                    onClick={handleSeed}
                  >
                    {isSeeding ? "Preparando demo..." : "Popular dados demo"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    className="h-11 rounded-2xl border-white/15 bg-white/10 px-5 text-white hover:bg-white/16"
                    onClick={handleRefresh}
                  >
                    <RefreshCcw className="size-4" />
                    Atualizar painel
                  </Button>
                  <Link
                    to="/console"
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-11 rounded-2xl bg-white px-5 text-[#16324a] hover:bg-slate-100"
                    )}
                  >
                    Abrir console operacional
                    <ArrowRight className="size-4" />
                  </Link>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    { label: "Busca local", value: "Estoque perto da oficina", icon: MapPinned },
                    { label: "Pedido", value: "Checkout em poucos cliques", icon: ShoppingCart },
                    { label: "Entrega", value: "Ultima milha sob demanda", icon: Truck },
                  ].map(({ label, value, icon: Icon }) => (
                    <div
                      key={label}
                      className="rounded-[22px] border border-white/10 bg-white/6 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                    >
                      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">
                        <Icon className="size-3.5" />
                        {label}
                      </div>
                      <div className="mt-3 font-heading text-xl font-bold text-white">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4 rounded-[28px] border border-white/10 bg-white/6 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">
                      Command center
                    </div>
                    <div className="mt-2 font-heading text-3xl font-bold text-white">
                      Leitura em 1 minuto
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-400/12 px-3 py-1 text-xs font-semibold text-emerald-200">
                    <span className="size-2 animate-pulse rounded-full bg-emerald-300" />
                    live
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <StatTile
                    label="GMV simulado"
                    value={currency(metrics.gross_volume)}
                    foot="Volume bruto da operacao atual"
                    dark
                  />
                  <StatTile
                    label="Pedidos em rota"
                    value={metrics.in_delivery}
                    foot="Jornadas ativas agora"
                    dark
                  />
                </div>

                <div className="rounded-[22px] border border-white/10 bg-[#0f2236]/65 p-4">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.14em] text-slate-300 uppercase">
                    <Clock3 className="size-3.5" />
                    Ultimo sinal
                  </div>
                  <div className="mt-3 text-sm leading-7 text-slate-200">
                    {latestOrder ? (
                      <>
                        Pedido #{latestOrder.id} em {latestOrder.delivery_address}
                        <br />
                        {currency(latestOrder.total_amount)} | {latestOrder.store_name}
                      </>
                    ) : (
                      "Painel aguardando a primeira ordem da demo."
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                    <span className="rounded-full bg-white/8 px-3 py-1">
                      {lastSyncAt ? `sincronizado as ${lastSyncAt}` : "sem sincronizacao ainda"}
                    </span>
                    {seedNote ? <span className="text-slate-400">{seedNote}</span> : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Lojas ativas"
                value={metrics.stores}
                foot="Pontos de venda publicados"
                dark
              />
              <StatTile
                label="Produtos"
                value={metrics.products}
                foot="Itens no catalogo"
                dark
              />
              <StatTile
                label="Pedidos"
                value={metrics.orders}
                foot="Pedidos registrados no MVP"
                dark
              />
              <StatTile
                label="Entregadores"
                value={metrics.delivery_users}
                foot="Perfis prontos para corrida"
                dark
              />
            </div>
          </div>
        </SurfaceCard>

        <div className="grid gap-5">
          <SurfaceCard className="p-6">
            <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
              O que a demo prova
            </div>
            <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">
              Narrativa de operacao
            </h2>
            <div className="mt-4 space-y-3">
              {[
                "Loja publica o estoque e responde com velocidade.",
                "Cliente encontra a peca certa sem perder contexto.",
                "Entrega assume a corrida e finaliza a ultima milha.",
              ].map((copy, index) => (
                <div
                  key={copy}
                  className="grid grid-cols-[36px_1fr] gap-3 rounded-[20px] border border-[#d7e0e8] bg-slate-50 p-4"
                >
                  <div className="grid size-9 place-items-center rounded-full bg-[#16324a] text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div className="text-sm leading-6 text-slate-600">{copy}</div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard className="p-6">
            <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
              Sessao e acessos
            </div>
            <div className="mt-3 space-y-4">
              <InfoCard title="Usuarios demo">
                <div>{demoUsers.store}</div>
                <div>{demoUsers.customer}</div>
                <div>{demoUsers.delivery}</div>
              </InfoCard>

              <InfoCard title="Sessao atual">
                {user ? (
                  <>
                    <div className="font-medium text-[#12202d]">
                      Logado como {user.name} ({getRoleLabel(user.role)})
                    </div>
                    <div className="mt-2 rounded-2xl border border-dashed border-[#d7e0e8] bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500">
                      {formatToken(token)}
                    </div>
                  </>
                ) : (
                  "Nenhum login ativo."
                )}
              </InfoCard>
            </div>
          </SurfaceCard>
        </div>
      </section>

      <section className="defer-render grid gap-5 lg:grid-cols-3">
        <PersonaCard
          title="Para a loja"
          copy="Publica estoque, protege disponibilidade e transforma urgencia mecanica em receita."
          stat={`${metrics.products} SKUs e ${currency(metrics.gross_volume)} de GMV simulado`}
          icon={Warehouse}
        />
        <PersonaCard
          title="Para a oficina"
          copy="Encontra a peca certa perto do destino e reduz o tempo parado do veiculo."
          stat={`${metrics.orders} pedidos no MVP e foco em reposicao rapida`}
          icon={Wrench}
        />
        <PersonaCard
          title="Para a entrega"
          copy="Recebe a corrida certa, acompanha status e conclui a jornada sem ruido."
          stat={`${metrics.in_delivery} corridas em rota e ${metrics.delivery_users} perfis prontos`}
          icon={Truck}
        />
      </section>

      <section className="defer-render grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
        <SurfaceCard className="p-6 md:p-7">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
                Theater operacional
              </div>
              <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">
                Cidade, estoque e ultima milha
              </h2>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                O produto ganha leitura espacial: loja, rota e destino ficam visiveis como
                partes da mesma operacao, nao como telas soltas.
              </p>
            </div>

            <div className="relative min-h-[380px] overflow-hidden rounded-[28px] border border-[#d7e0e8] bg-[linear-gradient(180deg,#f8fbfd,#eef4f9)] p-5">
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(22,50,74,0.05)_1px,transparent_1px),linear-gradient(rgba(22,50,74,0.05)_1px,transparent_1px)] bg-[size:34px_34px]" />
              <div className="absolute left-[14%] top-[20%] h-1.5 w-[70%] rotate-[8deg] rounded-full bg-[#16324a]/16" />
              <div className="absolute left-[9%] top-[60%] h-1.5 w-[74%] -rotate-[9deg] rounded-full bg-[#16324a]/16" />
              <div className="absolute left-[48%] top-[16%] h-[66%] w-1.5 rounded-full bg-[#16324a]/16" />
              <div className="absolute left-[24%] top-[30%] h-[24%] w-[50%] rotate-[6deg] rounded-tr-[120px] border-t-[3px] border-r-[3px] border-dashed border-[#b55a22]/70" />

              <div className="absolute left-[10%] top-[18%] rounded-[18px] border border-[#d7e0e8] bg-white/95 px-4 py-3 shadow-[0_16px_28px_rgba(15,34,52,0.08)]">
                <div className="flex items-center gap-2 font-semibold text-[#12202d]">
                  <Store className="size-4 text-[#16324a]" />
                  Loja parceira
                </div>
                <div className="mt-1 text-sm text-slate-500">AutoPecas Centro</div>
              </div>

              <div className="absolute left-[41%] top-[36%] rounded-[18px] border border-[#d7e0e8] bg-white/95 px-4 py-3 shadow-[0_16px_28px_rgba(15,34,52,0.08)]">
                <div className="flex items-center gap-2 font-semibold text-[#12202d]">
                  <Truck className="size-4 text-emerald-700" />
                  Entregador
                </div>
                <div className="mt-1 text-sm text-slate-500">Rota em andamento</div>
              </div>

              <div className="absolute right-[10%] top-[54%] rounded-[18px] border border-[#d7e0e8] bg-white/95 px-4 py-3 shadow-[0_16px_28px_rgba(15,34,52,0.08)]">
                <div className="flex items-center gap-2 font-semibold text-[#12202d]">
                  <MapPinned className="size-4 text-[#b55a22]" />
                  Destino
                </div>
                <div className="mt-1 text-sm text-slate-500">Oficina / cliente</div>
              </div>

              <div className="absolute bottom-5 left-5 flex max-w-[calc(100%-160px)] flex-wrap gap-2">
                {[
                  ["Loja com estoque", "bg-[#16324a]"],
                  ["Entregador em rota", "bg-emerald-600"],
                  ["Destino do pedido", "bg-[#b55a22]"],
                ].map(([label, tone]) => (
                  <div
                    key={label}
                    className="inline-flex items-center gap-2 rounded-full border border-[#d7e0e8] bg-white/95 px-3 py-2 text-xs font-semibold text-slate-500"
                  >
                    <span className={cn("size-2 rounded-full", tone)} />
                    {label}
                  </div>
                ))}
              </div>

              <div className="absolute bottom-5 right-5 inline-flex items-center gap-2 rounded-full bg-[#0f2236] px-4 py-2 text-xs font-semibold text-white">
                <span className="size-2 animate-pulse rounded-full bg-emerald-400" />
                corrida acompanhada em tempo real
              </div>
            </div>
          </div>
        </SurfaceCard>

        <SurfaceCard className="p-6 md:p-7">
          <div className="space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
                Pedido em foco
              </div>
              <h2 className="mt-2 font-heading text-3xl font-bold text-[#12202d]">
                Snapshot do pedido mais recente
              </h2>
            </div>

            <InfoCard title={latestOrder ? `Pedido #${latestOrder.id}` : "Pedido em espera"}>
              {latestOrder ? (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={latestOrder.status} />
                    <span className="rounded-full bg-[#f5dccb] px-3 py-1 text-xs font-semibold text-[#8e4517]">
                      {currency(latestOrder.total_amount)}
                    </span>
                  </div>
                  <div className="mt-3">
                    Loja: {latestOrder.store_name}
                    <br />
                    Cliente: {latestOrder.customer_name}
                    <br />
                    Entrega: {latestOrder.delivery_address}
                  </div>
                  <Link
                    to="/console"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "mt-4 h-10 rounded-2xl border-[#d7e0e8] bg-white"
                    )}
                  >
                    Continuar no console
                    <ArrowRight className="size-4" />
                  </Link>
                </>
              ) : (
                "Nenhum pedido em foco ainda."
              )}
            </InfoCard>

            <div className="grid gap-3 md:grid-cols-3">
              <StatTile
                label="Aguardando entregador"
                value={metrics.available_deliveries}
                foot="Pedidos esperando corrida"
              />
              <StatTile label="Em rota" value={metrics.in_delivery} foot="Jornadas em andamento" />
              <StatTile label="Concluidos" value={metrics.delivered} foot="Pedidos entregues" />
            </div>

            <OrderTracker status={latestOrder?.status ?? "accepted"} />
          </div>
        </SurfaceCard>
      </section>

      <section className="defer-render grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <SurfaceCard className="p-6 md:p-7">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-[#16324a]/8 text-[#16324a]">
              <Boxes className="size-5" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-[0.14em] text-[#8e4517] uppercase">
                Catalogo em destaque
              </div>
              <h2 className="mt-1 font-heading text-3xl font-bold text-[#12202d]">
                Pecas prontas para a jornada
              </h2>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {featuredProducts.length ? (
              featuredProducts.map((product) => (
                <InfoCard key={product.id} title={product.name} className="h-full">
                  <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">
                    <PackageCheck className="size-3.5" />
                    SKU ativo
                  </div>
                  <div className="mt-3 font-heading text-3xl font-bold text-[#12202d]">
                    {currency(product.price)}
                  </div>
                  <div className="mt-3">
                    Estoque: {product.stock}
                    <br />
                    Loja: {product.store_name}
                  </div>
                </InfoCard>
              ))
            ) : (
              <InfoCard title="Catalogo vazio">
                Cadastre a demo para preencher a vitrine com as primeiras pecas.
              </InfoCard>
            )}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              {
                title: "Popular dados demo",
                copy: "Crie a base inicial de usuarios, loja, produtos e pedido.",
                icon: Users,
              },
              {
                title: "Abrir console",
                copy: "Use a tela operacional por persona, sem ruido visual.",
                icon: Gauge,
              },
              {
                title: "Mostrar o fluxo",
                copy: "Alterne perfis e conclua a entrega ponta a ponta.",
                icon: Truck,
              },
            ].map(({ title, copy, icon: Icon }) => (
              <div key={title} className="rounded-[22px] border border-[#d7e0e8] bg-slate-50 p-4">
                <div className="flex items-center gap-2 font-semibold text-[#12202d]">
                  <Icon className="size-4 text-[#16324a]" />
                  {title}
                </div>
                <div className="mt-2 text-sm leading-6 text-slate-500">{copy}</div>
              </div>
            ))}
          </div>
        </SurfaceCard>

        <SurfaceCard className="overflow-hidden border-white/15 bg-[linear-gradient(155deg,rgba(15,34,52,0.99),rgba(20,46,69,0.96))] p-6 text-white md:p-7">
          <div className="space-y-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold tracking-[0.14em] uppercase text-slate-200">
              <Clock3 className="size-3.5" />
              stack atual
            </div>
            <div>
              <h2 className="font-heading text-4xl font-bold">Frontend novo, mesma API.</h2>
              <p className="mt-3 text-sm leading-7 text-slate-200">
                A apresentacao ficou mais forte sem trocar o coracao do MVP. O build React
                conversa com a mesma camada FastAPI e leva a demo direto para o console.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                ["React + Vite", formatDate(new Date().toISOString())],
                ["shadcn/ui", "Base de componentes"],
                ["FastAPI", "API existente"],
              ].map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-[22px] border border-white/10 bg-white/6 px-4 py-3"
                >
                  <div className="font-semibold text-white">{title}</div>
                  <div className="text-sm text-slate-300">{subtitle}</div>
                </div>
              ))}
            </div>
            <Link
              to="/console"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-11 rounded-2xl bg-white px-5 text-[#16324a] hover:bg-slate-100"
              )}
            >
              Entrar no console
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </SurfaceCard>
      </section>
    </div>
  )
}

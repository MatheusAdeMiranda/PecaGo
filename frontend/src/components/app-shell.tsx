import { LogOut, PackageSearch } from "lucide-react"
import { NavLink, Outlet } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useSession } from "@/components/session-provider"
import { getRoleLabel } from "@/lib/format"
import { cn } from "@/lib/utils"

const navLinkClassName = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-[#16324a]/8 hover:text-[#16324a]",
    isActive && "bg-[#16324a]/8 text-[#16324a]"
  )

export function AppShell() {
  const { user, logout } = useSession()

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 md:px-6 xl:px-0">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-2xl bg-[#16324a] text-white shadow-[0_12px_30px_rgba(13,34,52,0.22)]">
              <PackageSearch className="size-6" />
            </div>
            <div>
              <div className="font-heading text-3xl leading-none font-bold text-[#12202d]">
                PecaGo
              </div>
              <div className="text-sm text-slate-500">
                Marketplace de autopecas com entrega sob demanda
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex items-center gap-1 rounded-full border border-[#d7e0e8] bg-white/90 p-1">
              <NavLink to="/" end className={navLinkClassName}>
                Home
              </NavLink>
              <NavLink to="/console" className={navLinkClassName}>
                Console
              </NavLink>
              <a
                href="/docs"
                target="_blank"
                rel="noreferrer"
                className="rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-[#16324a]/8 hover:text-[#16324a]"
              >
                Docs
              </a>
            </nav>

            {user ? (
              <div className="flex items-center gap-2 rounded-full border border-[#d7e0e8] bg-white px-3 py-2 shadow-sm">
                <div className="text-right">
                  <div className="text-sm font-semibold text-[#12202d]">{user.name}</div>
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-500">
                    {getRoleLabel(user.role)}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#d7e0e8] bg-white"
                  onClick={logout}
                >
                  <LogOut className="size-4" />
                  Sair
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 xl:px-0">
        <Outlet />
      </main>
    </div>
  )
}

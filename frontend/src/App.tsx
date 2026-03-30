import { lazy, Suspense } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/app-shell"
import { SessionProvider } from "@/components/session-provider"
import { Toaster } from "@/components/ui/sonner"

const HomePage = lazy(async () => ({
  default: (await import("@/pages/home-page")).HomePage,
}))

const ConsolePage = lazy(async () => ({
  default: (await import("@/pages/console-page")).ConsolePage,
}))

function RouteFallback() {
  return (
    <div className="space-y-6">
      <div className="h-[340px] animate-pulse rounded-[28px] border border-white/60 bg-white/70" />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="h-[220px] animate-pulse rounded-[28px] border border-white/60 bg-white/70" />
        <div className="h-[220px] animate-pulse rounded-[28px] border border-white/60 bg-white/70" />
        <div className="h-[220px] animate-pulse rounded-[28px] border border-white/60 bg-white/70" />
      </div>
    </div>
  )
}

function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route
              path="/"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <HomePage />
                </Suspense>
              }
            />
            <Route
              path="/console"
              element={
                <Suspense fallback={<RouteFallback />}>
                  <ConsolePage />
                </Suspense>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </SessionProvider>
  )
}

export default App

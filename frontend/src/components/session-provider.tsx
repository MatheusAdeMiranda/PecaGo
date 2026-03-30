import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

import {
  api,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
  type TokenResponse,
  type UserRead,
} from "@/lib/api"

interface SessionContextValue {
  token: string
  user: UserRead | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  refreshSession: () => Promise<void>
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => getStoredToken())
  const [user, setUser] = useState<UserRead | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(getStoredToken()))

  const refreshSession = useCallback(async () => {
    const activeToken = getStoredToken()

    if (!activeToken) {
      startTransition(() => {
        setToken("")
        setUser(null)
      })
      return
    }

    setIsLoading(true)

    try {
      const me = await api<UserRead>("/auth/me", {}, activeToken)
      startTransition(() => {
        setToken(activeToken)
        setUser(me)
      })
    } catch {
      clearStoredToken()
      startTransition(() => {
        setToken("")
        setUser(null)
      })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  async function login(email: string, password: string) {
    setIsLoading(true)

    try {
      const auth = await api<TokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const me = await api<UserRead>("/auth/me", {}, auth.access_token)
      setStoredToken(auth.access_token)

      startTransition(() => {
        setToken(auth.access_token)
        setUser(me)
      })
    } finally {
      setIsLoading(false)
    }
  }

  function logout() {
    clearStoredToken()
    startTransition(() => {
      setToken("")
      setUser(null)
    })
  }

  return (
    <SessionContext.Provider
      value={{
        token,
        user,
        isLoading,
        isAuthenticated: Boolean(token && user),
        login,
        logout,
        refreshSession,
      }}
    >
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const context = useContext(SessionContext)

  if (!context) {
    throw new Error("useSession must be used inside SessionProvider")
  }

  return context
}

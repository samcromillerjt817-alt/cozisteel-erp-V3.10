import { create } from 'zustand'

interface AuthState {
  isAuthenticated: boolean
  user: { name: string; id: string } | null
  setAuth: (user: { name: string; id: string } | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  user: null,
  setAuth: (user) => set({ isAuthenticated: !!user, user }),
}))
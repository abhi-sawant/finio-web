import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AuthUser } from '@/services/api';

interface AuthStore {
  token: string | null;
  user: AuthUser | null;
  lastBackupAt: string | null;
  isLoaded: boolean;

  loadAuth: () => void;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  setLastBackupAt: (date: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      lastBackupAt: null,
      isLoaded: false,

      loadAuth: () => {
        set({ isLoaded: true });
      },

      setAuth: (token, user) => {
        set({ token, user });
      },

      clearAuth: () => {
        set({ token: null, user: null, lastBackupAt: null });
      },

      setLastBackupAt: (date) => {
        set({ lastBackupAt: date });
      },
    }),
    {
      name: 'finio-auth',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.loadAuth();
        }
      },
    },
  ),
);

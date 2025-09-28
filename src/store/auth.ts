import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  token: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      token: null,

      setUser: (user) => {
        set({ user, isAuthenticated: !!user });
      },

      setToken: (token) => {
        set({ token });
      },

      login: async (email: string, password: string) => {
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          const data = await response.json();

          if (!response.ok) {
            return {
              success: false,
              error: data.error || 'Login failed',
            };
          }

          // Update auth state
          set({
            user: data.user,
            isAuthenticated: true,
            token: data.session?.access_token || null,
          });

          return { success: true };
        } catch (error) {
          console.error('Login error:', error);
          return {
            success: false,
            error: 'Network error',
          };
        }
      },

      logout: async () => {
        try {
          await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
          console.error('Logout error:', error);
        } finally {
          // Clear auth state
          set({
            user: null,
            isAuthenticated: false,
            token: null,
          });

          // Clear other stores if needed
          localStorage.removeItem('user');

          // Redirect to login
          window.location.href = '/login';
        }
      },

      checkSession: async () => {
        try {
          const response = await fetch('/api/auth/session');

          if (!response.ok) {
            // Session invalid or expired
            set({
              user: null,
              isAuthenticated: false,
              token: null,
            });
            return;
          }

          const data = await response.json();

          if (data.user) {
            set({
              user: data.user,
              isAuthenticated: true,
              token: data.session?.access_token || null,
            });
          }
        } catch (error) {
          console.error('Session check error:', error);
          set({
            user: null,
            isAuthenticated: false,
            token: null,
          });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Helper function to add auth headers to fetch requests
export function getAuthHeaders(): HeadersInit {
  const state = useAuthStore.getState();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  return headers;
}

// Protected fetch wrapper
export async function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const authHeaders = getAuthHeaders();

  const response = await fetch(url, {
    ...options,
    headers: {
      ...authHeaders,
      ...(options?.headers || {}),
    },
  });

  // Handle 401 - redirect to login
  if (response.status === 401) {
    const authStore = useAuthStore.getState();
    await authStore.logout();
  }

  return response;
}
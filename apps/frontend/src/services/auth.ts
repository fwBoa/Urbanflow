import { apiService } from './api';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatar: string;
  preferredMode: string;
  accessibilityNeeds: boolean;
  role: string;
}

export interface AuthResponse {
  user: AuthUser;
}

// ─── OWASP A07: JWT now stored in httpOnly cookie (no localStorage) ───
// Token is sent automatically by the browser with credentials: 'include'
// We keep a lightweight flag in sessionStorage to know if user is "logged in"
const AUTH_FLAG = 'urbanflow_authenticated';

export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(AUTH_FLAG) === 'true';
}

function setAuthFlag(): void {
  sessionStorage.setItem(AUTH_FLAG, 'true');
}

function clearAuthFlag(): void {
  sessionStorage.removeItem(AUTH_FLAG);
}

// ─── Auth API calls (credentials: 'include' for cookie-based auth) ───

export async function register(email: string, password: string, displayName?: string): Promise<AuthResponse> {
  const res = await fetch(`${apiService.getBaseUrl()}/api/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, displayName }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Erreur lors de l\'inscription');
  }

  const data: AuthResponse = await res.json();
  setAuthFlag();
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${apiService.getBaseUrl()}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || 'Email ou mot de passe incorrect');
  }

  const data: AuthResponse = await res.json();
  setAuthFlag();
  return data;
}

export async function getProfile(): Promise<AuthUser> {
  const res = await fetch(`${apiService.getBaseUrl()}/api/auth/me`, {
    credentials: 'include',
  });

  if (!res.ok) {
    clearAuthFlag();
    throw new Error('Session expirée');
  }

  return res.json();
}

export async function updateProfile(updates: {
  displayName?: string;
  avatar?: string;
  preferredMode?: string;
  accessibilityNeeds?: boolean;
}): Promise<AuthUser> {
  const res = await fetch(`${apiService.getBaseUrl()}/api/auth/me`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    throw new Error('Erreur lors de la mise à jour du profil');
  }

  return res.json();
}

export async function logout(): Promise<void> {
  // Call backend to clear httpOnly cookie
  await fetch(`${apiService.getBaseUrl()}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
  clearAuthFlag();
}
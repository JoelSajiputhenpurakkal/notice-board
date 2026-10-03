// Client API bridge for Spring Boot REST API with fallback to Next.js API routes

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
export const usesRemoteBackend = Boolean(API_BASE);
const TOKEN_KEY = "noticeboard_jwt_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Primary URL points to Spring Boot; fall back to same-origin Next.js if Spring Boot is unreachable
  const fullUrl = path.startsWith("http") ? path : API_BASE ? `${API_BASE}${path}` : path;

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers,
      cache: "no-store"
    });

    if (response.status === 401) {
      setToken(null);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP error ${response.status}`);
    }
    return data as T;
  } catch (error: any) {
    // If Spring Boot server is down, check if Next.js local fallback can answer (for auth/dev)
    if (API_BASE && fullUrl.startsWith(API_BASE) && error.message.includes("Failed to fetch")) {
      try {
        const fallbackUrl = path;
        const fallbackResponse = await fetch(fallbackUrl, {
          ...options,
          headers,
          cache: "no-store"
        });
        const fallbackData = await fallbackResponse.json().catch(() => ({}));
        if (!fallbackResponse.ok) {
          throw new Error(fallbackData.message || fallbackData.error || "Request failed");
        }
        return fallbackData as T;
      } catch (fallbackError) {
        // Preserve same-origin API errors such as invalid credentials instead of
        // masking them with the unreachable backend error.
        throw fallbackError;
      }
    }
    throw error;
  }
}

export async function pingBackend(): Promise<boolean> {
  try {
    const healthUrl = API_BASE ? `${API_BASE}/api/health` : "/api/health";
    const res = await fetch(healthUrl, { method: "GET", cache: "no-store", signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

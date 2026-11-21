const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');

let activeAccessToken: string | undefined;
let refreshInFlight: Promise<string | undefined> | undefined;

/** Keep the in-memory bearer token synchronized with the authenticated session. */
export function setAccessToken(token: string | undefined) {
  activeAccessToken = token;
}

export async function refreshAccessToken(): Promise<string | undefined> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(API + '/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) return undefined;
        const body = (await response.json()) as { data?: { accessToken?: string } };
        activeAccessToken = body.data?.accessToken;
        return activeAccessToken;
      })
      .catch(() => undefined)
      .finally(() => {
        refreshInFlight = undefined;
      });
  }
  return refreshInFlight;
}

/**
 * Centralized API transport. It preserves cookie credentials, bearer auth,
 * JSON handling, and the single refresh-and-retry behavior for expired sessions.
 */
export async function call<T>(
  path: string,
  token?: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const currentToken = activeAccessToken || token;
  if (currentToken) headers.set('Authorization', 'Bearer ' + currentToken);
  const response = await fetch(API + path, { ...init, headers, credentials: 'include' });

  if (response.status === 401 && retry && !path.startsWith('/auth/')) {
    const nextToken = await refreshAccessToken();
    if (nextToken) return call<T>(path, nextToken, init, false);
  }
  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(body.error?.message || 'Request failed (' + response.status + ')');
  }
  return body.data as T;
}

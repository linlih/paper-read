export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'content-type': 'application/json' }),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || payload.message || message;
    } catch {
      // Keep status fallback.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function promiseWithTimeout<T>(
  promise: PromiseLike<T>,
  ms: number,
  label = 'Promise',
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ])
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 10000, ...rest } = options
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal })
    return res
  } finally {
    clearTimeout(id)
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number; retries?: number; backoff?: number } = {},
): Promise<Response> {
  const { retries = 2, backoff = 1000, ...rest } = options
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, rest)
      if (res.ok || attempt >= retries) return res
      if (res.status >= 400 && res.status < 500) return res
      console.warn(`fetch ${url} returned ${res.status}, retrying (${attempt + 1}/${retries})`)
    } catch (e) {
      if (attempt >= retries) throw e
      console.warn(`fetch ${url} failed (${attempt + 1}/${retries}):`, e)
    }
    await new Promise((r) => setTimeout(r, backoff * (attempt + 1)))
  }
  throw new Error(`fetch ${url} failed after ${retries + 1} attempts`)
}

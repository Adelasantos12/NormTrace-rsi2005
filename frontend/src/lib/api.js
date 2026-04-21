function normalizeBase(url) {
  return (url || '').trim().replace(/\/+$/, '')
}

function resolveBase() {
  const runtimeBase =
    typeof window !== 'undefined'
      ? normalizeBase(new URLSearchParams(window.location.search).get('api'))
      : ''
  const envBase = normalizeBase(import.meta.env.VITE_API_URL)

  if (runtimeBase) return runtimeBase
  if (envBase) return envBase
  if (!import.meta.env.PROD) return 'http://localhost:8000'
  return ''
}

const BASE = resolveBase()

async function request(path, options = {}) {
  if (!BASE) {
    throw new Error('Backend URL not configured. Set VITE_API_URL in Vercel.')
const envBase = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
const runtimeBase = typeof window !== 'undefined'
  ? (new URLSearchParams(window.location.search).get('api') || '').trim().replace(/\/+$/, '')
  : '';

const BASE = runtimeBase || envBase || (import.meta.env.PROD ? '' : 'http://localhost:8000');

if (import.meta.env.PROD && !BASE) {
  console.error(
    '[NormTrace] Missing API base URL. Configure VITE_API_URL in Vercel, or open the app with ?api=https://your-backend.railway.app'
  );
const envBase = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
const runtimeBase = typeof window !== 'undefined'
  ? (new URLSearchParams(window.location.search).get('api') || '').trim().replace(/\/+$/, '')
  : ''

const BASE = runtimeBase || envBase || (import.meta.env.PROD ? '' : 'http://localhost:8000')

if (import.meta.env.PROD && !BASE) {
  console.error(
    '[NormTrace] Missing API base URL. Configure VITE_API_URL in Vercel, ' +
    'or open the app with ?api=https://your-backend.railway.app'

const BASE = envBase || (import.meta.env.PROD ? '/api' : 'http://localhost:8000')

if (import.meta.env.PROD && !envBase) {
  console.warn(
    '[NormTrace] VITE_API_URL is not configured. Using /api fallback. ' +
    'If your deployment has no /api rewrite/proxy, requests will fail.'
  )
}

async function request(path, options = {}) {
  if (!BASE) {
    throw new Error(
      'Backend URL not configured. Set VITE_API_URL in Vercel (or use ?api=https://your-backend.railway.app).'
    )
  }

  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  if (res.status === 204) return null
  return res.json()
}

// Countries
export const getCountries = () => request('/countries')
export const createCountry = (payload) =>
  request('/countries', { method: 'POST', body: JSON.stringify(payload) })

// Analyses
export const getAnalyses = (iso3) => request(`/countries/${iso3}/analyses`)
export const createAnalysis = (iso3, lang = 'en') =>
  request(`/countries/${iso3}/analyses?lang=${lang}`, { method: 'POST' })
export const getAnalysis = (aid) => request(`/analyses/${aid}`)
export const updateLanguage = (aid, language) =>
  request(`/analyses/${aid}/language`, {
    method: 'PATCH',
    body: JSON.stringify({ language }),
  })
export const updateNotes = (aid, notes) =>
  request(`/analyses/${aid}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  })
export const updateEsparScore = (aid, score, reference_date) =>
  request(
    `/analyses/${aid}/espar-score?score=${score}&reference_date=${encodeURIComponent(reference_date)}`,
    { method: 'PATCH' }
  )

// Corpus
export const getCorpus = (aid) => request(`/analyses/${aid}/corpus`)
export const updateCorpusItem = (itemId, payload) =>
  request(`/corpus-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
export const addCorpusItem = (aid, payload) =>
  request(`/analyses/${aid}/corpus`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
export const confirmCorpus = (aid) =>
  request(`/analyses/${aid}/confirm-corpus`, { method: 'POST' })

// Streaming
export function streamDiscoverCorpus(aid, onChunk, onDone, onError) {
  return streamEndpoint(`/analyses/${aid}/discover-corpus`, 'POST', onChunk, onDone, onError)
}

export function streamAnalyzeBlock(aid, block, onChunk, onDone, onError) {
  return streamEndpoint(`/analyses/${aid}/analyze/${block}`, 'POST', onChunk, onDone, onError)
}

function streamEndpoint(path, method, onChunk, onDone, onError) {
  const controller = new AbortController()
  if (!BASE) {
    onError(new Error('Backend URL not configured. Set VITE_API_URL in Vercel.'))
    return () => {}
  }

  if (!BASE) {
    onError(new Error('Backend URL not configured. Set VITE_API_URL in Vercel.'))
    return () => {}
  }

  fetch(`${BASE}${path}`, { method, signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let terminalEventReceived = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const msg = JSON.parse(line.slice(6))
            if (msg.chunk) onChunk(msg.chunk)
            if (msg.done) {
              terminalEventReceived = true
              onDone(msg)
            }
            if (msg.error) {
              terminalEventReceived = true
              onError(new Error(msg.error))
            }
          } catch (_) {}
        }
      }

      // Defensive fallback: some servers/proxies may end stream without final SSE event.
      if (!terminalEventReceived) onDone({ done: true, implicit: true })
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err)
    })

  return () => controller.abort()
}

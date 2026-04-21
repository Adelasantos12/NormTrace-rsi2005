function normalizeBase(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

function resolveBase() {
  const runtimeBase =
    typeof window !== 'undefined'
      ? normalizeBase(new URLSearchParams(window.location.search).get('api'))
      : '';
  const envBase = normalizeBase(import.meta.env.VITE_API_URL);

  if (runtimeBase) return runtimeBase;
  if (envBase) return envBase;
  if (!import.meta.env.PROD) return 'http://localhost:8000';
  return '';
}

const BASE = resolveBase();

async function request(path, options = {}) {
  if (!BASE) {
    throw new Error('Backend URL not configured. Set VITE_API_URL in Vercel.');
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch (err) {
    throw new Error(`Network error reaching API at ${BASE}: ${err.message}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

function getApiBase() {
  return BASE;
}

// Countries
function getCountries() {
  return request('/countries');
}

function createCountry(payload) {
  return request('/countries', { method: 'POST', body: JSON.stringify(payload) });
}

// Analyses
function getAnalyses(iso3) {
  return request(`/countries/${iso3}/analyses`);
}

function createAnalysis(iso3, lang = 'en') {
  return request(`/countries/${iso3}/analyses?lang=${lang}`, { method: 'POST' });
}

function getAnalysis(aid) {
  return request(`/analyses/${aid}`);
}

function updateLanguage(aid, language) {
  return request(`/analyses/${aid}/language`, {
    method: 'PATCH',
    body: JSON.stringify({ language }),
  });
}

function updateNotes(aid, notes) {
  return request(`/analyses/${aid}/notes`, {
    method: 'PATCH',
    body: JSON.stringify({ notes }),
  });
}

function updateEsparScore(aid, score, reference_date) {
  return request(
    `/analyses/${aid}/espar-score?score=${score}&reference_date=${encodeURIComponent(reference_date)}`,
    { method: 'PATCH' }
  );
}

// Corpus
function getCorpus(aid) {
  return request(`/analyses/${aid}/corpus`);
}

function updateCorpusItem(itemId, payload) {
  return request(`/corpus-items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

function addCorpusItem(aid, payload) {
  return request(`/analyses/${aid}/corpus`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

function confirmCorpus(aid) {
  return request(`/analyses/${aid}/confirm-corpus`, { method: 'POST' });
}

// Streaming
function streamDiscoverCorpus(aid, onChunk, onDone, onError) {
  return streamEndpoint(`/analyses/${aid}/discover-corpus`, 'POST', onChunk, onDone, onError);
}

function streamAnalyzeBlock(aid, block, onChunk, onDone, onError) {
  return streamEndpoint(`/analyses/${aid}/analyze/${block}`, 'POST', onChunk, onDone, onError);
}

function streamEndpoint(path, method, onChunk, onDone, onError) {
  const controller = new AbortController();
  if (!BASE) {
    onError(new Error('Backend URL not configured. Set VITE_API_URL in Vercel.'));
    return () => {};
  }

  fetch(`${BASE}${path}`, { method, signal: controller.signal })
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let terminalEventReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const msg = JSON.parse(line.slice(6));
            if (msg.chunk) onChunk(msg.chunk);
            if (msg.done) {
              terminalEventReceived = true;
              onDone(msg);
            }
            if (msg.error) {
              terminalEventReceived = true;
              onError(new Error(msg.error));
            }
          } catch (_) {}
        }
      }

      if (!terminalEventReceived) onDone({ done: true, implicit: true });
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError(err);
    });

  return () => controller.abort();
}

export {
  getCountries,
  createCountry,
  getAnalyses,
  createAnalysis,
  getAnalysis,
  updateLanguage,
  updateNotes,
  updateEsparScore,
  getCorpus,
  updateCorpusItem,
  addCorpusItem,
  confirmCorpus,
  streamDiscoverCorpus,
  streamAnalyzeBlock,
  getApiBase,
};

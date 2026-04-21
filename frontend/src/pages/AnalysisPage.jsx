import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  getAnalysis, getCorpus, updateCorpusItem, addCorpusItem,
  confirmCorpus, streamDiscoverCorpus, streamAnalyzeBlock,
  updateLanguage, updateEsparScore
} from '../lib/api'

const BLOCKS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'SCORES']

const SEVERITY_COLORS = {
  critical: '#A32D2D', high: '#854F0B', medium: '#3B6D11', low: '#185FA5'
}

const CLS_LABELS = { include: '✓ Include', review: '? Review', discard: '✗ Discard' }

export default function AnalysisPage({ country, analysis: initialAnalysis, onBack }) {
  const { t } = useTranslation()
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [corpus, setCorpus] = useState([])
  const [activeTab, setActiveTab] = useState('corpus')
  const [streaming, setStreaming] = useState(null)  // block name being streamed
  const [streamText, setStreamText] = useState({})  // blockName → raw text
  const [esparInput, setEsparInput] = useState({ score: '', date: '' })
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', instrument_type: '', sector: '', url: '', last_reform_label: '', ihr_articles: '' })
  const [uiError, setUiError] = useState('')
  const cancelStream = useRef(null)

  useEffect(() => {
    if (analysis && analysis.status === 'corpus_pending' && streaming !== 'DISCOVERY') {
      startDiscovery();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis?.status]);


  useEffect(() => {
    getCorpus(analysis.id).then(setCorpus).catch((err) => setUiError(err.message || 'Failed to load corpus'))
    const interval = setInterval(async () => {
      try {
        const fresh = await getAnalysis(analysis.id)
        setAnalysis(fresh)
        if (fresh.status === 'complete') clearInterval(interval)
      } catch (err) {
        setUiError(err.message || 'Failed to refresh analysis')
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [analysis.id])

  // Corpus discovery
  function startDiscovery() {
    setUiError('')
    setStreaming('DISCOVERY')
    setStreamText(p => ({ ...p, DISCOVERY: '' }))
    cancelStream.current = streamDiscoverCorpus(
      analysis.id,
      (chunk) => setStreamText(p => ({ ...p, DISCOVERY: (p.DISCOVERY || '') + chunk })),
      async () => {
        try {
          setStreaming(null)
          const [fresh, freshCorpus] = await Promise.all([
            getAnalysis(analysis.id),
            getCorpus(analysis.id),
          ])
          setAnalysis(fresh)
          setCorpus(freshCorpus)
        } catch (err) {
          setUiError(err.message || 'Discovery finished with errors')
        }
      },
      async (err) => {
        setStreaming(null)
        setUiError(err.message || 'Corpus discovery failed')
        try {
          const fresh = await getAnalysis(analysis.id)
          setAnalysis(fresh)
        } catch (_) {}
      }
    )
  }

  // Block analysis
  function startBlockAnalysis(block) {
    setUiError('')
    setStreaming(block)
    setStreamText(p => ({ ...p, [block]: '' }))
    cancelStream.current = streamAnalyzeBlock(
      analysis.id, block,
      (chunk) => setStreamText(p => ({ ...p, [block]: (p[block] || '') + chunk })),
      async () => {
        try {
          setStreaming(null)
          const fresh = await getAnalysis(analysis.id)
          setAnalysis(fresh)
        } catch (err) {
          setUiError(err.message || `Block ${block} finished with errors`)
        }
      },
      (err) => {
        setStreaming(null)
        setUiError(err.message || `Block ${block} failed`)
      }
    )
  }

  async function handleClassify(itemId, newCls) {
    try {
      const updated = await updateCorpusItem(itemId, { classification: newCls, user_confirmed: 'yes' })
      setCorpus(prev => prev.map(i => i.id === itemId ? updated : i))
    } catch (err) {
      setUiError(err.message || 'Failed to update corpus item')
    }
  }

  async function handleAddItem(e) {
    e.preventDefault()
    try {
      const item = await addCorpusItem(analysis.id, { ...newItem, classification: 'include' })
      setCorpus(prev => [...prev, item])
      setNewItem({ name: '', instrument_type: '', sector: '', url: '', last_reform_label: '', ihr_articles: '' })
      setShowAddItem(false)
    } catch (err) {
      setUiError(err.message || 'Failed to add corpus item')
    }
  }

  async function handleConfirmCorpus() {
    try {
      await confirmCorpus(analysis.id)
      const fresh = await getAnalysis(analysis.id)
      setAnalysis(fresh)
      setActiveTab('A')
    } catch (err) {
      setUiError(err.message || 'Failed to confirm corpus')
    }
  }

  async function handleLangChange(lang) {
    try {
      await updateLanguage(analysis.id, lang)
      const fresh = await getAnalysis(analysis.id)
      setAnalysis(fresh)
    } catch (err) {
      setUiError(err.message || 'Failed to update analysis language')
    }
  }

  async function handleEsparSave() {
    if (!esparInput.score || !esparInput.date) return
    try {
      await updateEsparScore(analysis.id, parseInt(esparInput.score), esparInput.date)
      const fresh = await getAnalysis(analysis.id)
      setAnalysis(fresh)
    } catch (err) {
      setUiError(err.message || 'Failed to save e-SPAR score')
    }
  }

  const includedCorpus = corpus.filter(i => i.classification === 'include')
  const reviewCorpus = corpus.filter(i => i.classification === 'review')
  const discardedCorpus = corpus.filter(i => i.classification === 'discard')

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
        <button onClick={onBack} style={btnSecondary}>← {t('nav.countries')}</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', margin: 0, fontFamily: 'inherit' }}>
            {country.name_en} — Analysis #{analysis.id}
          </h2>
          <p style={{ fontSize: '11px', color: '#73726c', margin: '2px 0 0' }}>
            {t('analysis.created')}: {new Date(analysis.created_at).toLocaleString()}
            {analysis.completed_at && (
              <> · {t('analysis.completed')}: {new Date(analysis.completed_at).toLocaleString()}</>
            )}
          </p>
        </div>

        {/* Language selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: '#73726c' }}>{t('language.label')}:</span>
          {['en', 'es', 'fr'].map(l => (
            <button
              key={l}
              onClick={() => handleLangChange(l)}
              style={{
                ...btnSmall,
                fontWeight: analysis.language === l ? '700' : '400',
                background: analysis.language === l ? '#1a1917' : 'none',
                color: analysis.language === l ? '#fff' : '#5F5E5A',
                border: '1px solid ' + (analysis.language === l ? '#1a1917' : '#e5e3dc'),
              }}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Source dates card — traceability panel */}
      {analysis.sources && analysis.sources.length > 0 && (
        <div style={{ ...card, marginBottom: '1rem', background: '#f9f8f5' }}>
          <div style={{ fontSize: '11px', color: '#73726c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
            {t('analysis.sources')} — {t('analysis.reanalyzeHint')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '6px' }}>
            {analysis.sources.map(s => (
              <div key={s.id} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ color: '#3d3d3a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#185FA5' }}>{s.name}</a> : s.name}
                </span>
                <span style={{ color: s.last_reform_label ? '#854F0B' : '#888780', flexShrink: 0 }}>
                  {s.last_reform_label || t('analysis.noSourceDate')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      {uiError && (
        <div style={{ marginBottom: '1rem', color: '#A32D2D', fontSize: '12px' }}>
          {uiError}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid #e5e3dc', marginBottom: '1.5rem', overflowX: 'auto' }}>
        <Tab label={t('corpus.title')} id="corpus" active={activeTab} onClick={setActiveTab} />
        {BLOCKS.map(b => (
          <Tab
            key={b}
            label={b === 'SCORES' ? 'C1 + Reforms' : `Block ${b}`}
            id={b}
            active={activeTab}
            onClick={setActiveTab}
            done={!!analysis.results?.[b]}
          />
        ))}
      </div>

      {/* ── Corpus tab ── */}
      {activeTab === 'corpus' && (
        <div>
          {analysis.status === 'corpus_pending' && (
            <div style={{ marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '13px', color: '#73726c', marginBottom: '12px' }}>
                {t('corpus.subtitle')}
              </p>
              <button
                onClick={startDiscovery}
                disabled={streaming === 'DISCOVERY'}
                style={btn}
              >
                {streaming === 'DISCOVERY' ? 'Discovering…' : '→ Start corpus discovery'}
              </button>
            </div>
          )}

          {streaming === 'DISCOVERY' && streamText.DISCOVERY && (
            <pre style={{ fontSize: '11px', color: '#5F5E5A', background: '#f9f8f5', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap', marginBottom: '1rem' }}>
              {streamText.DISCOVERY}
            </pre>
          )}

          {corpus.length > 0 && (
            <>
              <CorpusSection
                title={`${t('corpus.include')} (${includedCorpus.length})`}
                items={includedCorpus}
                color="#3B6D11"
                onClassify={handleClassify}
                t={t}
              />
              <CorpusSection
                title={`${t('corpus.review')} (${reviewCorpus.length})`}
                items={reviewCorpus}
                color="#854F0B"
                onClassify={handleClassify}
                t={t}
              />
              <CorpusSection
                title={`${t('corpus.discard')} (${discardedCorpus.length})`}
                items={discardedCorpus}
                color="#888780"
                onClassify={handleClassify}
                t={t}
              />

              {/* Add manual item */}
              <button onClick={() => setShowAddItem(!showAddItem)} style={{ ...btnSecondary, marginBottom: '12px' }}>
                + {t('corpus.addManual')}
              </button>

              {showAddItem && (
                <form onSubmit={handleAddItem} style={{ ...card, display: 'grid', gap: '8px', marginBottom: '1rem' }}>
                  <input placeholder="Official name *" value={newItem.name} onChange={e => setNewItem(p => ({ ...p, name: e.target.value }))} required style={input} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    <input placeholder="Type (law, regulation…)" value={newItem.instrument_type} onChange={e => setNewItem(p => ({ ...p, instrument_type: e.target.value }))} style={input} />
                    <input placeholder="Sector (health, migration…)" value={newItem.sector} onChange={e => setNewItem(p => ({ ...p, sector: e.target.value }))} style={input} />
                    <input placeholder="IHR articles (e.g. 4, 6, 19)" value={newItem.ihr_articles} onChange={e => setNewItem(p => ({ ...p, ihr_articles: e.target.value }))} style={input} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px' }}>
                    <input placeholder="URL" value={newItem.url} onChange={e => setNewItem(p => ({ ...p, url: e.target.value }))} style={input} />
                    <input placeholder="Last reform (e.g. DOF 15-01-2026)" value={newItem.last_reform_label} onChange={e => setNewItem(p => ({ ...p, last_reform_label: e.target.value }))} style={input} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button type="button" onClick={() => setShowAddItem(false)} style={btnSecondary}>{t('actions.cancel')}</button>
                    <button type="submit" style={btn}>{t('actions.save')}</button>
                  </div>
                </form>
              )}

              {analysis.status === 'corpus_ready' && (
                <button onClick={handleConfirmCorpus} style={btn}>
                  ✓ {t('corpus.confirm')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Block tabs ── */}
      {BLOCKS.includes(activeTab) && (
        <BlockTab
          block={activeTab}
          analysis={analysis}
          streaming={streaming}
          streamText={streamText[activeTab] || ''}
          onAnalyze={() => startBlockAnalysis(activeTab)}
          esparInput={esparInput}
          setEsparInput={setEsparInput}
          onEsparSave={handleEsparSave}
          t={t}
        />
      )}
    </div>
  )
}

function Tab({ label, id, active, onClick, done }) {
  return (
    <button
      onClick={() => onClick(id)}
      style={{
        padding: '8px 16px',
        fontSize: '12px',
        fontFamily: 'inherit',
        background: 'none',
        border: 'none',
        borderBottom: active === id ? '2px solid #1a1917' : '2px solid transparent',
        cursor: 'pointer',
        color: active === id ? '#1a1917' : '#73726c',
        fontWeight: active === id ? '600' : '400',
        whiteSpace: 'nowrap',
      }}
    >
      {label} {done && <span style={{ color: '#3B6D11' }}>✓</span>}
    </button>
  )
}

function CorpusSection({ title, items, color, onClassify, t }) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h3 style={{ fontSize: '11px', fontWeight: '600', color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
        {title}
      </h3>
      <div style={{ display: 'grid', gap: '4px' }}>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'start',
            padding: '8px 12px', background: '#fff', border: '1px solid #e5e3dc', borderRadius: '6px', fontSize: '12px',
          }}>
            <div>
              <div style={{ fontWeight: '500', marginBottom: '2px' }}>
                {item.url
                  ? <a href={item.url} target="_blank" rel="noreferrer" style={{ color: '#185FA5', textDecoration: 'none' }}>{item.name}</a>
                  : item.name
                }
              </div>
              <div style={{ color: '#73726c', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {item.instrument_type && <span>{item.instrument_type}</span>}
                {item.sector && <span>· {item.sector}</span>}
                {item.ihr_articles && <span>· Arts. {item.ihr_articles}</span>}
                {item.last_reform_label && (
                  <span style={{ color: '#854F0B' }}>· {item.last_reform_label}</span>
                )}
              </div>
              {item.classification_reason && (
                <div style={{ color: '#888780', fontSize: '11px', marginTop: '2px', fontStyle: 'italic' }}>
                  {item.classification_reason}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['include', 'review', 'discard'].filter(c => c !== item.classification).map(cls => (
                <button key={cls} onClick={() => onClassify(item.id, cls)} style={btnTiny}>
                  → {cls}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function BlockTab({ block, analysis, streaming, streamText, onAnalyze, esparInput, setEsparInput, onEsparSave, t }) {
  const result = analysis.results?.[block]
  const isStreaming = streaming === block
  const canAnalyze = analysis.status === 'analyzing' || analysis.status === 'complete'

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>
          {t(`blocks.${block}`)}
        </h3>
        {!result && canAnalyze && (
          <button onClick={onAnalyze} disabled={!!streaming} style={btn}>
            {isStreaming ? t('blocks.analyzing') : t('blocks.analyze')}
          </button>
        )}
      </div>

      {/* Streaming output */}
      {isStreaming && streamText && (
        <pre style={{ fontSize: '11px', color: '#5F5E5A', background: '#f9f8f5', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap', marginBottom: '1rem', overflowY: 'auto', maxHeight: '400px' }}>
          {streamText}
        </pre>
      )}

      {/* Results */}
      {result && block !== 'SCORES' && <BlockResult data={result} t={t} />}
      {result && block === 'SCORES' && (
        <ScoresResult
          data={result}
          analysis={analysis}
          esparInput={esparInput}
          setEsparInput={setEsparInput}
          onEsparSave={onEsparSave}
          t={t}
        />
      )}

      {!result && !isStreaming && (
        <p style={{ fontSize: '12px', color: '#888780' }}>
          {canAnalyze ? t('blocks.pending') : 'Confirm the corpus first to enable analysis.'}
        </p>
      )}
    </div>
  )
}

function BlockResult({ data }) {
  if (!data) return null
  return (
    <div>
      {data.intersectorality_note && (
        <div style={{ ...card, marginBottom: '1rem', borderLeft: '3px solid #378ADD', borderRadius: '0 6px 6px 0' }}>
          <p style={{ fontSize: '12px', color: '#73726c', margin: 0 }}>{data.intersectorality_note}</p>
        </div>
      )}
      {data.articles && Object.entries(data.articles).map(([artKey, art]) => (
        <div key={artKey} style={{ ...card, marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {artKey.replace('_', ' ').toUpperCase()}
            </span>
            <SeverityBadge level={art.attention_level} />
          </div>
          <p style={{ fontSize: '12px', color: '#3d3d3a', lineHeight: 1.6, margin: '0 0 8px' }}>{art.finding}</p>
          <ChainViz chain={art.chain} />
          {art.sources && art.sources.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#73726c' }}>
              {art.sources.map((s, i) => (
                <span key={i}>
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#185FA5' }}>{s.name}</a> : s.name}
                  {s.article && ` Art. ${s.article}`}
                  {i < art.sources.length - 1 && ' · '}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
      {data['2024_amendment_gaps'] && data['2024_amendment_gaps'].length > 0 && (
        <div style={{ ...card, background: '#fef9f0', borderColor: '#EF9F27', marginTop: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: '600', color: '#854F0B', marginBottom: '4px' }}>2024 AMENDMENT GAPS</div>
          {data['2024_amendment_gaps'].map((gap, i) => (
            <p key={i} style={{ fontSize: '12px', margin: '0 0 4px', color: '#5F5E5A' }}>{gap}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function ScoresResult({ data, analysis, esparInput, setEsparInput, onEsparSave, t }) {
  const indicators = ['c1_1', 'c1_2', 'c1_3', 'c1_4', 'c1_5']
  const labels = ['Legislation', 'Financing', 'Coordination', 'Preparedness', 'Accountability']
  const weights = [0.30, 0.20, 0.25, 0.15, 0.10]

  const delta = analysis.c1_score_espar
    ? (analysis.c1_score_espar - (data.total_weighted || 0)).toFixed(1)
    : null

  return (
    <div>
      {/* Score grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '1rem' }}>
        {indicators.map((ind, i) => (
          <div key={ind} style={{ ...card, textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: scoreColor(data[ind]?.score) }}>
              {data[ind]?.score ?? '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#73726c', marginTop: '2px' }}>{labels[i]}</div>
            <div style={{ fontSize: '9px', color: '#888780' }}>w={weights[i]}</div>
          </div>
        ))}
      </div>

      {/* Total + e-SPAR comparison */}
      <div style={{ ...card, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '1rem' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#73726c', marginBottom: '4px' }}>{t('analysis.scores.scanner')}</div>
          <div style={{ fontSize: '32px', fontWeight: '600', color: scoreColor(data.total_weighted) }}>
            {data.total_weighted?.toFixed(1) ?? '—'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '11px', color: '#73726c', marginBottom: '4px' }}>
            {t('analysis.scores.espar')}
            {analysis.espar_reference_date && (
              <span style={{ color: '#888780' }}> · {analysis.espar_reference_date}</span>
            )}
          </div>
          {analysis.c1_score_espar ? (
            <>
              <div style={{ fontSize: '32px', fontWeight: '600', color: scoreColor(analysis.c1_score_espar) }}>
                {analysis.c1_score_espar}
              </div>
              {delta && (
                <div style={{ fontSize: '12px', color: parseFloat(delta) > 0.5 ? '#A32D2D' : '#3B6D11' }}>
                  Δ {delta > 0 ? '+' : ''}{delta} · {parseFloat(delta) > 0.5 ? t('analysis.scores.overreporting') : t('analysis.scores.aligned')}
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
              <input placeholder="Score (1-5)" value={esparInput.score} onChange={e => setEsparInput(p => ({ ...p, score: e.target.value }))} style={{ ...input, width: '70px' }} />
              <input placeholder="Date (e.g. 2024-Q3)" value={esparInput.date} onChange={e => setEsparInput(p => ({ ...p, date: e.target.value }))} style={{ ...input, width: '120px' }} />
              <button onClick={onEsparSave} style={btn}>Save</button>
            </div>
          )}
        </div>
      </div>

      {data.main_finding && (
        <div style={{ ...card, borderLeft: '3px solid #378ADD', borderRadius: '0 6px 6px 0', marginBottom: '1rem' }}>
          <p style={{ fontSize: '13px', color: '#3d3d3a', lineHeight: 1.7, margin: 0 }}>{data.main_finding}</p>
        </div>
      )}

      {/* Reform proposals */}
      {data.reform_proposals && data.reform_proposals.length > 0 && (
        <div>
          <h4 style={{ fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', color: '#5F5E5A' }}>
            {t('reforms.title')}
          </h4>
          {data.reform_proposals.map((r, i) => (
            <div key={i} style={{ ...card, marginBottom: '8px', borderLeft: `3px solid ${SEVERITY_COLORS[r.priority] || '#888780'}`, borderRadius: '0 6px 6px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#5F5E5A', textTransform: 'uppercase' }}>
                  IHR Art. {r.ihr_article}
                </span>
                <SeverityBadge level={r.priority} />
              </div>
              <div style={{ fontSize: '12px', display: 'grid', gap: '4px', color: '#3d3d3a', lineHeight: 1.6 }}>
                <div><strong>{t('reforms.gap')}:</strong> {r.current_gap}</div>
                <div><strong>{t('reforms.instrument')}:</strong> {r.instrument_recommended} — {r.instrument_reason}</div>
                {r.proposed_text && <div style={{ background: '#f9f8f5', padding: '8px', borderRadius: '4px', fontFamily: 'inherit' }}>{r.proposed_text}</div>}
                {r.lateral_effects && <div style={{ color: '#73726c' }}><strong>{t('reforms.lateral')}:</strong> {r.lateral_effects}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChainViz({ chain }) {
  if (!chain) return null
  const links = ['norm', 'actor', 'authority', 'enforceability']
  const colors = { ok: '#3B6D11', weak: '#854F0B', missing: '#A32D2D' }
  const symbols = { ok: '✓', weak: '⚠', missing: '✗' }
  return (
    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
      {links.map((l, i) => (
        <span key={l} style={{ fontSize: '10px', color: colors[chain[l]] || '#888780' }}>
          {symbols[chain[l]] || '?'} {l}{i < links.length - 1 ? ' →' : ''}
        </span>
      ))}
    </div>
  )
}

function SeverityBadge({ level }) {
  const colors = { critical: '#A32D2D', high: '#854F0B', medium: '#3B6D11', low: '#185FA5' }
  const bg = { critical: '#FCEBEB', high: '#FAEEDA', medium: '#EAF3DE', low: '#E6F1FB' }
  if (!level) return null
  return (
    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '3px', background: bg[level] || '#f1efe8', color: colors[level] || '#888780', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {level}
    </span>
  )
}

function scoreColor(score) {
  if (!score) return '#888780'
  if (score <= 1.5) return '#A32D2D'
  if (score <= 2.5) return '#854F0B'
  if (score <= 3.5) return '#BA7517'
  if (score <= 4.5) return '#3B6D11'
  return '#0F6E56'
}

const card = { background: '#fff', border: '1px solid #e5e3dc', borderRadius: '6px', padding: '12px 16px' }
const btn = { background: '#1a1917', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', fontWeight: '500' }
const btnSecondary = { background: 'none', color: '#1a1917', border: '1px solid #e5e3dc', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }
const btnSmall = { padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit' }
const btnTiny = { background: 'none', color: '#73726c', border: '1px solid #e5e3dc', padding: '2px 6px', borderRadius: '3px', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit' }
const input = { padding: '6px 10px', border: '1px solid #e5e3dc', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', color: '#1a1917' }

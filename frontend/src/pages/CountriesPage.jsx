import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getCountries, createCountry, createAnalysis, getAnalyses } from '../lib/api'

const STATUS_COLORS = {
  complete: '#3B6D11',
  analyzing: '#185FA5',
  corpus_ready: '#854F0B',
  corpus_pending: '#888780',
  error: '#A32D2D',
}

export default function CountriesPage({ onSelectAnalysis }) {
  const { t } = useTranslation()
  const [countries, setCountries] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [newCountry, setNewCountry] = useState({ iso3: '', name_en: '', legal_system: 'civil_law', is_federal: 'no' })
  const [loading, setLoading] = useState(true)
  const [expandedCountry, setExpandedCountry] = useState(null)
  const [analyses, setAnalyses] = useState({})  // iso3 → [analysis]

  useEffect(() => {
    getCountries().then(setCountries).finally(() => setLoading(false))
  }, [])

  async function handleAddCountry(e) {
    e.preventDefault()
    const c = await createCountry(newCountry)
    setCountries(prev => [...prev, c])
    setNewCountry({ iso3: '', name_en: '', legal_system: 'civil_law', is_federal: 'no' })
    setShowAdd(false)
  }


  async function toggleCountry(country) {
    let list = analyses[country.iso3];
    if (!list) {
      list = await getAnalyses(country.iso3);
      setAnalyses(prev => ({ ...prev, [country.iso3]: list }));
    }

    if (list && list.length > 0) {
      // Auto-load the most recent analysis
      onSelectAnalysis(country, list[0]);
    } else {
      // Create a new analysis if none exists
      const analysis = await createAnalysis(country.iso3, 'en');
      setAnalyses(prev => ({
        ...prev,
        [country.iso3]: [analysis, ...(prev[country.iso3] || [])],
      }));
      onSelectAnalysis(country, analysis);
    }
  }

  async function handleNewAnalysis(country, lang = 'en') {
    const analysis = await createAnalysis(country.iso3, lang)
    setAnalyses(prev => ({
      ...prev,
      [country.iso3]: [analysis, ...(prev[country.iso3] || [])],
    }))
    onSelectAnalysis(country, analysis)
  }

  const mono = { fontFamily: "'IBM Plex Mono', monospace" }

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '2rem', padding: '16px', background: '#f9f8f5', borderLeft: '4px solid #854F0B', borderRadius: '4px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: '#5F5E5A' }}>{t('methodology.title')}</h3>
        <p style={{ fontSize: '13px', color: '#3d3d3a', lineHeight: 1.6, marginBottom: '8px' }}>{t('methodology.p1')}</p>
        <p style={{ fontSize: '12px', color: '#73726c', fontStyle: 'italic' }}>{t('methodology.p2')}</p>
      </div>

      <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px', ...mono }}>
            {t('countries.title')}
          </h1>
          <p style={{ fontSize: '13px', color: '#73726c' }}>{t('countries.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} style={btnStyle}>
          + {t('countries.addCountry')}
        </button>
      </div>

      {/* Add country form */}
      {showAdd && (
        <form onSubmit={handleAddCountry} style={{ ...cardStyle, marginBottom: '1.5rem', display: 'grid', gap: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 140px', gap: '8px' }}>
            <input
              placeholder="ISO3 (e.g. MEX)"
              value={newCountry.iso3}
              onChange={e => setNewCountry(p => ({ ...p, iso3: e.target.value.toUpperCase() }))}
              maxLength={3}
              required
              style={inputStyle}
            />
            <input
              placeholder="Country name in English"
              value={newCountry.name_en}
              onChange={e => setNewCountry(p => ({ ...p, name_en: e.target.value }))}
              required
              style={inputStyle}
            />
            <select
              value={newCountry.legal_system}
              onChange={e => setNewCountry(p => ({ ...p, legal_system: e.target.value }))}
              style={inputStyle}
            >
              <option value="civil_law">Civil law</option>
              <option value="common_law">Common law</option>
              <option value="mixed">Mixed</option>
            </select>
            <select
              value={newCountry.is_federal}
              onChange={e => setNewCountry(p => ({ ...p, is_federal: e.target.value }))}
              style={inputStyle}
            >
              <option value="no">Unitary</option>
              <option value="yes">Federal</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => setShowAdd(false)} style={btnSecondaryStyle}>{t('actions.cancel')}</button>
            <button type="submit" style={btnStyle}>{t('actions.confirm')}</button>
          </div>
        </form>
      )}

      {/* Country list */}
      {loading ? (
        <p style={{ color: '#73726c', fontSize: '13px' }}>Loading…</p>
      ) : countries.length === 0 ? (
        <p style={{ color: '#73726c', fontSize: '13px' }}>{t('countries.noCountries')}</p>
      ) : (
        <div style={{ display: 'grid', gap: '8px' }}>
          {countries.map(c => (
            <div key={c.iso3} style={cardStyle}>
              {/* Country row */}
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => toggleCountry(c)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '0.1em', color: '#5F5E5A', ...mono }}>
                    {c.iso3}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: '500' }}>{c.name_en}</span>
                  <span style={tagStyle}>{c.legal_system}</span>
                  {c.is_federal === 'yes' && <span style={tagStyle}>federal</span>}
                </div>
                <span style={{ fontSize: '18px', color: '#888780' }}>
                  {expandedCountry === c.iso3 ? '−' : '+'}
                </span>
              </div>

              {/* Expanded: analysis list */}
              {expandedCountry === c.iso3 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid #e5e3dc', paddingTop: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '11px', color: '#73726c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {t('analysis.title')}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {['en', 'es', 'fr'].map(lang => (
                        <button key={lang} onClick={() => handleNewAnalysis(c, lang)} style={btnSmallStyle}>
                          + {t('analysis.new')} ({lang.toUpperCase()})
                        </button>
                      ))}
                    </div>
                  </div>

                  {(!analyses[c.iso3] || analyses[c.iso3].length === 0) ? (
                    <p style={{ fontSize: '12px', color: '#888780' }}>No analyses yet.</p>
                  ) : (
                    <div style={{ display: 'grid', gap: '6px' }}>
                      {analyses[c.iso3].map(a => (
                        <div
                          key={a.id}
                          onClick={() => onSelectAnalysis(c, a)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto auto auto auto',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '10px 12px',
                            background: '#fafaf9',
                            border: '1px solid #e5e3dc',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          <span style={{ color: '#73726c', ...mono }}>
                            #{a.id} · {new Date(a.created_at).toLocaleDateString()}
                          </span>

                          <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.06em',
                            color: STATUS_COLORS[a.status] || '#888780', textTransform: 'uppercase' }}>
                            {t(`analysis.status.${a.status}`)}
                          </span>

                          <span style={tagStyle}>{a.language.toUpperCase()}</span>

                          {a.c1_score_scanner && (
                            <span style={{ fontWeight: '600', color: '#1a1917' }}>
                              C1: {a.c1_score_scanner}/5
                            </span>
                          )}

                          {/* Source dates summary */}
                          {a.sources && a.sources.length > 0 && (
                            <span style={{ color: '#888780', fontSize: '11px' }}>
                              {a.sources.length} sources
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const cardStyle = {
  background: '#fff',
  border: '1px solid #e5e3dc',
  borderRadius: '8px',
  padding: '16px 20px',
}
const btnStyle = {
  background: '#1a1917', color: '#fff', border: 'none',
  padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
  fontSize: '12px', fontWeight: '500', fontFamily: 'inherit',
}
const btnSecondaryStyle = {
  background: 'none', color: '#1a1917', border: '1px solid #e5e3dc',
  padding: '8px 16px', borderRadius: '6px', cursor: 'pointer',
  fontSize: '12px', fontWeight: '500', fontFamily: 'inherit',
}
const btnSmallStyle = {
  background: 'none', color: '#5F5E5A', border: '1px solid #e5e3dc',
  padding: '4px 10px', borderRadius: '4px', cursor: 'pointer',
  fontSize: '11px', fontFamily: 'inherit',
}
const tagStyle = {
  fontSize: '10px', padding: '2px 6px', borderRadius: '3px',
  background: '#f1efe8', color: '#5F5E5A', fontWeight: '500',
}
const inputStyle = {
  padding: '8px 10px', border: '1px solid #e5e3dc', borderRadius: '6px',
  fontSize: '12px', fontFamily: 'inherit', background: '#fff', color: '#1a1917',
  width: '100%',
}

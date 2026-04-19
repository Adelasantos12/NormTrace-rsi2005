import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import '../i18n/index.js'
import CountriesPage from './pages/CountriesPage'
import AnalysisPage from './pages/AnalysisPage'
import LanguageSwitcher from './components/ui/LanguageSwitcher'

export default function App() {
  const { t } = useTranslation()
  const [view, setView] = useState('countries')   // 'countries' | 'analysis'
  const [selectedCountry, setSelectedCountry] = useState(null)
  const [selectedAnalysis, setSelectedAnalysis] = useState(null)

  function openAnalysis(country, analysis) {
    setSelectedCountry(country)
    setSelectedAnalysis(analysis)
    setView('analysis')
  }

  function goHome() {
    setView('countries')
    setSelectedAnalysis(null)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#fafaf9',
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #e5e3dc',
        background: '#fff',
        padding: '0 2rem',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <button
          onClick={goHome}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: '600', letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#1a1917',
            fontFamily: 'inherit',
          }}
        >
          {t('nav.observatory')}
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          {view === 'analysis' && selectedCountry && (
            <span style={{ fontSize: '12px', color: '#73726c' }}>
              {selectedCountry.name_en} · {selectedCountry.iso3}
            </span>
          )}
          <LanguageSwitcher />
        </div>
      </header>

      {/* Main content */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem' }}>
        {view === 'countries' ? (
          <CountriesPage onSelectAnalysis={openAnalysis} />
        ) : (
          <AnalysisPage
            country={selectedCountry}
            analysis={selectedAnalysis}
            onBack={goHome}
          />
        )}
      </main>
    </div>
  )
}

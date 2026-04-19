import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()
  const langs = ['en', 'es', 'fr']

  return (
    <div style={{ display: 'flex', gap: '2px', background: '#f1efe8', borderRadius: '6px', padding: '2px' }}>
      {langs.map(l => (
        <button
          key={l}
          onClick={() => i18n.changeLanguage(l)}
          title={`Switch UI to ${l.toUpperCase()}`}
          style={{
            padding: '3px 8px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            fontFamily: 'inherit',
            fontWeight: i18n.language === l ? '700' : '400',
            background: i18n.language === l ? '#fff' : 'transparent',
            color: i18n.language === l ? '#1a1917' : '#73726c',
          }}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

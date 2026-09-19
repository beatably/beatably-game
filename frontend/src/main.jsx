import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import ConsentBanner from './components/ConsentBanner.jsx'
import { PreviewModeProvider } from './contexts/PreviewModeContext'
import { trackPageview, installErrorReporting } from './utils/track'

installErrorReporting()
trackPageview('game')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PreviewModeProvider>
        <App />
        <ConsentBanner />
      </PreviewModeProvider>
    </ErrorBoundary>
  </StrictMode>,
)

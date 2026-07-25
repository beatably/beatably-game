import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { PreviewModeProvider } from './contexts/PreviewModeContext'
import { trackPageview } from './utils/track'

trackPageview('game')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PreviewModeProvider>
        <App />
      </PreviewModeProvider>
    </ErrorBoundary>
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { PreviewModeProvider } from './contexts/PreviewModeContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <PreviewModeProvider>
        <App />
      </PreviewModeProvider>
    </ErrorBoundary>
  </StrictMode>,
)

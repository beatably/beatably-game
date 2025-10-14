import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { PreviewModeProvider } from './contexts/PreviewModeContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PreviewModeProvider>
      <App />
    </PreviewModeProvider>
  </StrictMode>,
)

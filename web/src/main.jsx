import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import App from './App.jsx'
import './styles.css'

// Apply the saved theme before first paint so there's no flash.
try {
  const s = JSON.parse(localStorage.getItem('keeply_settings') || '{}')
  if (s.darkMode) document.documentElement.dataset.theme = 'dark'
} catch { /* ignore */ }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
)

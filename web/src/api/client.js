import axios from 'axios'

// One axios instance for the whole app. In dev, Vite proxies /api -> Laravel:8000.
// In production (single cPanel domain) /api is served by the same Laravel app.
const client = axios.create({
  baseURL: '/api',
  headers: { Accept: 'application/json' },
})

const TOKEN_KEY = 'keeply_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// Attach the Bearer token (Sanctum personal access token) to every request.
client.interceptors.request.use((config) => {
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// If the token ever goes stale, clear it so the app drops back to the login screen.
client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && getToken()) {
      setToken(null)
      // Let the auth context notice on next render.
      window.dispatchEvent(new Event('keeply:unauthorized'))
    }
    return Promise.reject(err)
  }
)

export default client

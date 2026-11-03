import { useRegisterSW } from 'virtual:pwa-register/react'

// Shows a banner when a new version is deployed. Clicking Refresh applies it and reloads.
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check the server for a newer version every 60s while the app is open.
      if (registration) {
        setInterval(() => { registration.update() }, 60 * 1000)
      }
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-toast" role="status">
      <span className="update-msg">A new version of Keeply is ready.</span>
      <button className="update-refresh" onClick={() => updateServiceWorker(true)}>Refresh</button>
      <button className="update-x" onClick={() => setNeedRefresh(false)} aria-label="Dismiss">✕</button>
    </div>
  )
}

import { useEffect, useState } from 'react'

// A slim status "billboard" pinned to the bottom of the app showing network state.
// Green when connected; amber when offline (notes still save locally and sync later).
export default function NetworkBar() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const [flash, setFlash] = useState(false) // brief "back online" confirmation

  useEffect(() => {
    let t
    const goOnline = () => { setOnline(true); setFlash(true); clearTimeout(t); t = setTimeout(() => setFlash(false), 3000) }
    const goOffline = () => { setOnline(false); setFlash(false) }
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      clearTimeout(t)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  const state = !online ? 'offline' : flash ? 'reconnected' : 'online'

  return (
    <div className={`netbar ${state}`} role="status" aria-live="polite">
      <span className="net-dot" />
      {state === 'offline' && <span>Offline — your notes save on this device and sync when you’re back online.</span>}
      {state === 'reconnected' && <span>Back online — syncing your notes.</span>}
      {state === 'online' && <span>Online — your notes are synced.</span>}
    </div>
  )
}

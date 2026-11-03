import { copyText } from './clipboard'

// Send a note's words to another app. In the Android app that is the phone's share sheet;
// in a browser that supports it, the browser's; otherwise the text is copied.
// Resolves 'shared', 'copied' or 'cancelled'.
export async function shareNote({ title, text }) {
  const bridge = typeof window !== 'undefined' ? window.KeeplyApp : null
  if (bridge && typeof bridge.share === 'function') {
    bridge.share(title || '', text)
    return 'shared'
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: title || undefined, text })
      return 'shared'
    } catch (err) {
      if (err?.name === 'AbortError') return 'cancelled'
    }
  }
  return (await copyText(text)) ? 'copied' : 'cancelled'
}

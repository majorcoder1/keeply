// Voice capture from one microphone stream:
//   1. MediaRecorder  -> the audio file (locked on this device, then saved to Recordings)
//   2. Level meter    -> the live waveform
// There is deliberately no speech-to-text: that would mean sending the audio somewhere
// else to be heard, which can't be done with locked audio.

export function recordingSupported() {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'
}

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/mp4')) return 'audio/mp4' // Safari / iPhone
  return ''
}

// Low bitrate is plenty for speech and keeps long recordings small (~14 MB an hour at 32 kbps).
function recorderOptions() {
  const opts = { audioBitsPerSecond: 32000 }
  const mime = pickMime()
  if (mime) opts.mimeType = mime
  return opts
}

// --- Audio recorder ---------------------------------------------------------
export function createAudioRecorder() {
  let mediaRecorder = null
  let stream = null
  let chunks = []
  let startTime = 0

  return {
    // Resolves with the microphone stream so the level meter can share it.
    async start() {
      // Clean up the voice: cancel echo, suppress background noise, auto-level.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      chunks = []
      mediaRecorder = new MediaRecorder(stream, recorderOptions())
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.start()
      startTime = performance.now()
      return stream
    },
    stop() {
      return new Promise((resolve) => {
        if (!mediaRecorder) return resolve(null)
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' })
          const duration = (performance.now() - startTime) / 1000
          stream?.getTracks().forEach((t) => t.stop())
          resolve({ blob, duration })
        }
        mediaRecorder.stop()
      })
    },
    // Throw everything away (window closed mid-recording).
    cancel() {
      try { if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop() } catch { /* noop */ }
      stream?.getTracks().forEach((t) => t.stop())
    },
  }
}

// --- Level meter --------------------------------------------------------------
// level() returns the loudness right now (RMS, roughly 0 silent … 0.3 loud speech).
export function createLevelMeter(stream) {
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return { level: () => 0.05, stop() {} }
  const ctx = new Ctx()
  ctx.resume?.()
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 1024
  source.connect(analyser)
  const buf = new Float32Array(analyser.fftSize)
  let closed = false
  return {
    level() {
      analyser.getFloatTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
      return Math.sqrt(sum / buf.length)
    },
    stop() {
      if (closed) return
      closed = true
      try { source.disconnect() } catch { /* already gone */ }
      ctx.close().catch(() => { /* already closed */ })
    },
  }
}

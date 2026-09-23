import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'

export function AudioMonitor({ engine }: { engine: AudioEngine }) {
  const waveRef = useRef<HTMLCanvasElement>(null)
  const freqRef = useRef<HTMLCanvasElement>(null)
  const meterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const draw = () => {
      const frame = engine.getLastFrame()
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.min(1, frame.amplitude * 1.2)})`

      const wave = waveRef.current
      if (wave) {
        const rect = wave.getBoundingClientRect()
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.floor(rect.width * dpr))
        const h = Math.max(1, Math.floor(rect.height * dpr))
        if (wave.width !== w || wave.height !== h) { wave.width = w; wave.height = h }
        const ctx = wave.getContext('2d')!
        ctx.clearRect(0, 0, w, h)
        ctx.strokeStyle = 'rgba(133, 246, 255, .9)'
        ctx.lineWidth = 1.5 * dpr
        ctx.beginPath()
        const data = frame.waveform
        const step = Math.max(1, Math.floor(data.length / Math.max(1, w / 2)))
        let x = 0
        for (let i = 0; i < data.length; i += step) {
          const y = ((data[i] - 0) / 255) * h
          if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          x += (step / data.length) * w
        }
        ctx.stroke()
      }

      const freq = freqRef.current
      if (freq) {
        const rect = freq.getBoundingClientRect()
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.floor(rect.width * dpr))
        const h = Math.max(1, Math.floor(rect.height * dpr))
        if (freq.width !== w || freq.height !== h) { freq.width = w; freq.height = h }
        const ctx = freq.getContext('2d')!
        ctx.clearRect(0, 0, w, h)
        const data = frame.frequency
        const bars = 44
        const bw = w / bars
        for (let i = 0; i < bars; i += 1) {
          const index = Math.floor((i / bars) ** 1.8 * (data.length - 1))
          const value = data[index] / 255
          const bh = Math.max(1, value * h)
          ctx.fillStyle = `hsla(${190 + i * 1.9}, 95%, 65%, ${0.3 + value * 0.7})`
          ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1.5 * dpr), bh)
        }
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  return (
    <div className="audio-monitor">
      <div className="meter-track"><div ref={meterRef} className="meter-fill" /></div>
      <div className="monitor-grid">
        <div><span>WAVEFORM</span><canvas ref={waveRef} /></div>
        <div><span>SPECTRUM</span><canvas ref={freqRef} /></div>
      </div>
    </div>
  )
}

import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../audio/AudioEngine'
import { MODES, type AudioFrame, type VisualMode, type VisualSettings } from '../types'

type Particle = {
  angle: number
  radius: number
  baseRadius: number
  velocity: number
  size: number
  phase: number
  orbit: number
}

const palette: Record<string, string> = {
  'Neon Blue': '#5c7cff',
  Purple: '#9b5cff',
  Pink: '#ff4fc8',
  Cyan: '#48f5ff',
  Green: '#5dff9a',
  Orange: '#ff984d',
  Red: '#ff4f67',
  White: '#f4fbff',
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split('').map((x) => x + x).join('')
    : normalized, 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

function color(settings: VisualSettings, frame: AudioFrame, alpha = 1, offset = 0) {
  if (settings.colorPreset === 'Rainbow') {
    const hue = (frame.timestamp * 0.025 + offset + frame.treble * 120) % 360
    return `hsla(${hue}, 98%, 66%, ${alpha})`
  }
  if (settings.audioReactiveColors) {
    const baseHue = settings.colorPreset === 'Custom' ? 190 : 190 + offset
    const hue = (baseHue + frame.bass * 55 + frame.mid * 105 + frame.treble * 175 + frame.timestamp * 0.006) % 360
    return `hsla(${hue}, 95%, ${58 + frame.beatIntensity * 18}%, ${alpha})`
  }
  const value = settings.colorPreset === 'Custom' ? settings.customColor : (palette[settings.colorPreset] || '#48f5ff')
  const { r, g, b } = hexToRgb(value)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function scaledFrame(raw: AudioFrame, s: VisualSettings): AudioFrame {
  const master = s.masterSensitivity
  return {
    ...raw,
    amplitude: clamp01(raw.amplitude * master),
    bass: clamp01(raw.bass * master * s.bassSensitivity),
    mid: clamp01(raw.mid * master * s.midSensitivity),
    treble: clamp01(raw.treble * master * s.trebleSensitivity),
    beatIntensity: clamp01(raw.beatIntensity * master),
  }
}

export function VisualizerCanvas({
  engine,
  mode,
  autoSync,
  settings,
  onAutoScene,
}: {
  engine: AudioEngine
  mode: VisualMode
  autoSync: boolean
  settings: VisualSettings
  onAutoScene?: (mode: VisualMode) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef(mode)
  const autoRef = useRef(autoSync)
  const settingsRef = useRef(settings)
  const callbackRef = useRef(onAutoScene)

  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { autoRef.current = autoSync }, [autoSync])
  useEffect(() => { settingsRef.current = settings; engine.setSmoothing(settings.smoothing) }, [settings, engine])
  useEffect(() => { callbackRef.current = onAutoScene }, [onAutoScene])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })!
    let raf = 0
    let w = 0
    let h = 0
    let dpr = 1
    let last = performance.now()
    let autoMode: VisualMode = 'wave'
    let previousAutoMode: VisualMode = 'wave'
    let transitionStart = -10_000
    let lastAutoSwitch = 0
    let lastAutoBand = -1
    let burstLatch = false
    let previousBeat = 0
    const particles: Particle[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, Math.floor(rect.width * dpr))
      h = Math.max(1, Math.floor(rect.height * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
      }
    }

    const ensureParticles = (count: number) => {
      const target = Math.min(3200, Math.max(50, count))
      while (particles.length < target) {
        particles.push({
          angle: Math.random() * Math.PI * 2,
          radius: Math.random() * Math.min(w, h) * 0.3,
          baseRadius: Math.random() * Math.min(w, h) * 0.28,
          velocity: 0,
          size: 0.5 + Math.random() * 2.4,
          phase: Math.random() * Math.PI * 2,
          orbit: 0.3 + Math.random() * 1.2,
        })
      }
      if (particles.length > target) particles.length = target
    }

    const chooseAuto = (frame: AudioFrame, now: number) => {
      const energy = clamp01(frame.amplitude * 0.22 + frame.bass * 0.36 + frame.mid * 0.25 + frame.treble * 0.17)
      const band = energy < 0.15 ? 0 : energy < 0.3 ? 1 : energy < 0.5 ? 2 : 3
      const bassDrop = frame.bass > 0.7 && frame.beatIntensity > 0.62 && !burstLatch
      burstLatch = frame.bass > 0.48 ? burstLatch : false
      const minDwell = 3800
      let next = autoMode

      if (bassDrop && now - lastAutoSwitch > 1700) {
        next = 'particles'
        burstLatch = true
      } else if (band !== lastAutoBand && now - lastAutoSwitch > minDwell) {
        next = band === 0 ? 'wave' : band === 1 ? 'lines' : band === 2 ? 'grid' : 'tunnel'
      } else if (band === 3 && frame.beatIntensity > 0.78 && now - lastAutoSwitch > 6000) {
        next = frame.treble > frame.mid ? 'spectrum' : 'circle'
      }

      if (next !== autoMode) {
        previousAutoMode = autoMode
        autoMode = next
        transitionStart = now
        lastAutoSwitch = now
        callbackRef.current?.(autoMode)
      }
      lastAutoBand = band
      return autoMode
    }

    const background = (s: VisualSettings, frame: AudioFrame) => {
      const brightness = Math.round(2 + s.backgroundBrightness * 18 + frame.beatIntensity * 6)
      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = `rgb(${brightness}, ${brightness + 1}, ${brightness + 5})`
      ctx.fillRect(0, 0, w, h)
      const g = ctx.createRadialGradient(w * .5, h * .46, 0, w * .5, h * .5, Math.max(w, h) * .7)
      g.addColorStop(0, color(s, frame, 0.075 + frame.bass * .09))
      g.addColorStop(.45, 'rgba(13,18,31,.18)')
      g.addColorStop(1, 'rgba(0,0,0,.72)')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
    }

    const prepGlow = (s: VisualSettings, frame: AudioFrame, multiplier = 1) => {
      ctx.shadowBlur = (7 + s.glowIntensity * 24 + frame.beatIntensity * 20) * dpr * multiplier
      ctx.shadowColor = color(s, frame, .85)
    }

    const drawLines = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const count = Math.min(420, Math.max(35, Math.round(s.lineCount)))
      const cx = w / 2, cy = h / 2
      ctx.save(); ctx.translate(cx, cy)
      prepGlow(s, frame, .45)
      ctx.globalCompositeOperation = 'lighter'
      const maxR = Math.hypot(w, h) * .56
      for (let i = 0; i < count; i += 1) {
        const p = i / count
        const bin = Math.floor((p ** 1.7) * (frame.frequency.length - 1))
        const f = frame.frequency[bin] / 255
        const angle = p * Math.PI * 2 + t * .00012 * s.animationSpeed + frame.mid * .35
        const inner = maxR * (.08 + p * .15)
        const outer = inner + (30 + f * 230 * s.motionIntensity + frame.bass * 90) * dpr
        const wobble = Math.sin(t * .0018 * s.animationSpeed + i * .32) * (10 + frame.mid * 38) * dpr
        ctx.beginPath()
        ctx.moveTo(Math.cos(angle) * (inner + wobble), Math.sin(angle) * (inner + wobble))
        ctx.lineTo(Math.cos(angle + frame.treble * .025) * outer, Math.sin(angle + frame.treble * .025) * outer)
        ctx.strokeStyle = color(s, frame, .12 + f * .75, i * 2.4)
        ctx.lineWidth = (.55 + f * 1.8) * dpr
        ctx.stroke()
      }
      ctx.restore()
    }

    const drawCircle = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const cx = w / 2, cy = h / 2
      const base = Math.min(w, h) * (.13 + s.shapeSize * .055)
      const radius = base * (1 + frame.bass * .38 + frame.beatIntensity * .18)
      const points = 170
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * .00006 * s.animationSpeed + frame.mid * .1)
      prepGlow(s, frame, .95)
      ctx.globalCompositeOperation = 'lighter'
      for (let layer = 0; layer < 3; layer += 1) {
        ctx.beginPath()
        for (let i = 0; i <= points; i += 1) {
          const p = i / points
          const angle = p * Math.PI * 2
          const bin = Math.floor(p * (frame.frequency.length * .55))
          const f = frame.frequency[bin] / 255
          const deform = f * (15 + layer * 7) * dpr + Math.sin(angle * (4 + layer) + t * .0015) * frame.mid * 12 * dpr
          const r = radius + deform + layer * 12 * dpr
          const x = Math.cos(angle) * r, y = Math.sin(angle) * r
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.strokeStyle = color(s, frame, .7 - layer * .16, layer * 55)
        ctx.lineWidth = (2.2 - layer * .45) * dpr
        ctx.stroke()
      }
      ctx.fillStyle = color(s, frame, .055 + frame.bass * .06)
      ctx.beginPath(); ctx.arc(0, 0, radius * .86, 0, Math.PI * 2); ctx.fill()
      const sparks = Math.min(520, Math.round(s.particleCount * .24))
      for (let i = 0; i < sparks; i += 1) {
        const a = i * 2.399 + t * .0001 * (i % 5 + 1)
        const rr = radius * (1.18 + ((i * 37) % 100) / 150) + frame.treble * 80 * dpr * Math.sin(i + t * .003)
        const size = (.45 + (i % 5) * .18 + frame.treble * 1.8) * dpr
        ctx.fillStyle = color(s, frame, .16 + frame.treble * .55, i * 4)
        ctx.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, size, size)
      }
      ctx.restore()
    }

    const drawParticles = (frame: AudioFrame, s: VisualSettings, t: number, dt: number) => {
      ensureParticles(s.particleCount)
      const cx = w / 2, cy = h / 2
      const beatEdge = frame.beatIntensity > .5 && previousBeat <= .5
      if (beatEdge) {
        const impulse = (3 + frame.beatIntensity * 14 + frame.bass * 10) * dpr * s.motionIntensity
        for (const p of particles) p.velocity += impulse * (.25 + Math.random() * .9)
      }
      ctx.save(); ctx.translate(cx, cy); ctx.globalCompositeOperation = 'lighter'; prepGlow(s, frame, .38)
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i]
        p.velocity *= Math.pow(.91, dt / 16.67)
        p.radius += p.velocity * (dt / 16.67)
        p.radius = lerp(p.radius, p.baseRadius * (1 + frame.bass * .24), .016 * (dt / 16.67))
        p.angle += .00012 * dt * s.animationSpeed * p.orbit * (1 + frame.mid)
        const wave = Math.sin(t * .001 + p.phase) * frame.mid * 24 * dpr
        const x = Math.cos(p.angle) * (p.radius + wave)
        const y = Math.sin(p.angle) * (p.radius + wave)
        const size = (p.size + frame.treble * 2.2 + frame.beatIntensity * .8) * dpr
        ctx.fillStyle = color(s, frame, .18 + .65 * (1 - i / Math.max(1, particles.length)), i * .19)
        ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill()
      }
      ctx.restore()
    }

    const drawWave = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const data = frame.waveform
      const centerY = h / 2
      prepGlow(s, frame, .6)
      ctx.globalCompositeOperation = 'lighter'
      const layers = 4
      for (let layer = 0; layer < layers; layer += 1) {
        ctx.beginPath()
        const step = Math.max(1, Math.floor(data.length / Math.max(200, w / dpr)))
        let x = 0
        for (let i = 0; i < data.length; i += step) {
          const normalized = (data[i] - 128) / 128
          const envelope = Math.sin((i / data.length) * Math.PI)
          const y = centerY + normalized * h * (.27 + frame.bass * .12) * s.motionIntensity * envelope + Math.sin(i * .02 + t * .0013 + layer) * frame.treble * 9 * dpr
          if (x === 0) ctx.moveTo(x, y + layer * 5 * dpr); else ctx.lineTo(x, y + layer * 5 * dpr)
          x += (step / data.length) * w
        }
        ctx.strokeStyle = color(s, frame, .82 - layer * .16, layer * 50)
        ctx.lineWidth = (2.1 - layer * .3) * dpr
        ctx.stroke()
      }
      ctx.shadowBlur = 0
      ctx.strokeStyle = color(s, frame, .18)
      ctx.lineWidth = dpr
      ctx.beginPath(); ctx.moveTo(0, centerY); ctx.lineTo(w, centerY); ctx.stroke()
    }

    const polygon = (cx: number, cy: number, radius: number, sides: number, rotation: number) => {
      ctx.beginPath()
      for (let i = 0; i <= sides; i += 1) {
        const a = rotation + i / sides * Math.PI * 2
        const x = cx + Math.cos(a) * radius
        const y = cy + Math.sin(a) * radius
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    const drawTunnel = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const cx = w / 2 + Math.sin(t * .0005) * frame.mid * 45 * dpr * s.cameraMovement
      const cy = h / 2 + Math.cos(t * .00043) * frame.treble * 30 * dpr * s.cameraMovement
      const rings = 18
      ctx.globalCompositeOperation = 'lighter'; prepGlow(s, frame, .4)
      for (let i = rings - 1; i >= 0; i -= 1) {
        const phase = (t * .00014 * s.animationSpeed * (1 + frame.bass * 2.5) + i / rings) % 1
        const depth = phase ** 2.2
        const radius = (25 + depth * Math.max(w, h) * .72) * (1 + frame.beatIntensity * .08)
        const alpha = (.08 + (1 - depth) * .68)
        const sides = 5 + (i % 3)
        polygon(cx, cy, radius, sides, t * .00014 * s.animationSpeed + i * .17 + frame.mid * .5)
        ctx.strokeStyle = color(s, frame, alpha, i * 19)
        ctx.lineWidth = (1 + (1 - depth) * 1.7) * dpr
        ctx.stroke()
      }
      const rays = 12
      for (let i = 0; i < rays; i += 1) {
        const a = i / rays * Math.PI * 2 + t * .00006
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * Math.max(w,h), cy + Math.sin(a) * Math.max(w,h));
        ctx.strokeStyle = color(s, frame, .055 + frame.treble * .12, i * 30); ctx.lineWidth = .8 * dpr; ctx.stroke()
      }
    }

    const drawSpectrum = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const bars = Math.min(180, Math.max(48, Math.round(s.lineCount * .55)))
      const usable = w * .82
      const left = (w - usable) / 2
      const bw = usable / bars
      const bottom = h * .78
      ctx.globalCompositeOperation = 'lighter'; prepGlow(s, frame, .34)
      for (let i = 0; i < bars; i += 1) {
        const p = i / bars
        const bin = Math.floor((p ** 2) * (frame.frequency.length - 1))
        const value = frame.frequency[bin] / 255
        const bh = (12 + value * h * .48 * s.motionIntensity) * (1 + frame.beatIntensity * .12)
        const x = left + i * bw
        const grad = ctx.createLinearGradient(0, bottom, 0, bottom - bh)
        grad.addColorStop(0, color(s, frame, .18, i * 2))
        grad.addColorStop(1, color(s, frame, .95, i * 2 + t * .005))
        ctx.fillStyle = grad
        ctx.fillRect(x, bottom - bh, Math.max(dpr, bw * .72), bh)
        if (value > .55) {
          ctx.fillStyle = color(s, frame, .85, i * 2)
          ctx.fillRect(x, bottom - bh - 5 * dpr, Math.max(dpr, bw * .72), 2 * dpr)
        }
      }
    }

    const drawGrid = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const horizon = h * (.38 - frame.beatIntensity * .018)
      ctx.globalCompositeOperation = 'lighter'; prepGlow(s, frame, .3)
      const rows = 23
      for (let i = 0; i <= rows; i += 1) {
        const p = i / rows
        const perspective = p ** 2
        const y = horizon + perspective * (h - horizon)
        const deform = Math.sin(t * .0013 * s.animationSpeed + p * 11) * frame.bass * 28 * dpr
        ctx.beginPath(); ctx.moveTo(0, y + deform); ctx.lineTo(w, y - deform * .18)
        ctx.strokeStyle = color(s, frame, .08 + p * .48, i * 7); ctx.lineWidth = (0.6 + p * 1.2) * dpr; ctx.stroke()
      }
      const cols = 28
      const vanishingX = w / 2 + Math.sin(t * .0005) * frame.mid * 55 * dpr * s.cameraMovement
      for (let i = 0; i <= cols; i += 1) {
        const p = i / cols
        const bottomX = p * w
        const topX = lerp(vanishingX, bottomX, .06)
        ctx.beginPath(); ctx.moveTo(topX, horizon); ctx.quadraticCurveTo(vanishingX + (bottomX - vanishingX) * .45, h * .68 + Math.sin(i + t * .002) * frame.bass * 16 * dpr, bottomX, h)
        ctx.strokeStyle = color(s, frame, .08 + Math.abs(p - .5) * .24 + frame.beatIntensity * .12, i * 8); ctx.lineWidth = .75 * dpr; ctx.stroke()
      }
      ctx.fillStyle = color(s, frame, .35 + frame.beatIntensity * .35)
      ctx.beginPath(); ctx.arc(vanishingX, horizon, (3 + frame.beatIntensity * 8) * dpr, 0, Math.PI * 2); ctx.fill()
    }

    const drawLiquid = (frame: AudioFrame, s: VisualSettings, t: number) => {
      const cx = w / 2, cy = h / 2
      const base = Math.min(w, h) * (.16 + s.shapeSize * .045)
      ctx.globalCompositeOperation = 'lighter'; prepGlow(s, frame, .8)
      for (let layer = 0; layer < 5; layer += 1) {
        const points = 100
        ctx.beginPath()
        for (let i = 0; i <= points; i += 1) {
          const p = i / points
          const a = p * Math.PI * 2
          const bin = Math.floor((p ** 1.3) * frame.frequency.length * .65)
          const f = frame.frequency[Math.min(frame.frequency.length - 1, bin)] / 255
          const lobe = Math.sin(a * (3 + layer) + t * .0011 * s.animationSpeed + layer) * (12 + frame.mid * 35) * dpr
          const fine = Math.sin(a * 11 - t * .0018) * frame.treble * 12 * dpr
          const r = base * (1 + layer * .13 + frame.bass * .24) + lobe + fine + f * 18 * dpr
          const x = cx + Math.cos(a + layer * .09) * r
          const y = cy + Math.sin(a) * r * (.88 + frame.mid * .08)
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fillStyle = color(s, frame, .024 + layer * .014, layer * 42)
        ctx.strokeStyle = color(s, frame, .62 - layer * .09, layer * 42)
        ctx.lineWidth = (2.2 - layer * .25) * dpr
        ctx.fill(); ctx.stroke()
      }
    }

    const render = (now: number) => {
      resize()
      const dt = Math.min(40, now - last); last = now
      const s = settingsRef.current
      const raw = engine.update(s.beatSensitivity)
      const frame = scaledFrame(raw, s)
      background(s, frame)
      const selected = autoRef.current ? chooseAuto(frame, now) : modeRef.current

      const drawMode = (scene: VisualMode, alpha = 1) => {
        ctx.save()
        ctx.globalAlpha = alpha
        switch (scene) {
          case 'lines': drawLines(frame, s, now); break
          case 'circle': drawCircle(frame, s, now); break
          case 'particles': drawParticles(frame, s, now, dt); break
          case 'wave': drawWave(frame, s, now); break
          case 'tunnel': drawTunnel(frame, s, now); break
          case 'spectrum': drawSpectrum(frame, s, now); break
          case 'grid': drawGrid(frame, s, now); break
          case 'liquid': drawLiquid(frame, s, now); break
        }
        ctx.restore()
      }

      if (autoRef.current && now - transitionStart < 900) {
        const mix = clamp01((now - transitionStart) / 900)
        const eased = mix * mix * (3 - 2 * mix)
        drawMode(previousAutoMode, 1 - eased)
        drawMode(selected, eased)
      } else {
        drawMode(selected)
      }

      previousBeat = frame.beatIntensity
      raf = requestAnimationFrame(render)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    raf = requestAnimationFrame(render)
    return () => { cancelAnimationFrame(raf); observer.disconnect() }
  }, [engine])

  return <canvas ref={canvasRef} className="visualizer-canvas" aria-label="Real-time audio reactive visualizer" />
}

export function modeName(mode: VisualMode) {
  return MODES.find((m) => m.id === mode)?.name ?? mode
}

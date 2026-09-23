import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AudioEngine } from './audio/AudioEngine'
import { AudioMonitor } from './components/AudioMonitor'
import { VisualizerCanvas, modeName } from './visuals/VisualizerCanvas'
import { MODES, type ColorPreset, type VisualMode, type VisualSettings } from './types'

const defaultSettings: VisualSettings = {
  masterSensitivity: 1.2,
  bassSensitivity: 1.15,
  midSensitivity: 1,
  trebleSensitivity: 1.1,
  beatSensitivity: 1,
  particleCount: 900,
  lineCount: 180,
  animationSpeed: 1,
  glowIntensity: 0.75,
  shapeSize: 1,
  motionIntensity: 1,
  cameraMovement: 0.7,
  smoothing: 0.72,
  backgroundBrightness: 0.18,
  colorPreset: 'Cyan',
  customColor: '#55f6ff',
  audioReactiveColors: true,
}

type InputType = 'none' | 'microphone' | 'system' | 'file'

function SliderRow({ label, value, min, max, step, onChange, display }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  display?: string
}) {
  const p = ((value - min) / (max - min)) * 100
  return (
    <label className="slider-row">
      <div className="slider-label"><span>{label}</span><strong>{display ?? value.toFixed(step < 1 ? 2 : 0)}</strong></div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--range-p': `${p}%` } as CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  )
}

function TinyMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="tiny-metric">
      <div><span>{label}</span><b>{Math.round(value * 100)}</b></div>
      <div className="tiny-track"><i style={{ width: `${Math.min(100, value * 100)}%` }} /></div>
    </div>
  )
}

export default function App() {
  const engine = useMemo(() => new AudioEngine(), [])
  const [mode, setMode] = useState<VisualMode>('circle')
  const [autoSync, setAutoSync] = useState(false)
  const [autoScene, setAutoScene] = useState<VisualMode>('wave')
  const [settings, setSettings] = useState(defaultSettings)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState('')
  const [inputType, setInputType] = useState<InputType>('none')
  const [status, setStatus] = useState('Audio engine standing by')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [filePlaying, setFilePlaying] = useState(false)
  const [uiVisible, setUiVisible] = useState(true)
  const [metrics, setMetrics] = useState({ amplitude: 0, bass: 0, mid: 0, treble: 0, beat: 0 })
  const fileRef = useRef<HTMLInputElement>(null)

  const updateSetting = <K extends keyof VisualSettings>(key: K, value: VisualSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }))
  }

  const refreshDevices = async () => {
    try {
      const list = await engine.listInputs()
      setDevices(list)
      if (!selectedDevice && list[0]) setSelectedDevice(list[0].deviceId)
    } catch {
      // Device enumeration can be limited until permission is granted.
    }
  }

  const enableMic = async (deviceId = selectedDevice) => {
    setError('')
    setStatus('Requesting microphone permission…')
    try {
      await engine.enableMicrophone(deviceId || undefined)
      setInputType('microphone')
      setFilePlaying(false)
      setStatus('Microphone live')
      await refreshDevices()
    } catch (e) {
      setInputType('none')
      setError(e instanceof Error ? e.message : 'Microphone access was not available.')
      setStatus('Microphone unavailable')
    }
  }

  const captureSystemAudio = async () => {
    setError('')
    setStatus('Choose a browser tab/window with shared audio…')
    try {
      await engine.captureSystemAudio()
      setInputType('system')
      setFilePlaying(false)
      setStatus('Shared audio live')
    } catch (e) {
      setInputType('none')
      setError(e instanceof Error ? e.message : 'System/tab audio capture was not available.')
      setStatus('Share cancelled or unavailable')
    }
  }

  const uploadFile = async (file?: File) => {
    if (!file) return
    setError('')
    setStatus('Loading audio file…')
    try {
      await engine.loadAudioFile(file)
      setFileName(file.name)
      setFilePlaying(true)
      setInputType('file')
      setStatus('Audio file playing')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not play this audio file.')
      setStatus('File load failed')
    }
  }

  const toggleFile = () => {
    const playing = engine.toggleFilePlayback()
    setFilePlaying(playing)
    setStatus(playing ? 'Audio file playing' : 'Audio file paused')
  }

  const requestFullscreen = async () => {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  }

  useEffect(() => {
    let raf = 0
    let previous = 0
    const tick = (now: number) => {
      if (now - previous > 90) {
        const f = engine.getLastFrame()
        setMetrics({ amplitude: f.amplitude, bass: f.bass, mid: f.mid, treble: f.treble, beat: f.beatIntensity })
        previous = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine])

  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') void requestFullscreen()
      if (e.key.toLowerCase() === 'h') setUiVisible((v) => !v)
      if (e.key.toLowerCase() === 'a') setAutoSync((v) => !v)
      const n = Number(e.key)
      if (n >= 1 && n <= 8) { setAutoSync(false); setMode(MODES[n - 1].id) }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [])

  useEffect(() => () => engine.stop(), [engine])

  const colorOptions: ColorPreset[] = ['Neon Blue', 'Purple', 'Pink', 'Cyan', 'Green', 'Orange', 'Red', 'White', 'Rainbow', 'Custom']
  const activeMode = autoSync ? autoScene : mode

  return (
    <main className={`app-shell ${uiVisible ? '' : 'performance-only'}`}>
      <VisualizerCanvas engine={engine} mode={mode} autoSync={autoSync} settings={settings} onAutoScene={setAutoScene} />
      <div className="screen-vignette" />
      <div className="scanline" />

      <header className="topbar hud-panel">
        <div className="brand-group">
          <div className="brand-mark"><i /><i /><i /></div>
          <div><h1>SYNCORIX</h1><p>REAL-TIME AUDIO VISUAL ENGINE</p></div>
        </div>
        <div className="live-state">
          <span className={`status-dot ${inputType !== 'none' ? 'online' : ''}`} />
          <div><b>{inputType === 'none' ? 'STANDBY' : 'LIVE INPUT'}</b><small>{status}</small></div>
        </div>
        <div className="top-actions">
          <button className={`auto-btn ${autoSync ? 'active' : ''}`} onClick={() => setAutoSync((v) => !v)}><span>◈</span> AUTO SYNC</button>
          <button className="icon-btn" onClick={() => setUiVisible((v) => !v)} title="Hide interface (H)">◫</button>
          <button className="icon-btn" onClick={() => void requestFullscreen()} title="Fullscreen (F)">⛶</button>
        </div>
      </header>

      <aside className="left-panel hud-panel">
        <div className="panel-title"><span>AUDIO INPUT</span><em>{inputType.toUpperCase()}</em></div>
        <button className={`primary-action ${inputType === 'microphone' ? 'active' : ''}`} onClick={() => void enableMic()}>
          <span className="button-icon">⌁</span><span><b>Enable Microphone</b><small>Live low-latency input</small></span>
        </button>
        <div className="select-wrap">
          <label>INPUT DEVICE</label>
          <select value={selectedDevice} onChange={(e) => { setSelectedDevice(e.target.value); if (inputType === 'microphone') void enableMic(e.target.value) }}>
            {!devices.length && <option value="">Default microphone</option>}
            {devices.map((d, i) => <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Audio Input ${i + 1}`}</option>)}
          </select>
        </div>
        <button className={`secondary-action ${inputType === 'system' ? 'active' : ''}`} onClick={() => void captureSystemAudio()}>
          <span>▣</span><div><b>Capture Tab / System Audio</b><small>Browser support varies</small></div>
        </button>

        <div className="divider"><span>OR</span></div>
        <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac" hidden onChange={(e) => void uploadFile(e.target.files?.[0])} />
        <button className="upload-action" onClick={() => fileRef.current?.click()}><span>＋</span> Upload Audio</button>
        {fileName && (
          <div className="file-chip">
            <button onClick={toggleFile}>{filePlaying ? 'Ⅱ' : '▶'}</button>
            <div><b>{fileName}</b><small>{filePlaying ? 'PLAYING' : 'PAUSED'}</small></div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}

        <AudioMonitor engine={engine} />

        <div className="metrics-grid">
          <TinyMetric label="LEVEL" value={metrics.amplitude} />
          <TinyMetric label="BASS" value={metrics.bass} />
          <TinyMetric label="MID" value={metrics.mid} />
          <TinyMetric label="HIGH" value={metrics.treble} />
        </div>
        <div className="beat-readout">
          <div><span>BEAT INTENSITY</span><strong>{metrics.beat.toFixed(2)}</strong></div>
          <div className="beat-track"><i style={{ transform: `scaleX(${metrics.beat})` }} /></div>
        </div>
      </aside>

      <aside className="right-panel hud-panel">
        <div className="panel-title"><span>VISUAL ENGINE</span><em>REALTIME</em></div>
        <div className="section-heading">REACTIVITY</div>
        <SliderRow label="Master sensitivity" value={settings.masterSensitivity} min={0.25} max={2.5} step={0.01} onChange={(v) => updateSetting('masterSensitivity', v)} />
        <SliderRow label="Bass sensitivity" value={settings.bassSensitivity} min={0.2} max={2.5} step={0.01} onChange={(v) => updateSetting('bassSensitivity', v)} />
        <SliderRow label="Mid sensitivity" value={settings.midSensitivity} min={0.2} max={2.5} step={0.01} onChange={(v) => updateSetting('midSensitivity', v)} />
        <SliderRow label="Treble sensitivity" value={settings.trebleSensitivity} min={0.2} max={2.5} step={0.01} onChange={(v) => updateSetting('trebleSensitivity', v)} />
        <SliderRow label="Beat sensitivity" value={settings.beatSensitivity} min={0.45} max={1.8} step={0.01} onChange={(v) => updateSetting('beatSensitivity', v)} />
        <SliderRow label="Smoothing" value={settings.smoothing} min={0} max={0.95} step={0.01} onChange={(v) => updateSetting('smoothing', v)} />

        <div className="section-heading">GEOMETRY</div>
        <SliderRow label="Particle count" value={settings.particleCount} min={100} max={3000} step={50} onChange={(v) => updateSetting('particleCount', v)} display={settings.particleCount.toLocaleString()} />
        <SliderRow label="Line count" value={settings.lineCount} min={40} max={400} step={5} onChange={(v) => updateSetting('lineCount', v)} />
        <SliderRow label="Animation speed" value={settings.animationSpeed} min={0.1} max={2.5} step={0.01} onChange={(v) => updateSetting('animationSpeed', v)} />
        <SliderRow label="Glow intensity" value={settings.glowIntensity} min={0} max={1.5} step={0.01} onChange={(v) => updateSetting('glowIntensity', v)} />
        <SliderRow label="Shape size" value={settings.shapeSize} min={0.4} max={2} step={0.01} onChange={(v) => updateSetting('shapeSize', v)} />
        <SliderRow label="Motion intensity" value={settings.motionIntensity} min={0.25} max={2} step={0.01} onChange={(v) => updateSetting('motionIntensity', v)} />
        <SliderRow label="Camera movement" value={settings.cameraMovement} min={0} max={1.5} step={0.01} onChange={(v) => updateSetting('cameraMovement', v)} />
        <SliderRow label="Background brightness" value={settings.backgroundBrightness} min={0} max={1} step={0.01} onChange={(v) => updateSetting('backgroundBrightness', v)} />

        <div className="section-heading">COLOR SYSTEM</div>
        <div className="color-grid">
          {colorOptions.map((item) => (
            <button key={item} className={`color-swatch ${settings.colorPreset === item ? 'selected' : ''}`} onClick={() => updateSetting('colorPreset', item)} title={item}>
              <i className={item === 'Rainbow' ? 'rainbow' : ''} style={item === 'Custom' ? { background: settings.customColor } : item === 'Rainbow' ? undefined : { background: ({'Neon Blue':'#5c7cff',Purple:'#9b5cff',Pink:'#ff4fc8',Cyan:'#48f5ff',Green:'#5dff9a',Orange:'#ff984d',Red:'#ff4f67',White:'#f4fbff'} as Record<string,string>)[item] }} />
              <span>{item}</span>
            </button>
          ))}
        </div>
        {settings.colorPreset === 'Custom' && <input className="custom-color" type="color" value={settings.customColor} onChange={(e) => updateSetting('customColor', e.target.value)} />}
        <label className="toggle-row"><span><b>Audio Reactive Colors</b><small>Frequency-driven hue movement</small></span><input type="checkbox" checked={settings.audioReactiveColors} onChange={(e) => updateSetting('audioReactiveColors', e.target.checked)} /><i /></label>
      </aside>

      <section className="scene-label">
        <span>{autoSync ? 'AUTO SYNC SCENE' : 'VISUAL MODE'}</span>
        <strong>{modeName(activeMode)}</strong>
        <small>{autoSync ? 'Energy-aware transitions enabled' : 'Manual scene control'}</small>
      </section>

      <nav className="mode-dock hud-panel">
        <button className={`dock-auto ${autoSync ? 'selected' : ''}`} onClick={() => setAutoSync(true)}><b>◈</b><span>AUTO<br />SYNC</span></button>
        <div className="dock-separator" />
        {MODES.map((item, index) => (
          <button key={item.id} className={!autoSync && mode === item.id ? 'selected' : ''} onClick={() => { setAutoSync(false); setMode(item.id) }} title={`${item.name} (${index + 1})`}>
            <b>{['╱╲','◯','✦','〰','⬡','▥','⌗','◒'][index]}</b><span>{item.short}</span><em>{index + 1}</em>
          </button>
        ))}
      </nav>

      <div className="shortcut-hint">A AUTO SYNC&nbsp;&nbsp;·&nbsp;&nbsp;1–8 MODES&nbsp;&nbsp;·&nbsp;&nbsp;F FULLSCREEN&nbsp;&nbsp;·&nbsp;&nbsp;H HIDE UI</div>
      {!uiVisible && <button className="restore-ui" onClick={() => setUiVisible(true)}>SHOW SYNCORIX UI</button>}
    </main>
  )
}

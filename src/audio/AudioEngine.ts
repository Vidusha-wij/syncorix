import type { AudioFrame } from '../types'

const silentFrequency = new Uint8Array(1024)
const silentWave = new Uint8Array(2048).fill(128)

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

export class AudioEngine {
  private context: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: AudioNode | null = null
  private stream: MediaStream | null = null
  private mediaElement: HTMLAudioElement | null = null
  private mediaElementSource: MediaElementAudioSourceNode | null = null
  private outputGain: GainNode | null = null
  private freqData = silentFrequency
  private waveData = silentWave
  private beatHistory: number[] = []
  private lastBeatAt = 0
  private beatEnvelope = 0
  private lastFrame: AudioFrame = {
    amplitude: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    beatIntensity: 0,
    frequency: silentFrequency,
    waveform: silentWave,
    timestamp: performance.now(),
  }

  async ensureContext() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' })
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 2048
      this.analyser.minDecibels = -92
      this.analyser.maxDecibels = -18
      this.analyser.smoothingTimeConstant = 0.72
      this.outputGain = this.context.createGain()
      this.outputGain.gain.value = 1
      this.outputGain.connect(this.context.destination)
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount)
      this.waveData = new Uint8Array(this.analyser.fftSize)
    }
    if (this.context.state === 'suspended') await this.context.resume()
    return this.context
  }

  setSmoothing(value: number) {
    if (this.analyser) this.analyser.smoothingTimeConstant = Math.max(0, Math.min(0.95, value))
  }

  private disconnectSource() {
    try { this.source?.disconnect() } catch {}
    this.source = null
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop())
      this.stream = null
    }
    if (this.mediaElement) {
      this.mediaElement.pause()
    }
  }

  async enableMicrophone(deviceId?: string) {
    await this.ensureContext()
    this.disconnectSource()
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    })
    this.stream = stream
    const src = this.context!.createMediaStreamSource(stream)
    src.connect(this.analyser!)
    this.source = src
    return stream
  }

  async captureSystemAudio() {
    await this.ensureContext()
    this.disconnectSource()
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    const audioTracks = stream.getAudioTracks()
    if (!audioTracks.length) {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error('No shareable audio track was provided by the browser.')
    }
    stream.getVideoTracks().forEach((track) => track.stop())
    this.stream = new MediaStream(audioTracks)
    const src = this.context!.createMediaStreamSource(this.stream)
    src.connect(this.analyser!)
    this.source = src
    return this.stream
  }

  async loadAudioFile(file: File) {
    await this.ensureContext()
    this.disconnectSource()
    if (this.mediaElement) {
      URL.revokeObjectURL(this.mediaElement.src)
    }
    const audio = new Audio(URL.createObjectURL(file))
    audio.crossOrigin = 'anonymous'
    audio.loop = true
    audio.preload = 'auto'
    this.mediaElement = audio
    this.mediaElementSource = this.context!.createMediaElementSource(audio)
    this.mediaElementSource.connect(this.analyser!)
    this.mediaElementSource.connect(this.outputGain!)
    this.source = this.mediaElementSource
    await audio.play()
    return audio
  }

  toggleFilePlayback() {
    if (!this.mediaElement) return false
    if (this.mediaElement.paused) {
      void this.mediaElement.play()
      return true
    }
    this.mediaElement.pause()
    return false
  }

  getFileElement() {
    return this.mediaElement
  }

  stop() {
    this.disconnectSource()
  }

  async listInputs() {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter((d) => d.kind === 'audioinput')
  }

  update(beatSensitivity = 1) {
    const analyser = this.analyser
    const context = this.context
    const now = performance.now()
    if (!analyser || !context) {
      this.beatEnvelope *= 0.9
      this.lastFrame = { ...this.lastFrame, beatIntensity: this.beatEnvelope, timestamp: now }
      return this.lastFrame
    }

    analyser.getByteFrequencyData(this.freqData)
    analyser.getByteTimeDomainData(this.waveData)

    let rms = 0
    for (let i = 0; i < this.waveData.length; i += 1) {
      const centered = (this.waveData[i] - 128) / 128
      rms += centered * centered
    }
    const amplitude = clamp01(Math.sqrt(rms / this.waveData.length) * 2.3)

    const nyquist = context.sampleRate / 2
    const hzPerBin = nyquist / this.freqData.length
    const band = (low: number, high: number) => {
      const from = Math.max(0, Math.floor(low / hzPerBin))
      const to = Math.min(this.freqData.length - 1, Math.ceil(high / hzPerBin))
      let total = 0
      let count = 0
      for (let i = from; i <= to; i += 1) {
        total += this.freqData[i] / 255
        count += 1
      }
      return count ? total / count : 0
    }

    const bass = clamp01(band(35, 250) * 1.5)
    const mid = clamp01(band(250, 2200) * 1.35)
    const treble = clamp01(band(2200, 12000) * 1.65)

    this.beatHistory.push(bass)
    if (this.beatHistory.length > 54) this.beatHistory.shift()
    const baseline = this.beatHistory.reduce((sum, v) => sum + v, 0) / Math.max(1, this.beatHistory.length)
    const threshold = baseline * (1.36 / Math.max(0.45, beatSensitivity)) + 0.035
    const transient = clamp01((bass - threshold) * 4.4 + amplitude * 0.28)
    const canTrigger = now - this.lastBeatAt > 150
    if (canTrigger && bass > 0.1 && transient > 0.16) {
      this.lastBeatAt = now
      this.beatEnvelope = Math.max(this.beatEnvelope, clamp01(transient * 1.35))
    } else {
      this.beatEnvelope *= 0.885
    }

    this.lastFrame = {
      amplitude,
      bass,
      mid,
      treble,
      beatIntensity: clamp01(this.beatEnvelope),
      frequency: this.freqData,
      waveform: this.waveData,
      timestamp: now,
    }
    return this.lastFrame
  }

  getLastFrame() {
    return this.lastFrame
  }
}

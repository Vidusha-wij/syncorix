export type VisualMode =
  | 'lines'
  | 'circle'
  | 'particles'
  | 'wave'
  | 'tunnel'
  | 'spectrum'
  | 'grid'
  | 'liquid'

export type ColorPreset =
  | 'Neon Blue'
  | 'Purple'
  | 'Pink'
  | 'Cyan'
  | 'Green'
  | 'Orange'
  | 'Red'
  | 'White'
  | 'Rainbow'
  | 'Custom'

export interface VisualSettings {
  masterSensitivity: number
  bassSensitivity: number
  midSensitivity: number
  trebleSensitivity: number
  beatSensitivity: number
  particleCount: number
  lineCount: number
  animationSpeed: number
  glowIntensity: number
  shapeSize: number
  motionIntensity: number
  cameraMovement: number
  smoothing: number
  backgroundBrightness: number
  colorPreset: ColorPreset
  customColor: string
  audioReactiveColors: boolean
}

export interface AudioFrame {
  amplitude: number
  bass: number
  mid: number
  treble: number
  beatIntensity: number
  frequency: Uint8Array
  waveform: Uint8Array
  timestamp: number
}

export const MODES: { id: VisualMode; name: string; short: string }[] = [
  { id: 'lines', name: 'Reactive Lines', short: 'LINES' },
  { id: 'circle', name: 'Energy Circle', short: 'CIRCLE' },
  { id: 'particles', name: 'Particle Explosion', short: 'BURST' },
  { id: 'wave', name: 'Audio Wave', short: 'WAVE' },
  { id: 'tunnel', name: 'Geometric Tunnel', short: 'TUNNEL' },
  { id: 'spectrum', name: 'Spectrum', short: 'SPECTRUM' },
  { id: 'grid', name: 'Neon Grid', short: 'GRID' },
  { id: 'liquid', name: 'Liquid', short: 'LIQUID' },
]

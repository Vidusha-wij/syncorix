# SYNCORIX

A browser-based real-time audio-reactive visualizer built with React, TypeScript, Vite, the Web Audio API and HTML5 Canvas.

## Features

- Live microphone input with selectable devices
- Browser tab/system audio capture where the browser exposes a shareable audio track
- Upload and loop browser-supported audio files (MP3, WAV, OGG, M4A, etc.)
- Real-time amplitude, bass, mid, treble, FFT spectrum and waveform analysis
- Smoothed beat detection with a normalized `beatIntensity` value from 0–1
- Eight reactive scenes: Reactive Lines, Energy Circle, Particle Explosion, Audio Wave, Geometric Tunnel, Spectrum, Neon Grid and Liquid
- AUTO SYNC scene logic that changes visual behavior based on sustained energy and strong bass/beat events
- Real-time sensitivity, geometry, motion, smoothing, brightness and color controls
- Audio-reactive colors, custom color, rainbow mode
- Fullscreen/performance mode and keyboard shortcuts
- No backend required

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL, normally `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

The production files are generated in `dist/`.

## Browser permissions

Microphone access requires user permission and normally works on HTTPS or localhost. Tab/system audio capture is browser/OS dependent. Chromium-based browsers usually provide the broadest support; when sharing a browser tab, enable the browser's "share audio" option.

## Performance tips

For large LED walls or projectors, use fullscreen mode, close unnecessary browser tabs and reduce Particle Count if the GPU/CPU is under load. Canvas rendering is capped to a device-pixel-ratio of 2 to avoid excessive high-DPI rendering cost.

## Keyboard shortcuts

- `A` — toggle AUTO SYNC
- `1`–`8` — select a scene
- `F` — fullscreen
- `H` — hide/show the control UI

import type { SoundPackId } from '../../shared/types'

type Tone = { freq: number; dur: number; type?: OscillatorType; gain?: number }

const PACKS: Record<SoundPackId, { relic: Tone[]; riven: Tone[] }> = {
  soft: {
    relic: [{ freq: 784, dur: 0.18, gain: 0.035 }],
    riven: [
      { freq: 659, dur: 0.12, gain: 0.03 },
      { freq: 880, dur: 0.16, gain: 0.028 },
    ],
  },
  bright: {
    relic: [
      { freq: 988, dur: 0.1, gain: 0.04 },
      { freq: 1319, dur: 0.14, gain: 0.032 },
    ],
    riven: [
      { freq: 1175, dur: 0.09, gain: 0.036 },
      { freq: 1568, dur: 0.14, gain: 0.03 },
    ],
  },
  double: {
    relic: [
      { freq: 740, dur: 0.09, gain: 0.034 },
      { freq: 740, dur: 0.12, gain: 0.028 },
    ],
    riven: [
      { freq: 622, dur: 0.08, gain: 0.032 },
      { freq: 830, dur: 0.08, gain: 0.03 },
      { freq: 1047, dur: 0.14, gain: 0.028 },
    ],
  },
  low: {
    relic: [{ freq: 392, dur: 0.22, type: 'triangle', gain: 0.04 }],
    riven: [
      { freq: 330, dur: 0.14, type: 'triangle', gain: 0.036 },
      { freq: 494, dur: 0.18, type: 'triangle', gain: 0.03 },
    ],
  },
}

function playTones(tones: Tone[]) {
  try {
    const ctx = new AudioContext()
    let t = ctx.currentTime
    for (const tone of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type || 'sine'
      osc.frequency.value = tone.freq
      gain.gain.value = tone.gain ?? 0.035
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur)
      osc.stop(t + tone.dur)
      t += tone.dur * 0.85
    }
    window.setTimeout(() => void ctx.close(), Math.ceil((t - ctx.currentTime + 0.05) * 1000))
  } catch {
    // Audio may be blocked until user gesture
  }
}

export function playScanSound(kind: 'relic' | 'riven', pack: SoundPackId = 'soft') {
  const tones = PACKS[pack]?.[kind] || PACKS.soft[kind]
  playTones(tones)
}

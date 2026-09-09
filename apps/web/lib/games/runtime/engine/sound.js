/**
 * Sound without sound files.
 *
 * There is nothing to download in the sandbox, so every effect here is
 * synthesised: an oscillator, an envelope, sometimes a filtered burst of
 * noise. That constraint turns out to suit games — the whole arcade vocabulary
 * of blips, jumps, coins and explosions is a handful of frequency sweeps, and
 * synthesised effects cost bytes rather than megabytes and can be retuned by
 * changing a number.
 *
 * The one browser rule that cannot be worked around: audio does not start
 * until the player interacts with the page. `createAudio` therefore begins
 * suspended and resumes itself on the first click or keypress, so a game never
 * has to think about it — but it does mean the very first sound of a game can
 * only follow the very first input.
 */

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  /** The one that cannot sound wrong — the safe default for generated music. */
  minorPentatonic: [0, 3, 5, 7, 10],
}

/** MIDI note number to Hz, with A4 = 69 = 440Hz. */
export function noteToHz(note) {
  return 440 * Math.pow(2, (note - 69) / 12)
}

export function createAudio(engine, options = {}) {
  const { volume = 0.6 } = options

  const context = new (window.AudioContext ?? window.webkitAudioContext)()
  const master = context.createGain()
  master.gain.value = volume
  master.connect(context.destination)

  /**
   * A compressor across everything.
   *
   * Synthesised effects have no headroom discipline: fire six explosions at
   * once and the sum clips into a nasty crackle. This is the single cheapest
   * thing that makes generated audio sound produced rather than assembled.
   */
  const compressor = context.createDynamicsCompressor()
  compressor.threshold.value = -12
  compressor.ratio.value = 8
  compressor.connect(master)

  let muted = false

  const unlock = () => {
    if (context.state === "suspended") context.resume()
  }
  window.addEventListener("pointerdown", unlock)
  window.addEventListener("keydown", unlock)

  /** Shared noise buffer: generating a second of noise per gunshot is waste. */
  let noiseBuffer = null
  function getNoise() {
    if (noiseBuffer) return noiseBuffer
    const length = context.sampleRate
    noiseBuffer = context.createBuffer(1, length, context.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
    return noiseBuffer
  }

  /**
   * One synthesised note.
   *
   * The envelope matters more than the waveform: a tone that starts and stops
   * abruptly produces an audible click at both ends, which is why the gain
   * always ramps — `setValueAtTime` alone is what makes homemade game audio
   * sound broken.
   */
  function tone(options = {}) {
    const {
      frequency = 440,
      /** Sweep to this frequency over the note. Falling reads as impact. */
      endFrequency = null,
      type = "square",
      duration = 0.15,
      attack = 0.005,
      gain = 0.3,
      detune = 0,
      delay = 0,
      destination = compressor,
    } = options

    if (muted) return
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const envelope = context.createGain()

    oscillator.type = type
    oscillator.detune.value = detune
    oscillator.frequency.setValueAtTime(frequency, start)
    if (endFrequency !== null) {
      /** Exponential, because pitch is perceived logarithmically. */
      oscillator.frequency.exponentialRampToValueAtTime(
        Math.max(endFrequency, 1),
        start + duration
      )
    }

    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(gain, start + attack)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    oscillator.connect(envelope).connect(destination)
    oscillator.start(start)
    /** Stopped and left to be collected — nodes are single-use in Web Audio. */
    oscillator.stop(start + duration + 0.02)
  }

  /** A filtered burst of noise: impacts, footsteps, explosions, wind. */
  function noise(options = {}) {
    const {
      duration = 0.2,
      gain = 0.3,
      frequency = 1200,
      endFrequency = 200,
      type = "lowpass",
      delay = 0,
      q = 1,
    } = options

    if (muted) return
    const start = context.currentTime + delay
    const source = context.createBufferSource()
    source.buffer = getNoise()

    const filter = context.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    filter.frequency.setValueAtTime(frequency, start)
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(endFrequency, 20),
      start + duration
    )

    const envelope = context.createGain()
    envelope.gain.setValueAtTime(gain, start)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    source.connect(filter).connect(envelope).connect(compressor)
    source.start(start)
    source.stop(start + duration + 0.02)
  }

  /**
   * The standard library of game sounds.
   *
   * Named for the moment they belong to rather than for how they are made, so
   * a game asks for `sfx.coin()` and never has to know it is two square waves
   * a fifth apart.
   */
  const sfx = {
    blip: () => tone({ frequency: 880, duration: 0.07, gain: 0.22 }),
    select: () =>
      tone({ frequency: 660, endFrequency: 990, duration: 0.09, gain: 0.2 }),
    jump: () =>
      tone({
        frequency: 300,
        endFrequency: 720,
        duration: 0.16,
        type: "triangle",
        gain: 0.3,
      }),
    land: () => noise({ duration: 0.12, frequency: 600, endFrequency: 90, gain: 0.25 }),
    step: () => noise({ duration: 0.06, frequency: 900, endFrequency: 300, gain: 0.1 }),
    coin: () => {
      tone({ frequency: 988, duration: 0.08, gain: 0.22 })
      tone({ frequency: 1319, duration: 0.16, gain: 0.22, delay: 0.07 })
    },
    powerup: () => {
      /** A rising arpeggio: four notes is enough to read as "you gained something". */
      ;[523, 659, 784, 1047].forEach((frequency, i) =>
        tone({
          frequency,
          duration: 0.12,
          gain: 0.2,
          type: "triangle",
          delay: i * 0.06,
        })
      )
    },
    hit: () => {
      noise({ duration: 0.14, frequency: 2200, endFrequency: 200, gain: 0.35 })
      tone({ frequency: 180, endFrequency: 60, duration: 0.14, gain: 0.25, type: "sawtooth" })
    },
    laser: () =>
      tone({
        frequency: 1400,
        endFrequency: 180,
        duration: 0.22,
        type: "sawtooth",
        gain: 0.2,
      }),
    explosion: () => {
      noise({ duration: 0.7, frequency: 1800, endFrequency: 40, gain: 0.5 })
      tone({ frequency: 90, endFrequency: 30, duration: 0.6, gain: 0.3, type: "sine" })
    },
    lose: () =>
      [440, 349, 262].forEach((frequency, i) =>
        tone({
          frequency,
          duration: 0.3,
          gain: 0.25,
          type: "triangle",
          delay: i * 0.16,
        })
      ),
    win: () =>
      [523, 659, 784, 1047, 1319].forEach((frequency, i) =>
        tone({
          frequency,
          duration: 0.35,
          gain: 0.22,
          type: "triangle",
          delay: i * 0.1,
        })
      ),
  }

  /**
   * A generated backing loop.
   *
   * Scheduled ahead of time against the audio clock rather than from the
   * render loop: `requestAnimationFrame` jitters by whole milliseconds, and
   * music scheduled on it swings audibly. Notes are queued a beat early and the
   * loop only decides *what* to play, never *when* it sounds.
   */
  function createMusic(musicOptions = {}) {
    const {
      root = 57,
      scale = SCALES.minorPentatonic,
      bpm = 96,
      gain = 0.12,
    } = musicOptions

    const beat = 60 / bpm
    let nextNoteTime = 0
    let step = 0
    let playing = false
    let stopTick = null

    const schedule = () => {
      /** Half a second of lookahead is inaudible as latency and immune to hitches. */
      while (nextNoteTime < context.currentTime + 0.5) {
        const degree = scale[step % scale.length]
        const octave = Math.floor(step / scale.length) % 2

        tone({
          frequency: noteToHz(root + degree + octave * 12),
          type: "triangle",
          duration: beat * 0.9,
          gain,
          delay: nextNoteTime - context.currentTime,
        })

        /** A root note on every other beat is the whole bassline. */
        if (step % 4 === 0) {
          tone({
            frequency: noteToHz(root - 12),
            type: "sine",
            duration: beat * 1.6,
            gain: gain * 1.4,
            delay: nextNoteTime - context.currentTime,
          })
        }

        nextNoteTime += beat / 2
        step++
      }
    }

    return {
      start() {
        if (playing) return
        playing = true
        nextNoteTime = context.currentTime + 0.1
        stopTick = engine.onUpdate(schedule)
      },
      stop() {
        playing = false
        stopTick?.()
        stopTick = null
      },
      get playing() {
        return playing
      },
    }
  }

  const audio = {
    context,
    master,
    tone,
    noise,
    sfx,
    createMusic,
    SCALES,

    setVolume(next) {
      master.gain.value = next
    },
    mute(next = true) {
      muted = next
      master.gain.value = next ? 0 : volume
    },
    get muted() {
      return muted
    },
    toggleMute() {
      audio.mute(!muted)
      return muted
    },
    unlock,
    dispose() {
      window.removeEventListener("pointerdown", unlock)
      window.removeEventListener("keydown", unlock)
      context.close()
    },
  }

  engine.onDispose(() => audio.dispose())
  return audio
}

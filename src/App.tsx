import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Grid,
  ShoppingCart,
  Rocket,
  Coins,
  ArrowLeft,
  AlertTriangle,
  RefreshCw,
  Menu as MenuIcon,
  Trophy,
  Pause,
  Settings as SettingsIcon,
} from "lucide-react";

// --- CONSTANTS & DATA ---
const SHIP_DESIGNS = [
  {
    id: "default",
    name: "Mk-1 Pioneer",
    cost: 0,
    description: "Standard issue craft. Balanced stats.",
    color: "#06b6d4",
    stats: { hp: 100, thrust: -0.55 },
  },
  {
    id: "interceptor",
    name: "Red Viper",
    cost: 100,
    description: "Assault fighter. Faster thrust, lower HP.",
    color: "#ef4444",
    stats: { hp: 75, thrust: -0.65 },
  },
  {
    id: "tank",
    name: "Iron Clad",
    cost: 100,
    description: "Heavily armored. High HP, slower thrust.",
    color: "#64748b",
    stats: { hp: 150, thrust: -0.45 },
  },
];

// --- AUDIO UTILITIES ---
const SoundFX = {
  ctx: null as AudioContext | null,
  masterMusicGain: null as GainNode | null,
  masterSFXGain: null as GainNode | null,
  masterThrustGain: null as GainNode | null,
  musicInterval: null as ReturnType<typeof setInterval> | null,
  musicGain: null as GainNode | null,
  currentMusicType: null as "menu" | "game" | "boss" | null,
  thrustSource: null as AudioBufferSourceNode | null,
  thrustVolume: null as GainNode | null,
  noiseBuffer: null as AudioBuffer | null,

  volumeMusic: 0.5,
  volumeSFX: 0.5,
  volumeThrust: 0.5,

  init() {
    if (!this.ctx) {
      this.ctx = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();

      this.masterMusicGain = this.ctx.createGain();
      this.masterMusicGain.gain.value = this.volumeMusic;
      this.masterMusicGain.connect(this.ctx.destination);

      this.masterSFXGain = this.ctx.createGain();
      this.masterSFXGain.gain.value = this.volumeSFX;
      this.masterSFXGain.connect(this.ctx.destination);

      this.masterThrustGain = this.ctx.createGain();
      this.masterThrustGain.gain.value = this.volumeThrust;
      this.masterThrustGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  },

  setVolumeMusic(v: number) {
    this.volumeMusic = v;
    if (this.masterMusicGain) this.masterMusicGain.gain.value = v;
  },
  setVolumeSFX(v: number) {
    this.volumeSFX = v;
    if (this.masterSFXGain) this.masterSFXGain.gain.value = v;
  },
  setVolumeThrust(v: number) {
    this.volumeThrust = v;
    if (this.masterThrustGain) this.masterThrustGain.gain.value = v;
  },

  createNoiseBuffer() {
    if (!this.ctx || this.noiseBuffer) return;
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1; // White noise
    }
    this.noiseBuffer = buffer;
  },

  playTone(
    freq: number,
    type: OscillatorType,
    duration: number,
    vol = 0.1,
    slideFreq: number | null = null,
  ) {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.connect(gain);
    gain.connect(this.masterSFXGain as GainNode);
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slideFreq) {
      osc.frequency.exponentialRampToValueAtTime(
        slideFreq,
        this.ctx.currentTime + duration,
      );
    }
    gain.gain.setValueAtTime(vol, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.ctx.currentTime + duration,
    );
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  },

  laser() {
    this.playTone(880, "square", 0.1, 0.015, 220);
  },
  hit() {
    this.playTone(100, "sawtooth", 0.3, 0.05, 20);
  },
  victory() {
    this.playTone(440, "sine", 0.2, 0.05);
    setTimeout(() => this.playTone(554, "sine", 0.2, 0.05), 200);
    setTimeout(() => this.playTone(659, "sine", 0.4, 0.05), 400);
  },
  gameover() {
    this.playTone(300, "sawtooth", 0.3, 0.05, 100);
    setTimeout(() => this.playTone(200, "sawtooth", 0.3, 0.05, 50), 300);
    setTimeout(() => this.playTone(100, "sawtooth", 0.5, 0.05, 20), 600);
  },
  powerup() {
    this.playTone(400, "square", 0.1, 0.05, 600);
    setTimeout(() => this.playTone(600, "square", 0.1, 0.05, 800), 100);
  },
  shieldHit() {
    this.playTone(150, "triangle", 0.2, 0.05, 100);
  },

  bossTransformation() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    // Klaxon warning sound (played 3 times)
    for (let i = 0; i < 3; i++) {
      const startTime = time + i * 0.8;
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(300, startTime);
      osc1.frequency.setValueAtTime(300, startTime + 0.3);
      osc1.frequency.setValueAtTime(200, startTime + 0.3);
      osc1.frequency.setValueAtTime(200, startTime + 0.6);

      const osc2 = this.ctx.createOscillator();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(305, startTime);
      osc2.frequency.setValueAtTime(305, startTime + 0.3);
      osc2.frequency.setValueAtTime(205, startTime + 0.3);
      osc2.frequency.setValueAtTime(205, startTime + 0.6);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.05, startTime + 0.1);
      gain.gain.setValueAtTime(0.05, startTime + 0.5);
      gain.gain.linearRampToValueAtTime(0, startTime + 0.6);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(this.masterSFXGain as GainNode);

      osc1.start(startTime);
      osc1.stop(startTime + 0.6);
      osc2.start(startTime);
      osc2.stop(startTime + 0.6);
    }

    // Deep power up swoosh
    const osc3 = this.ctx.createOscillator();
    osc3.type = "sine";
    osc3.frequency.setValueAtTime(50, time + 0.6);
    osc3.frequency.exponentialRampToValueAtTime(500, time + 3.0);

    const gain3 = this.ctx.createGain();
    gain3.gain.setValueAtTime(0, time + 0.6);
    gain3.gain.linearRampToValueAtTime(0.2, time + 2.0);
    gain3.gain.linearRampToValueAtTime(0, time + 3.0);

    osc3.connect(gain3);
    gain3.connect(this.masterSFXGain as GainNode);
    osc3.start(time + 0.6);
    osc3.stop(time + 3.0);
  },

  bossExplosionPhase1() {
    if (!this.ctx) return;
    if (!this.noiseBuffer) this.createNoiseBuffer();
    const time = this.ctx.currentTime;

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(2000, time);
    noiseFilter.frequency.exponentialRampToValueAtTime(100, time + 1.5);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 1.5);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterSFXGain as GainNode);
    noiseSrc.start(time);
    noiseSrc.stop(time + 1.5);

    this.playTone(150, "sawtooth", 1.5, 0.4, 20);
  },

  bossCharge() {
    if (!this.ctx) return;
    const time = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(200, time);
    osc.frequency.exponentialRampToValueAtTime(800, time + 1.0);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 1.0);

    osc.connect(gain);
    gain.connect(this.masterSFXGain as GainNode);
    osc.start(time);
    osc.stop(time + 1.0);
  },

  bossMegaLaser() {
    if (!this.ctx) return;
    if (!this.noiseBuffer) this.createNoiseBuffer();
    const time = this.ctx.currentTime;

    // Zap sound
    this.playTone(800, "square", 0.5, 0.3, 100);

    // Noise blast
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = this.noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1000, time);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.5, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);

    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.masterSFXGain as GainNode);
    noiseSrc.start(time);
    noiseSrc.stop(time + 0.5);
  },

  makeDistortionCurve(amount: number) {
    const k = amount;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }
    return curve;
  },

  startThrustSound() {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (this.thrustSource) return;

    if (!this.noiseBuffer) this.createNoiseBuffer();

    const time = this.ctx.currentTime;

    // 1. Noise Layer (The Roar)
    this.thrustSource = this.ctx.createBufferSource();
    this.thrustSource.buffer = this.noiseBuffer;
    this.thrustSource.loop = true;

    // Spool up pitch
    this.thrustSource.playbackRate.setValueAtTime(0.5, time);
    this.thrustSource.playbackRate.linearRampToValueAtTime(1.8, time + 0.4);

    const lowPass = this.ctx.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.setValueAtTime(200, time);
    lowPass.frequency.exponentialRampToValueAtTime(800, time + 0.5);
    lowPass.Q.value = 8;

    // Distortion for realism
    const distortion = this.ctx.createWaveShaper();
    distortion.curve = this.makeDistortionCurve(40);
    distortion.oversample = "4x";

    // 2. Turbine Whine (Oscillator)
    const whineOsc = this.ctx.createOscillator();
    whineOsc.type = "sine";
    whineOsc.frequency.setValueAtTime(400, time);
    whineOsc.frequency.exponentialRampToValueAtTime(1200, time + 0.4);

    const whineGain = this.ctx.createGain();
    whineGain.gain.setValueAtTime(0.005, time);
    whineGain.gain.exponentialRampToValueAtTime(0.02, time + 0.4);

    // 3. Master Controller
    this.thrustVolume = this.ctx.createGain();
    this.thrustVolume.gain.setValueAtTime(0, time);
    this.thrustVolume.gain.linearRampToValueAtTime(0.5, time + 0.2);

    // Internal modulation for realism
    const lfo = this.ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.setValueAtTime(4, time);
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.setValueAtTime(80, time); // Wobbly bass
    lfo.connect(lfoGain);
    lfoGain.connect(lowPass.frequency);

    // Connections
    this.thrustSource.connect(distortion);
    distortion.connect(lowPass);
    lowPass.connect(this.thrustVolume);

    whineOsc.connect(whineGain);
    whineGain.connect(this.thrustVolume);

    this.thrustVolume.connect(this.masterThrustGain as GainNode);

    this.thrustSource.start();
    whineOsc.start();
    lfo.start();

    // Store sub-nodes for cleanup
    (this.thrustSource as any)._nodes = [
      whineOsc,
      lfo,
      lowPass,
      whineGain,
      lfoGain,
      distortion,
    ];
  },

  stopThrustSound() {
    if (this.thrustSource && this.thrustVolume && this.ctx) {
      const vol = this.thrustVolume;
      const src = this.thrustSource;
      const subNodes = (src as any)._nodes || [];
      const time = this.ctx.currentTime;

      // Spool down volume
      vol.gain.cancelScheduledValues(time);
      vol.gain.setValueAtTime(vol.gain.value, time);
      vol.gain.exponentialRampToValueAtTime(0.001, time + 0.4);

      // Spool down pitch
      src.playbackRate.cancelScheduledValues(time);
      src.playbackRate.setValueAtTime(src.playbackRate.value, time);
      src.playbackRate.linearRampToValueAtTime(0.1, time + 0.4);

      const whineOsc = subNodes.find(
        (n: any) => n instanceof OscillatorNode && n.frequency.value > 100,
      );
      if (whineOsc) {
        whineOsc.frequency.cancelScheduledValues(time);
        whineOsc.frequency.setValueAtTime(whineOsc.frequency.value, time);
        whineOsc.frequency.exponentialRampToValueAtTime(100, time + 0.4);
      }

      setTimeout(() => {
        try {
          src.stop();
        } catch (e) {}
        src.disconnect();
        subNodes.forEach((n: any) => {
          try {
            if (n.stop) n.stop();
          } catch (e) {}
          n.disconnect();
        });
        vol.disconnect();
      }, 450);

      this.thrustSource = null;
      this.thrustVolume = null;
    } else if (this.thrustSource) {
      try {
        this.thrustSource.stop();
      } catch (e) {}
      this.thrustSource.disconnect();
      this.thrustSource = null;
    }
  },

  startMusic(type: "menu" | "game" | "boss" = "game") {
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") this.ctx.resume();
    if (!this.noiseBuffer) this.createNoiseBuffer();
    if (this.currentMusicType === type && this.musicInterval) return; // Already playing this type

    this.stopMusic();
    this.currentMusicType = type as "menu" | "game" | "boss" | null;

    let notes: number[] = [];
    let intervalTime = 150;
    let bassNotes: number[] = [];

    if (type === "menu") {
      // 8-bit bouncy menu theme
      notes = [
        523.25,
        659.25,
        783.99,
        659.25, // C E G E
        523.25,
        659.25,
        783.99,
        1046.5, // C E G C
        493.88,
        659.25,
        783.99,
        659.25, // B E G E
        493.88,
        659.25,
        783.99,
        987.77, // B E G B
      ];
      bassNotes = [
        130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 130.81, 123.47,
        123.47, 123.47, 123.47, 123.47, 123.47, 123.47, 123.47,
      ];
      intervalTime = 160;
    } else if (type === "boss") {
      // Menegangkan boss theme
      notes = [
        329.63,
        349.23,
        392.0,
        349.23, // E F G F
        329.63,
        349.23,
        493.88,
        349.23, // E F B F
        329.63,
        349.23,
        392.0,
        349.23, // E F G F
        329.63,
        349.23,
        523.25,
        493.88, // E F C B
      ];
      bassNotes = [
        82.41, 82.41, 82.41, 82.41, 87.31, 87.31, 87.31, 87.31, 82.41, 82.41,
        82.41, 82.41, 77.78, 77.78, 98.0, 92.5,
      ];
      intervalTime = 110;
    } else {
      // 8-bit intense in-game theme (slower)
      notes = [
        440.0,
        440.0,
        523.25,
        440.0, // A A C A
        392.0,
        440.0,
        523.25,
        659.25, // G A C E
        349.23,
        349.23,
        440.0,
        349.23, // F F A F
        329.63,
        349.23,
        440.0,
        523.25, // E F A C
      ];
      bassNotes = [
        110.0, 110.0, 110.0, 110.0, 110.0, 110.0, 110.0, 110.0, 87.31, 87.31,
        87.31, 87.31, 82.41, 82.41, 82.41, 82.41,
      ];
      intervalTime = 170; // Slower game tempo
    }

    let step = 0;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = type === "menu" ? 0.1 : 0.15; // lower volume for 8-bit waves
    this.musicGain.connect(this.masterMusicGain as GainNode);

    this.musicInterval = setInterval(() => {
      if (!this.ctx || !this.musicGain) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const time = this.ctx.currentTime;

      // 1. Melody - Square wave for classic 8-bit sound
      const osc = this.ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(notes[step % notes.length], time);

      const noteGain = this.ctx.createGain();
      // Short plucky envelope
      noteGain.gain.setValueAtTime(0.4, time);
      noteGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

      osc.connect(noteGain);
      noteGain.connect(this.musicGain);

      osc.start(time);
      osc.stop(time + 0.15);

      // 2. Bass - Triangle wave for 8-bit bass
      const bassOsc = this.ctx.createOscillator();
      bassOsc.type = "triangle";
      bassOsc.frequency.setValueAtTime(
        bassNotes[step % bassNotes.length],
        time,
      );

      const bassGain = this.ctx.createGain();
      bassGain.gain.setValueAtTime(0.6, time);
      bassGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

      bassOsc.connect(bassGain);
      bassGain.connect(this.musicGain);

      bassOsc.start(time);
      bassOsc.stop(time + 0.2);

      // 3. 8-bit Noise Snare/Hi-hat
      if (step % 2 === 1) {
        // Off-beats
        if (this.noiseBuffer) {
          const noiseSrc = this.ctx.createBufferSource();
          noiseSrc.buffer = this.noiseBuffer;

          const noiseFilter = this.ctx.createBiquadFilter();
          noiseFilter.type = "highpass";
          noiseFilter.frequency.value = type === "game" ? 2000 : 3000;

          const noiseGain = this.ctx.createGain();
          noiseGain.gain.setValueAtTime(step % 4 === 3 ? 0.3 : 0.1, time); // Snare on 4, hi-hat on 2
          noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

          noiseSrc.connect(noiseFilter);
          noiseFilter.connect(noiseGain);
          noiseGain.connect(this.musicGain);

          noiseSrc.start(time);
          noiseSrc.stop(time + 0.1);
        }
      }

      // 4. Simple "Kick" (pitch drop)
      if (step % 4 === 0) {
        // On the beat
        const kickOsc = this.ctx.createOscillator();
        kickOsc.type = "square"; // using square for 8-bit kick

        const kickGain = this.ctx.createGain();

        kickOsc.frequency.setValueAtTime(150, time);
        kickOsc.frequency.exponentialRampToValueAtTime(0.01, time + 0.1);

        kickGain.gain.setValueAtTime(0.4, time);
        kickGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

        kickOsc.connect(kickGain);
        kickGain.connect(this.musicGain);

        kickOsc.start(time);
        kickOsc.stop(time + 0.1);
      }

      step++;
    }, intervalTime);
  },

  stopMusic() {
    this.currentMusicType = null;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
    if (this.musicGain) {
      this.musicGain.disconnect();
      this.musicGain = null;
    }
  },
};

// 2. Modals
const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const [volMusic, setVolMusic] = useState(SoundFX.volumeMusic);
  const [volSFX, setVolSFX] = useState(SoundFX.volumeSFX);
  const [volThrust, setVolThrust] = useState(SoundFX.volumeThrust);

  const handleMusicChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolMusic(v);
    SoundFX.setVolumeMusic(v);
  };
  const handleSFXChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolSFX(v);
    SoundFX.setVolumeSFX(v);
  };
  const handleThrustChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolThrust(v);
    SoundFX.setVolumeThrust(v);
  };

  return (
    <div className="flex fixed inset-0 z-50 items-center justify-center p-4 bg-black/80 backdrop-blur-sm anim-fade">
      <div className="w-full max-w-sm p-8 bg-slate-900 border-2 rounded-2xl border-white/10 shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col gap-6">
        <h2 className="text-2xl font-black tracking-wider text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
          AUDIO SETTINGS
        </h2>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="flex justify-between text-sm font-bold text-slate-300">
              <span className="tracking-wider">MUSIC</span>
              <span className="text-cyan-400 font-mono">
                {Math.round(volMusic * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volMusic}
              onChange={handleMusicChange}
              className="w-full accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex justify-between text-sm font-bold text-slate-300">
              <span className="tracking-wider">EFFECTS</span>
              <span className="text-cyan-400 font-mono">
                {Math.round(volSFX * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volSFX}
              onChange={handleSFXChange}
              className="w-full accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex justify-between text-sm font-bold text-slate-300">
              <span className="tracking-wider">ENGINE</span>
              <span className="text-cyan-400 font-mono">
                {Math.round(volThrust * 100)}%
              </span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volThrust}
              onChange={handleThrustChange}
              className="w-full accent-cyan-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 mt-2 font-bold tracking-wider text-white transition-all rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95"
        >
          CLOSE
        </button>
      </div>
    </div>
  );
};

const GameOverModal = ({ distance, level, onRetry, onMenu }: any) => (
  <div className="modal-overlay anim-fade">
    <div
      className="modal-box"
      style={{
        background: "linear-gradient(to bottom, rgba(69,10,10,0.9), black)",
        border: "1px solid rgba(127,29,29,0.5)",
      }}
    >
      <div className="center anim-bounce" style={{ marginBottom: "24px" }}>
        <div
          style={{
            padding: "16px",
            background: "rgba(69,10,10,0.5)",
            borderRadius: "50%",
            border: "1px solid #7f1d1d",
            display: "inline-block",
          }}
        >
          <AlertTriangle size={48} color="#ef4444" />
        </div>
      </div>
      <h1 className="modal-title" style={{ color: "#ef4444" }}>
        Mission Failed
      </h1>
      <p
        style={{
          fontFamily: "monospace",
          fontSize: "0.85rem",
          color: "rgba(254,202,202,0.5)",
          marginBottom: "24px",
        }}
      >
        Ship signal lost in deep space.
      </p>
      <div
        className="stats-box"
        style={{ border: "1px solid rgba(127,29,29,0.3)" }}
      >
        <div
          style={{
            fontSize: "0.7rem",
            fontWeight: "bold",
            textTransform: "uppercase",
            letterSpacing: "2px",
            color: "#f87171",
            marginBottom: "4px",
          }}
        >
          Distance Traveled
        </div>
        <div className="stats-val">{distance}m</div>
        <div
          style={{
            fontSize: "0.75rem",
            fontWeight: "bold",
            color: "#64748b",
            letterSpacing: "1px",
          }}
        >
          LEVEL {level}
        </div>
      </div>
      <div className="modal-btn-row">
        <button
          onClick={onRetry}
          className="btn"
          style={{ background: "#dc2626", flex: 1 }}
        >
          <RefreshCw size={20} /> RETRY
        </button>
        <button
          onClick={onMenu}
          className="btn"
          style={{
            background: "#0f172a",
            border: "1px solid #1e293b",
            color: "#cbd5e1",
            flex: 1,
          }}
        >
          <MenuIcon size={20} /> MENU
        </button>
      </div>
    </div>
  </div>
);

const VictoryModal = ({
  level,
  coinsEarned,
  onNextLevel,
  onReplay,
  onMenu,
  isLastLevel,
}: any) => (
  <div
    className="modal-overlay anim-fade"
    style={{ background: "rgba(8,51,68,0.8)" }}
  >
    <div
      className="modal-box"
      style={{
        background: "linear-gradient(to bottom, #0f172a, black)",
        border: "1px solid rgba(6,182,212,0.3)",
        boxShadow: "0 0 50px rgba(6,182,212,0.15)",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "inline-block",
          marginBottom: "24px",
        }}
      >
        <Trophy size={64} style={{ position: "relative", color: "#facc15" }} />
      </div>
      <h1 className="modal-title" style={{ color: "#22d3ee" }}>
        MISSION COMPLETE
      </h1>
      <div style={{ display: "flex", gap: "16px", marginBottom: "24px" }}>
        <div
          style={{
            flex: 1,
            background: "rgba(30,41,59,0.5)",
            border: "1px solid rgba(6,182,212,0.2)",
            padding: "16px",
            borderRadius: "16px",
          }}
        >
          <div style={{ color: "#06b6d4", fontSize: "0.7rem" }}>TARGET</div>
          <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
            {100 + (level - 1) * 30}m
          </div>
        </div>
        <div
          style={{
            flex: 1,
            background: "rgba(113,63,18,0.2)",
            border: "1px solid rgba(234,179,8,0.3)",
            padding: "16px",
            borderRadius: "16px",
          }}
        >
          <div style={{ color: "#eab308", fontSize: "0.7rem" }}>EARNED</div>
          <div
            style={{ fontSize: "1.5rem", fontWeight: "bold", color: "white" }}
          >
            +{coinsEarned}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "12px", flexDirection: "column" }}>
        {!isLastLevel && (
          <button
            onClick={onNextLevel}
            className="btn"
            style={{ background: "#eab308", color: "black" }}
          >
            NEXT MISSION
          </button>
        )}
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            onClick={onReplay}
            className="btn"
            style={{ flex: 1, background: "#0f172a" }}
          >
            REPLAY
          </button>
          <button
            onClick={onMenu}
            className="btn"
            style={{ flex: 1, background: "transparent" }}
          >
            MENU
          </button>
        </div>
      </div>
    </div>
  </div>
);

// 3. Menu & Screens
const MainMenu = ({ coins, onPlay, onLevels, onShop, onSettings }: any) => (
  <div className="screen menu-screen center font-sans">
    <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-indigo-900 via-indigo-950 to-black -bottom-20 -left-20 border border-white/5"></div>
      <div className="absolute w-32 h-32 rounded-full bg-gradient-to-tr from-orange-900 to-amber-950 top-20 right-10 opacity-40 blur-sm"></div>
    </div>
    <div className="absolute top-6 left-6 z-20">
      <button
        onClick={onSettings}
        className="p-3 bg-slate-800/80 hover:bg-slate-700/80 backdrop-blur border border-white/10 rounded-full text-slate-300 hover:text-white transition-all shadow-lg active:scale-95"
      >
        <SettingsIcon size={24} />
      </button>
    </div>
    <div
      className="coins-display z-20"
      style={{ right: "1.5rem", top: "1.5rem" }}
    >
      <Coins className="text-amber-400" size={20} /> {coins}
    </div>
    <div className="flex flex-col items-center gap-12 z-10">
      <div className="title-container relative flex flex-col items-center">
        <div className="mb-0 relative">
          <div className="absolute inset-0 bg-cyan-500 blur-3xl opacity-20 animate-pulse"></div>
          <Rocket size={100} className="title-icon anim-bounce relative z-10" />
        </div>
        <h1 className="title-text">
          <span className="part1">METEOR</span>
          <span className="part2">ESCAPE</span>
        </h1>
      </div>
      <div className="menu-buttons">
        <button onClick={onPlay} className="btn btn-play w-full py-4 text-lg">
          <Play size={24} className="fill-current" /> LAUNCH MISSION
        </button>
        <div className="grid grid-cols-2 gap-4 mt-2">
          <button
            onClick={onLevels}
            className="btn btn-levels py-4 flex flex-col items-center gap-1 w-full h-full text-base"
          >
            <Grid size={24} /> LEVELS
          </button>
          <button
            onClick={onShop}
            className="btn btn-shop py-4 flex flex-col items-center gap-1 w-full h-full text-base"
          >
            <ShoppingCart size={24} /> HANGAR
          </button>
        </div>
      </div>
    </div>
    <div className="absolute bottom-10 left-10 gap-4 opacity-50 z-10 hidden md:flex pointer-events-none">
      <Rocket size={48} className="text-slate-500" strokeWidth={1} />
      <div className="text-xs font-mono text-slate-500 flex flex-col justify-center">
        <span>COORD_X: 144.22</span>
        <span>COORD_Y: 890.11</span>
        <span>DEEP_SPACE_NODE_04</span>
      </div>
    </div>
    <div className="absolute bottom-10 right-10 text-right opacity-30 z-10 hidden md:block pointer-events-none">
      <p className="text-[10px] uppercase tracking-widest font-bold text-white">
        System Status: Optimal
      </p>
      <p className="text-[10px] uppercase tracking-widest font-bold text-cyan-400">
        Shields: 100%
      </p>
    </div>
  </div>
);

const LevelSelect = ({ onBack, onSelectLevel }: any) => {
  const levels = Array.from({ length: 30 }, (_, i) => i + 1);
  return (
    <div className="screen" style={{ background: "#020617" }}>
      <div className="nav-header">
        <button onClick={onBack} className="btn-back">
          <ArrowLeft size={24} />
        </button>
        <h2 className="nav-title" style={{ color: "#22d3ee" }}>
          SELECT MISSION
        </h2>
      </div>
      <div className="scroll-container custom-scrollbar">
        <div className="grid-levels">
          {levels.map((level) => (
            <button
              key={level}
              onClick={() => onSelectLevel(level)}
              className="level-card"
              style={{ borderColor: "rgba(6,182,212,0.3)" }}
            >
              <span className="level-num">{level}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const Shop = ({
  coins,
  unlockedShips,
  selectedShipId,
  onBuy,
  onSelect,
  onBack,
}: any) => (
  <div className="screen" style={{ background: "#020617" }}>
    <div className="nav-header">
      <button onClick={onBack} className="btn-back">
        <ArrowLeft size={24} />
      </button>
      <div className="coins-display" style={{ position: "static" }}>
        <Coins color="#facc15" size={20} /> {coins}
      </div>
    </div>
    <div className="scroll-container custom-scrollbar">
      <div className="grid-shop">
        {SHIP_DESIGNS.map((ship) => {
          const isUnlocked = unlockedShips.includes(ship.id);
          const isSelected = selectedShipId === ship.id;
          return (
            <div
              key={ship.id}
              className={`ship-card ${isSelected ? "selected" : ""}`}
            >
              <div className="ship-img">
                <Rocket size={64} color={ship.color} />
              </div>
              <div className="ship-info">
                <h3 className="ship-name">{ship.name}</h3>
                <p className="ship-desc">{ship.description}</p>
                <div className="flex gap-4 mb-4 text-xs font-mono text-gray-300">
                  <div>
                    <span className="text-gray-500">HP:</span> {ship.stats.hp}
                  </div>
                  <div>
                    <span className="text-gray-500">THRUST:</span>{" "}
                    {Math.abs(ship.stats.thrust).toFixed(2)}
                  </div>
                </div>
                {isUnlocked ? (
                  <button
                    onClick={() => onSelect(ship.id)}
                    className={`btn-equip ${isSelected ? "equipped" : "select"}`}
                  >
                    {isSelected ? "EQUIPPED" : "EQUIP"}
                  </button>
                ) : (
                  <button
                    onClick={() => onBuy(ship.id, ship.cost)}
                    className={`btn-equip ${coins >= ship.cost ? "unlock" : "locked"}`}
                  >
                    UNLOCK ({ship.cost} <Coins size={14} />)
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  </div>
);

// 4. THE GAME ENGINE
const GameLoop = ({
  level,
  selectedShipId,
  onGameOver,
  onVictory,
  onExit,
  onSettings,
}: any) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef(0);

  const [hudDistance, setHudDistance] = useState(0);
  const [bossActive, setBossActive] = useState(false);
  const [bossHp, setBossHp] = useState(0);
  const [bossMaxHp, setBossMaxHp] = useState(100);
  const [showCriticalTip, setShowCriticalTip] = useState(false);

  const [isPaused, setIsPaused] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const isPausedRef = useRef(false);
  const countdownRef = useRef(3);

  const framesRef = useRef(0);
  const distanceRef = useRef(0);
  const isThrustingRef = useRef(false);
  const isBossFightRef = useRef(false);

  const bgRef = useRef({ stars: [] as any[], planets: [] as any[] });
  const shipRef = useRef({
    x: 100,
    y: 0,
    w: 60,
    h: 40,
    vy: 0,
    thrust: -0.55,
    gravity: 0.22,
    hp: 100,
    maxHp: 100,
    shield: 0,
  });
  const meteorsRef = useRef<any[]>([]);
  const enemiesRef = useRef<any[]>([]);
  const lasersRef = useRef<any[]>([]);
  const powerupsRef = useRef<any[]>([]);
  const particlesRef = useRef<any[]>([]);
  const bossRef = useRef({
    active: false,
    x: -200,
    y: 0,
    w: 200,
    h: 150,
    hp: 100,
    maxHp: 100,
    vy: 1,
    lastShot: 0,
    angle: 0,
    phase: 1,
    transitioning: false,
    transitionTimer: 0,
    transitioningPhase3: false,
    chargingAttack: false,
    chargeTimer: 0,
    dying: false,
    deathTimer: 0,
  });

  const TARGET_DISTANCE = 100 + (level - 1) * 30;
  const IS_BOSS_LEVEL = level % 10 === 0;

  useEffect(() => {
    SoundFX.init();
    return () => {
      SoundFX.stopThrustSound();
    };
  }, []);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);
  useEffect(() => {
    countdownRef.current = countdown;
  }, [countdown]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initialShipX = IS_BOSS_LEVEL
      ? Math.max(window.innerWidth / 2, 280)
      : 100;

    const currentShipData =
      SHIP_DESIGNS.find((s) => s.id === selectedShipId) || SHIP_DESIGNS[0];
    shipRef.current = {
      x: initialShipX,
      y: window.innerHeight / 2,
      w: 60,
      h: 40,
      vy: 0,
      thrust: currentShipData.stats.thrust,
      gravity: 0.22,
      hp: currentShipData.stats.hp,
      maxHp: currentShipData.stats.hp,
      shield: 0,
    };
    meteorsRef.current = [];
    enemiesRef.current = [];
    lasersRef.current = [];
    powerupsRef.current = [];
    particlesRef.current = [];
    isThrustingRef.current = false;
    distanceRef.current = 0;
    framesRef.current = 0;
    setHudDistance(0);
    setCountdown(3);
    setIsPaused(false);

    bgRef.current.stars = Array.from({ length: 150 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 2 + 0.5,
      speed: Math.random() * 0.5 + 0.1,
      color: Math.random() > 0.5 ? "#ffffff" : "#93c5fd",
    }));
    bgRef.current.planets = [
      {
        x: window.innerWidth * 0.8,
        y: window.innerHeight * 0.2,
        radius: 80,
        color: "#312e81",
        craterColor: "#1e1b4b",
        speed: 0.1,
        hasRings: true,
        ringAngle: Math.PI / 6,
      },
      {
        x: window.innerWidth * 0.2,
        y: window.innerHeight * 0.8,
        radius: 40,
        color: "#14532d",
        craterColor: "#064e3b",
        speed: 0.15,
        hasRings: false,
        ringAngle: 0,
      },
      {
        x: window.innerWidth * 0.6,
        y: window.innerHeight * 0.5,
        radius: 25,
        color: "#7c2d12",
        craterColor: "#451a03",
        speed: 0.2,
        hasRings: true,
        ringAngle: -Math.PI / 8,
      },
    ];

    if (IS_BOSS_LEVEL) {
      isBossFightRef.current = true;
      setBossActive(true);
      const calculatedBossHp = 300 + level * 50;
      setBossMaxHp(calculatedBossHp);
      bossRef.current = {
        active: true,
        x: -300,
        y: window.innerHeight / 2 - 60,
        w: 200,
        h: 150,
        hp: calculatedBossHp,
        maxHp: calculatedBossHp,
        vy: 0.5,
        lastShot: 0,
        angle: 0,
        phase: 1,
        transitioning: false,
        transitionTimer: 0,
        transitioningPhase3: false,
        chargingAttack: false,
        chargeTimer: 0,
        dying: false,
        deathTimer: 0,
        stunned: false,
        stunTimer: 0,
      };
    } else {
      isBossFightRef.current = false;
      setBossActive(false);
      bossRef.current.active = false;
    }

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);
    handleResize();

    const startThrust = (e: any) => {
      if (e.target?.tagName === "BUTTON") return;
      if (e.target?.closest("button")) return;
      if (!isPausedRef.current && countdownRef.current === 0) {
        if (!isThrustingRef.current) {
          isThrustingRef.current = true;
          SoundFX.startThrustSound();
        }
      }
    };
    const stopThrust = () => {
      if (isThrustingRef.current) {
        isThrustingRef.current = false;
        SoundFX.stopThrustSound();
      }
    };
    const handleKey = (e: any) => {
      if (e.code === "Space") {
        if (!isPausedRef.current && countdownRef.current === 0) {
          const isDown = e.type === "keydown";
          if (isDown && !isThrustingRef.current) {
            isThrustingRef.current = true;
            SoundFX.startThrustSound();
          } else if (!isDown && isThrustingRef.current) {
            isThrustingRef.current = false;
            SoundFX.stopThrustSound();
          }
        }
      }
      if (e.code === "Escape" && e.type === "keydown") {
        setIsPaused((prev) => !prev);
      }
    };

    window.addEventListener("mousedown", startThrust);
    window.addEventListener("mouseup", stopThrust);
    window.addEventListener("touchstart", startThrust, { passive: false });
    window.addEventListener("touchend", stopThrust);
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousedown", startThrust);
      window.removeEventListener("mouseup", stopThrust);
      window.removeEventListener("touchstart", startThrust);
      window.removeEventListener("touchend", stopThrust);
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [level, IS_BOSS_LEVEL]);

  useEffect(() => {
    if (isPaused) {
      SoundFX.stopMusic();
      SoundFX.stopThrustSound();
      return;
    }
    const loop = () => {
      update();
      draw();
      requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);

    // Auto-resume music if not paused
    SoundFX.startMusic(IS_BOSS_LEVEL ? "boss" : "game");

    return () => cancelAnimationFrame(requestRef.current);
  }, [isPaused]);

  useEffect(() => {
    if (!isPaused && countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, isPaused]);

  // LOGIC & GAMELOOP
  const update = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ship = shipRef.current;

    framesRef.current++;
    if (countdownRef.current > 0) return;

    const spawnShipTrailParticles = (x: number, y: number) => {
      for (let i = 0; i < 3; i++) {
        particlesRef.current.push({
          x: x,
          y: y + (Math.random() - 0.5) * 8,
          vx: -(Math.random() * 12 + 5),
          vy: (Math.random() - 0.5) * 2,
          life: 1.0,
          decay: 0.08,
          size: Math.random() * 3 + 1.5,
          color: Math.random() > 0.5 ? "#fde047" : "#ea580c",
        });
      }
    };

    const spawnExplosionParticles = (
      x: number,
      y: number,
      colorOverrides?: string[],
    ) => {
      const colors = colorOverrides || [
        "#f97316",
        "#ef4444",
        "#fde047",
        "#9ca3af",
        "#fb923c",
      ];
      for (let i = 0; i < 25; i++) {
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 16,
          vy: (Math.random() - 0.5) * 16,
          life: 1.0 + Math.random() * 0.5,
          decay: 0.03,
          size: Math.random() * 6 + 2,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
      }
    };

    const takeDamage = (dmg: number, hitX: number, hitY: number) => {
      spawnExplosionParticles(hitX, hitY);
      if (ship.shield > 0) {
        ship.shield -= 1;
        SoundFX.shieldHit();
      } else {
        ship.hp -= dmg;
        SoundFX.hit();
      }
      if (ship.hp <= 0) {
        spawnExplosionParticles(ship.x + ship.w / 2, ship.y + ship.h / 2);
        SoundFX.gameover();
        onGameOver(Math.floor(distanceRef.current / 10));
        return true;
      }
      return false;
    };

    // Background Parallax Move
    bgRef.current.stars.forEach((s) => {
      s.x -= s.speed * (isThrustingRef.current ? 2 : 1);
      if (s.x < 0) {
        s.x = canvas.width;
        s.y = Math.random() * canvas.height;
      }
    });
    bgRef.current.planets.forEach((p) => {
      p.x -= p.speed * (isThrustingRef.current ? 1.5 : 1);
      if (p.x + p.radius * 1.5 < 0) {
        p.x = canvas.width + p.radius * 1.5;
        p.y = Math.random() * canvas.height;
      }
    });

    // Ship Physic Updates
    if (isThrustingRef.current) {
      ship.vy += ship.thrust;
      spawnShipTrailParticles(ship.x, ship.y + ship.h / 2);
    }
    ship.vy += ship.gravity;
    ship.y += ship.vy;

    // Player Auto-Shoot during Boss Phase 2 & 3
    if (
      isBossFightRef.current &&
      bossRef.current.active &&
      (bossRef.current.phase === 2 || bossRef.current.phase === 3)
    ) {
      if (framesRef.current % 45 === 0) {
        lasersRef.current.push({
          type: "PLAYER",
          x: ship.x + ship.w,
          y: ship.y + ship.h / 2,
          vx: 20,
          vy: 0,
          w: 24,
          h: 4,
          color: "#3b82f6", // Blue laser for player
        });
        SoundFX.laser(); // Actually this might be too noisy if it fires 4 times a second, but it's fine
      }
    }

    if (ship.y < 0) {
      ship.y = 0;
      ship.vy = 0;
    }
    if (ship.y + ship.h > canvas.height) {
      SoundFX.gameover();
      onGameOver(Math.floor(distanceRef.current / 10));
      cancelAnimationFrame(requestRef.current);
      return;
    }

    distanceRef.current++;
    const currentDistMeters = Math.floor(distanceRef.current / 10);
    if (framesRef.current % 10 === 0) {
      setHudDistance(currentDistMeters);
      if (isBossFightRef.current) {
        setBossHp(bossRef.current.hp);
        if (bossRef.current.hp <= 0) {
          if (
            level >= 20 &&
            bossRef.current.phase === 1 &&
            !bossRef.current.transitioning
          ) {
            bossRef.current.transitioning = true;
            bossRef.current.transitionTimer = framesRef.current;
            bossRef.current.hp = 0; // prevent negative
            SoundFX.bossExplosionPhase1();
            SoundFX.bossTransformation();

            // Spawn debris particles
            const cx = bossRef.current.x + bossRef.current.w / 2;
            const cy = bossRef.current.y + bossRef.current.h / 2;
            // Central flash
            particlesRef.current.push({
              x: cx,
              y: cy,
              vx: 0,
              vy: 0,
              life: 1.0,
              decay: 0.1,
              color: "#ffffff",
              size: 100,
              glow: true,
            });
            for (let i = 0; i < 60; i++) {
              particlesRef.current.push({
                x: cx,
                y: cy,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20,
                life: 1.0,
                decay: 0.02 + Math.random() * 0.02,
                color: ["#ef4444", "#fb923c", "#fcd34d", "#64748b"][
                  Math.floor(Math.random() * 4)
                ],
                size: Math.random() * 8 + 4,
                glow: Math.random() > 0.5,
              });
            }
          } else if (
            level >= 30 &&
            bossRef.current.phase === 2 &&
            !bossRef.current.transitioningPhase3 &&
            !bossRef.current.dying
          ) {
            bossRef.current.transitioningPhase3 = true;
            bossRef.current.transitionTimer = framesRef.current;
            bossRef.current.hp = 0;
            SoundFX.bossExplosionPhase1();
            SoundFX.bossTransformation();

            // Spawn debris particles for phase 3 transition
            const cx = bossRef.current.x + bossRef.current.w / 2;
            const cy = bossRef.current.y + bossRef.current.h / 2;
            // Central flash
            particlesRef.current.push({
              x: cx,
              y: cy,
              vx: 0,
              vy: 0,
              life: 1.0,
              decay: 0.1,
              color: "#a7f3d0",
              size: 120,
              glow: true,
            });
            for (let i = 0; i < 80; i++) {
              particlesRef.current.push({
                x: cx,
                y: cy,
                vx: (Math.random() - 0.5) * 25,
                vy: (Math.random() - 0.5) * 25,
                life: 1.2,
                decay: 0.015 + Math.random() * 0.02,
                color: ["#10b981", "#3b82f6", "#ffffff", "#d946ef"][
                  Math.floor(Math.random() * 4)
                ],
                size: Math.random() * 10 + 4,
                glow: Math.random() > 0.4,
              });
            }
          } else if (
            !bossRef.current.transitioning &&
            !bossRef.current.transitioningPhase3 &&
            !bossRef.current.dying
          ) {
            bossRef.current.dying = true;
            bossRef.current.deathTimer = framesRef.current;
            bossRef.current.hp = 0;
            SoundFX.bossExplosionPhase1(); // initial boom
          }
        }
      } else {
        if (currentDistMeters >= TARGET_DISTANCE) {
          SoundFX.victory();
          onVictory(currentDistMeters, 20);
          cancelAnimationFrame(requestRef.current);
          return;
        }
      }
    }

    const baseSpeed = 4 + level * 0.15 + distanceRef.current / 3000;

    // Spawn Meteor
    const meteorSpawnRate = Math.max(20, 60 - level);
    if (framesRef.current % meteorSpawnRate === 0) {
      const vertices = [];
      const numPoints = 7 + Math.floor(Math.random() * 5);
      for (let j = 0; j < numPoints; j++) {
        vertices.push(0.7 + Math.random() * 0.3);
      }
      meteorsRef.current.push({
        x: canvas.width + 100,
        y: Math.random() * (canvas.height - 40),
        size: Math.random() * 40 + 30,
        speed: baseSpeed * (Math.random() * 0.5 + 0.8),
        rot: 0,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        vertices: vertices,
      });
    }

    // Spawn Enemy
    const enemySpawnRate = Math.max(60, 150 - level * 5);
    if (
      level >= 2 &&
      !isBossFightRef.current &&
      framesRef.current % enemySpawnRate === 0
    ) {
      enemiesRef.current.push({
        x: canvas.width + 50,
        y: Math.random() * (canvas.height - 40),
        w: 50,
        h: 40,
        speed: baseSpeed * (Math.random() * 0.4 + 0.6),
        hp: 2 + Math.floor(level / 5),
        maxHp: 2 + Math.floor(level / 5),
        lastShot: framesRef.current,
        randomSeed: Math.random() * Math.PI * 2,
        vampType: Math.random() > 0.5, // determine unpredictable movement logic
      });
    }

    // Spawn Powerups (Shield / Regen)
    if (framesRef.current % 400 === 0 && Math.random() > 0.3) {
      powerupsRef.current.push({
        type: Math.random() > 0.5 ? "SHIELD" : "REGEN",
        x: canvas.width + 50,
        y: Math.random() * (canvas.height - 40),
        speed: baseSpeed * 0.5,
        size: 20,
      });
    }

    // Boss Move
    if (isBossFightRef.current && bossRef.current.active) {
      const boss = bossRef.current;

      if (boss.dying) {
        const timer = framesRef.current - boss.deathTimer;

        // Random explosions across the boss body
        if (timer % 8 === 0) {
          const ex = boss.x + Math.random() * boss.w;
          const ey = boss.y + Math.random() * boss.h;

          // Flash for this small explosion
          particlesRef.current.push({
            x: ex,
            y: ey,
            vx: 0,
            vy: 0,
            life: 1.0,
            decay: 0.15,
            color: "#fde047",
            size: Math.random() * 30 + 20,
            glow: true,
          });

          for (let i = 0; i < 15; i++) {
            particlesRef.current.push({
              x: ex,
              y: ey,
              vx: (Math.random() - 0.5) * 12,
              vy: (Math.random() - 0.5) * 12,
              life: 1.0,
              color: ["#ef4444", "#fb923c", "#fcd34d", "#ffffff"][
                Math.floor(Math.random() * 4)
              ],
              size: Math.random() * 8 + 2,
              glow: true,
            });
          }
          SoundFX.hit();
        }

        // Violent shaking
        boss.x += (Math.random() - 0.5) * 8;
        boss.y += (Math.random() - 0.5) * 8 + 0.5; // slowly fall

        if (timer === 150) {
          // 2.5 seconds of explosions
          // Final huge explosion
          const cx = boss.x + boss.w / 2;
          const cy = boss.y + boss.h / 2;

          // 1. Huge center flash
          particlesRef.current.push({
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            life: 1.0,
            decay: 0.05,
            color: "#ffffff",
            size: 300,
            glow: true,
          });

          // 2. Fast shockwave / sparks
          for (let i = 0; i < 100; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 25 + 10;
            particlesRef.current.push({
              x: cx,
              y: cy,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              life: 1.0,
              decay: 0.02 + Math.random() * 0.03,
              color: ["#fef08a", "#fde047", "#ffffff"][
                Math.floor(Math.random() * 3)
              ],
              size: Math.random() * 4 + 2,
              glow: true,
            });
          }

          // 3. Debris chunks
          for (let i = 0; i < 40; i++) {
            particlesRef.current.push({
              x: cx + (Math.random() - 0.5) * 50,
              y: cy + (Math.random() - 0.5) * 50,
              vx: (Math.random() - 0.5) * 15,
              vy: (Math.random() - 0.5) * 15,
              life: 2.0,
              decay: 0.01,
              color: ["#475569", "#334155", "#1e293b", "#0f172a"][
                Math.floor(Math.random() * 4)
              ],
              size: Math.random() * 16 + 6,
            });
          }

          // 4. Large fireballs/plasma
          for (let i = 0; i < 60; i++) {
            particlesRef.current.push({
              x: cx + (Math.random() - 0.5) * 40,
              y: cy + (Math.random() - 0.5) * 40,
              vx: (Math.random() - 0.5) * 10,
              vy: (Math.random() - 0.5) * 10,
              life: 1.5,
              decay: 0.02 + Math.random() * 0.02,
              color: ["#ef4444", "#f97316", "#f59e0b", "#ec4899", "#d946ef"][
                Math.floor(Math.random() * 5)
              ],
              size: Math.random() * 25 + 10,
              glow: true,
            });
          }

          SoundFX.bossExplosionPhase1(); // big boom
          boss.explodingDone = true;
        }

        if (timer > 250) {
          SoundFX.victory();
          const finalMeters = Math.floor(distanceRef.current / 10);
          onVictory(finalMeters, 50);
          cancelAnimationFrame(requestRef.current);
          return;
        }
      } else if (boss.transitioningPhase3) {
        boss.y -= 2; // hover slightly up
        boss.x += (Math.random() - 0.5) * 10; // jitter

        // Spawn continuous debris for phase 3 transition
        if (framesRef.current % 2 === 0) {
          particlesRef.current.push({
            x: boss.x + Math.random() * boss.w,
            y: boss.y + Math.random() * boss.h,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8 - 2,
            life: 1.0,
            decay: 0.03,
            color: ["#10b981", "#3b82f6", "#ffffff"][
              Math.floor(Math.random() * 3)
            ],
            size: Math.random() * 6 + 3,
          });
        }

        if (framesRef.current - boss.transitionTimer > 180) {
          boss.transitioningPhase3 = false;
          boss.phase = 3;
          boss.hp = boss.maxHp * 1.5; // 50% more than phase 2
          boss.maxHp = boss.hp;
          setBossMaxHp(boss.hp);
          setShowCriticalTip(true);
          setTimeout(() => setShowCriticalTip(false), 5000);
        }
      } else if (boss.transitioning) {
        boss.y -= 5; // fly out of screen
        boss.x += 1;

        // Spawn continuous debris
        if (framesRef.current % 3 === 0) {
          particlesRef.current.push({
            x: boss.x + Math.random() * boss.w,
            y: boss.y + Math.random() * boss.h,
            vx: (Math.random() - 0.5) * 5,
            vy: Math.random() * 5 + 5,
            life: 1.0,
            decay: 0.02,
            color: ["#475569", "#ef4444", "#fb923c"][
              Math.floor(Math.random() * 3)
            ],
            size: Math.random() * 6 + 2,
          });
        }

        // Geser pesawat player ke kiri secara perlahan agar lebih mudah menghindar di phase 2
        if (ship.x > 100) {
          ship.x -= (ship.x - 100) * 0.05;
        }

        if (framesRef.current - boss.transitionTimer > 180) {
          // 3 seconds at 60 FPS
          boss.transitioning = false;
          boss.phase = 2;
          boss.hp = boss.maxHp * 1.5;
          boss.maxHp = boss.hp;
          setBossMaxHp(boss.maxHp);
          boss.w *= 0.5;
          boss.h *= 0.5;
          boss.x = canvas.width + 100;
          boss.y = window.innerHeight / 2 - boss.h / 2;
          setShowCriticalTip(true);
          setTimeout(() => setShowCriticalTip(false), 5000);
        }
      } else if (boss.stunned) {
        if (framesRef.current - boss.stunTimer > 60) {
          boss.stunned = false;
        } else {
          boss.lastShot++;
          if (boss.chargingAttack) boss.chargeTimer++;
          boss.x += (Math.random() - 0.5) * 4;
          boss.y += (Math.random() - 0.5) * 4;
          if (framesRef.current % 2 === 0) {
            particlesRef.current.push({
              x: boss.x + boss.w * 0.1 + Math.random() * 20,
              y: boss.y + boss.h * 0.3 + Math.random() * 20,
              vx: -2 + Math.random() * 4,
              vy: -2 + Math.random() * 4,
              life: 1.0,
              decay: 0.05,
              color: "#9ca3af",
              size: Math.random() * 6 + 4,
            });
          }
        }
      } else {
        boss.angle += 0.05;
        if (boss.phase === 1) {
          if (boss.x < 50) boss.x += 1;
        } else {
          // Phase 2/3 comes in differently from the right
          if (boss.x > window.innerWidth - boss.w - 50) boss.x -= 3;
        }

        const hoverOffset = Math.sin(boss.angle) * (boss.phase >= 2 ? 4 : 2);
        const targetY = ship.y - boss.h / 2;
        const dy = targetY - boss.y;
        boss.vy = dy * (boss.phase >= 2 ? 0.04 : 0.02);

        if (boss.chargingAttack) {
          // Charging: move slower and jitter
          boss.y += boss.vy * 0.2 + (Math.random() - 0.5) * 8;

          const chargeDuration = boss.phase === 3 ? 90 : 60; // Longer charge for Phase 3

          if (framesRef.current - boss.chargeTimer > chargeDuration) {
            // Fire spread
            boss.chargingAttack = false;
            boss.lastShot = framesRef.current;

            if (boss.phase === 3) {
              // Conical pattern of smaller, faster projectiles
              const numProjectiles = 15;
              const spreadAngle = Math.PI / 3; // 60 degrees spread
              const centerAngle = Math.atan2(
                ship.y - (boss.y + boss.h / 2),
                ship.x - (boss.x + boss.w / 2),
              );

              for (let i = 0; i < numProjectiles; i++) {
                const angleOffset =
                  numProjectiles > 1
                    ? (i / (numProjectiles - 1) - 0.5) * spreadAngle
                    : 0;
                const angle = centerAngle + angleOffset;
                lasersRef.current.push({
                  type: "BOSS",
                  x: boss.x + boss.w / 2,
                  y: boss.y + boss.h / 2,
                  vx: Math.cos(angle) * 25, // faster
                  vy: Math.sin(angle) * 25,
                  w: 12, // smaller
                  h: 4,
                  color: "#06b6d4", // Cyan
                });
              }
              SoundFX.bossMegaLaser();
            } else {
              const spreadAngle = Math.PI / 4;
              const centerAngle = Math.atan2(
                ship.y - (boss.y + boss.h / 2),
                ship.x - (boss.x + boss.w / 2),
              );
              for (let i = -3; i <= 3; i++) {
                const angleOffset = (i / 3) * (spreadAngle / 2);
                const angle = centerAngle + angleOffset;
                lasersRef.current.push({
                  type: "BOSS",
                  x: boss.x + boss.w / 2,
                  y: boss.y + boss.h / 2,
                  vx: Math.cos(angle) * 18,
                  vy: Math.sin(angle) * 18,
                  w: 24,
                  h: 8,
                  color: "#10b981", // Emerald color for big attack
                });
              }
              SoundFX.bossMegaLaser();
            }
          } else {
            // Visual effect during charge
            if (framesRef.current % 2 === 0) {
              if (boss.phase === 3) {
                // Suck-in effect: spawn further away, point velocity to center
                const cx = boss.x + boss.w / 2;
                const cy = boss.y + boss.h / 2;
                const dist = 60 + Math.random() * 40;
                const angle = Math.random() * Math.PI * 2;
                const px = cx + Math.cos(angle) * dist;
                const py = cy + Math.sin(angle) * dist;

                particlesRef.current.push({
                  x: px,
                  y: py,
                  vx: (cx - px) * 0.1, // towards center
                  vy: (cy - py) * 0.1,
                  life: 1.0,
                  decay: 0.05,
                  color: "#06b6d4",
                  size: Math.random() * 8 + 3,
                  glow: true,
                });
              } else {
                particlesRef.current.push({
                  x: boss.x + boss.w / 2 - 20,
                  y: boss.y + boss.h / 2 + (Math.random() - 0.5) * 40,
                  vx: (Math.random() - 0.5) * 4 - 4,
                  vy: (Math.random() - 0.5) * 4,
                  life: 0.8,
                  color: "#10b981",
                  size: Math.random() * 6 + 2,
                });
              }
            }
          }
        } else {
          boss.y += boss.vy + hoverOffset * (boss.phase >= 2 ? 0.3 : 0.1);

          const bossFireRate = Math.max(
            boss.phase >= 2 ? 15 : 20,
            (boss.phase >= 2 ? 40 : 60) - Math.floor(level * 0.5),
          );
          if (framesRef.current - boss.lastShot > bossFireRate) {
            if (boss.phase >= 2 && Math.random() < 0.25) {
              boss.chargingAttack = true;
              boss.chargeTimer = framesRef.current;
              SoundFX.bossCharge();
            } else {
              boss.lastShot = framesRef.current;

              if (boss.phase === 3) {
                // Homing/Direct target laser for Phase 3
                const angleToShip = Math.atan2(
                  ship.y - (boss.y + boss.h / 2),
                  ship.x - (boss.x + boss.w / 2),
                );
                lasersRef.current.push({
                  type: "BOSS",
                  x: boss.x + boss.w / 2,
                  y: boss.y + boss.h / 2,
                  vx: Math.cos(angleToShip) * 18,
                  vy: Math.sin(angleToShip) * 18,
                  w: 40,
                  h: 8,
                  color: "#fcd34d", // Golden laser
                });
                // Small spread as well
                for (let i = -1; i <= 1; i += 2) {
                  lasersRef.current.push({
                    type: "BOSS",
                    x: boss.x + boss.w / 2,
                    y: boss.y + boss.h / 2 + i * 20,
                    vx: Math.cos(angleToShip + i * 0.2) * 12,
                    vy: Math.sin(angleToShip + i * 0.2) * 12,
                    w: 20,
                    h: 5,
                    color: "#d946ef",
                  });
                }
                SoundFX.laser();
              } else if (boss.phase === 2) {
                // Multi-shot for phase 2
                for (let i = -1; i <= 1; i++) {
                  lasersRef.current.push({
                    type: "BOSS",
                    x: boss.x + boss.w / 2,
                    y: boss.y + boss.h / 2 + i * 20,
                    vx: boss.phase >= 2 ? -15 : 12,
                    vy: (ship.y - (boss.y + boss.h / 2)) * 0.02 + i * 3,
                    w: 30,
                    h: 6,
                    color: "#d946ef",
                  });
                }
                SoundFX.laser();
              } else {
                lasersRef.current.push({
                  type: "BOSS",
                  x: boss.x + boss.w - 40,
                  y: boss.y + boss.h / 2,
                  vx: 12,
                  vy: (ship.y - (boss.y + boss.h / 2)) * 0.015,
                  w: 30,
                  h: 6,
                  color: "#ef4444",
                });
                SoundFX.laser();
              }
            }
          }
        }
      }
    }

    // Update Entities & Collisions
    const shipBox = {
      x: ship.x + 10,
      y: ship.y + 10,
      w: ship.w - 20,
      h: ship.h - 20,
    }; // adjusted hit box

    const spawnDustParticles = (x: number, y: number) => {
      for (let i = 0; i < 15; i++) {
        particlesRef.current.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 8,
          vy: (Math.random() - 0.5) * 8,
          life: 1.0,
          size: Math.random() * 3 + 1,
          color: "#9ca3af", // gray-400
        });
      }
    };

    for (let i = meteorsRef.current.length - 1; i >= 0; i--) {
      const m = meteorsRef.current[i];
      m.x -= m.speed;
      m.rot += m.rotSpeed;
      if (rectIntersect(shipBox, { x: m.x, y: m.y, w: m.size, h: m.size })) {
        spawnDustParticles(m.x + m.size / 2, m.y + m.size / 2);
        meteorsRef.current.splice(i, 1);
        if (takeDamage(20, m.x + m.size / 2, m.y + m.size / 2)) return;
        continue;
      }
      if (isBossFightRef.current && bossRef.current.active) {
        const bossBox = {
          x: bossRef.current.x,
          y: bossRef.current.y,
          w: bossRef.current.w,
          h: bossRef.current.h,
        };
        const weakBox = {
          x: bossRef.current.x,
          y: bossRef.current.y + bossRef.current.h * 0.3,
          w: bossRef.current.w * 0.2,
          h: bossRef.current.h * 0.4,
        };
        // During transition to phase 2, don't take damage or register hits (since it flew out)
        if (
          !bossRef.current.transitioning &&
          !bossRef.current.transitioningPhase3 &&
          !bossRef.current.dying &&
          rectIntersect(bossBox, { x: m.x, y: m.y, w: m.size, h: m.size })
        ) {
          spawnDustParticles(m.x + m.size / 2, m.y + m.size / 2);

          if (
            rectIntersect(weakBox, { x: m.x, y: m.y, w: m.size, h: m.size })
          ) {
            const baseDamage = (300 + level * 50) * 0.45; // 3x damage
            bossRef.current.hp -= baseDamage;
            bossRef.current.stunned = true;
            bossRef.current.stunTimer = framesRef.current;
            // Big visual indicator
            for (let j = 0; j < 15; j++) {
              particlesRef.current.push({
                x: m.x,
                y: m.y,
                vx: (Math.random() - 0.5) * 15,
                vy: (Math.random() - 0.5) * 15,
                life: 1.0,
                decay: 0.05,
                color: "#fcd34d",
                glow: true,
                size: Math.random() * 5 + 3,
              });
            }
            SoundFX.hit(); // could be a crit sound
          } else {
            const baseDamage = (300 + level * 50) * 0.15;
            bossRef.current.hp -= baseDamage;
            SoundFX.hit();
          }

          meteorsRef.current.splice(i, 1);
          continue;
        }
      }
      if (m.x + m.size < -100) meteorsRef.current.splice(i, 1);
    }

    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const e = enemiesRef.current[i];
      e.x -= e.speed;
      if (e.vampType) {
        e.y += Math.sin(framesRef.current * 0.05 + e.randomSeed) * 3;
      } else {
        const dy = ship.y - e.y;
        e.y += dy * 0.01;
      }

      const fireRate = Math.max(40, 100 - level * 2);
      if (framesRef.current - e.lastShot > fireRate) {
        e.lastShot = framesRef.current;
        lasersRef.current.push({
          type: "NORMAL",
          x: e.x,
          y: e.y + e.h / 2,
          vx: -10,
          vy: (ship.y - e.y) * 0.005,
          w: 20,
          h: 4,
          color: "#fbbf24",
        });
        SoundFX.laser();
      }
      if (rectIntersect(shipBox, { x: e.x, y: e.y, w: e.w, h: e.h })) {
        enemiesRef.current.splice(i, 1);
        if (takeDamage(25, e.x + e.w / 2, e.y + e.h / 2)) return;
        continue;
      }
      if (e.x + e.w < -50) enemiesRef.current.splice(i, 1);
    }

    for (let i = lasersRef.current.length - 1; i >= 0; i--) {
      const l = lasersRef.current[i];
      l.x += l.vx;
      l.y += l.vy;

      if (l.type === "PLAYER") {
        if (
          isBossFightRef.current &&
          bossRef.current.active &&
          !bossRef.current.dying &&
          !bossRef.current.transitioning
        ) {
          const bossBox = {
            x: bossRef.current.x,
            y: bossRef.current.y,
            w: bossRef.current.w,
            h: bossRef.current.h,
          };
          const weakBox = {
            x: bossRef.current.x,
            y: bossRef.current.y + bossRef.current.h * 0.3,
            w: bossRef.current.w * 0.2,
            h: bossRef.current.h * 0.4,
          };

          if (rectIntersect({ x: l.x, y: l.y, w: l.w, h: l.h }, weakBox)) {
            lasersRef.current.splice(i, 1);
            const dmg = (300 + level * 50) * 0.1; // 10% damage
            bossRef.current.hp -= dmg;
            bossRef.current.stunned = true;
            bossRef.current.stunTimer = framesRef.current;
            for (let j = 0; j < 5; j++) {
              particlesRef.current.push({
                x: l.x + l.w,
                y: l.y + l.h / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                decay: 0.1,
                color: "#fcd34d",
                glow: true,
                size: Math.random() * 3 + 2,
              });
            }
            SoundFX.hit();
            continue;
          } else if (
            rectIntersect({ x: l.x, y: l.y, w: l.w, h: l.h }, bossBox)
          ) {
            lasersRef.current.splice(i, 1);
            bossRef.current.hp -= (300 + level * 50) * 0.02; // Normal damage
            SoundFX.hit();
            continue;
          }
        }
      } else {
        if (rectIntersect(shipBox, { x: l.x, y: l.y, w: l.w, h: l.h })) {
          lasersRef.current.splice(i, 1);
          if (takeDamage(15, l.x + l.w / 2, l.y + l.h / 2)) return;
          continue;
        }
      }

      if (l.x > canvas.width + 100 || l.x < -100)
        lasersRef.current.splice(i, 1);
    }

    for (let i = powerupsRef.current.length - 1; i >= 0; i--) {
      const p = powerupsRef.current[i];
      p.x -= p.speed;
      if (rectIntersect(shipBox, { x: p.x, y: p.y, w: p.size, h: p.size })) {
        if (p.type === "SHIELD") {
          ship.shield = 2;
        } else if (p.type === "REGEN") {
          ship.hp = Math.min(ship.maxHp, ship.hp + ship.maxHp * 0.6);
        }
        SoundFX.powerup();
        powerupsRef.current.splice(i, 1);
        continue;
      }
      if (p.x + p.size < -50) powerupsRef.current.splice(i, 1);
    }

    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay || 0.05;
      if (p.life <= 0) particlesRef.current.splice(i, 1);
    }
  };

  const rectIntersect = (r1: any, r2: any) =>
    !(
      r2.x > r1.x + r1.w ||
      r2.x + r2.w < r1.x ||
      r2.y > r1.y + r1.h ||
      r2.y + r2.h < r1.y
    );

  // --- DRAWING WITH PURE CANVAS ---
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background Space Colors
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    let shakeX = 0;
    let shakeY = 0;
    if (isBossFightRef.current && bossRef.current.active) {
      if (bossRef.current.dying) {
        shakeX = (Math.random() - 0.5) * 15;
        shakeY = (Math.random() - 0.5) * 15;
      } else if (bossRef.current.transitioningPhase3) {
        shakeX = (Math.random() - 0.5) * 8;
        shakeY = (Math.random() - 0.5) * 8;
      } else if (bossRef.current.transitioning) {
        shakeX = (Math.random() - 0.5) * 5;
        shakeY = (Math.random() - 0.5) * 5;
      } else if (
        bossRef.current.stunned &&
        framesRef.current - bossRef.current.stunTimer < 10
      ) {
        shakeX = (Math.random() - 0.5) * 12;
        shakeY = (Math.random() - 0.5) * 12;
      }
    }
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.translate(shakeX, shakeY);
    }

    if (
      isBossFightRef.current &&
      bossRef.current.stunned &&
      framesRef.current - bossRef.current.stunTimer < 5
    ) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
      ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);
    }

    // Parallax Stars
    bgRef.current.stars.forEach((s) => {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
    });

    // Parallax Planets
    bgRef.current.planets.forEach((p) => {
      ctx.save();
      // Planet Atmosphere Glow
      const gradient = ctx.createRadialGradient(
        p.x,
        p.y,
        p.radius * 0.8,
        p.x,
        p.y,
        p.radius * 1.2,
      );
      gradient.addColorStop(0, "rgba(255,255,255,0.1)");
      gradient.addColorStop(1, "transparent");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // Planet Base Body
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.clip(); // Clip inner content to the circle

      // Planet Craters
      ctx.fillStyle = p.craterColor;
      ctx.beginPath();
      ctx.arc(
        p.x - p.radius * 0.3,
        p.y - p.radius * 0.3,
        p.radius * 0.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        p.x + p.radius * 0.4,
        p.y + p.radius * 0.1,
        p.radius * 0.15,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.beginPath();
      ctx.arc(
        p.x - p.radius * 0.1,
        p.y + p.radius * 0.4,
        p.radius * 0.25,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Inner shadow for 3D sphere look
      const innerShadow = ctx.createRadialGradient(
        p.x - p.radius * 0.3,
        p.y - p.radius * 0.3,
        p.radius * 0.1,
        p.x,
        p.y,
        p.radius,
      );
      innerShadow.addColorStop(0, "rgba(255,255,255,0.2)");
      innerShadow.addColorStop(1, "rgba(0,0,0,0.6)");
      ctx.fillStyle = innerShadow;
      ctx.fillRect(p.x - p.radius, p.y - p.radius, p.radius * 2, p.radius * 2);

      ctx.restore(); // remove clip

      // Planet Rings
      if (p.hasRings) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(
          p.x,
          p.y,
          p.radius * 2.2,
          p.radius * 0.6,
          p.ringAngle || 0,
          0,
          Math.PI * 2,
        );
        ctx.lineWidth = p.radius * 0.3;
        const ringGrad = ctx.createRadialGradient(
          p.x,
          p.y,
          p.radius * 1.5,
          p.x,
          p.y,
          p.radius * 2.5,
        );
        ringGrad.addColorStop(0, "rgba(255,255,255,0)");
        ringGrad.addColorStop(0.5, p.craterColor);
        ringGrad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = ringGrad;
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore(); // restore original save
    });

    if (isBossFightRef.current && bossRef.current.active) {
      if (
        bossRef.current.transitioning ||
        bossRef.current.transitioningPhase3
      ) {
        ctx.save();
        const pulse = Math.abs(Math.sin(framesRef.current * 0.1));

        // Full screen red tint with vignette
        const grad = ctx.createRadialGradient(
          canvas.width / 2,
          canvas.height / 2,
          100,
          canvas.width / 2,
          canvas.height / 2,
          canvas.width,
        );
        grad.addColorStop(0, `rgba(220, 38, 38, ${pulse * 0.1})`);
        grad.addColorStop(1, `rgba(220, 38, 38, ${pulse * 0.5})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Warning banner background
        ctx.fillStyle = `rgba(0, 0, 0, 0.85)`;
        const bannerY = canvas.height / 2 - 100;
        const bannerH = 200;
        ctx.fillRect(0, bannerY, canvas.width, bannerH);

        // Hazard stripes
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, bannerY, canvas.width, 10);
        ctx.rect(0, bannerY + bannerH - 10, canvas.width, 10);
        ctx.clip();
        ctx.fillStyle = `rgba(239, 68, 68, ${pulse * 0.8 + 0.2})`;
        for (let i = -(framesRef.current * 2) % 40; i < canvas.width; i += 40) {
          ctx.beginPath();
          ctx.moveTo(i, bannerY - 10);
          ctx.lineTo(i + 20, bannerY - 10);
          ctx.lineTo(i - 10, bannerY + bannerH + 10);
          ctx.lineTo(i - 30, bannerY + bannerH + 10);
          ctx.fill();
        }
        ctx.restore();

        // Glitch text effect
        const textX = canvas.width / 2;
        const textY = canvas.height / 2 - 10;

        ctx.font = "900 72px Inter, monospace";
        ctx.textAlign = "center";

        // Red glitch channel
        ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
        ctx.fillText(
          "⚠ CRITICAL WARNING ⚠",
          textX - 4 + Math.random() * 8,
          textY + Math.random() * 4,
        );

        // Cyan glitch channel
        ctx.fillStyle = "rgba(6, 182, 212, 0.8)";
        ctx.fillText(
          "⚠ CRITICAL WARNING ⚠",
          textX + 4 - Math.random() * 8,
          textY - Math.random() * 4,
        );

        // Main text
        ctx.fillStyle = `rgba(255, 255, 255, 1)`;
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 30;
        ctx.fillText("⚠ CRITICAL WARNING ⚠", textX, textY);

        ctx.shadowBlur = 0;
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 28px Inter, monospace";
        ctx.letterSpacing = "4px";
        ctx.fillText(
          bossRef.current.transitioningPhase3
            ? "BOSS FINAL FORM DETECTED. BRACE YOURSELF!"
            : "BOSS SECOND FORM DETECTED. BRACE YOURSELF!",
          canvas.width / 2,
          canvas.height / 2 + 50,
        );
        ctx.letterSpacing = "0px";
        ctx.restore();
      }
      drawBoss(ctx, bossRef.current);
    }

    const currentShipColor =
      SHIP_DESIGNS.find((s) => s.id === selectedShipId)?.color || "#06b6d4";
    drawShip(ctx, shipRef.current, isThrustingRef.current, currentShipColor);

    meteorsRef.current.forEach((m) => drawMeteor(ctx, m));
    enemiesRef.current.forEach((e) => drawEnemy(ctx, e));

    // Draw Lasers
    lasersRef.current.forEach((l) => {
      ctx.shadowBlur = 15;
      ctx.shadowColor = l.color;
      ctx.fillStyle = l.color;
      ctx.fillRect(l.x, l.y, l.w, l.h);
      ctx.shadowBlur = 0; // reset
    });

    // Draw Powerups
    powerupsRef.current.forEach((p) => {
      ctx.save();
      ctx.translate(p.x + p.size / 2, p.y + p.size / 2);
      ctx.rotate(framesRef.current * 0.05);
      ctx.shadowBlur = 10;
      ctx.lineWidth = 2;
      if (p.type === "SHIELD") {
        ctx.shadowColor = "#3b82f6";
        ctx.strokeStyle = "#60a5fa";
        ctx.fillStyle = "rgba(59, 130, 246, 0.4)";
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#eff6ff";
        ctx.shadowBlur = 0;
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.rotate(-framesRef.current * 0.05);
        ctx.fillText("S", 0, 0);
      } else if (p.type === "REGEN") {
        ctx.shadowColor = "#22c55e";
        ctx.strokeStyle = "#4ade80";
        ctx.fillStyle = "rgba(34, 197, 94, 0.4)";
        ctx.beginPath();
        ctx.rect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#f0fdf4";
        ctx.shadowBlur = 0;
        ctx.font = "bold 16px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.rotate(-framesRef.current * 0.05);
        ctx.fillText("+", 0, 0);
      }
      ctx.restore();
    });

    // Draw Particles
    particlesRef.current.forEach((p) => {
      ctx.fillStyle = p.color || "white";
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size || 4, 0, Math.PI * 2);
      ctx.fill();

      // If it's a spark or something, we can add glow depending on the particle type later, but for now this is fine.
      if (p.glow) {
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1.0;
    });

    ctx.restore();
  };

  // Custom Ship Drawing function
  const drawShip = (
    ctx: CanvasRenderingContext2D,
    ship: any,
    isThrusting: boolean,
    color: string,
  ) => {
    ctx.save();
    // HP Bar
    if (ship.hp < ship.maxHp) {
      ctx.fillStyle = "red";
      ctx.fillRect(
        ship.x,
        ship.y - 12,
        ship.w * (Math.max(0, ship.hp) / ship.maxHp),
        4,
      );
    }

    ctx.translate(ship.x + ship.w / 2, ship.y + ship.h / 2);
    const tilt = Math.min(Math.max(ship.vy * 0.05, -0.25), 0.25);
    ctx.rotate(tilt);

    // Engine Fire Effect
    if (isThrusting) {
      // Outer flame (orange/red)
      ctx.fillStyle = "rgba(234, 88, 12, 0.7)"; // Tailwind orange-600
      ctx.beginPath();
      ctx.moveTo(-ship.w / 2, -8);
      ctx.lineTo(-ship.w / 2 - 35 - Math.random() * 25, 0);
      ctx.lineTo(-ship.w / 2, 8);
      ctx.fill();

      // Inner flame (yellow)
      ctx.fillStyle = "rgba(253, 224, 71, 0.9)"; // Tailwind yellow-300
      ctx.beginPath();
      ctx.moveTo(-ship.w / 2, -5);
      ctx.lineTo(-ship.w / 2 - 20 - Math.random() * 15, 0);
      ctx.lineTo(-ship.w / 2, 5);
      ctx.fill();

      // Core flame (white)
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(-ship.w / 2, -2);
      ctx.lineTo(-ship.w / 2 - 10 - Math.random() * 5, 0);
      ctx.lineTo(-ship.w / 2, 2);
      ctx.fill();
    }

    // Rocket Main Body Shape
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(ship.w / 2, 0);
    ctx.lineTo(-ship.w / 4, -ship.h / 2.2);
    ctx.lineTo(-ship.w / 2, -ship.h / 4);
    ctx.lineTo(-ship.w / 2.5, 0);
    ctx.lineTo(-ship.w / 2, ship.h / 4);
    ctx.lineTo(-ship.w / 4, ship.h / 2.2);
    ctx.closePath();
    ctx.fill();

    // Rocket Cockpit Window
    ctx.fillStyle = "#e0f2fe";
    ctx.beginPath();
    ctx.ellipse(ship.w / 8, 0, ship.w / 6, ship.h / 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rocket Wing Detail
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(-ship.w / 4, -ship.h / 2.2);
    ctx.lineTo(-ship.w / 8, -ship.h / 2.2 + 5);
    ctx.lineTo(-ship.w / 3, -ship.h / 4);
    ctx.fill();

    // Shield Effect
    if (ship.shield > 0) {
      ctx.strokeStyle =
        ship.shield === 2
          ? "rgba(59, 130, 246, 0.8)"
          : "rgba(59, 130, 246, 0.4)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(ship.w, ship.h) / 1.5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(59, 130, 246, 0.1)";
      ctx.fill();
    }

    ctx.restore();
  };

  // Custom Meteor Drawing function
  const drawMeteor = (ctx: CanvasRenderingContext2D, m: any) => {
    ctx.save();
    ctx.translate(m.x + m.size / 2, m.y + m.size / 2);
    ctx.rotate(m.rot);

    ctx.fillStyle = "#78716c";
    ctx.strokeStyle = "#44403c";
    ctx.lineWidth = 3;

    // Polygon Vector Rock
    ctx.beginPath();
    const numPoints = m.vertices.length;
    for (let j = 0; j < numPoints; j++) {
      const angle = (j / numPoints) * Math.PI * 2;
      const r = (m.size / 2) * m.vertices[j];
      if (j === 0) ctx.moveTo(r * Math.cos(angle), r * Math.sin(angle));
      else ctx.lineTo(r * Math.cos(angle), r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Craters on Asteroid
    ctx.fillStyle = "#57534e";
    ctx.beginPath();
    ctx.arc(-m.size / 8, -m.size / 8, m.size / 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(m.size / 6, m.size / 8, m.size / 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  };

  // Custom Boss Drawing function
  const drawBoss = (ctx: CanvasRenderingContext2D, boss: any) => {
    if (boss.explodingDone) return;

    ctx.save();
    // Boss HP Bar
    const hpPct = Math.max(0, boss.hp / boss.maxHp);
    ctx.fillStyle = "red";
    ctx.fillRect(boss.x + boss.w / 4, boss.y - 15, (boss.w / 2) * hpPct, 6);

    ctx.translate(boss.x + boss.w / 2, boss.y + boss.h / 2);
    const wobble = Math.sin(boss.angle) * 3;
    ctx.translate(0, wobble);

    // Mothership Main Body Vector
    ctx.fillStyle =
      boss.phase === 3 ? "#064e3b" : boss.phase === 2 ? "#1e1b4b" : "#312e81";
    ctx.beginPath();
    ctx.moveTo(-boss.w / 2, -boss.h / 2);
    ctx.lineTo(boss.w / 4, -boss.h / 3);
    ctx.lineTo(boss.w / 2, 0);
    ctx.lineTo(boss.w / 4, boss.h / 3);
    ctx.lineTo(-boss.w / 2, boss.h / 2);
    ctx.lineTo(-boss.w / 3, 0);
    ctx.closePath();
    ctx.fill();

    // Wing Details
    ctx.fillStyle =
      boss.phase === 3 ? "#059669" : boss.phase === 2 ? "#312e81" : "#4c1d95";
    ctx.beginPath();
    ctx.moveTo(-boss.w / 4, -boss.h / 2);
    ctx.lineTo(0, -boss.h / 4);
    ctx.lineTo(-boss.w / 2.5, -boss.h / 4);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-boss.w / 4, boss.h / 2);
    ctx.lineTo(0, boss.h / 4);
    ctx.lineTo(-boss.w / 2.5, boss.h / 4);
    ctx.fill();

    // Core Engine Glow (Weak point!)
    // If stunned, the core is erratic or red
    if (boss.stunned) {
      if (Math.floor(Date.now() / 50) % 2 === 0) {
        ctx.fillStyle = "#dc2626"; // dark red
        ctx.beginPath();
        ctx.ellipse(
          -boss.w / 2.5,
          0,
          boss.w / 10,
          boss.h / 5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();

        // Electrical arcs
        ctx.strokeStyle = "#fcd34d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(
          -boss.w / 2.5 + (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
        );
        ctx.lineTo(
          -boss.w / 2.5 + (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
        );
        ctx.stroke();
      } else {
        ctx.fillStyle = "#fee2e2"; // very pale red
        ctx.beginPath();
        ctx.ellipse(
          -boss.w / 2.5,
          0,
          boss.w / 10,
          boss.h / 5,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      ctx.fillStyle = boss.phase === 3 ? "#34d399" : "#ec4899";
      ctx.beginPath();
      ctx.ellipse(-boss.w / 2.5, 0, boss.w / 10, boss.h / 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = boss.phase === 3 ? "#a7f3d0" : "#fbcfe8";
      ctx.beginPath();
      ctx.ellipse(
        -boss.w / 2.5,
        0,
        boss.w / 20,
        boss.h / 10,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      // Target Reticle around Weak Point sometimes to indicate it is vulnerable
      if (framesRef.current % 120 < 20 && !boss.chargingAttack) {
        ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(
          -boss.w / 2.5,
          0,
          boss.w / 8 + Math.sin(framesRef.current * 0.5) * 5,
          0,
          Math.PI * 2,
        );
        ctx.stroke();

        ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
        ctx.font = "bold 10px monospace";
        ctx.fillText("CRITICAL", -boss.w / 2.5 - 25, -boss.h / 4);
      }
    }

    // Laser Cannon Front Muzzle
    ctx.fillStyle = boss.phase === 3 ? "#fcd34d" : "#ef4444";
    ctx.fillRect(boss.w / 2.2, -5, 20, 10);

    // Telegraphing Laser Aim
    if (boss.chargingAttack && (boss.phase === 2 || boss.phase === 3)) {
      const chargeDuration = boss.phase === 3 ? 90 : 60;
      const progress = Math.min(
        1,
        (framesRef.current - boss.chargeTimer) / chargeDuration,
      );

      const ship = shipRef.current;
      const shipTargetX = ship.x + ship.w / 2;
      const shipTargetY = ship.y + ship.h / 2;

      const muzzleLocalX = boss.w / 2.2 + 20;
      const absMuzzleX = boss.x + boss.w / 2 + muzzleLocalX;
      // Note: wobble is already applied by ctx.translate(0, wobble) above
      // But we need the absolute Y to calculate the true angle
      const absMuzzleY = boss.y + boss.h / 2 + wobble;

      const angle = Math.atan2(
        shipTargetY - absMuzzleY,
        shipTargetX - absMuzzleX,
      );

      ctx.save();
      ctx.translate(muzzleLocalX, 0); // Translate from boss center to muzzle
      ctx.rotate(angle); // Aim towards ship

      // Draw Laser Guide Beam
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(2000, 0); // Far offscreen

      ctx.lineWidth = progress * 4;
      ctx.strokeStyle =
        boss.phase === 3
          ? `rgba(252, 211, 77, ${progress * 0.4})`
          : `rgba(239, 68, 68, ${progress * 0.4})`;

      // Flicker effect
      if (framesRef.current % 4 < 2) {
        ctx.stroke();
      }
      ctx.restore();

      // Draw Target crosshair on ship
      // We are currently translated to boss center + wobble, so we calculate offset to ship
      ctx.save();
      ctx.translate(
        shipTargetX - (boss.x + boss.w / 2),
        shipTargetY - (boss.y + boss.h / 2) - wobble,
      );
      ctx.rotate(framesRef.current * 0.1);

      ctx.strokeStyle = boss.phase === 3 ? "#fcd34d" : "#ef4444";
      ctx.lineWidth = 2;
      const size = 30 - progress * 15; // shrinks linearly

      ctx.beginPath();
      ctx.moveTo(-size, -size);
      ctx.lineTo(-size / 2, -size);
      ctx.moveTo(-size, -size);
      ctx.lineTo(-size, -size / 2);
      ctx.moveTo(size, -size);
      ctx.lineTo(size / 2, -size);
      ctx.moveTo(size, -size);
      ctx.lineTo(size, -size / 2);
      ctx.moveTo(-size, size);
      ctx.lineTo(-size / 2, size);
      ctx.moveTo(-size, size);
      ctx.lineTo(-size, size / 2);
      ctx.moveTo(size, size);
      ctx.lineTo(size / 2, size);
      ctx.moveTo(size, size);
      ctx.lineTo(size, size / 2);
      ctx.stroke();

      ctx.fillStyle =
        boss.phase === 3
          ? `rgba(252, 211, 77, ${0.2 * progress})`
          : `rgba(239, 68, 68, ${0.2 * progress})`;
      ctx.beginPath();
      ctx.arc(0, 0, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  };

  // Custom Enemy Drawing function
  const drawEnemy = (ctx: CanvasRenderingContext2D, e: any) => {
    ctx.save();
    if (e.hp > 1) {
      ctx.fillStyle = "white";
      ctx.fillRect(e.x, e.y - 8, e.w * (e.hp / e.maxHp), 3);
    }
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);

    // UFO Cockpit Dome
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    ctx.arc(0, -e.h / 8, e.w / 3.5, Math.PI, 0);
    ctx.fill();

    // UFO Base Ship
    ctx.fillStyle = "#475569";
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w / 2, e.h / 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, e.w / 2, e.h / 3.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Glowing LED indicators
    ctx.fillStyle =
      Math.floor(Date.now() / 200) % 2 === 0 ? "#facc15" : "#ef4444";
    ctx.beginPath();
    ctx.arc(-e.w / 3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, e.h / 6, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.w / 3, 0, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Prevent default scrolling on canvas
  const preventDefault = (e: any) => {
    e.preventDefault();
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 0,
          width: "100%",
          height: "100%",
          touchAction: "none",
        }}
        // We use passive: false in event listeners setup inside useEffect
      />

      <div className="game-hud">
        <div className="hud-left">
          <div
            className="hud-dist"
            style={{ color: bossActive ? "#ef4444" : "#22d3ee" }}
          >
            {!bossActive ? (
              <>
                <span style={{ fontFamily: "monospace" }}>{hudDistance}</span>m
              </>
            ) : (
              <span className="anim-pulse">BOSS DETECTED</span>
            )}
          </div>
          <div className={`progress-bg`}>
            <div
              className="progress-fill"
              style={{
                background: bossActive ? "#ef4444" : "#06b6d4",
                width: bossActive
                  ? `${Math.max(0, (bossHp / bossMaxHp) * 100)}%`
                  : `${Math.min(100, (hudDistance / TARGET_DISTANCE) * 100)}%`,
              }}
            />
          </div>
          {bossActive && showCriticalTip && (
            <div className="mt-1 text-xs font-bold text-center text-amber-400 tracking-wider">
              TARGET CRITICAL: MESIN PESAWAT MUSUH
            </div>
          )}
        </div>
        {!isPaused && countdown === 0 && (
          <button onClick={() => setIsPaused(true)} className="btn-pause z-50">
            <Pause size={24} fill="currentColor" />
          </button>
        )}
      </div>

      {countdown > 0 && !isPaused && (
        <div className="countdown-text anim-bounce">{countdown}</div>
      )}

      {countdown === 0 && !isPaused && (
        <div className="hint text-center">Click or press SPACE to thrust</div>
      )}

      {isPaused && (
        <div className="modal-overlay anim-fade z-50">
          <div className="modal-box" style={{ background: "#0f172a" }}>
            <h2
              style={{
                fontSize: "2rem",
                color: "white",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              PAUSED
            </h2>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <button
                onClick={() => {
                  setCountdown(3);
                  setIsPaused(false);
                }}
                className="btn btn-play"
              >
                RESUME
              </button>
              <button onClick={onSettings} className="btn btn-levels">
                AUDIO SETTINGS
              </button>
              <button onClick={onExit} className="btn btn-exit">
                MENU
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// 7. App Root
export default function App() {
  const [screen, setScreen] = useState("MENU");
  const [level, setLevel] = useState(1);
  const [lastDistance, setLastDistance] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [coins, setCoins] = useState(100); // give some starting coins
  const [unlockedShips, setUnlockedShips] = useState(["default"]);
  const [selectedShipId, setSelectedShipId] = useState("default");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    // Try to start music based on screen type.
    if (screen === "PLAYING") {
      SoundFX.startMusic(level % 10 === 0 ? "boss" : "game");
    } else {
      SoundFX.startMusic("menu");
    }
  }, [screen, level]);

  useEffect(() => {
    const handleFirstInteraction = async () => {
      const ctx = SoundFX.init();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      if (ctx.state === "running") {
        if (screen !== "PLAYING") {
          SoundFX.startMusic("menu");
        } else {
          SoundFX.startMusic(level % 10 === 0 ? "boss" : "game");
        }
        window.removeEventListener("click", handleFirstInteraction);
        window.removeEventListener("keydown", handleFirstInteraction);
      }
    };
    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
    };
  }, [screen]);

  return (
    <>
      {screen === "MENU" && (
        <MainMenu
          coins={coins}
          onPlay={() => {
            SoundFX.init();
            setLevel(1);
            setScreen("PLAYING");
          }}
          onLevels={() => setScreen("LEVELS")}
          onShop={() => setScreen("SHOP")}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {screen === "SHOP" && (
        <Shop
          coins={coins}
          unlockedShips={unlockedShips}
          selectedShipId={selectedShipId}
          onBuy={(id: string, cost: number) => {
            if (coins >= cost) {
              setCoins((c) => c - cost);
              setUnlockedShips((s) => [...s, id]);
            }
          }}
          onSelect={(id: string) => setSelectedShipId(id)}
          onBack={() => setScreen("MENU")}
        />
      )}
      {screen === "LEVELS" && (
        <LevelSelect
          onBack={() => setScreen("MENU")}
          onSelectLevel={(lvl: number) => {
            SoundFX.init();
            setLevel(lvl);
            setScreen("PLAYING");
          }}
        />
      )}
      {screen === "PLAYING" && (
        <GameLoop
          level={level}
          selectedShipId={selectedShipId}
          onGameOver={(dist: number) => {
            setLastDistance(dist);
            setScreen("GAMEOVER");
          }}
          onVictory={(dist: number, rwd: number) => {
            setLastDistance(dist);
            setCoinsEarned(rwd);
            setCoins((c) => c + rwd);
            setScreen("VICTORY");
          }}
          onExit={() => setScreen("MENU")}
          onSettings={() => setShowSettings(true)}
        />
      )}
      {screen === "GAMEOVER" && (
        <GameOverModal
          distance={lastDistance}
          level={level}
          onRetry={() => {
            SoundFX.init();
            setScreen("PLAYING");
          }}
          onMenu={() => setScreen("MENU")}
        />
      )}
      {screen === "VICTORY" && (
        <VictoryModal
          level={level}
          coinsEarned={coinsEarned}
          onNextLevel={() => {
            SoundFX.init();
            if (level < 30) {
              setLevel((l) => l + 1);
              setScreen("PLAYING");
            } else setScreen("MENU");
          }}
          onReplay={() => {
            SoundFX.init();
            setScreen("PLAYING");
          }}
          onMenu={() => setScreen("MENU")}
          isLastLevel={level === 30}
        />
      )}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}

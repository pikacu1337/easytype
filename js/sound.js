// Звуки синтезируются через Web Audio — никаких аудиофайлов не нужно.
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let profile = 'mech', volume = 0.5;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.random() * list.length | 0];

  // Контекст можно создать только после жеста пользователя, поэтому лениво
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      // Общий срез верхов убирает резкость у всех пресетов сразу
      const soften = ctx.createBiquadFilter();
      soften.type = 'lowpass';
      soften.frequency.value = 6500;
      soften.Q.value = 0.5;
      const comp = ctx.createDynamicsCompressor();
      master.connect(soften).connect(comp).connect(ctx.destination);

      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = volume;
    return true;
  }

  // Плавная атака вместо мгновенного скачка — без неё каждый звук начинается со щелчка
  function envelope(amp, t, gain, dur, attack) {
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(gain, t + attack);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
  }

  // Короткий всплеск отфильтрованного шума — «щелчок» клавиши
  function noise(type, freq, dur, gain, { delay = 0, q = 1, attack = 0.002 } = {}) {
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = noiseBuf;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    envelope(amp, t, gain, dur, attack);
    src.connect(filter).connect(amp).connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.02);
  }

  // Тон со скольжением частоты — «тело» удара или нота
  function tone(wave, from, to, dur, gain, { delay = 0, attack = 0.004 } = {}) {
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    envelope(amp, t, gain, dur, attack);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // kind: 'key' | 'space' | 'back'. Пробел везде ниже и глуше обычной клавиши.
  const PROFILES = {
    mech(kind) {
      const low = kind === 'space', v = rnd(0.93, 1.07);
      noise('bandpass', (low ? 1200 : kind === 'back' ? 1900 : 2400) * v, 0.03, 0.45, { q: 1.2 });
      tone('sine', (low ? 130 : 190) * v, low ? 65 : 95, 0.06, 0.3);
    },
    soft(kind) {
      const low = kind === 'space', v = rnd(0.9, 1.1);
      noise('lowpass', (low ? 500 : 800) * v, 0.06, 0.45);
      tone('sine', (low ? 115 : 160) * v, 75, 0.07, 0.26);
    },
    thock(kind) {
      const low = kind === 'space', v = rnd(0.94, 1.06);
      noise('lowpass', 350, 0.05, 0.45);
      tone('sine', (low ? 95 : 130) * v, low ? 45 : 55, 0.09, 0.5);
    },
    wood(kind) {
      const f = (kind === 'space' ? 420 : kind === 'back' ? 520 : 620) * rnd(0.96, 1.04);
      noise('bandpass', f * 1.8, 0.03, 0.3, { q: 6 });
      tone('triangle', f, f * 0.9, 0.06, 0.3);
    },
    typewriter(kind) {
      const v = rnd(0.94, 1.06);
      if (kind === 'space') {
        noise('lowpass', 450, 0.1, 0.5);
        tone('sine', 90, 50, 0.1, 0.3);
        return;
      }
      noise('bandpass', 1900 * v, 0.025, 0.5);
      noise('bandpass', 600 * v, 0.08, 0.35, { delay: 0.012, q: 2 });
      tone('triangle', 1100 * v, 700, 0.03, 0.06);
    },
    pop(kind) {
      const base = kind === 'space' ? 380 : kind === 'back' ? 520 : rnd(640, 820);
      tone('sine', base, base * 0.35, 0.09, 0.32);
    },
    bubble(kind) {
      const base = (kind === 'space' ? 200 : kind === 'back' ? 240 : 290) * rnd(0.92, 1.08);
      tone('sine', base, base * 2.1, 0.08, 0.28, { attack: 0.008 });
    },
    glass(kind) {
      const f = kind === 'space' ? 880 : kind === 'back' ? 990 : pick([1175, 1320, 1480, 1760]);
      tone('sine', f, f, 0.22, 0.12, { attack: 0.002 });
      tone('sine', f * 2.76, f * 2.76, 0.1, 0.035, { attack: 0.002 });
    },
    notes(kind) {
      const f = kind === 'space' ? 196 : kind === 'back' ? 220 : pick([262, 294, 330, 392, 440, 523]);
      tone('sine', f, f, 0.2, 0.24);
      tone('sine', f * 4, f * 4, 0.04, 0.05);
    },
    retro(kind) {
      const f = kind === 'space' ? 220 : kind === 'back' ? 196 : pick([330, 392, 440, 523]);
      tone('square', f, f, 0.05, 0.06);
    },
    whisper(kind) {
      const low = kind === 'space';
      noise('bandpass', (low ? 900 : 1500) * rnd(0.9, 1.1), 0.06, 0.24, { q: 0.7, attack: 0.008 });
    },
  };

  function play(kind) {
    if (profile === 'off' || !PROFILES[profile] || !ensure()) return;
    if (kind === 'error') tone('sine', 140, 90, 0.12, 0.35);
    else PROFILES[profile](kind);
  }

  function set(nextProfile, nextVolume) {
    profile = nextProfile;
    volume = nextVolume;
    if (master) master.gain.value = volume;
  }

  return { play, set, has: name => name === 'off' || name in PROFILES };
})();

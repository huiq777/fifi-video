"""Tiny synthesis toolkit: every sound in the film is computed here (numpy/scipy only, no samples)."""
import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 48000
TAU = 2 * np.pi
_rng = np.random.default_rng(20261110)


def midi(n):
    return 440.0 * 2.0 ** ((np.asarray(n, dtype=float) - 69.0) / 12.0)


def db(x):
    return 10.0 ** (x / 20.0)


def n_of(dur):
    return int(round(dur * SR))


def tt(n):
    return np.arange(n) / SR


# ---------------------------------------------------------------- envelopes / filters
def adsr(n, a=0.005, d=0.1, s=0.7, r=0.1):
    """n = total samples (including release)."""
    na, nd, nr = max(1, n_of(a)), max(1, n_of(d)), max(1, n_of(r))
    ns = max(0, n - na - nd - nr)
    env = np.concatenate([np.linspace(0, 1, na, endpoint=False), s + (1 - s) * np.exp(-np.linspace(0, 5, nd)),
                          np.full(ns, s), s * np.linspace(1, 0, nr) ** 1.6])
    if len(env) < n:
        env = np.pad(env, (0, n - len(env)))
    return env[:n]


def fade(x, a=0.005, r=0.02):
    x = x.copy(); na, nr = min(len(x), n_of(a)), min(len(x), n_of(r))
    if na: x[:na] = (x[:na].T * np.linspace(0, 1, na)).T
    if nr: x[-nr:] = (x[-nr:].T * np.linspace(1, 0, nr)).T
    return x


def _sos(kind, fc, order=2):
    fc = np.clip(np.asarray(fc, dtype=float), 12.0, SR * 0.47)
    return signal.butter(order, fc / (SR / 2), kind, output='sos')


def lp(x, fc, order=2): return signal.sosfilt(_sos('low', fc, order), x, axis=0)
def hp(x, fc, order=2): return signal.sosfilt(_sos('high', fc, order), x, axis=0)
def bp(x, f0, f1, order=2): return signal.sosfilt(_sos('band', [f0, f1], order), x, axis=0)


def peak(x, f0, q, gain_db):
    """peaking EQ biquad"""
    A = 10 ** (gain_db / 40); w0 = TAU * f0 / SR; al = np.sin(w0) / (2 * q)
    b = [1 + al * A, -2 * np.cos(w0), 1 - al * A]; a = [1 + al / A, -2 * np.cos(w0), 1 - al / A]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def shelf_hi(x, f0, gain_db):
    A = 10 ** (gain_db / 40); w0 = TAU * f0 / SR; al = np.sin(w0) / 2 * np.sqrt(2)
    c = np.cos(w0); sq = 2 * np.sqrt(A) * al
    b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
    a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    return signal.lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


def sweep(x, f_curve, kind='low', order=2, block=512, q_band=1.6):
    """time-varying filter: f_curve is per-sample cutoff (Hz); processed block-wise with carried state."""
    out = np.empty_like(x); zi = None
    for i in range(0, len(x), block):
        fc = float(f_curve[min(i + block // 2, len(f_curve) - 1)])
        sos = _sos('band', [fc / q_band, fc * q_band], order) if kind == 'band' else _sos(kind, fc, order)
        if zi is None:
            zi = np.zeros((sos.shape[0], 2) + x.shape[1:]) if x.ndim > 1 else np.zeros((sos.shape[0], 2))
        seg = x[i:i + block]
        if x.ndim > 1:
            y = np.empty_like(seg)
            for ch in range(x.shape[1]):
                y[:, ch], zi[:, :, ch] = signal.sosfilt(sos, seg[:, ch], zi=zi[:, :, ch])
        else:
            y, zi = signal.sosfilt(sos, seg, zi=zi)
        out[i:i + block] = y
    return out


def noise(n, stereo=False):
    return _rng.standard_normal((n, 2)) if stereo else _rng.standard_normal(n)


def sat(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def stereo(x, pan=0.0):
    """mono -> stereo with equal-power pan (-1..1)"""
    a = (pan + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


# ---------------------------------------------------------------- oscillators
_tables = {}


def table(freq, kind='saw'):
    """band-limited single-cycle wavetable for a given fundamental"""
    key = (kind, int(round(freq)))
    if key in _tables: return _tables[key]
    N = 2048; ph = np.arange(N) / N * TAU
    H = max(1, int(min(SR * 0.45 / max(freq, 20), 400)))
    w = np.zeros(N)
    for h in range(1, H + 1):
        if kind == 'saw': a = 1.0 / h
        elif kind == 'square': a = (1.0 / h) if h % 2 else 0.0
        elif kind == 'pulse25': a = np.sin(np.pi * h * 0.25) / h * 1.4
        elif kind == 'tri': a = ((-1) ** ((h - 1) // 2) / h ** 2) if h % 2 else 0.0
        elif kind == 'soft': a = 1.0 / h ** 1.8
        else: a = 1.0 / h
        if a: w += a * np.sin(h * ph)
    w /= np.max(np.abs(w))
    _tables[key] = w
    return w


def osc(freq, n, kind='saw', phase0=0.0, fcurve=None):
    """wavetable oscillator; fcurve (per-sample Hz) overrides freq for glides/vibrato"""
    w = table(float(np.max(fcurve)) if fcurve is not None else freq, kind)   # band-limit for the highest pitch reached
    inc = (fcurve if fcurve is not None else np.full(n, freq)) / SR
    ph = (phase0 + np.cumsum(inc)) % 1.0
    return np.interp(ph * len(w), np.arange(len(w) + 1), np.append(w, w[0]))


def sine(freq, n, phase=0.0, fcurve=None):
    if fcurve is not None: return np.sin(TAU * np.cumsum(fcurve) / SR + phase)
    return np.sin(TAU * freq * tt(n) + phase)


# PADsynth (Nasca): lush sustained tones from a smeared harmonic spectrum with random phases
_pads = {}


def padsynth(freq, profile='warm', bw=38.0, seed=0, N=2 ** 18):
    key = (int(round(freq * 10)), profile, int(bw), seed)
    if key in _pads: return _pads[key]
    rng = np.random.default_rng(seed + int(freq * 7))
    spec = np.zeros(N // 2 + 1); bin_hz = SR / N
    for h in range(1, 96):
        fh = freq * h
        if fh > SR * 0.42: break
        if profile == 'warm': a = 1.0 / h ** 1.55
        elif profile == 'bright': a = 1.0 / h ** 1.0
        elif profile == 'choir':
            a = (1.0 / h ** 1.0) * (0.12 + np.exp(-((fh - 620) / 220) ** 2) + 0.8 * np.exp(-((fh - 1080) / 260) ** 2) + 0.35 * np.exp(-((fh - 2500) / 450) ** 2))
        elif profile == 'glass': a = (1.0 / h ** 0.6) * (1.0 if h in (1, 2, 4, 7, 11) else 0.08)
        else: a = 1.0 / h
        sigma = max(1.0, (2 ** (bw / 1200) - 1) * freq * h ** 0.9 / bin_hz / 2)
        c = fh / bin_hz; lo = int(max(0, c - 5 * sigma)); hi = int(min(N // 2, c + 5 * sigma)) + 1
        k = np.arange(lo, hi)
        spec[lo:hi] += a * np.exp(-0.5 * ((k - c) / sigma) ** 2) / sigma
    out = []
    for ch in range(2):
        ph = rng.uniform(0, TAU, N // 2 + 1)
        x = np.fft.irfft(spec * np.exp(1j * ph), n=N)
        out.append(x / np.max(np.abs(x)))
    y = np.stack(out, axis=1)
    _pads[key] = y
    return y


def pad_note(note, dur, profile='warm', bw=38.0, a=0.6, r=1.2, seed=0):
    w = padsynth(float(midi(note)), profile, bw, seed)
    n = n_of(dur + r); off = int(_rng.integers(0, len(w)))
    idx = (off + np.arange(n)) % len(w)
    y = w[idx]
    env = np.ones(n); na, nr = n_of(a), n_of(r)
    env[:na] = np.linspace(0, 1, na) ** 1.5; env[-nr:] = np.linspace(1, 0, nr) ** 1.5
    return y * env[:, None]


# ---------------------------------------------------------------- instruments
def fm_keys(note, dur, vel=1.0, bright=1.0):
    """electric-piano / bell: two-operator FM plus a short tine"""
    f = float(midi(note)); n = n_of(dur + 1.2); t = tt(n)
    idx = (1.6 * bright * vel + 0.2) * np.exp(-t / 0.5) + 0.25
    car = np.sin(TAU * f * t + idx * np.sin(TAU * f * t))
    tine = 0.22 * vel * np.exp(-t / 0.12) * np.sin(TAU * f * t + 0.7 * np.sin(TAU * f * 14.0 * t))
    env = np.exp(-t / (0.9 + 1.6 * (60.0 / max(note, 30)) ** 2 * (dur / 1.0))) * np.minimum(1, t / 0.004)
    rel = np.ones(n); nr = n_of(1.2); rel[-nr:] = np.linspace(1, 0, nr) ** 2
    y = (car + tine) * env * rel * vel
    det = np.sin(TAU * f * 1.003 * t + idx * np.sin(TAU * f * 1.003 * t)) * env * rel * vel
    return np.stack([y * 0.8 + det * 0.25, y * 0.25 + det * 0.8], axis=1) * 0.5


def bell(note, dur=2.5, vel=1.0, ratio=3.5):
    f = float(midi(note)); n = n_of(dur); t = tt(n)
    idx = 2.2 * np.exp(-t / 0.7) * vel + 0.1
    y = np.sin(TAU * f * t + idx * np.sin(TAU * f * ratio * t)) * np.exp(-t / (dur * 0.33)) * np.minimum(1, t / 0.003)
    y2 = np.sin(TAU * f * 1.004 * t + idx * np.sin(TAU * f * ratio * 1.002 * t)) * np.exp(-t / (dur * 0.33)) * np.minimum(1, t / 0.003)
    return np.stack([y, y2], axis=1) * 0.4 * vel


def pluck(note, dur=0.3, vel=1.0, bright=1.0, kind='saw'):
    """subtractive pluck: saw whose low-pass closes quickly (cross-fade of two fixed filters)"""
    f = float(midi(note)); n = n_of(dur + 0.25); t = tt(n)
    x = osc(f, n, kind) + 0.5 * osc(f * 1.006, n, kind, 0.3) + 0.35 * osc(f * 0.5, n, 'square', 0.1)
    hi_ = lp(x, min(9000, 2200 * bright + f * 4), 2); lo_ = lp(x, 420 + f * 0.8, 2)
    k = np.exp(-t / (0.055 + 0.05 * bright))
    y = (hi_ * k + lo_ * (1 - k)) * np.exp(-t / (dur * 0.55)) * np.minimum(1, t / 0.002)
    return y * vel * 0.33


def ks(note, dur=1.2, vel=1.0, bright=0.6, decay=0.996):
    """Karplus-Strong string at 4x rate (for tuning), then decimated"""
    OS = 4; f = float(midi(note)); N = int(round(SR * OS / f - 0.5)); n = n_of(dur) * OS
    ex = np.zeros(n); burst = _rng.uniform(-1, 1, N)
    burst = signal.lfilter([1 - bright * 0.0 - (1 - bright) * 0.9], [1, -(1 - bright) * 0.9], burst)
    ex[:N] = burst
    a = np.zeros(N + 2); a[0] = 1; a[N] = -0.5 * decay; a[N + 1] = -0.5 * decay
    y = signal.lfilter([1], a, ex)
    y = signal.resample_poly(y, 1, OS)
    return y / (np.max(np.abs(y)) + 1e-9) * vel * 0.5


def bass_note(note, dur, vel=1.0, drive=1.4, cutoff=420):
    f = float(midi(note)); n = n_of(dur + 0.06); t = tt(n)
    sub = np.sin(TAU * f * t)
    body = np.sin(TAU * 2 * f * t) * 0.5 + np.sin(TAU * 3 * f * t) * 0.22          # audible on small speakers
    grit = lp(osc(f, n, 'saw') + 0.5 * osc(f * 2.0, n, 'saw', 0.2), cutoff, 2)
    env = np.minimum(1, t / 0.008) * np.minimum(1, (n / SR - t) / 0.05)
    return sat((sub * 0.6 + body * 0.55 + grit * 0.7) * env, drive) * vel * 0.5


def lead_line(notes, bright=1.0, vib=0.004):
    """notes: [(start_s, dur_s, midi)] -> (signal, t0). Gliding mono lead with vibrato."""
    t0 = notes[0][0]; end = max(s + d for s, d, _ in notes) + 0.6
    n = n_of(end - t0); f = np.zeros(n); g = np.zeros(n)
    for s, d, m in notes:
        i0, i1 = n_of(s - t0), min(n, n_of(s - t0 + d))
        f[i0:] = midi(m); g[i0:i1] = 1.0
    f[f == 0] = midi(notes[0][2])
    k = np.exp(-1.0 / (0.028 * SR)); f = signal.lfilter([1 - k], [1, -k], f, zi=[f[0] * k])[0]   # portamento
    t = tt(n)
    f = f * (1 + vib * np.sin(TAU * 5.3 * t) * np.minimum(1, t / 0.4))
    ka = np.exp(-1.0 / (0.012 * SR)); g = signal.lfilter([1 - ka], [1, -ka], g)
    kr = np.exp(-1.0 / (0.16 * SR)); g = np.maximum(g, signal.lfilter([1 - kr], [1, -kr], g))
    x = 0.55 * sine(0, n, fcurve=f) + 0.5 * osc(0, n, 'soft', fcurve=f) + 0.28 * osc(0, n, 'saw', 0.3, fcurve=f * 1.004) + 0.2 * sine(0, n, fcurve=f * 2)
    x = lp(x, 5200 * bright, 2)
    return x * g * 0.4, t0


# ---------------------------------------------------------------- drums / percussion
def kick(vel=1.0, long=False, soft=False):
    n = n_of(0.6 if long else 0.4); t = tt(n)
    f = 52 + (90 if soft else 150) * np.exp(-t / 0.042) + 260 * np.exp(-t / 0.006) * (0 if soft else 1)
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / (0.22 if long else 0.15)) * np.minimum(1, t / 0.0015)
    if not soft: y += hp(noise(n), 2500) * np.exp(-t / 0.004) * 0.22 + bp(noise(n), 900, 2600) * np.exp(-t / 0.012) * 0.12
    y = sat(y, 1.9 if not soft else 1.1)
    if soft: y = lp(y, 1100)
    return fade(y, 0.0, 0.03) * vel


def snare(vel=1.0, tail=0.16):
    n = n_of(0.5); t = tt(n)
    tone = (np.sin(TAU * np.cumsum(185 + 90 * np.exp(-t / 0.02)) / SR) + 0.6 * np.sin(TAU * 331 * t)) * np.exp(-t / 0.07)
    nz = bp(noise(n), 1400, 9500) * np.exp(-t / tail)
    return fade(sat(tone * 0.55 + nz * 0.5, 1.3), 0.0005, 0.05) * vel


def clap(vel=1.0):
    n = n_of(0.4); t = tt(n); env = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.022, 0.034]):
        i = n_of(d); env[i:] = np.maximum(env[i:], np.exp(-(t[:n - i]) / (0.012 if k < 3 else 0.11)))
    return bp(noise(n), 900, 4200) * env * 0.7 * vel


def hat(vel=1.0, open_=False):
    n = n_of(0.45 if open_ else 0.09); t = tt(n)
    y = hp(noise(n), 7500, 3) * np.exp(-t / (0.16 if open_ else 0.022))
    return fade(y, 0.0003, 0.01) * 0.5 * vel


def crash(vel=1.0, dur=3.0):
    n = n_of(dur); t = tt(n)
    y = bp(noise(n, True), 3200, 13000) * (np.exp(-t / (dur * 0.28)) * np.minimum(1, t / 0.002))[:, None]
    y += hp(noise(n, True), 9000) * (np.exp(-t / 0.3))[:, None] * 0.5
    return y * 0.4 * vel


def tom(freq=95.0, vel=1.0, dur=0.7):
    n = n_of(dur); t = tt(n)
    f = freq * (1 + 0.9 * np.exp(-t / 0.03))
    y = np.sin(TAU * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.3)) + lp(noise(n), 900) * np.exp(-t / 0.02) * 0.4
    return fade(sat(y, 1.5), 0.001, 0.05) * 0.8 * vel


def blip(note, dur=0.12, vel=1.0, kind='sine'):
    f = float(midi(note)); n = n_of(dur); t = tt(n)
    y = (np.sin(TAU * f * t) if kind == 'sine' else osc(f, n, kind)) * np.exp(-t / (dur * 0.3)) * np.minimum(1, t / 0.002)
    return fade(y, 0.0, 0.01) * 0.3 * vel


def key_click(vel=1.0, soft=False):
    n = n_of(0.07); t = tt(n)
    f0 = _rng.uniform(1500, 2400) * (0.7 if soft else 1.0)
    y = bp(noise(n), 1200, 6500) * np.exp(-t / 0.004) + 0.5 * np.sin(TAU * f0 * t) * np.exp(-t / 0.008) + 0.6 * np.sin(TAU * 190 * t) * np.exp(-t / 0.014)
    return fade(y, 0.0002, 0.01) * (0.28 if soft else 0.42) * vel


def woodblock(freq=1150, vel=1.0):
    n = n_of(0.12); t = tt(n)
    return (np.sin(TAU * freq * t) + 0.5 * np.sin(TAU * freq * 2.72 * t)) * np.exp(-t / 0.018) * 0.35 * vel


def riser(dur, f0=300, f1=9000, stereo_=True):
    n = n_of(dur); t = tt(n) / dur
    x = noise(n, stereo_)
    y = sweep(x, f0 * (f1 / f0) ** t, 'band', 2, q_band=1.5)
    return y * (t ** 2.2)[:, None] * 0.35 if stereo_ else y * t ** 2.2 * 0.35


def whoosh(dur=0.6, f0=500, f1=4000):
    n = n_of(dur); t = tt(n) / dur
    y = sweep(noise(n, True), f0 * (f1 / f0) ** t, 'band', 2, q_band=1.8)
    return y * (np.sin(np.pi * t) ** 1.5)[:, None] * 0.3


def boom(vel=1.0, dur=2.2, f=41.0):
    n = n_of(dur); t = tt(n)
    y = np.sin(TAU * np.cumsum(f + 40 * np.exp(-t / 0.05)) / SR) * np.exp(-t / (dur * 0.3)) * np.minimum(1, t / 0.002)
    return sat(y, 1.6) * 0.9 * vel


# ---------------------------------------------------------------- mixing helpers
class Bus:
    def __init__(self, seconds):
        self.x = np.zeros((n_of(seconds), 2))

    def add(self, sig, t, gain=1.0, pan=0.0):
        if sig.ndim == 1: sig = stereo(sig, pan)
        i = n_of(t)
        if i < 0: sig = sig[-i:]; i = 0
        n = min(len(sig), len(self.x) - i)
        if n > 0: self.x[i:i + n] += sig[:n] * gain


def reverb_ir(rt60=2.6, pre=0.02, lo=250, hi=7500, seed=1):
    rng = np.random.default_rng(seed); n = n_of(rt60 * 1.3); t = tt(n)
    x = rng.standard_normal((n, 2)) * np.exp(-6.91 * t / rt60)[:, None]
    x = hp(lp(x, hi), lo)
    x[:, 0] = signal.lfilter([1], [1, -0.0], x[:, 0])
    # a few early reflections
    for d, g in [(0.011, 0.5), (0.019, 0.4), (0.031, 0.33), (0.047, 0.25)]:
        i = n_of(d); x[i, :] += g * rng.choice([-1, 1], 2)
    x = np.concatenate([np.zeros((n_of(pre), 2)), x])
    return x / np.sqrt(np.sum(x ** 2, axis=0, keepdims=True)).mean()


def convolve(x, ir):
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], axis=1)


def ping_pong(x, delay, fb=0.45, n_echo=7, damp=5000):
    out = np.zeros_like(x); d = n_of(delay); cur = x.copy(); g = 1.0
    for k in range(1, n_echo + 1):
        cur = lp(cur, damp); g *= fb
        sh = np.zeros_like(x)
        if k * d >= len(x): break
        sh[k * d:] = cur[:len(x) - k * d][:, ::-1] if k % 2 else cur[:len(x) - k * d]
        out += sh * g
    return out


def duck_env(n, times, depth=0.6, rel=0.22):
    """side-chain style gain curve: dips at each kick time"""
    env = np.ones(n); t = tt(n_of(rel * 3)); shape = 1 - depth * np.exp(-t / rel) * np.minimum(1, t / 0.003)   # 3 ms attack: no step
    for tk in times:
        i = n_of(tk)
        if i >= n or i < 0: continue
        m = min(len(shape), n - i); env[i:i + m] = np.minimum(env[i:i + m], shape[:m])
    return env


def limiter(x, ceiling_db=-1.2, win=0.05):
    """offline brick-wall leveller on the 4x-oversampled (true) peak: required gain -> window min -> moving average"""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    thr = db(ceiling_db)
    up = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.max(np.abs(up[:len(x) * 4].reshape(len(x), 4, 2)), axis=(1, 2))
    g = np.minimum(1.0, thr / np.maximum(pk, 1e-9))
    w = n_of(win) | 1
    g = uniform_filter1d(minimum_filter1d(g, size=w), size=w)
    return x * g[:, None]


def write_wav(path, x, bits=24):
    import wave
    x = np.clip(x, -1, 1)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR)
        v = (x * (2 ** 23 - 1)).astype(np.int32)
        b = np.empty((len(v), 2, 3), dtype=np.uint8)
        for i in range(3): b[:, :, i] = (v >> (8 * i)) & 0xFF
        w.writeframes(b.tobytes())

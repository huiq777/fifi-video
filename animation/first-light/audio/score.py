#!/usr/bin/env python3
"""FIRST LIGHT — the score. 120 BPM, D major, IV–I–V–vi. Each layer of the picture has a layer of sound:
one number = one sine, three numbers = a triad, many sines = an arpeggio, noise = clouds and sea."""
import json, os, sys
import numpy as np
from scipy import signal
sys.path.insert(0, os.path.dirname(__file__))
from synth import *

HERE = os.path.dirname(os.path.abspath(__file__))
EV = json.load(open(os.path.join(HERE, 'events.json')))
T = EV['T']
TOTAL = T['total'] + 3.0
BAR, BEAT, S16 = 2.0, 0.5, 0.125
B = lambda bar, beat=0.0: (bar - 1) * BAR + beat * BEAT

# ------------------------------------------------------------------ buses
names = ['drums', 'bass', 'pad', 'arp', 'lead', 'keys', 'fx', 'amb']
bus = {k: Bus(TOTAL) for k in names}
rvA, rvB, dly = Bus(TOTAL), Bus(TOTAL), Bus(TOTAL)
kick_times = []


# section-by-section stem trims (dB), applied where a sound starts, so its reverb/delay sends follow
ADJ = [
    (12, 16, dict(keys=-2)), (16, 20, dict(fx=-3, bass=-4)), (20, 28, dict(bass=-5, keys=1)),
    (28, 36, dict(arp=10, bass=-4, pad=2)), (36, 44, dict(arp=10, pad=0, drums=-1, bass=-3)),
    (48, 54, dict(arp=11, pad=6, drums=-2, fx=-5, bass=-3)), (54, 58, dict(arp=9, pad=6, bass=-6, lead=1)), (58, 64.6, dict(arp=11, pad=6, drums=-2, fx=-5, bass=-3)),
    (64.6, 68, dict(fx=-1)), (68, 70, dict(arp=11, drums=-2, bass=-3)), (70, 72, dict(keys=0, drums=-2)), (72, 74, dict(pad=2, bass=-4)),
    (74, 76, dict(keys=7, fx=3, drums=-2, bass=-3)), (76, 78, dict(bass=-6, drums=-3, pad=1)), (78, 80, dict(keys=6, drums=-1, bass=-3)),
    (80, 82, dict(keys=3, drums=-4, pad=0)), (82, 84, dict(bass=-9, fx=-7, pad=7, drums=-2)), (86, 110, dict(bass=-7, keys=2, pad=1)),
]


def trim(name, t):
    for t0, t1, d_ in ADJ:
        if t0 <= t < t1: return db(d_.get(name, 0.0))
    return 1.0


def put(name, sig, t, gain=1.0, pan=0.0, a=0.0, b=0.0, d=0.0):
    gain = gain * trim(name, t)
    bus[name].add(sig, t, gain, pan)
    if a: rvA.add(sig, t, gain * a, pan)
    if b: rvB.add(sig, t, gain * b, pan)
    if d: dly.add(sig, t, gain * d, pan)


G_ = dict(root=43, pad=[55, 59, 62, 66, 69], arp=[55, 62, 67, 69, 71, 74, 71, 69], tri=[67, 71, 74])
D_ = dict(root=42, pad=[54, 57, 62, 64, 69], arp=[54, 62, 66, 69, 74, 76, 74, 69], tri=[66, 69, 74])
A_ = dict(root=45, pad=[57, 61, 64, 69, 71], arp=[57, 64, 69, 71, 73, 76, 73, 71], tri=[64, 69, 73])
Bm = dict(root=47, pad=[59, 62, 66, 69, 73], arp=[59, 66, 71, 73, 74, 78, 74, 73], tri=[66, 71, 74])
DD = dict(root=38, pad=[50, 57, 62, 66, 69, 76], arp=[50, 62, 66, 69, 74, 76, 74, 69], tri=[66, 69, 74])
As = dict(root=45, pad=[57, 62, 64, 69, 71], arp=[57, 64, 69, 71, 74, 76, 74, 71], tri=[64, 69, 74])
CYC = [G_, D_, A_, Bm]


def pad_section(bars_chords, gain, f0, f1, profile='warm', a=0.5, send=0.35, bw=38.0, octave=0):
    """sustained chords with a slowly opening low-pass"""
    t0 = B(bars_chords[0][0]); t1 = B(bars_chords[-1][0] + 1) + 2.0
    tmp = Bus(t1 - t0)
    for bar, ch in bars_chords:
        for i, n in enumerate(ch['pad']):
            tmp.add(pad_note(n + octave, BAR, profile, bw, a=a, r=1.3, seed=i), B(bar) - t0, 0.2)
        if octave == 0 and profile != 'choir':
            tmp.add(pad_note(ch['root'], BAR, 'warm', bw, a=a, r=1.3, seed=9), B(bar) - t0, 0.2)
            tmp.add(pad_note(ch['root'] + 7, BAR, 'warm', bw, a=a, r=1.3, seed=10), B(bar) - t0, 0.12)
    n = len(tmp.x); f = f0 * (f1 / f0) ** np.linspace(0, 1, n)
    y = sweep(tmp.x, f, 'low', 2)
    y = hp(y, 85)
    put('pad', y, t0, gain, a=send)


def arp_bar(bar, ch, steps=range(16), vel=1.0, bright=1.0, gain=0.5, octave=0, d=0.3, a=0.2):
    for s in steps:
        n = ch['arp'][s % 8] + octave + (12 if (s // 8) % 2 and s % 8 in (4, 5) else 0)
        acc = 1.0 if s % 4 == 0 else (0.8 if s % 2 == 0 else 0.62)
        put('arp', pluck(n, 0.22, vel * acc, bright), B(bar) + s * S16, gain, pan=0.45 * np.sin(s * 1.9), a=a, d=d)


def drums_bar(bar, kicks=(), snares=(), hats=(), ohats=(), claps=(), kv=1.0, sv=1.0, hv=1.0, long=False, soft=False, srev=0.25):
    for s in kicks:
        t = B(bar) + s * S16; put('drums', kick(kv, long, soft), t, 0.85); kick_times.append(t)
    for s in snares: put('drums', snare(sv, 0.2 if long else 0.15), B(bar) + s * S16, 0.6, b=srev, a=srev * 0.6)
    for s in claps: put('drums', clap(sv), B(bar) + s * S16, 0.6, pan=0.1, b=0.3)
    for s in hats: put('drums', hat(hv * (1.0 if s % 4 == 0 else 0.6 + 0.25 * ((s * 7) % 3 == 0))), B(bar) + s * S16, 0.5, pan=0.25 if s % 2 else -0.2)
    for s in ohats: put('drums', hat(hv, True), B(bar) + s * S16, 0.42, pan=0.3, b=0.15)


def bass_bar(bar, ch, pattern='long', gain=0.62, octave=0):
    r = ch['root'] - 12 + octave
    if pattern == 'long': put('bass', bass_note(r, BAR - 0.05), B(bar), gain)
    elif pattern == 'pulse':
        for s in range(0, 16, 2): put('bass', bass_note(r, 0.2, 1.0 if s % 4 == 0 else 0.8), B(bar) + s * S16, gain)
    elif pattern == 'off':
        for s in (2, 6, 10, 14): put('bass', bass_note(r, 0.22), B(bar) + s * S16, gain)
        put('bass', bass_note(r - 0 if r > 30 else r, 0.2, 0.7), B(bar), gain * 0.7)
    elif pattern == 'oct':
        for s in range(0, 16, 2): put('bass', bass_note(r + (12 if s % 4 == 2 else 0), 0.21, 1.0, 1.8, 420), B(bar) + s * S16, gain)


# ================================================================== 0–12  intro: a room, a cursor
room = lp(hp(noise(n_of(TOTAL), True), 120), 2600) * db(-58)
put('amb', room, 0)
put('amb', lp(pad_note(38, 13.0, 'warm', 30, a=5.0, r=2.5), 420), 0.3, 0.045, a=0.5)
put('amb', lp(pad_note(50, 13.0, 'warm', 30, a=5.0, r=2.5, seed=5), 700), 0.3, 0.05, a=0.5)
put('amb', lp(pad_note(57, 9.0, 'warm', 30, a=4.0, r=3.0, seed=3), 900), 3.0, 0.035, a=0.6)
for e in EV['events']:
    if e['t'] < 12:
        put('fx', key_click(1.0, e['type'] == 'keysoft'), e['t'], 0.55, pan=float(np.random.default_rng(int(e['t'] * 1000)).uniform(-0.25, 0.25)), b=0.22)
put('keys', bell(81, 3.5, 0.5), EV['introEnd'][2] + 0.25, 0.3, a=0.9)                 # the idea
put('fx', whoosh(0.9, 300, 2600), 11.15, 0.22, a=0.3)
put('fx', blip(74, 0.08, 0.6), 12.0, 0.4, b=0.4)

# ================================================================== 12–16  one number = one sine
n = n_of(2.2); u = np.clip((tt(n) - 0.0) / 1.8, 0, 1); v = u * u * (3 - 2 * u)
tone = sine(0, n, fcurve=220.0 * 2 ** v) * (v ** 1.2) * np.minimum(1, (2.2 - tt(n)) / 0.02)
put('keys', tone, 14.0, 0.32, a=0.35)
put('keys', sine(0, n, fcurve=110.0 * 2 ** v) * (v ** 2) * np.minimum(1, (2.2 - tt(n)) / 0.02), 14.0, 0.18)
put('fx', riser(1.6, 400, 7000), 14.4, 0.35, a=0.3)

# ================================================================== 16–20  white, then four colours = four chords
t0 = T['flood']
put('fx', boom(0.8, 2.2, 44), t0, 0.8)
put('fx', hp(noise(n_of(0.5), True), 3000) * np.exp(-tt(n_of(0.5)) / 0.07)[:, None], t0, 0.4, a=0.5)
for i, m in enumerate([50, 62, 66, 69, 74, 76, 81, 86]): put('keys', bell(m, 3.2, 0.7), t0, 0.22, pan=(i - 3.5) / 5, a=0.8)
for i, ch in enumerate(CYC):
    t = t0 + (i + 1) * BEAT
    for j, m in enumerate(ch['tri']):
        nn = n_of(0.62); e = np.minimum(1, tt(nn) / 0.004) * np.exp(-tt(nn) / 0.2)
        put('keys', sine(float(midi(m)), nn) * e, t, 0.2, pan=(j - 1) * 0.5, a=0.5, d=0.15)
    put('bass', bass_note(ch['root'] - 12, 0.4, 0.9), t, 0.5)
    put('fx', key_click(0.7), t, 0.35)
for i, m in enumerate([74, 71, 69, 66]):                                           # bands dropping into place
    put('fx', blip(m, 0.16, 0.8), T['bands'] + 0.12 + i * 0.16 if i else T['bands'], 0.5, pan=-0.3 + 0.2 * i, b=0.4, d=0.2)
put('fx', boom(0.4, 1.0, 55), T['bands'], 0.4)

# ================================================================== 20–28  sky, sun (cycle 1: G D A D)
pad_section([(11, G_), (12, D_), (13, A_), (14, DD)], 0.42, 380, 1500, send=0.45)
for i, m in enumerate([67, 71, 74, 78, 81]):                                       # 4, 8, 16, 32, 64 bands
    put('keys', fm_keys(m, 0.5, 0.75 + 0.05 * i), T['sky'] + i * BEAT, 0.42, a=0.55, d=0.25)
put('keys', bell(86, 3.0, 0.5), T['sky'] + 2.5, 0.22, a=0.9)
put('fx', blip(88, 0.07, 0.8), T['sun'], 0.4, b=0.3); put('fx', blip(93, 0.07, 0.8), T['sun'] + 0.09, 0.4, b=0.3)   # target lock
for k, m in enumerate([69, 73, 76, 81, 85, 88]):                                   # iso-rings
    put('keys', blip(m, 0.5, 0.8), T['sun'] + 1.0 + k * 0.11, 0.42, pan=-0.5 + 0.2 * k, a=0.6, d=0.3)
nn = n_of(3.2); t = tt(nn)
sw = np.sin(TAU * 73.42 * t) * np.clip(t / 2.2, 0, 1) ** 2 * np.minimum(1, (3.2 - t) / 0.6)     # the sun arrives: D2 swell
put('bass', sat(sw, 1.3), T['sunRise'] - 0.4, 0.55)
for m in (62, 69, 74, 78): put('keys', fm_keys(m, 2.0, 0.8), T['sun'] + 3.0, 0.34, a=0.7, d=0.2)
put('bass', bass_note(26, 1.4, 0.9), T['sun'] + 3.0, 0.55)

# ================================================================== 28–36  sea (cycle 2): one sine, then many
pad_section([(15, G_), (16, D_), (17, A_), (18, Bm)], 0.5, 1300, 2800, send=0.4)
put('fx', whoosh(0.55, 800, 5000), T['sea'], 0.25, a=0.3)
nn = n_of(1.9); t = tt(nn)
wob = np.sin(TAU * 196.0 * t) * (0.6 + 0.4 * np.sin(TAU * 2.0 * t)) * np.clip(t / 0.9, 0, 1) * np.minimum(1, (1.9 - t) / 0.3)
put('keys', wob, T['sea'] + 0.4, 0.2, a=0.4)                                        # "one sine is a wave"
arp_bar(16, D_, steps=[0, 2], gain=0.5); arp_bar(16, D_, steps=[4, 5, 6, 7], gain=0.5)   # n = 2, 4
arp_bar(16, D_, steps=range(8, 12), gain=0.52); arp_bar(16, D_, steps=range(12, 16), gain=0.58, octave=0)   # n = 8, 32
arp_bar(17, A_, gain=0.6, bright=1.15); arp_bar(18, Bm, gain=0.62, bright=1.3)
bass_bar(17, A_, 'long', 0.5); bass_bar(18, Bm, 'long', 0.55)
drums_bar(18, kicks=(0, 4, 8, 12), kv=0.8, soft=True)
# the sea itself: slow breathing noise from here on
nA = n_of(TOTAL - T['seaRoll']); t = tt(nA)
swell = 0.55 + 0.25 * np.sin(TAU * t / 7.3 + 1.0) + 0.2 * np.sin(TAU * t / 4.1 + 2.2) + 0.12 * np.sin(TAU * t / 11.7)
sea = lp(hp(noise(nA, True), 180), 1500) * (swell * np.clip(t / 2.5, 0, 1))[:, None]
sea += lp(hp(noise(nA, True), 2500), 7000) * ((swell - 0.3).clip(0) ** 2 * np.clip(t / 2.5, 0, 1))[:, None] * 0.6
sea_gain = np.interp(T['seaRoll'] + t, [32, 34, 44, 47.4, 47.6, 48, 64, 64.6, 68, 84, 86, 96, 102, 103.6], [0.0, 0.09, 0.07, 0.05, 0.0, 0.05, 0.05, 0.12, 0.10, 0.04, 0.13, 0.13, 0.06, 0.0])
put('amb', sea * sea_gain[:, None], T['seaRoll'], 1.0)

# ================================================================== 36–44  clouds (cycle 3): noise, five layers
pad_section([(19, G_), (20, D_), (21, A_), (22, Bm)], 0.52, 2400, 5200, send=0.4)
nn = n_of(1.5); st = hp(noise(nn, True), 600) * (0.25 + 0.75 * np.exp(-tt(nn) / 0.12))[:, None]
put('fx', fade(st, 0.001, 0.1), T['cloud'], 0.2)                                    # a handful of static
put('fx', fade(sweep(noise(n_of(0.6), True), 9000 * (300 / 9000) ** np.linspace(0, 1, n_of(0.6)), 'low'), 0.01, 0.2), T['cloud'] + 1.5, 0.16)
# noise choir: the same noise, tuned — one more octave of resonances per layer
for L, tL in enumerate([T['cloud'] + 1.5, 38.0, 38.5, 39.0, 39.5]):
    dur = 44.0 - tL; nn = n_of(dur); src = noise(nn, True); y = np.zeros((nn, 2))
    for bar, ch in [(19, G_), (20, D_), (21, A_), (22, Bm)]:
        i0, i1 = max(0, n_of(B(bar) - tL)), min(nn, n_of(B(bar + 1) - tL))
        if i1 <= i0: continue
        seg = np.zeros((nn, 2)); w = np.zeros(nn); w[i0:i1] = 1; w = lp(w, 3.0)
        for m in ch['tri']:
            f = float(midi(m + 12 * (L - 1)))
            if f > 9000: continue
            sos = signal.butter(1, [f / 1.012 / (SR / 2), f * 1.012 / (SR / 2)], 'band', output='sos')
            seg += signal.sosfilt(sos, src, axis=0)
        y += seg * w[:, None]
    put('pad', fade(y, 0.25, 0.6), tL, 1.15 * (0.8 ** L), a=0.6)
    put('keys', fm_keys([62, 66, 69, 74, 78][L], 0.6, 0.7), tL, 0.3, a=0.6, d=0.2)
for bar, ch in [(19, G_), (20, D_), (21, A_), (22, Bm)]:
    arp_bar(bar, ch, gain=0.6, bright=1.35 + 0.1 * (bar - 19))
    bass_bar(bar, ch, 'long', 0.58)
drums_bar(19, kicks=(0, 4, 8, 12), kv=0.85, soft=True, hats=range(2, 16, 4), hv=0.7)
drums_bar(20, kicks=(0, 4, 8, 12), kv=0.9, soft=True, hats=range(2, 16, 4), hv=0.8)
drums_bar(21, kicks=(0, 4, 8, 12), kv=0.95, hats=range(0, 16, 2), hv=0.8, claps=(8,))
drums_bar(22, kicks=(0, 4, 8, 12), kv=1.0, hats=range(0, 16), hv=0.9, claps=(4, 12))
put('fx', crash(0.5, 2.5), T['cloudForm'], 0.5, a=0.4)
for i in range(8): put('drums', snare(0.35 + 0.08 * i), 43.0 + i * S16, 0.5, b=0.2)   # last-beat roll
put('fx', riser(3.2, 300, 10000), 40.8, 0.55, a=0.4)

# ================================================================== 44–48  time: everything holds its breath
pad_section([(23, As), (24, As)], 0.3, 700, 520, send=0.6)
for i in range(7):
    put('fx', woodblock(1500 if i % 2 == 0 else 1120, 0.9), 44.0 + i * BEAT, 0.42, pan=-0.35 if i % 2 == 0 else 0.35, b=0.18)   # tick, tock
for e in EV['events']:
    if 45 < e['t'] < 47.4: put('fx', key_click(1.0), e['t'], 0.6, b=0.2)
put('fx', key_click(1.4) + 0.0, T['enter'], 1.0, b=0.25)
put('fx', blip(50, 0.2, 1.0), T['enter'], 0.5)
rs = crash(0.9, 1.6)[::-1] * np.linspace(0, 1, n_of(1.6))[:, None] ** 3          # the last breath before the drop
put('fx', rs, T['drop'] - 1.6 + 0.0, 0.0)
sw = riser(0.42, 800, 12000); put('fx', sw, T['drop'] - 0.42, 0.9)

# ================================================================== 48–64  first light
pad_section([(25, G_), (26, D_), (27, A_)], 0.62, 5200, 9500, 'bright', a=0.08, send=0.4, bw=48)
pad_section([(28, Bm), (29, G_)], 0.4, 2600, 2000, 'warm', a=0.6, send=0.6)
pad_section([(30, D_), (31, A_), (32, Bm)], 0.68, 7000, 11000, 'bright', a=0.08, send=0.4, bw=52)
pad_section([(25, G_), (26, D_), (27, A_)], 0.2, 3000, 5000, 'choir', a=0.3, send=0.6, octave=12)
pad_section([(30, D_), (31, A_), (32, Bm)], 0.26, 3000, 6000, 'choir', a=0.3, send=0.6, octave=12)
put('fx', boom(1.0, 3.0, 38), T['drop'], 1.0); put('fx', crash(1.0, 4.0), T['drop'], 0.75, a=0.5)
put('fx', boom(0.9, 2.6, 38), B(30), 0.85); put('fx', crash(0.9, 3.5), B(30), 0.7, a=0.5)
for bar in (25, 26, 27, 30, 31, 32):
    ch = CYC[(bar - 25) % 4]
    drums_bar(bar, kicks=(0, 6, 10), snares=(8,), hats=range(0, 16, 2), ohats=(14,), kv=1.0, sv=1.0, hv=0.9, long=True, srev=0.5)
    bass_bar(bar, ch, 'pulse', 0.62)
    arp_bar(bar, ch, gain=0.5, bright=1.7, octave=12)
for bar in (28, 29):                                                              # the long lens: just pulse and air
    ch = CYC[(bar - 25) % 4]
    bass_bar(bar, ch, 'long', 0.6)
    arp_bar(bar, ch, gain=0.34, bright=0.9, octave=12, d=0.45, a=0.5)
    drums_bar(bar, kicks=(0, 8), kv=0.8, soft=True)
    for s, m in enumerate(ch['tri']): put('keys', bell(m + 24, 2.5, 0.5), B(bar) + s * 2 * BEAT / 1.5, 0.2, pan=0.4 * (s - 1), a=0.9)
for i, s in enumerate((12, 13, 14, 15)): put('drums', tom(150 - 22 * i, 0.9), B(29) + s * S16, 0.7, pan=-0.4 + 0.27 * i, b=0.4)
for i, s in enumerate((10, 12, 13, 14, 15)): put('drums', tom(165 - 20 * i, 1.0), B(32) + s * S16, 0.75, pan=-0.4 + 0.2 * i, b=0.4)
F5, A5, B5, E5, D5, D6, C6, E6 = 78, 81, 83, 76, 74, 86, 85, 88
mel1 = [(B(25), 1.0, F5), (B(25, 2), 0.5, A5), (B(25, 3), 0.5, B5), (B(26), 1.5, A5), (B(26, 3), 0.5, F5),
        (B(27), 1.0, E5), (B(27, 2), 0.5, F5), (B(27, 3), 0.5, E5), (B(28), 2.6, D5)]
mel2 = [(B(30), 1.5, D6), (B(30, 3), 0.5, A5), (B(31), 1.0, C6), (B(31, 2), 0.5, B5), (B(31, 3), 0.5, A5), (B(32), 1.0, B5), (B(32, 2), 0.9, F5)]
pick = [(B(29, 2), 0.5, A5), (B(29, 3), 0.5, B5)]
for mel, g in ((mel1, 0.75), (pick, 0.6), (mel2, 0.85)):
    y, t0 = lead_line(mel, 1.0); put('lead', y, t0, g, a=0.5, d=0.32)
y, t0 = lead_line([(s, d, m + 12) for s, d, m in mel2], 0.8); put('lead', y, t0, 0.3, pan=0.25, a=0.6, d=0.3)
for s, d, m in mel2: put('keys', bell(m + 12, 2.0, 0.55), s, 0.2, pan=-0.3, a=0.8)

# ================================================================== 64–68  wait.
tail = Bus(1.4)
for i, nt in enumerate(G_['pad']): tail.add(pad_note(nt, 1.0, 'bright', 48, a=0.02, r=0.3, seed=i), 0, 0.12)
tail.add(kick(1.0, True), 0, 0.8); tail.add(bass_note(G_['root'] - 12, 1.0), 0, 0.6)
for s in range(8): tail.add(pluck(G_['arp'][s] + 12, 0.22, 1.0, 1.7), s * S16, 0.45)
dur = 0.62; nn = n_of(dur); r = (1 - tt(nn) / dur) ** 1.25; pos = np.cumsum(r)
ts = np.stack([np.interp(pos, np.arange(len(tail.x)), tail.x[:, c]) for c in range(2)], axis=1) * (np.minimum(1, r * 6))[:, None]
put('fx', ts, T['twist'], 0.85, b=0.2)                                              # tape stop
for i, (dt_, m) in enumerate([(0.05, 62), (1.0, 66), (2.0, 69)]):
    put('keys', pluck(m, 0.5, 1.0, 0.7, 'soft'), T['twist'] + dt_, 0.8, b=0.5, d=0.15)
    put('keys', fm_keys(m - 12, 0.6, 0.6), T['twist'] + dt_, 0.3, b=0.4)
put('fx', blip(81, 0.09, 0.9), T['twist'] + 2.5, 0.42, b=0.3)                       # chip pops up
put('fx', blip(86, 0.06, 0.8), T['twist'] + 3.0, 0.4, b=0.3)                        # select
put('fx', key_click(1.2), T['twist'] + 3.5, 0.8, b=0.2); put('keys', bell(93, 1.5, 0.6), T['twist'] + 3.5, 0.3, a=0.6)
for i in range(4): put('drums', snare(0.5 + 0.15 * i), T['mont'] - 0.5 + i * S16, 0.55, b=0.25)
put('fx', riser(0.9, 600, 11000), T['mont'] - 0.9, 0.6)

# ================================================================== 68–84  eight worlds, one flight — the band changes with each
def crush(x, bits=5, rate=11000):
    idx = (np.floor(np.arange(len(x)) * rate / SR) * SR / rate).astype(int)
    q = 2 ** (bits - 1)
    return np.round(x[idx] * q) / q


def v_two_suns(bar, ch):                       # 01 suns = 2: everything in pairs — a house groove, the hook in thirds
    drums_bar(bar, kicks=(0, 4, 8, 12), claps=(4, 12), hats=range(2, 16, 4), ohats=(2, 6, 10, 14), kv=1.0, hv=0.8)
    bass_bar(bar, ch, 'off', 0.62); arp_bar(bar, ch, gain=0.42, bright=1.6, octave=12)
    hook = [(B(bar), 0.45, 83, 79), (B(bar, 1), 0.45, 86, 83), (B(bar, 2), 0.45, 81, 78), (B(bar, 3), 0.9, 83, 79)]   # diatonic thirds
    for k, pan, g in ((2, -0.4, 0.7), (3, 0.4, 0.55)):
        y, t0 = lead_line([(h[0], h[1], h[k]) for h in hook], 1.2); put('lead', y, t0, g, pan=pan, a=0.4, d=0.25)
    put('fx', crash(0.8, 2.5), B(bar), 0.55, a=0.4)


def v_8bit(bar, ch):                           # 02 bits = 8: pulse waves, triangle bass, noise drums, crushed
    tmp = Bus(BAR + 0.3)
    for s in range(32):
        m = [ch['tri'][0], ch['tri'][1], ch['tri'][2], ch['tri'][0] + 12][s % 4] + 12
        tmp.add(osc(float(midi(m)), n_of(0.058), 'pulse25') * np.linspace(1, 0.6, n_of(0.058)), s * S16 / 2, 0.16)
    for s, m in enumerate([78, 81, 86, 81, 83, 81, 78, 74]):
        tmp.add(fade(osc(float(midi(m)), n_of(0.22), 'square'), 0.002, 0.03), s * S16 * 2, 0.2)
    for s in range(0, 16, 2):
        tmp.add(fade(crush(osc(float(midi(ch['root'] - 12 + (12 if s % 4 == 2 else 0))), n_of(0.2), 'tri'), 4, 48000), 0.002, 0.02), s * S16, 0.5)
    for s in (4, 12): tmp.add(crush(noise(n_of(0.12)) * np.exp(-tt(n_of(0.12)) / 0.04), 3, 9000), s * S16, 0.3)
    for s in range(0, 16): tmp.add(crush(noise(n_of(0.02)), 2, 16000) * 0.5, s * S16, 0.1 if s % 2 else 0.16)
    put('keys', np.stack([crush(tmp.x[:, 0], 6, 15000), crush(tmp.x[:, 1], 6, 15000)], axis=1), B(bar), 0.85, b=0.08)
    for s in (0, 4, 8, 12):
        t = B(bar) + s * S16; put('drums', crush(kick(1.0), 5, 12000), t, 0.75); kick_times.append(t)


def v_aurora(bar, ch):                         # 03 night: no drums, glass and breath
    pad_section([(bar, ch)], 0.6, 1800, 4200, 'choir', a=0.5, send=0.8, octave=12)
    pad_section([(bar, ch)], 0.45, 900, 1600, 'warm', a=0.4, send=0.6)
    for s, m in enumerate([88, 85, 81, 76, 81, 85]): put('keys', bell(m, 3.0, 0.6, 3.5), B(bar) + s * BEAT * 0.66, 0.34, pan=0.6 * np.sin(s * 2.1), a=1.0, d=0.3)
    put('bass', bass_note(ch['root'] - 12, 1.9, 0.9, 1.1, 160), B(bar), 0.6)
    t = B(bar); put('drums', kick(0.8, True, True), t, 0.8); kick_times.append(t)


def v_ascii(bar, ch):                          # 04 pixels = "text": a teletype keeps time
    for s in range(16):
        put('fx', key_click(1.0 if s % 4 == 0 else 0.6, s % 2 == 1), B(bar) + s * S16, 0.75, pan=-0.6 + 1.2 * (s / 15), b=0.05)
    for s, m in enumerate([71, 74, 78, 83, 78, 74, 71, 74]):
        put('keys', blip(m, 0.1, 1.0, 'square'), B(bar) + s * 2 * S16, 0.42, pan=0.0, b=0.05)
    drums_bar(bar, kicks=(0, 4, 8, 12), kv=0.9)
    bass_bar(bar, ch, 'off', 0.5)
    put('keys', bell(95, 1.2, 0.7, 2.0), B(bar, 3.5), 0.3, pan=0.5, b=0.3)          # carriage-return bell


def v_saturn(bar, ch):                         # 05 moon = saturn: slow, enormous
    pad_section([(bar, ch)], 0.8, 2500, 5000, 'choir', a=0.25, send=0.8)
    pad_section([(bar, ch)], 0.6, 600, 2600, 'bright', a=0.5, send=0.5, octave=-12)
    for s, f, v in ((0, 62, 1.0), (6, 74, 0.8), (10, 62, 0.9), (12, 55, 1.0)): put('drums', tom(f, v, 1.1), B(bar) + s * S16, 0.95, pan=0.0, a=0.6)
    put('bass', bass_note(ch['root'] - 12, 1.9, 1.0, 1.3, 200), B(bar), 0.7)
    put('fx', crash(0.9, 3.0), B(bar), 0.6, a=0.5)
    y, t0 = lead_line([(B(bar), 0.9, 79), (B(bar, 2), 0.9, 86)], 0.7); put('lead', y, t0, 0.5, a=0.8, d=0.3)
    kick_times.append(B(bar))


def v_1984(bar, ch):                           # 06 year = 1984: gated snare, octave bass, brass
    gir = noise(n_of(0.24), True) * (np.linspace(1, 0.55, n_of(0.24)) ** 0.5)[:, None]; gir = hp(lp(gir, 6000), 400) * 0.02
    for s in (4, 12):
        sn = snare(1.0, 0.12); put('drums', sn, B(bar) + s * S16, 0.6)
        put('drums', convolve(np.pad(stereo(sn), ((0, n_of(0.3)), (0, 0))), gir), B(bar) + s * S16, 0.9)
    drums_bar(bar, kicks=(0, 4, 8, 12), hats=range(0, 16, 2), kv=1.0, hv=0.7)
    bass_bar(bar, ch, 'oct', 0.6)
    for s in (0, 3, 6, 10, 13):
        for i, m in enumerate(ch['tri']):
            nn = n_of(0.26); x = osc(float(midi(m)), nn, 'saw') + osc(float(midi(m)) * 1.007, nn, 'saw', 0.4)
            e = np.minimum(1, tt(nn) / 0.02) * np.exp(-tt(nn) / 0.14)
            put('keys', lp(x, 2600) * e, B(bar) + s * S16, 0.11, pan=(i - 1) * 0.5, b=0.35)
    for i, s in enumerate((13, 14, 15)): put('drums', tom(190 - 35 * i, 0.9, 0.5), B(bar) + s * S16, 0.6, pan=-0.5 + 0.5 * i, b=0.5)
    y, t0 = lead_line([(B(bar), 0.45, 81), (B(bar, 1), 0.45, 86), (B(bar, 2), 0.95, 90)], 1.3, 0.006); put('lead', y, t0, 0.5, a=0.4, d=0.3)


def v_1831(bar, ch):                           # 07 year = 1831: plucked string, taiko, woodblock
    run = [(0, 88, 1.0), (2, 85, 0.8), (3, 83, 0.8), (4, 81, 1.0), (6, 76, 0.9), (8, 81, 1.0), (9, 83, 0.7), (10, 85, 0.9), (12, 88, 1.0), (13, 88, 0.6), (14, 88, 0.7), (15, 88, 0.5)]
    for s, m, v in run: put('keys', ks(m - 12, 1.4, v, 0.75, 0.9965), B(bar) + s * S16, 0.75, pan=-0.55 + 0.075 * s, a=0.4, b=0.35)
    put('keys', ks(45, 2.0, 1.0, 0.5, 0.998), B(bar), 0.7, a=0.4)
    for i, m in enumerate((57, 64, 71, 76)): put('pad', pad_note(m, 1.8, 'glass', 14, a=0.25, r=0.5, seed=i), B(bar), 0.11, pan=(i - 1.5) / 2, a=0.5)
    for s, v in ((0, 1.0), (8, 0.85), (11, 0.6)): put('drums', tom(58, v, 1.3), B(bar) + s * S16, 1.0, a=0.6)
    for s in (2, 6, 10, 13, 14): put('fx', woodblock(1300, 0.9), B(bar) + s * S16, 0.5, pan=0.4, b=0.3)
    kick_times.append(B(bar)); kick_times.append(B(bar, 2))


def v_blackhole(bar, ch):                      # 08 sun = black_hole: everything falls
    nn = n_of(2.0); t = tt(nn)
    f = 27.5 + 95 * np.exp(-t / 0.42)
    sub = sat(np.sin(TAU * np.cumsum(f) / SR) * np.minimum(1, t / 0.005) * np.minimum(1, (2.0 - t) / 0.25), 2.4)
    put('bass', sub, B(bar), 0.85)
    tmp = Bus(2.4)
    for i, nt in enumerate(ch['pad']): tmp.add(pad_note(nt, 2.0, 'bright', 55, a=0.02, r=0.3, seed=i), 0, 0.16)
    for s in range(16): tmp.add(pluck(ch['arp'][s % 8] + 12, 0.22, 1.0, 1.6), s * S16, 0.4)
    L = n_of(2.0); rate = 2.0 ** (-1.4 * (tt(L) / 2.0) ** 1.2); pos = np.cumsum(rate)
    y = np.stack([np.interp(pos, np.arange(len(tmp.x)), tmp.x[:, c]) for c in range(2)], axis=1)
    y = sweep(y, 7000 * (300 / 7000) ** np.linspace(0, 1, L), 'low')
    put('pad', fade(y, 0.002, 0.1), B(bar), 0.9, a=0.7)
    for s, v in ((0, 1.0), (3, 0.6), (8, 0.9), (11, 0.5)):
        tk = B(bar) + s * S16; put('drums', kick(v, True, True), tk, 0.95); kick_times.append(tk)
    put('fx', boom(1.0, 2.5, 30), B(bar), 1.0, a=0.3)
    rc = crash(1.0, 1.9)[::-1] * (np.linspace(0, 1, n_of(1.9)) ** 2.5)[:, None]; put('fx', rc, B(bar + 1) - 1.9, 0.7, a=0.4)


for i, fn in enumerate([v_two_suns, v_8bit, v_aurora, v_ascii, v_saturn, v_1984, v_1831, v_blackhole]):
    fn(35 + i, CYC[i % 4])
    if i not in (0, 2, 4, 7): put('fx', hp(noise(n_of(0.06), True), 4000) * np.exp(-tt(n_of(0.06)) / 0.012)[:, None], B(35 + i), 0.25)
pad_section([(35, G_), (36, D_)], 0.3, 4000, 6000, 'bright', a=0.05, send=0.3)
pad_section([(38, Bm)], 0.14, 2000, 2500, 'warm', a=0.05, send=0.2)
pad_section([(40, D_)], 0.3, 4000, 7000, 'bright', a=0.03, send=0.3, bw=60)

# ================================================================== 86–104  it is mine
E_ = [(44, G_), (45, D_), (46, A_), (47, Bm), (48, G_), (49, D_), (50, A_), (51, DD), (52, DD)]   # bar 53 is black: one more line
pad_section(E_[:4], 0.5, 2600, 2000, 'warm', a=0.9, send=0.6)
pad_section(E_[4:], 0.5, 2000, 1100, 'warm', a=0.9, send=0.7)
pad_section(E_[4:8], 0.16, 2500, 2000, 'choir', a=1.0, send=0.8, octave=12)
for bar, ch in E_[:8]: put('bass', bass_note(ch['root'] - 12, 1.9, 0.9, 1.1, 180), B(bar), 0.5 if bar < 51 else 0.42)
motif = [(44, 0, 78, 1.0), (44, 2, 81, 1.0), (45, 0, 81, 1.4), (45, 3, 78, 0.5), (46, 0, 76, 1.0), (46, 2, 78, 0.8), (47, 0, 74, 1.8),
         (48, 0, 83, 1.0), (48, 2, 81, 1.0), (49, 0, 86, 1.6), (49, 3, 81, 0.5), (50, 0, 85, 1.0), (50, 2, 83, 1.0), (51, 0, 78, 3.0)]
for bar, beat, m, d_ in motif:
    put('keys', fm_keys(m, d_, 0.62), B(bar, beat), 0.5, pan=-0.15, a=0.75, d=0.25)
    put('keys', fm_keys(m - 12, d_, 0.4), B(bar, beat), 0.26, pan=0.2, a=0.6)
for bar, ch in E_[:8]:
    for s in (0, 6, 12): put('keys', fm_keys(ch['arp'][s % 8] - 12, 0.9, 0.45), B(bar) + s * S16, 0.3, pan=0.3, a=0.6)
put('keys', fm_keys(38, 3.0, 0.7), T['lineA'], 0.4, a=0.5); put('keys', fm_keys(50, 3.0, 0.7), T['lineB'], 0.42, a=0.6)
put('keys', bell(86, 4.0, 0.5), T['lineB'], 0.22, a=1.0)
put('fx', crash(0.35, 3.5), T['title'], 0.4, a=0.8)
for i, m in enumerate([62, 69, 74, 78, 81, 86]): put('keys', bell(m, 4.5, 0.55), T['title'] + 0.3 + i * 0.09, 0.2, pan=(i - 2.5) / 4, a=1.0)
for e in EV['events']:
    if e['t'] >= T['bye'] - 0.01: put('fx', key_click(1.0, e['type'] == 'keysoft'), e['t'], 0.55, b=0.25)
nn = n_of(1.6); put('keys', sine(440.0, nn) * np.minimum(1, tt(nn) / 0.01) * np.exp(-tt(nn) / 0.4), T['bye'] + 0.75, 0.2, a=0.9)   # the first sound, again

# ------------------------------------------------------------------ side-chain, effects, mix
kt = sorted(kick_times); n_all = len(bus['pad'].x)
bus['bass'].x *= duck_env(n_all, kt, 0.6, 0.16)[:, None]
bus['pad'].x *= duck_env(n_all, kt, 0.42, 0.2)[:, None]
bus['arp'].x *= duck_env(n_all, kt, 0.22, 0.14)[:, None]
bus['bass'].x = lp(bus['bass'].x, 3200)
bus['bass'].x[:, :] = bus['bass'].x.mean(axis=1, keepdims=True)
for k in ('arp', 'lead', 'keys'): bus[k].x = hp(bus[k].x, 130)
bus['lead'].x = peak(bus['lead'].x, 2800, 1.0, -2.0)
dl = ping_pong(dly.x, 0.375, 0.42, 6, 4200)
wetA = convolve(hp(rvA.x + dl * 0.35, 220), reverb_ir(3.1, 0.024, 260, 6800, 1))
wetB = convolve(hp(rvB.x, 180), reverb_ir(1.25, 0.008, 300, 8500, 2))
G = dict(drums=1.0, bass=1.0, pad=1.0, arp=1.0, lead=1.0, keys=1.0, fx=1.0, amb=1.0)
mix = sum(bus[k].x * G[k] for k in names) + wetA * 0.2 + wetB * 0.22 + dl * 0.7

# hard stop on Enter: half a second of true silence before the drop (only the riser lives there)
i0, i1 = n_of(T['enter'] + 0.07), n_of(T['drop'])
g = np.ones(len(mix)); g[i0:i1] = 0; g[i0:i0 + n_of(0.04)] = np.linspace(1, 0, n_of(0.04)); mix *= g[:, None]
mix[i1 - n_of(0.42):i1] += (riser(0.42, 900, 12000) * 0.5 + (crash(0.8, 0.42)[::-1] * np.linspace(0, 1, n_of(0.42))[:, None] ** 3) * 0.5)[:n_of(0.42)]

# rewind: the montage itself, backwards at 8x, plus a climbing motor whine
seg = mix[n_of(T['mont']):n_of(T['rewind'])][::-1]
rw = signal.resample_poly(seg, 1, 8, axis=0)[:n_of(T['end'] - T['rewind'])]
t = tt(len(rw)); u = t / t[-1]
rw = hp(rw, 300) * (0.75 * np.sin(np.pi * np.clip(u * 1.02, 0, 1)) ** 0.5 * (0.8 + 0.2 * np.sin(TAU * 31 * t)))[:, None]
whine = (osc(0, len(rw), 'tri', fcurve=500 * 2 ** (1.6 * np.sin(np.pi * u) ** 1.0)) * 0.05 * np.sin(np.pi * u))
i = n_of(T['rewind']); mix[i:i + len(rw)] += rw * 0.7 + stereo(whine)
_k = stereo(kick(0.8, False, True)); mix[n_of(T['end']):n_of(T['end']) + len(_k)] += _k * 0.3
_k = stereo(key_click(1.3)); mix[n_of(T['end']):n_of(T['end']) + len(_k)] += _k * 0.45

# master
mix = hp(mix, 28, 2)
mix = peak(mix, 58, 0.9, -3.0)
mix = peak(mix, 170, 0.8, 1.5)
mix = peak(mix, 3200, 0.8, 1.5)
mix = shelf_hi(mix, 7500, 2.5)
fo = np.interp(tt(len(mix)), [0, 101.5, 103.6, 103.7, T['total'] + 0.4, T['total'] + 0.5], [1, 1, 0.0, 1, 1, 0]); mix *= fo[:, None]
target = float(os.environ.get('GAIN_DB', '-2.3'))
# fader ride: lift the quiet scenes so they survive a phone speaker, keep the drop the loudest thing
ride = [(0, 5), (11.5, 5), (12.5, 3.5), (15.8, 3.5), (16.2, 1), (19.8, 1), (20.3, 2.5), (27.5, 2.5), (28.5, 1.5), (35.5, 1.5), (36.5, 0), (43.8, 0),
        (44.2, 4.5), (47.4, 4.5), (48.0, 0), (64.4, 0), (65.0, 5), (67.4, 5), (68.0, 0), (69.97, 0), (70.0, 2.5), (71.97, 2.5), (72.0, 1.5), (73.97, 1.5),
        (74.0, 3.5), (75.97, 3.5), (76.0, 0), (79.97, 0), (80.0, 2.5), (81.97, 2.5), (82.0, 0), (83.8, 0), (84.2, 2), (85.8, 2), (86.3, 2.5), (103.6, 2.5), (103.7, 5), (110, 5)]
ride_t = [r[0] for r in ride]; ride_db = [r[1] for r in ride]
mix *= db(np.interp(tt(len(mix)), ride_t, ride_db))[:, None]
pre = mix.copy()
x = mix * db(target)
th = 0.62; ax = np.abs(x)                                   # soft clip: shave transient peaks before the limiter
x = np.where(ax < th, x, np.sign(x) * (th + (1 - th) * np.tanh((ax - th) / (1 - th))))
mix = limiter(x, -1.2)
_gr = 20 * np.log10(np.maximum(np.max(np.abs(mix), axis=1), 1e-9) / np.maximum(np.max(np.abs(x), axis=1), 1e-9))
out = os.path.join(HERE, '..', 'out', 'audio'); os.makedirs(out, exist_ok=True)
write_wav(os.path.join(out, 'first_light.wav'), mix[:n_of(T['total'] + 0.5)])
if os.environ.get('STEMS'):
    for k in names: write_wav(os.path.join(out, f'stem_{k}.wav'), np.clip(bus[k].x * db(target), -1, 1))
rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
print('peak pre-limit %.1f dBFS' % (20 * np.log10(np.max(np.abs(pre)) + 1e-12) + target))
for k in names: print('  %-6s rms %6.1f  peak %6.1f' % (k, rms(bus[k].x), 20 * np.log10(np.max(np.abs(bus[k].x)) + 1e-12)))
for a, b_, lab in [(0, 12, 'intro'), (12, 20, 'number'), (20, 28, 'sky/sun'), (28, 36, 'sea'), (36, 44, 'cloud'), (44, 48, 'time'), (48, 54, 'climax A'), (54, 58, 'tele'), (58, 64, 'climax C'), (64, 68, 'twist'), (68, 84, 'montage'), (84, 86, 'rewind'), (86, 96, 'ending'), (96, 104, 'title')]:
    print('  %-9s rms %6.1f dB' % (lab, rms(mix[n_of(a):n_of(b_)])))

if os.environ.get('DIAG'):
    secs = [(0, 12, 'intro'), (12, 16, 'num'), (16, 20, 'color'), (20, 28, 'skysun'), (28, 36, 'sea'), (36, 44, 'cloud'), (44, 48, 'time'), (48, 54, 'climA'), (54, 58, 'tele'), (58, 64, 'climC'), (64, 68, 'twist'),
            (68, 70, 'v1'), (70, 72, 'v2'), (72, 74, 'v3'), (74, 76, 'v4'), (76, 78, 'v5'), (78, 80, 'v6'), (80, 82, 'v7'), (82, 84, 'v8'), (84, 86, 'rew'), (86, 96, 'end'), (96, 104, 'title')]
    print('%-7s' % '' + ''.join('%7s' % l for _, _, l in secs))
    rows = dict(bus_ := {k: bus[k].x for k in names}); rows['wetA'] = wetA * 0.2; rows['wetB'] = wetB * 0.22; rows['dly'] = dl * 0.7; rows['PRE'] = pre
    for k, x in rows.items(): print('%-7s' % k + ''.join('%7.1f' % rms(x[n_of(a):n_of(b_)]) for a, b_, _ in secs))
    print('%-7s' % 'PREpk' + ''.join('%7.1f' % (20 * np.log10(np.max(np.abs(pre[n_of(a):n_of(b_)])) + 1e-12)) for a, b_, _ in secs))

if os.environ.get('DIAG'):
    print('limiter gain reduction (dB): min / mean of the reduced part, share of time reduced')
    for a, b_, lab in [(12, 20, 'num/col'), (36, 44, 'cloud'), (48, 54, 'climA'), (58, 64, 'climC'), (68, 84, 'mont')]:
        g = _gr[n_of(a):n_of(b_)]; red = g[g < -0.1]
        print('  %-8s min %5.1f  mean %5.1f  share %4.1f%%' % (lab, g.min(), red.mean() if len(red) else 0, 100 * len(red) / len(g)))
    for a, b_, lab in [(0, 12, 'intro'), (48, 64, 'climax'), (68, 84, 'montage'), (86, 104, 'ending')]:
        seg = mix[n_of(a):n_of(b_)]; print('  corr L/R %-8s %.2f' % (lab, np.corrcoef(seg[:, 0], seg[:, 1])[0, 1]))
    # onset check: energy jump at key picture events
    e = np.sqrt(signal.lfilter(np.ones(480) / 480, [1], (mix ** 2).sum(axis=1)))
    for tv, lab in [(T['flood'], 'flood'), (T['enter'], 'enter'), (T['drop'], 'drop'), (T['twist'], 'twist'), (T['mont'], 'montage'), (T['end'], 'end')]:
        i = n_of(tv); before = e[i - n_of(0.05)]; after = e[i + n_of(0.02)]
        print('  %-8s t=%6.2f  level 50 ms before %6.1f dB  20 ms after %6.1f dB' % (lab, tv, 20 * np.log10(before + 1e-9), 20 * np.log10(after + 1e-9)))

#!/usr/bin/env python3
"""octave-band levels of a wav, per time section: bands.py file.wav t0-t1 [t0-t1 ...]"""
import sys, wave, numpy as np
from scipy import signal
w = wave.open(sys.argv[1]); sr = w.getframerate(); n = w.getnframes(); raw = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, 2, 3)
x = (raw[:, :, 0].astype(np.int32) | (raw[:, :, 1].astype(np.int32) << 8) | (raw[:, :, 2].astype(np.int8).astype(np.int32) << 16)) / 2 ** 23
cs = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
print('%-12s' % 'section' + ''.join('%7s' % (str(int(c)) if c < 1000 else '%gk' % (c / 1000)) for c in cs) + '   side/mid')
for arg in sys.argv[2:]:
    a, b = map(float, arg.split('-')); seg = x[int(a * sr):int(b * sr)]; m = seg.mean(axis=1); sd = (seg[:, 0] - seg[:, 1]) / 2
    out = []
    for c in cs:
        sos = signal.butter(3, [c / 2 ** 0.5 / (sr / 2), min(0.99, c * 2 ** 0.5 / (sr / 2))], 'band', output='sos')
        y = signal.sosfilt(sos, m); out.append(10 * np.log10(np.mean(y ** 2) + 1e-12))
    print('%-12s' % arg + ''.join('%7.1f' % v for v in out) + '   %6.1f' % (10 * np.log10(np.mean(sd ** 2) / (np.mean(m ** 2) + 1e-12) + 1e-12)))

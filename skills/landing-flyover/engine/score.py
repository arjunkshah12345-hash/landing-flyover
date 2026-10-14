"""Build the 14.5s score: a track window whose drop lands on 9.97s, whooshes peaking at 8.66s and 9.80s,
and a sub thump under the hit. Needs ffmpeg + numpy.

usage: python3 score.py <track.mp3|wav> [drop_seconds|auto] [out.wav]
"""
import subprocess, sys, wave
import numpy as np

HIT, DUR, SR = 9.97, 14.5, 48000
track = sys.argv[1]
drop_arg = sys.argv[2] if len(sys.argv) > 2 else 'auto'
out = sys.argv[3] if len(sys.argv) > 3 else 'audio/score.wav'

def decode(ss=None, t=None, ch=2, sr=SR):
    cmd = ['ffmpeg', '-v', 'error']
    if ss is not None: cmd += ['-ss', f'{ss:.3f}']
    if t is not None: cmd += ['-t', f'{t:.3f}']
    cmd += ['-i', track, '-ac', str(ch), '-ar', str(sr), '-f', 'f32le', '-']
    return np.frombuffer(subprocess.run(cmd, capture_output=True, check=True).stdout, np.float32)

def find_drop():
    """Biggest jump from a quiet stretch into a loud one (2s windows), refined to the transient."""
    sr = 22050; x = decode(ch=1, sr=sr); hop = 512
    n = len(x) // hop; rms = np.sqrt(np.mean(x[:n * hop].reshape(n, hop) ** 2, axis=1))
    w = int(2 * sr / hop); best = (0, None)
    for i in range(w, n - int(5 * sr / hop)):
        t = i * hop / sr
        if t < HIT: continue
        ratio = rms[i:i + w].mean() / (rms[i - w:i].mean() + 1e-4)
        if ratio > best[0]: best = (ratio, t)
    if best[1] is None: return HIT
    # refine: first frame in ±0.35s where short-term energy crosses 60% of the post-drop level
    t0 = best[1] - 0.35; y = decode(ss=t0, t=0.7, ch=1, sr=sr); h = int(0.01 * sr)
    e = np.sqrt(np.mean(y[:len(y) // h * h].reshape(-1, h) ** 2, axis=1))
    k = int(np.argmax(e > 0.6 * e[len(e) // 2:].mean()))
    print(f'drop found at {t0 + k * 0.01:.2f}s (energy x{best[0]:.1f})')
    return t0 + k * 0.01

drop = find_drop() if drop_arg == 'auto' else float(drop_arg)
start = max(0.0, drop - HIT)
m = decode(ss=start, t=DUR).reshape(-1, 2).copy()
n = int(DUR * SR); m = np.pad(m, ((0, max(0, n - len(m))), (0, 0)))[:n]
t = np.arange(n) / SR
pad_in = HIT - (drop - start)                      # if the drop comes earlier than 9.97s into the track
if pad_in > 0: m = np.roll(m, int(pad_in * SR), axis=0); m[:int(pad_in * SR)] = 0
m *= (np.clip(t / 0.35, 0, 1) * np.clip((DUR - t) / 1.5, 0, 1) ** 1.5)[:, None] * 0.82
rng = np.random.default_rng(7)

def whoosh(peak, rise=0.55, fall=0.3, gain=0.32):
    L = int((rise + fall) * SR); x = rng.standard_normal((L, 2)).astype(np.float32)
    tt = np.arange(L) / SR; p = np.where(tt < rise, tt / rise, 1 - (tt - rise) / fall)
    a = np.exp(-2 * np.pi * (300 + 5200 * np.clip(p, 0, 1) ** 2) / SR)
    y = np.zeros_like(x); z = np.zeros(2)
    for i in range(L): z = (1 - a[i]) * x[i] + a[i] * z; y[i] = z
    y *= np.where(tt < rise, (tt / rise) ** 2.2, np.exp(-(tt - rise) / (fall / 4)))[:, None]; y /= np.abs(y).max()
    pan = np.linspace(-0.6, 0.6, L)
    y[:, 0] *= np.sqrt((1 - pan) / 2) * 1.4; y[:, 1] *= np.sqrt((1 + pan) / 2) * 1.4
    s = int((peak - rise) * SR); m[s:s + L] += y[:n - s] * gain

whoosh(8.66); whoosh(9.80, rise=0.45, fall=0.25, gain=0.36)
s = int(HIT * SR); L = int(0.9 * SR); tt = np.arange(L) / SR
m[s:s + L] += (np.sin(2 * np.pi * np.cumsum(38 + 50 * np.exp(-tt / 0.05)) / SR) * np.exp(-tt / 0.28) * 0.35)[:, None]
m = np.tanh(m / max(np.abs(m).max(), 1) * 1.1) * 0.95
import os; os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((m * 32767).astype('<i2').tobytes())
print(f'{out}: track from {start:.2f}s, drop on {HIT}s, whooshes 8.66s / 9.80s')

"""Optical-flow check on a 30fps preview: the glide must never stall or reverse, the flight must never zoom in.
usage: python3 flow.py preview30.mp4   (needs opencv-python-headless + numpy; run `node render.mjs cam` first)
"""
import cv2, numpy as np, sys
cap = cv2.VideoCapture(sys.argv[1]); fps = cap.get(cv2.CAP_PROP_FPS)
prev = None; rows = []; i = 0
while True:
    ok, f = cap.read()
    if not ok: break
    g = cv2.cvtColor(f, cv2.COLOR_BGR2GRAY)
    if prev is not None:
        mask = np.zeros_like(prev); mask[400:760, 200:1240] = 255      # band through the frame centre
        pts = cv2.goodFeaturesToTrack(prev, 400, 0.01, 6, mask=mask)
        dy = np.nan; s = np.nan; n = 0
        if pts is not None and len(pts) >= 8:
            nxt, st, err = cv2.calcOpticalFlowPyrLK(prev, g, pts, None, winSize=(41, 41), maxLevel=5)
            ok_ = st.ravel() == 1
            p0 = pts[ok_].reshape(-1, 2); p1 = nxt[ok_].reshape(-1, 2); n = len(p0)
            if n >= 8:
                dy = -np.median(p1[:, 1] - p0[:, 1])
                M, inl = cv2.estimateAffinePartial2D(p0, p1)
                if M is not None: s = float(np.hypot(M[0, 0], M[1, 0]))
        rows.append((i / fps, dy, s, n))
    prev = g; i += 1
fl = [r for r in rows if 1.65 <= r[0] <= 7.25 and r[3] >= 8]
d = np.array([r[1] for r in fl])
print('cruise 1.65-7.25s  screen flow px/frame (30fps): min %.1f  p5 %.1f  median %.1f  max %.1f   (frames %d of %d measured)' % (d.min(), np.percentile(d, 5), np.median(d), d.max(), len(fl), sum(1 for r in rows if 1.65 <= r[0] <= 7.25)))
neg = [(round(r[0], 2), round(r[1], 1)) for r in rows if r[0] < 8.2 and r[3] >= 8 and r[1] < 0.5 and r[0] > 0.15]
print('flight frames with no forward motion:', neg)
import json, os
ok = len(neg) == 0
zin = [round(r[0], 2) for r in rows if r[0] < 8.2 and r[3] >= 8 and r[2] > 1.003]
print('flight frames zooming in:', zin); ok = ok and not zin
if os.path.exists('cam.json'):
    cam = json.load(open('cam.json'))
    cy = [c[1]['y'] for c in cam if c[0] <= 8.3]; cd = [c[1]['d'] for c in cam if c[0] <= 9.25]
    mono = all(b >= a for a, b in zip(cy, cy[1:])) and all(b >= a - 1e-6 for a, b in zip(cd, cd[1:]))
    print('camera page position and distance monotonic:', mono); ok = ok and mono
print('PASS' if ok else 'FAIL')
for t0 in np.arange(0, 8.4, 0.6):
    r = min(rows, key=lambda r: abs(r[0] - t0))
    print(f'{r[0]:5.2f}  dy {r[1]:6.1f}  scale {r[2]:.4f}  n {r[3]}')

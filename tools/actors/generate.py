"""Build one skinned GLB from a verified anatomic mesh, original tailoring and animated joint poses.

Invoke rebuild.py to prepare the working directory and generate the full cast.
"""

from model_data import body, faces, gender, joint, v
from pathlib import Path

f = faces
import struct, json, math, io, os
import numpy as np
from scipy.spatial.transform import Rotation
from scipy.ndimage import gaussian_filter
from PIL import Image
from collections import defaultdict

P = np.array
rng = np.random.default_rng(42)
female = gender == "female"
out = (
    Path(__file__).resolve().parents[2]
    / "public"
    / "actors"
    / ("survivor.glb" if female else "sumer.glb")
)
bones = {}


def bone(n, p, c):
    bones[n] = (p, np.array(c, dtype=float))


bone("hips", None, joint("pelvis"))
bone("chest", "hips", [0, 1.16, 0])
bone("neck", "chest", joint("neck"))
bone("head", "neck", joint("head"))
for s in ["l", "r"]:
    for n, p, c in [
        ("shoulder", "chest", "shoulder"),
        ("elbow", s + "shoulder", "elbow"),
        ("hand", s + "elbow", "hand"),
        ("thigh", "hips", "upper-leg"),
        ("shin", s + "thigh", "knee"),
        ("foot", s + "shin", "ankle"),
    ]:
        bone(s + n, p, joint(s + "-" + c))
bn = list(bones)
M = {}
batches = defaultdict(lambda: [[], [], [], [], [], []])


def linear(c):
    c = np.array(c) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def mat(n, c, rough=0.93):
    M[n] = (linear(c), rough)


for entry in [
    ("skin", [178, 127, 93], 0.76),
    ("hair", [46, 34, 29]),
    ("eyes", [235, 220, 196], 0.36),
    ("iris", [70, 43, 30], 0.26),
    ("pupil", [19, 14, 13], 0.20),
    ("shirt", [135, 124, 97]),
    ("vest", [66, 75, 62]),
    ("trim", [51, 56, 47]),
    ("trouser", [81, 74, 64]),
    ("boot", [61, 49, 41]),
    ("sole", [49, 46, 42]),
    ("scarf", [140, 88, 69]),
    ("weave", [207, 176, 131]),
    ("hardware", [140, 119, 82], 0.54),
    ("satchel", [125, 88, 58]),
    ("supplies", [166, 125, 76]),
]:
    mat(*entry)


def wpart(b):
    return {b: 1} if isinstance(b, str) else b


def addmesh(m, pp, ff, b="head", colors=None):
    if not len(pp):
        return
    pp = np.array(pp, dtype=float)
    ff = np.array(ff, dtype=int)
    p, n, col, j, w, ind = batches[m]
    off = len(p)
    norms = np.zeros_like(pp)
    norm = np.cross(pp[ff[:, 1]] - pp[ff[:, 0]], pp[ff[:, 2]] - pp[ff[:, 0]])
    for i in range(3):
        np.add.at(norms, ff[:, i], norm)
    norms /= np.maximum(1e-10, np.linalg.norm(norms, axis=1))[:, None]
    p.extend(pp)
    n.extend(norms)
    cc = np.tile([1.0, 1.0, 1.0], (len(pp), 1)) if colors is None else np.array(colors)
    col.extend(np.clip(cc, 0, 1))
    for pos in pp:
        ww = wpart(b(pos) if callable(b) else b)
        keys = [k for k, weight in ww.items() if weight > 0.000001][:4]
        j.append([bn.index(k) for k in keys] + [0] * (4 - len(keys)))
        weights = np.array([ww[k] for k in keys])
        w.append(list(weights / weights.sum()) + [0] * (4 - len(keys)))
    ind.extend(ff.flatten() + off)


def smooth(x):
    return np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))


def between(a, b, t):
    t = float(smooth(t))
    return {a: 1 - t, b: t}


def torso(p):
    return between("hips", "chest", (p[1] - 1.03) / 0.25)


def fixedbody(m, faces, transform=None, color=None, b="head"):
    ids = np.unique(np.concatenate(faces))
    mp = {int(a): i for i, a in enumerate(ids)}
    pp = v[ids].copy()
    if transform:
        pp = np.array([transform(p) for p in pp])
    ff = []
    for q in faces:
        for i in range(1, len(q) - 1):
            ff.append([mp[q[0]], mp[q[i]], mp[q[i + 1]]])
    addmesh(m, pp, ff, b, [color(p) for p in pp] if color else None)


# The face, exposed collar and fingers retain the upstream anatomical topology.
face = []
hands = {"l": [], "r": []}
for q in f["body"]:
    c = v[q].mean(0)
    x, y, z = c
    if y > 1.496 and abs(x) < 0.091:
        face.append(q)
    if abs(x) > 0.45 and y < 1.20 and z > 0.155:
        hands["l" if x > 0 else "r"].append(q)


def shade(p):
    x, y, z = p
    c = np.ones(3) * 0.985
    if y > 1.55:
        # Layered beard stubble and warm blush around the mouth.
        side = abs(x)
        sideburn = y < 1.685 and z < 0.084 and side > 0.047
        jaw = y < 1.583 + side * 0.75 and y > 1.554 and z > 0.049
        stache = abs(y - 1.609) < 0.0045 and side < 0.031 and z > 0.15
        if not female and (sideburn or jaw or stache):
            c *= np.array([0.25, 0.24, 0.23]) * rng.uniform(0.66, 1.1)
        if 1.596 < y < 1.605 and z > 0.149 and side < 0.029:
            c *= np.array([0.81, 0.48, 0.52])
        if (
            1.68 < y < 1.693
            and z > 0.129
            and 0.012 < side < 0.051
            and abs((y - 1.686) - 0.004 * math.cos((side - 0.03) * 88)) < 0.0034
        ):
            c *= 0.12
    return c


fixedbody("skin", face, color=shade, b=lambda p: between("neck", "head", (p[1] - 1.51) / 0.08))
for s in hands:
    fixedbody("skin", hands[s], b=s + "hand")


def cap(p):
    x, y, z = p
    return y > 1.655 + np.clip((z - 0.04) / 0.1, -0.75, 1) * 0.052 + 0.003 * np.sin(x * 80 + z * 55)


hairfaces = [q for q in face if cap(v[q].mean(0))]


def hairpos(p):
    x, y, z = p
    wave = 0.0018 * math.sin(x * 195 + z * 133 + 1.9 * math.sin(z * 59)) + 0.0011 * math.sin(
        z * 160 - x * 65
    )
    return [
        x * (1.045 + wave * 9),
        y + (y - 1.63) * 0.055 + wave,
        0.058 + (z - 0.058) * (1.045 + wave * 7),
    ]


fixedbody(
    "hair",
    hairfaces,
    hairpos,
    lambda p: np.ones(3)
    * (0.51 + 0.4 * (0.5 + 0.5 * math.sin(p[0] * 195 + p[2] * 133 + 1.9 * math.sin(p[2] * 59)))),
)


def quadstrip(nr, N):
    return [
        [a, b, c]
        for i in range(nr - 1)
        for j in range(N)
        for a, b, c in [
            (i * N + j, (i + 1) * N + j, i * N + (j + 1) % N),
            (i * N + (j + 1) % N, (i + 1) * N + j, (i + 1) * N + (j + 1) % N),
        ]
    ]


def oval(m, cent, rad, b, segments=16):
    pp = []
    ff = []
    cent = P(cent)
    rad = P(rad)
    for k in range(11):
        ph = math.pi * k / 10
        for j in range(segments):
            t = 2 * math.pi * j / segments
            pp.append(
                cent
                + rad * P([math.cos(t) * math.sin(ph), math.cos(ph), math.sin(t) * math.sin(ph)])
            )
    ff = np.array(quadstrip(11, segments))[:, ::-1]
    addmesh(m, pp, ff, b)


for s, sign in [("l", 1), ("r", -1)]:
    c = joint(s + "-eye")
    oval("eyes", c, [0.0153, 0.0143, 0.016], "head", 24)
    oval("iris", c + [0, -0.003, 0.0144], [0.0066, 0.0069, 0.0019], "head", 20)
    oval("pupil", c + [0, -0.003, 0.0161], [0.0031, 0.00335, 0.0008], "head")
    oval("eyes", c + [-0.0019, -0.0004, 0.0169], [0.001, 0.001, 0.0003], "head", 8)


# Closed tailoring rings. Cells follow the drape, folds and boot creases.
def shell(m, rows, b, N=40, fold=0.012, seed=0):
    pp = []
    cols = []
    ff = quadstrip(len(rows), N)
    for i, (y, cx, cz, rx, rz) in enumerate(rows):
        for j in range(N):
            a = math.tau * j / N
            k = 1 + fold * (math.cos(7 * a + 1.5 * y + seed) + 0.5 * math.sin(11 * a + y * 9))
            drape = (
                (0.004 * math.sin(3 * a + y * 2) + 0.003 * math.cos(a * 5))
                if m in ("scarf", "weave")
                else 0
            )
            pp.append(
                [
                    cx + rx * np.cos(a) * k,
                    y + fold * 0.055 * math.sin(5 * a + y * 8) + drape,
                    cz + rz * np.sin(a) * k,
                ]
            )
            cols.append(
                np.ones(3) * (0.90 + 0.08 * math.sin(7 * a + 1.5 * y + seed) * min(1, fold * 30))
            )
    for pos, top in [(0, False), (len(rows) - 1, True)]:
        idx = len(pp)
        y, x, z, _, _ = rows[pos]
        pp.append([x, y, z])
        cols.append([0.95] * 3)
        for j in range(N):
            tri = [idx, pos * N + j, pos * N + (j + 1) % N]
            ff.append(tri if top == False else tri[::-1])
    addmesh(m, pp, ff, b, cols)


def rings(m, rr, b="chest", **kw):
    shell(m, [(y, 0, z, rx, rz) for y, rx, rz, z in rr], b, **kw)


def band(m, y, rx, rz, z, h=0.009, b="chest"):
    rings(m, [(y, rx, rz, z), (y + h, rx, rz, z)], b, fold=0.006)


def tube(m, points, radii, b, seg=16):
    pts = np.array(points)
    pp = []
    ff = quadstrip(len(pts), seg)
    for i, c in enumerate(pts):
        a = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        a /= np.linalg.norm(a)
        d = P([0.0, 0.0, 1.0]) if abs(a[2]) < 0.86 else P([0.0, 1.0, 0.0])
        u = np.cross(a, d)
        u /= np.linalg.norm(u)
        v0 = np.cross(a, u)
        r = radii[i] if isinstance(radii, list) else radii
        rx, ry = (r, r) if np.isscalar(r) else r
        for j in range(seg):
            t = math.tau * j / seg
            pp.append(c + u * rx * math.cos(t) + v0 * ry * math.sin(t))
    for end in (0, len(pts) - 1):
        start = end * seg
        for j in range(1, seg - 1):
            ff.append(
                [start, start + j, start + j + 1] if end == 0 else [start, start + j + 1, start + j]
            )
    addmesh(m, pp, np.array(ff)[:, ::-1], b)


def block(m, center, dimensions, b):
    # Rounded leather/cloth panels formed from three bevel rings.
    x, y, z = center
    w, h, d = dimensions
    rr = min(w * 0.1, d * 0.24, h * 0.1)
    outline = [
        (-w / 2 + rr, -d / 2),
        (w / 2 - rr, -d / 2),
        (w / 2, -d / 2 + rr),
        (w / 2, d / 2 - rr),
        (w / 2 - rr, d / 2),
        (-w / 2 + rr, d / 2),
        (-w / 2, d / 2 - rr),
        (-w / 2, -d / 2 + rr),
    ]
    pp = []
    ff = quadstrip(4, 8)
    for Y, k in [(-h / 2, 0.87), (-h / 2 + rr, 1), (h / 2 - rr, 1), (h / 2, 0.87)]:
        pp.extend([[x + dx * k, y + Y, z + dz * k] for dx, dz in outline])
    for j in range(1, 7):
        ff.extend([[0, j, j + 1], [24, 24 + j + 1, 24 + j]])
    addmesh(m, pp, ff, b)


for s, sgn in [("l", 1), ("r", -1)]:

    def leg(p, s=s):
        return between(s + "shin", s + "thigh", (p[1] - 0.46) / 0.125)

    legrows = [
        (0.18, 0.186, 0.034, 0.058, 0.058),
        (0.22, 0.184, 0.032, 0.063, 0.063),
        (0.235, 0.182, 0.035, 0.059, 0.06),
        (0.245, 0.184, 0.032, 0.071, 0.061),
        (0.29, 0.181, 0.029, 0.076, 0.075),
        (0.35, 0.173, 0.027, 0.076, 0.075),
        (0.385, 0.169, 0.022, 0.074, 0.078),
        (0.42, 0.164, 0.028, 0.078, 0.074),
        (0.49, 0.158, 0.027, 0.075, 0.079),
        (0.52, 0.155, 0.026, 0.079, 0.081),
        (0.555, 0.15, 0.02, 0.076, 0.08),
        (0.61, 0.145, 0.011, 0.085, 0.089),
        (0.70, 0.137, 0.011, 0.094, 0.102),
        (0.78, 0.126, 0.005, 0.103, 0.109),
        (0.86, 0.113, 0.005, 0.116, 0.119),
        (0.91, 0.102, 0.008, 0.12, 0.119),
        (0.99, 0.09, 0.014, 0.11, 0.113),
    ]
    shell("trouser", [(y, x * sgn, z, rx, rz) for y, x, z, rx, rz in legrows], leg, 32, 0.046, sgn)
    boot = [
        (0.018, 0.202, 0.067, 0.059, 0.127),
        (0.035, 0.202, 0.067, 0.06, 0.129),
        (0.051, 0.202, 0.067, 0.059, 0.127),
        (0.068, 0.201, 0.065, 0.057, 0.12),
        (0.082, 0.20, 0.049, 0.056, 0.099),
        (0.10, 0.198, 0.036, 0.052, 0.081),
        (0.14, 0.194, 0.029, 0.049, 0.063),
        (0.18, 0.19, 0.03, 0.051, 0.06),
        (0.207, 0.187, 0.031, 0.055, 0.059),
    ]
    shell("boot", [(y, x * sgn, z, rx, rz) for y, x, z, rx, rz in boot], s + "foot", 30, 0.012)
    shell(
        "sole",
        [
            (y, 0.202 * sgn, 0.067, rx, rz)
            for y, rx, rz in [
                (0.002, 0.057, 0.124),
                (0.012, 0.061, 0.13),
                (0.031, 0.061, 0.13),
                (0.038, 0.06, 0.129),
            ]
        ],
        s + "foot",
        30,
        0.005,
    )
    for i in range(4):
        yy = 0.09 + i * 0.014
        zz = 0.144 - i * 0.014
        tube(
            "sole",
            [
                [0.201 * sgn - 0.025, yy, zz],
                [0.201 * sgn, yy + 0.001, zz + 0.005],
                [0.201 * sgn + 0.025, yy + 0.012, zz - 0.008],
            ],
            0.0027,
            s + "foot",
            8,
        )
    shoulder = bones[s + "shoulder"][1]
    elbow = bones[s + "elbow"][1]
    hand = bones[s + "hand"][1]
    wlim = lambda p, s=s, elbow=elbow: between(
        s + "shoulder",
        s + "elbow",
        (0.06 + np.dot(p - elbow, P([0.48 * (1 if s == "l" else -1), -0.53, 0.67]))) / 0.125,
    )
    sleeve = [
        shoulder + [-0.04 * sgn, 0.012, 0],
        shoulder,
        shoulder * 0.7 + elbow * 0.3,
        shoulder * 0.42 + elbow * 0.58,
        shoulder * 0.23 + elbow * 0.77,
        elbow,
        elbow * 0.8 + hand * 0.2,
        elbow * 0.55 + hand * 0.45,
        elbow * 0.39 + hand * 0.61,
        elbow * 0.20 + hand * 0.80,
        hand,
    ]
    sleeve[0] = shoulder + [-0.060 * sgn, -0.002, 0.0]
    oval("shirt", shoulder + [-0.011 * sgn, -0.003, 0], [0.076, 0.061, 0.073], s + "shoulder", 24)
    tube(
        "shirt",
        sleeve,
        [0.059, 0.078, 0.075, 0.071, 0.069, 0.063, 0.058, 0.061, 0.053, 0.049, 0.038],
        wlim,
        28,
    )
    tube("trim", [sleeve[-2] * 0.45 + hand * 0.55, hand], [0.043, 0.039], s + "elbow", 24)
# Practical linen tunic, field vest, belt and functional seams.
rings(
    "shirt",
    [
        (0.84, 0.211, 0.157, 0.012),
        (0.86, 0.213, 0.16, 0.012),
        (0.96, 0.205, 0.144, 0.018),
        (1.04, 0.154, 0.108, 0.026),
        (1.16, 0.153, 0.109, 0.032),
        (1.29, 0.166, 0.109, 0.026),
        (1.38, 0.179, 0.103, 0.022),
        (1.428, 0.183, 0.09, 0.018),
        (1.474, 0.13, 0.068, 0.027),
        (1.499, 0.078, 0.060, 0.038),
        (1.508, 0.070, 0.060, 0.042),
    ],
    torso,
    fold=0.033,
)
profile = [
    (1.018, 0.166, 0.124, 0.023),
    (1.045, 0.174, 0.127, 0.023),
    (1.15, 0.169, 0.133, 0.026),
    (1.24, 0.181, 0.139, 0.027),
    (1.32, 0.199, 0.139, 0.027),
    (1.39, 0.202, 0.122, 0.022),
    (1.424, 0.18, 0.099, 0.019),
    (1.465, 0.095, 0.073, 0.025),
]
rings("vest", profile, torso, fold=0.014)
for yy, rx, rz, z in [profile[0], profile[1], profile[3]]:
    band("trim", yy, rx + 0.001, rz + 0.003, z, 0.004, torso)
tube("trim", [[0, y, z + rz + 0.002] for y, rx, rz, z in profile], 0.0044, torso, 9)
for side in [-1, 1]:
    for y in [1.101, 1.31]:
        w = 0.081
        z = 0.14 if y < 1.2 else 0.151
        block("vest", [side * 0.09, y, z], [w, 0.089, 0.026], torso)
        block("trim", [side * 0.09, y + 0.043, z + 0.008], [w + 0.003, 0.022, 0.022], torso)
        oval("hardware", [side * 0.09, y + 0.039, z + 0.022], [0.004, 0.004, 0.0018], torso, 8)
# Leather utility bag, handle and shoulder strap.
block("satchel", [-0.129, 0.997, -0.094], [0.139, 0.158, 0.075], torso)
block("satchel", [-0.129, 1.045, -0.124], [0.145, 0.076, 0.035], torso)
block("hardware", [-0.129, 1.018, -0.145], [0.026, 0.029, 0.005], torso)
tube(
    "satchel",
    [
        [-0.126, 1.055, -0.133],
        [-0.07, 1.18, -0.119],
        [0.03, 1.31, -0.115],
        [0.136, 1.415, -0.056],
        [0.14, 1.444, 0.022],
        [0.124, 1.421, 0.091],
        [0.061, 1.32, 0.174],
        [-0.035, 1.20, 0.169],
        [-0.142, 1.06, 0.101],
        [-0.182, 1.01, 0],
        [-0.126, 1.055, -0.133],
    ],
    (0.011, 0.006),
    torso,
    12,
)
rings(
    "shirt",
    [(1.476, 0.096, 0.078, 0.032), (1.488, 0.087, 0.075, 0.033), (1.513, 0.067, 0.061, 0.039)],
    "neck",
    fold=0.012,
)
# Regional-style woven neck cloth with narrow dyed stripes and fringe.
sc = [
    (1.414, 0.150, 0.113, 0.033),
    (1.432, 0.145, 0.107, 0.031),
    (1.45, 0.127, 0.092, 0.036),
    (1.47, 0.112, 0.085, 0.038),
    (1.49, 0.088, 0.076, 0.043),
    (1.513, 0.074, 0.068, 0.046),
]
rings("scarf", sc, "neck", fold=0.045)
for k in [1, 3]:
    y, rx, rz, z = sc[k]
    band("weave", y, rx * 1.016, rz * 1.02, z, 0.0038, "neck")
tail = [
    [-0.089, 1.454, -0.024],
    [-0.104, 1.403, -0.076],
    [-0.091, 1.34, -0.108],
    [-0.106, 1.28, -0.12],
    [-0.092, 1.21, -0.118],
]


def ribbon(m, pts, widths, b):
    pp = []
    ff = []
    for ii, (p, w) in enumerate(zip(pts, widths)):
        for t in [-1, -0.5, 0, 0.5, 1]:
            pp.append(P(p) + P([w * t, 0, -0.002 * math.cos(t * 5 + ii)]))
            if ii and t != -1:
                k = len(pp) - 1
                ff.extend([[k - 6, k - 1, k], [k - 6, k, k - 5]])
    addmesh(m, pp, ff, b)


ribbon("scarf", tail, [0.028, 0.043, 0.046, 0.039, 0.032], torso)
for i in range(8):
    x = -0.12 + i * 0.008
    tube(
        "weave", [[x, 1.213, -0.119], [x + 0.002, 1.191 + (i % 3) * 0.006, -0.12]], 0.0016, torso, 6
    )
if female:
    # Woven dress below the waist and full head covering; its folded crown and
    # asymmetric ends distinguish this silhouette at gameplay distance.
    rings(
        "shirt",
        [
            (0.32, 0.226, 0.167, 0.012),
            (0.35, 0.227, 0.163, 0.012),
            (0.59, 0.222, 0.151, 0.008),
            (0.83, 0.218, 0.155, 0.013),
            (1.02, 0.18, 0.133, 0.021),
        ],
        "hips",
        fold=0.062,
    )
    for yy in [0.348, 0.364, 0.386, 0.837]:
        band(
            "weave",
            yy,
            0.227 if yy < 0.4 else 0.218,
            0.166 if yy < 0.4 else 0.157,
            0.011,
            0.006,
            "hips",
        )
    # Open-front scarf hood; angles are around the profile, mesh closes behind the face.
    pp = []
    ff = []
    N = 39
    for i, (y, rx, rz, cz, arc) in enumerate(
        [
            (1.39, 0.135, 0.092, 0.019, 2.2),
            (1.47, 0.114, 0.092, 0.029, 2.4),
            (1.54, 0.088, 0.105, 0.052, 2.32),
            (1.63, 0.094, 0.109, 0.05, 2.17),
            (1.68, 0.102, 0.123, 0.057, 0.96),
            (1.705, 0.101, 0.124, 0.057, 0.45),
            (1.733, 0.099, 0.123, 0.057, 0.0),
            (1.772, 0.075, 0.099, 0.057, 0.0),
            (1.80, 0.002, 0.003, 0.057, 0.0),
        ]
    ):
        for j in range(N):
            ang = math.pi / 2 + arc + (math.tau - 2 * arc) * j / (N - 1)
            k = 1 + 0.018 * math.sin(ang * 9 + i * 0.4)
            pp.append(
                [rx * math.cos(ang) * k, y + 0.004 * math.sin(ang * 4), cz + rz * math.sin(ang) * k]
            )
            if i and j:
                k = len(pp) - 1
                ff.extend([[k - N - 1, k - 1, k], [k - N - 1, k, k - N]])
    addmesh("scarf", pp, ff, "head")
    for edge in [0, N - 1]:
        tube("weave", [pp[i * N + edge] for i in range(9)], 0.002, "head", 8)
    for side in [-1, 1]:
        ribbon(
            "scarf",
            [
                [side * 0.073, 1.66, 0.11],
                [side * 0.079, 1.56, 0.107],
                [side * 0.103, 1.49, 0.11],
                [side * 0.133, 1.43, 0.116],
                [side * 0.111, 1.34, 0.159],
                [side * 0.118, 1.25, 0.153],
            ],
            [0.015, 0.024, 0.035, 0.039, 0.04, 0.028],
            "neck",
        )
# Compact GLB with one shared skinned mesh and a collection of authored performances.
blob = bytearray()
acc = []
views = []


def access(a, ctype, typ, dtype, mm=False, normalized=False):
    a = np.ascontiguousarray(a, dtype=dtype)
    d = a.tobytes()
    idx = len(views)
    start = len(blob)
    blob.extend(d)
    blob.extend(bytes((-len(blob)) % 4))
    views.append({"buffer": 0, "byteOffset": start, "byteLength": len(d)})
    item = {"bufferView": idx, "componentType": ctype, "count": len(a), "type": typ}
    if normalized:
        item["normalized"] = True
    if mm:
        item.update(
            min=a.min(axis=0).reshape(-1).astype(float).tolist(),
            max=a.max(axis=0).reshape(-1).astype(float).tolist(),
        )
    acc.append(item)
    return len(acc) - 1


nodes = [{"name": "Sumer", "children": [1]}]
mats = []
prims = []
for i, n in enumerate(bn):
    par, c = bones[n]
    local = c if par is None else c - bones[par][1]
    children = [j + 1 for j, k in enumerate(bn) if bones[k][0] == n]
    nodes.append(
        {"name": n, "translation": local.tolist(), **({"children": children} if children else {})}
    )
nodes.append({"name": "TailoredFigure", "mesh": 0, "skin": 0})


def morph(points, material, expression):
    points = np.array(points)
    offset = np.zeros_like(points)
    if material == "skin":
        x, y, z = points.T
        eye = joint("l-eye")
        if expression == "blink":
            width = np.clip(1 - ((abs(x) - abs(eye[0])) / 0.023) ** 4, 0, 1)
            depth = np.clip((z - eye[2] - 0.004) / 0.006, 0, 1)
            height = np.clip(1 - ((y - eye[1] - 0.001) / 0.017) ** 2, 0, 1)
            offset[:, 1] = -(y - eye[1] + 0.004) * width * height * depth
            offset[:, 2] = 0.003 * width * height * depth
        else:
            brow = np.exp(
                -(((abs(x) - 0.026) / 0.023) ** 2) - ((y - eye[1] - 0.019) / 0.013) ** 2
            ) * np.clip((z - 0.11) / 0.02, 0, 1)
            lip = np.exp(-(((y - 1.6) / 0.011) ** 2) - ((abs(x) - 0.025) / 0.012) ** 2) * np.clip(
                (z - 0.12) / 0.025, 0, 1
            )
            offset[:, 1] = 0.006 * brow - 0.003 * lip
            offset[:, 0] = -0.002 * np.sign(x) * brow
    ids = np.where(np.max(np.abs(offset), axis=1) > 0.00012)[0]
    item = {
        "componentType": 5126,
        "count": len(points),
        "type": "VEC3",
        "min": offset.min(axis=0).tolist(),
        "max": offset.max(axis=0).tolist(),
    }
    if len(ids):
        ia = access(ids, 5123, "SCALAR", "<u2")
        va = access(offset[ids], 5126, "VEC3", "<f4")
        item["sparse"] = {
            "count": len(ids),
            "indices": {"bufferView": acc[ia]["bufferView"], "componentType": 5123},
            "values": {"bufferView": acc[va]["bufferView"]},
        }
    acc.append(item)
    return len(acc) - 1


# Small original woven and cut-leather surfaces. Shared, embedded PNGs keep
# silhouettes smooth; their understated fine grain remains stable at distance.
yy, xx = np.indices((128, 128))
noise = rng.normal(0, 1, (128, 128))
broad = gaussian_filter(noise, 7, mode="wrap")
broad /= broad.std()
weft = np.sin(xx * math.pi / 2) * np.cos(yy * math.pi / 2) + 0.65 * np.sin(yy * math.pi)
gr = (229 + 9 * weft + 5 * broad + 3 * noise).clip(0, 255)
img = np.stack([gr, gr * 0.99, gr * 0.975], axis=-1).astype("uint8")
h = 2 * (0.4 * np.cos(xx * math.pi / 2) * np.sin(yy * math.pi / 2) + 0.1 * noise)
normimg = (
    np.stack(
        [
            128 + 9 * (np.roll(h, -1, 1) - h),
            128 + 9 * (np.roll(h, -1, 0) - h),
            np.full_like(h, 254),
        ],
        axis=-1,
    )
    .clip(0, 255)
    .astype("uint8")
)
images = []
for im in [img, normimg]:
    stream = io.BytesIO()
    Image.fromarray(im).save(stream, format="PNG", optimize=True)
    d = stream.getvalue()
    start = len(blob)
    blob.extend(d)
    blob.extend(bytes((-len(blob)) % 4))
    views.append({"buffer": 0, "byteOffset": start, "byteLength": len(d)})
    images.append({"bufferView": len(views) - 1, "mimeType": "image/png"})
for m, (p, n, col, j, w, indices) in batches.items():
    ci, rough = M[m]
    mats.append(
        {
            "name": m,
            "doubleSided": m in ("scarf", "weave", "hair"),
            "pbrMetallicRoughness": {
                "baseColorFactor": ci.tolist() + [1],
                "roughnessFactor": rough,
                "metallicFactor": 0.38 if m == "hardware" else 0,
            },
        }
    )
    ai = {
        "POSITION": access(p, 5126, "VEC3", "<f4", True),
        "NORMAL": access(n, 5126, "VEC3", "<f4"),
        "COLOR_0": access(
            np.c_[np.array(col), np.ones(len(col))] * 255, 5121, "VEC4", "u1", normalized=True
        ),
        "JOINTS_0": access(j, 5121, "VEC4", "u1"),
        "WEIGHTS_0": access(w, 5126, "VEC4", "<f4"),
    }
    if m in ("vest", "shirt", "trouser", "scarf", "trim", "boot", "satchel", "weave"):
        mats[-1]["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0}
        mats[-1]["normalTexture"] = {
            "index": 1,
            "scale": 0.21 if m in ("boot", "satchel") else 0.55,
        }
        points = np.array(p)
        uv = np.stack(
            [(points[:, 0] + 0.5 * points[:, 2]) * 6.4, (points[:, 1] + 0.27 * points[:, 2]) * 6.4],
            axis=-1,
        )
        ai["TEXCOORD_0"] = access(uv, 5126, "VEC2", "<f4")
        normals = np.array(n)
        vb = P([0.0, 1.0, 0.27])
        ub = P([1.0, 0.0, 0.50])
        tang = np.cross(normals, vb)
        length = np.linalg.norm(tang, axis=1)
        fallback = length < 0.0001
        tang[fallback] = np.cross(normals[fallback], P([1.0, 0.0, 0.0]))
        length = np.linalg.norm(tang, axis=1)
        tang /= np.maximum(length, 1e-10)[:, None]
        tang[(tang @ ub) < 0] *= -1
        handed = np.sign(np.cross(normals, tang) @ vb)
        handed[handed == 0] = 1
        ai["TANGENT"] = access(np.c_[tang, handed], 5126, "VEC4", "<f4")
    prims.append(
        {
            "attributes": ai,
            "targets": [{"POSITION": morph(p, m, ex)} for ex in ("blink", "concern")],
            "indices": access(indices, 5123, "SCALAR", "<u2"),
            "material": len(mats) - 1,
        }
    )
ib = []
for n in bn:
    mm = np.eye(4)
    mm[:3, 3] = -bones[n][1]
    ib.append(mm.T.ravel())
iba = access(ib, 5126, "MAT4", "<f4")
animations = []
for name, duration in [
    ("idle", 3.6),
    ("walk", 1.03),
    ("run", 0.72),
    ("sprint", 0.58),
    ("jump", 0.85),
    ("crouch", 1.3),
    ("interact", 1.35),
    ("climb", 1.3),
    ("help", 2.1),
    ("carry", 1.18),
    ("cover", 2.7),
    ("signal", 1.8),
]:
    times = np.linspace(0, duration, 17)
    ti = access(times, 5126, "SCALAR", "<f4", True)
    tracks = defaultdict(list)
    for t in times / duration:
        a = math.tau * t
        si = math.sin(a)
        co = math.cos(a)
        arch = math.sin(math.pi * t) ** 2
        pose = {k: P([0.0, 0.0, 0.0]) for k in bn}
        ofs = P([0.0, 0.0, 0.0])
        pace = {"walk": 0.36, "run": 0.61, "sprint": 0.77, "carry": 0.3, "climb": 0.38}.get(name, 0)
        torsoangle = 0.035 + 0.007 * si
        if name in ["run", "sprint"]:
            torsoangle = 0.19
        if name in ["crouch", "cover", "help"]:
            torsoangle = 0.27
            ofs[1] = -0.22
        if name == "interact":
            torsoangle = 0.085 + 0.14 * arch
        if name == "jump":
            torsoangle = 0.06 + 0.15 * arch
        for side, sign in [("l", 1), ("r", -1)]:
            phase = si * sign
            swing = pace * phase
            sh = P([swing * 0.8, 0.025 * sign, -0.54 * sign])
            el = P([0.44 - max(0, swing) * 0.5, 0.0, 0.025 * sign])
            thigh = P([-swing, 0.0, -0.10 * sign])
            shin = P([0.025 + max(0, -phase) * pace * 1.4, 0.0, 0.0])
            foot = P([-swing * 0.4 - shin[0] * 0.5, 0.0, 0.0])
            if name in ["run", "sprint"]:
                el[0] = -0.42 - 0.21 * phase
                sh[0] = swing - 0.12
            if name in ["cover", "crouch", "help"]:
                thigh[0] = -0.90
                shin[0] = 1.50
                foot[0] = -0.61
                sh[0] = -0.27
                el[0] = -0.08
            if name == "help":
                sh[0] = -0.58 - 0.24 * arch
                el[0] = -0.28 + arch * 0.2
                thigh[0] -= sign * 0.17
            if name == "climb":
                sh[0] = -1.47 - swing
                el[0] = -0.47 + 0.21 * phase
                thigh[0] = -0.37 - swing
                shin[0] = 0.65 + phase * 0.32
            if name == "carry":
                sh[0] = -0.53
                el[0] = -0.45
                sh[2] = -0.57 * sign
            if name == "signal" and side == "r":
                sh[0] = -0.88 - 1.56 * arch
                sh[2] = -0.15 * sign
                el[0] = -0.24
            if name == "interact" and side == "r":
                sh[0] = -0.15 - 1.14 * arch
                el[0] = 0.14 - 0.4 * arch
            if name == "jump":
                thigh[0] = -0.75 * arch
                shin[0] = 1.15 * arch
                sh[0] = -0.55 * arch
            for k, r in [
                ("shoulder", sh),
                ("elbow", el),
                ("thigh", thigh),
                ("shin", shin),
                ("foot", foot),
            ]:
                pose[side + k] = r
        pose["chest"] = [torsoangle, -pace * 0.12 * co, 0.012 * co]
        pose["head"] = [-torsoangle * 0.55, 0.032 * si, 0.009 * si]
        pose["hips"] = [0, pace * 0.08 * co, pace * 0.04 * co]
        ofs[1] += 0.015 * (1 - math.cos(2 * a)) if pace else 0.0015 * si
        tracks["translation"].append(bones["hips"][1] + ofs)
        for k, r in pose.items():
            tracks[k].append(Rotation.from_euler("xyz", r).as_quat())
    sam = []
    ch = []
    for k, values in tracks.items():
        if k not in ["translation"] and np.max(abs(np.array(values) - [0, 0, 0, 1])) < 0.0001:
            continue
        trans = k == "translation"
        ao = access(values, 5126, "VEC3" if trans else "VEC4", "<f4")
        sam.append({"input": ti, "output": ao, "interpolation": "LINEAR"})
        ch.append(
            {
                "sampler": len(sam) - 1,
                "target": {
                    "node": 1 if trans else bn.index(k) + 1,
                    "path": "translation" if trans else "rotation",
                },
            }
        )
    # Quiet blinks, lifted inner brows and a tightened mouth for the rescue poses.
    blinktime = 0.46 * duration
    ft = [0, blinktime - 0.065, blinktime, blinktime + 0.095, duration]
    stress = {"help": 0.78, "cover": 0.85, "climb": 0.55, "signal": 0.56, "interact": 0.35}.get(
        name, 0.12
    )
    vals = [0, stress * 0.85, 0, stress, 0.93, stress, 0, stress, 0, stress * 0.85]
    fi = access(ft, 5126, "SCALAR", "<f4", True)
    fo = access(vals, 5126, "SCALAR", "<f4")
    sam.append({"input": fi, "output": fo, "interpolation": "LINEAR"})
    ch.append({"sampler": len(sam) - 1, "target": {"node": 1 + len(bn), "path": "weights"}})
    animations.append({"name": name, "samplers": sam, "channels": ch})
scene = {
    "asset": {"version": "2.0", "generator": "Sinjar custom character workshop"},
    "textures": [{"source": 0, "sampler": 0}, {"source": 1, "sampler": 0}],
    "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
    "images": images,
    "scene": 0,
    "scenes": [{"nodes": [0, 1 + len(bn)]}],
    "nodes": nodes,
    "meshes": [
        {
            "name": "Sumer layered clothing and facial mesh",
            "primitives": prims,
            "weights": [0, 0],
            "extras": {"targetNames": ["blink", "concern"]},
        }
    ],
    "skins": [{"inverseBindMatrices": iba, "skeleton": 1, "joints": list(range(1, len(bn) + 1))}],
    "materials": mats,
    "animations": animations,
    "buffers": [{"byteLength": len(blob)}],
    "bufferViews": views,
    "accessors": acc,
}
js = json.dumps(scene, separators=(",", ":")).encode()
js += b" " * ((-len(js)) % 4)
with open(out, "wb") as handle:
    handle.write(
        struct.pack("<4sII", b"glTF", 2, 28 + len(js) + len(blob))
        + struct.pack("<I4s", len(js), b"JSON")
        + js
        + struct.pack("<I4s", len(blob), b"BIN\0")
        + blob
    )
print(
    "file",
    out,
    os.path.getsize(out),
    "triangles",
    sum(len(i) // 3 for _, _, _, _, _, i in batches.values()),
)

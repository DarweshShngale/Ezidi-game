import os

gender = os.environ.get("ACTOR", "male")
import numpy as np
from collections import defaultdict

v = []
faces = defaultdict(list)
grp = ""
for l in open("base.obj"):
    a = l.split()
    if not a:
        continue
    if a[0] == "v":
        v.append(list(map(float, a[1:4])))
    if a[0] == "g":
        grp = a[1]
    if a[0] == "f":
        faces[grp].append([int(s.split("/")[0]) - 1 for s in a[1:]])
v = np.array(v)
for name, w in [(gender, 1.0), ("femaledetail" if gender == "female" else "detail", 1.0)]:
    for l in open(name + ".target"):
        a = l.split()
        if len(a) == 4 and a[0].isdigit():
            v[int(a[0])] += np.array(a[1:], dtype=float) * w
body = np.unique(np.concatenate(faces["body"]))
mn = v[body].min(0)
mx = v[body].max(0)
scale = 1.78 / (mx[1] - mn[1])
v[:, 1] -= mn[1]
v *= scale


def joint(n):
    return v[np.unique(np.concatenate(faces["joint-" + n]))].mean(0)

import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Small changes residents make to the same neighbourhood over the course of the story.
export function chapterSet(scene: T.Scene) {
  const root = new T.Group()
  scene.add(root)
  const mats = [0x826844, 0xb5a88e, 0x616d5c, 0x484d49, 0x98795a, 0xd4bd91, 0x9aa8a3].map(
    (color) => new T.MeshStandardMaterial({ color, roughness: 0.91, side: T.DoubleSide }),
  )
  const lamp = new T.MeshStandardMaterial({
    color: 0xfadca3,
    emissive: 0xffb65b,
    emissiveIntensity: 1.4,
  })
  const materials = [...mats, lamp]
  const geometries: T.BufferGeometry[][] = materials.map(() => [])
  const vec = (x: number, y: number, z: number) => new T.Vector3(x, y, z)
  function piece(g: T.BufferGeometry, m: number, x: number, y: number, z: number, tilt = 0) {
    g.rotateZ(tilt)
    g.translate(x, y, z)
    geometries[m].push(g.index ? g.toNonIndexed() : g)
    if (g.index) g.dispose()
  }
  const box = (m: number, x: number, y: number, z: number, w: number, h: number, d: number, tilt = 0) =>
    piece(new T.BoxGeometry(w, h, d), m, x, y, z, tilt)
  function beam(a: T.Vector3, b: T.Vector3, r: number, m: number) {
    const g = new T.CylinderGeometry(r, r, a.distanceTo(b), 7),
      delta = b.clone().sub(a)
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(vec(0, 1, 0), delta.normalize()))
    const centre = a.clone().lerp(b, 0.5)
    piece(g, m, centre.x, centre.y, centre.z)
  }
  function fabric(x: number, z: number, s: number) {
    for (const sign of [-1, 1]) {
      beam(vec(x, 0, z + sign * s), vec(x, 2.04, z + sign * s), 0.045, 0)
      beam(vec(x - 1.1, 0, z + sign * s), vec(x - 1.1, 1.34, z + sign * s), 0.034, 0)
    }
    for (const sign of [-1, 1]) {
      const g = new T.PlaneGeometry(1.4, 2 * s, 6, 8)
      g.rotateX(-Math.PI / 2)
      const pos = g.attributes.position
      for (let i = 0; i < pos.count; i++) {
        const u = pos.getX(i) / 1.4 + 0.5,
          v = pos.getZ(i)
        pos.setXYZ(
          i,
          sign * u * 1.26,
          2.1 - 0.8 * u - 0.12 * (1 - Math.abs(v) / s) + 0.035 * Math.sin(v * 6),
          v,
        )
      }
      g.computeVertexNormals()
      piece(g, sign > 0 ? 1 : 2, x, 0, z)
    }
  }
  function crate(x: number, z: number, stack: number) {
    for (let j = 0; j < stack; j++) {
      const y = 0.26 + j * 0.49
      box(0, x, y, z, 0.8, 0.46, 0.55)
      for (const d of [-0.24, 0.24]) box(4, x, y + 0.23, z + d, 0.85, 0.06, 0.065)
      for (const d of [-0.3, 0.3]) box(4, x + d, y, z + 0.28, 0.1, 0.48, 0.035)
    }
  }
  function lampPost(x: number, z: number) {
    beam(vec(x, 0, z), vec(x, 2.15, z), 0.055, 0)
    beam(vec(x, 2.13, z), vec(x + 0.46, 2.13, z), 0.035, 3)
    box(7, x + 0.4, 1.92, z, 0.18, 0.26, 0.18)
    box(3, x + 0.4, 2.07, z, 0.25, 0.06, 0.25)
    box(3, x + 0.4, 1.76, z, 0.23, 0.05, 0.23)
  }
  let current = -1
  function switchTo(chapter: number) {
    if (current === chapter) return
    current = chapter
    root.traverse((n) => {
      if (n instanceof T.Mesh) n.geometry.dispose()
    })
    root.clear()
    switch (chapter) {
      case 0: // Loaves cool on the baker's board.
        box(0, -5.25, 0.75, 12, 0.62, 0.08, 1.35)
        for (const a of [-0.48, 0.48]) box(0, -5.25, 0.37, 12 + a, 0.46, 0.72, 0.08)
        for (let i = 0; i < 6; i++) {
          const g = new T.SphereGeometry(0.15, 11, 6)
          g.scale(0.8, 0.42, 1.15)
          piece(g, 5, -5.42 + (i % 2) * 0.27, 0.83, 11.63 + Math.floor(i / 2) * 0.34)
        }
        break
      case 1:
        fabric(-6, 13.8, 1.5)
        crate(-6.3, 10.5, 1)
        lampPost(-5.4, 11.2)
        break
      case 2:
        fabric(-6, -18.8, 1.6)
        fabric(6, -20.5, 1.55)
        for (let i = 0; i < 4; i++) {
          box(2, 6.5 + i * 0.34, 0.25, -18.4, 0.27, 0.5, 0.17)
          box(3, 6.5 + i * 0.34, 0.52, -18.4, 0.14, 0.05, 0.09)
        }
        break
      case 3:
        crate(-6.1, -10.5, 2)
        crate(-5.5, -9.7, 1)
        lampPost(-5.4, -8.5)
        beam(vec(-5.8, 0, -10.5), vec(-5.8, 6, -10.5), 0.036, 3)
        for (let i = 0; i < 3; i++)
          beam(vec(-6.35, 4.9 + i * 0.33, -10.5), vec(-5.2, 4.9 + i * 0.33, -10.5), 0.024, 6)
        break
      case 4:
        fabric(-10, 2.1, 1.2)
        box(6, -10.6, 0.64, 1.6, 0.62, 0.1, 1.58)
        for (const d of [-0.6, 0.6]) box(3, -10.6, 0.32, 1.6 + d, 0.44, 0.62, 0.065)
        crate(-7.2, 1.2, 1)
        lampPost(-8.5, 0.8)
        break
      case 5:
        lampPost(3.9, -0.8)
        lampPost(-4.4, -17)
        for (let i = 0; i < 5; i++) box(5, 4.2 + i * 0.21, 0.12, -1.2, 0.16, 0.23, 0.14)
        break
      case 6:
        for (const x of [-7, -5.7])
          for (const z of [13.6, 16.0]) beam(vec(x, 0, z), vec(x, 3.8, z), 0.045, 3)
        for (const y of [1.3, 2.7]) {
          box(0, -6.35, y, 14.8, 1.35, 0.09, 2.55)
          beam(vec(-7, y, 13.6), vec(-7, y + 1.05, 16), 0.035, 3)
        }
        for (let i = 0; i < 5; i++) box(4, -5.7 + i * 0.24, 0.13, -13.4, 0.18, 0.24, 0.19)
        break
    }
    geometries.forEach((batch, i) => {
      if (!batch.length) return
      const g = mergeGeometries(batch)
      if (g) {
        const mesh = new T.Mesh(g, materials[i])
        mesh.castShadow = mesh.receiveShadow = true
        root.add(mesh)
      }
      batch.forEach((b) => b.dispose())
      batch.length = 0
    })
  }
  return { switchTo }
}

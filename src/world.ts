import * as T from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

export interface WorldCollider {
  x: number
  z: number
  w: number
  d: number
  h: number
}
type V = [number, number, number]
type Dimensions = [number, number, number]
type Paint = T.MeshStandardMaterial

/** Built in metres. X runs east, and the upper end of the market lane faces north (-Z). */
export function createWorld(scene: T.Scene) {
  const root = new T.Group()
  root.name = 'حيّ الجبل'
  scene.add(root)
  const colliders: WorldCollider[] = []
  const textures: T.Texture[] = []
  const materials: T.Material[] = []
  const loader = new T.TextureLoader()
  const base = import.meta.env.BASE_URL + 'world/'
  function texture(file: string, colour = true, repeating = true) {
    const t = loader.load(base + file + '.webp')
    t.colorSpace = colour ? T.SRGBColorSpace : T.NoColorSpace
    if (repeating) t.wrapS = t.wrapT = T.RepeatWrapping
    t.anisotropy = 2
    textures.push(t)
    return t
  }
  const diffuse = Object.fromEntries(
    ['wall', 'mortar', 'ashlar', 'wood', 'iron', 'rock', 'shoulder', 'ridge'].map((k) => [
      k,
      texture(k),
    ]),
  )
  const normals = Object.fromEntries(
    ['wall', 'mortar', 'ashlar', 'earth'].map((k) => [k, texture(k + '-n', false)]),
  )
  function paint(colour: T.ColorRepresentation, key?: string, roughness = 0.92, metalness = 0) {
    const m = new T.MeshStandardMaterial({
      color: colour,
      roughness,
      metalness,
      map: key ? diffuse[key] : null,
      normalMap: key ? normals[key] || null : null,
      normalScale: new T.Vector2(0.55, 0.55),
    })
    materials.push(m)
    return m
  }
  const limestone = paint('#fff0d4', 'ashlar'),
    masonry = paint('#d5be99', 'wall')
  const render = [
    paint('#f6dfad', 'mortar'),
    paint('#e2c4a1', 'mortar'),
    paint('#ddc9ad', 'wall'),
    paint('#c9bca7', 'mortar'),
  ]
  const ground = paint('#f5e8d3', 'shoulder'),
    timber = paint('#d1ab83', 'wood'),
    darkTimber = paint('#775d43', 'wood')
  const steel = paint('#49483f', undefined, 0.72, 0.36),
    black = paint('#201f1b'),
    glass = paint('#495a56', undefined, 0.29, 0.37)
  const fadedBlue = paint('#506d6a', 'iron'),
    shutters = [fadedBlue, paint('#848477', 'iron'), paint('#926f52', 'iron')]
  const trim = paint('#b2926d'),
    plaster = paint('#d8bea0'),
    rust = paint('#865a40'),
    cable = paint('#322b27')
  const headlamp = paint('#eee0bd'),
    carGlass = paint('#52605c', undefined, 0.27, 0.4)
  const lampGlass = paint('#c8bc9b')
  lampGlass.emissive.set('#ffc47e')
  lampGlass.emissiveIntensity = 0
  const rafter = paint('#574535', 'wood'),
    shadeCloth = [paint('#b5a078'), paint('#94705b'), paint('#7c8680')]
  const mistGrey = paint('#b4b4ac', undefined, 0.67, 0.25),
    rubber = paint('#302f2a')
  const labelMaterial = paint('#ffffff')
  labelMaterial.map = texture('lettering', true, false)
  labelMaterial.alphaTest = 0.23
  labelMaterial.polygonOffset = true
  labelMaterial.polygonOffsetFactor = -1
  const mural = paint('#f8ecd5')
  mural.map = texture('mural', true, false)
  const oliveMat = paint('#e4dcba')
  oliveMat.map = texture('olive', true, false)
  oliveMat.alphaTest = 0.46
  oliveMat.side = T.DoubleSide
  const commonUnit = new T.BoxGeometry(1, 1, 1)
  const cylinderCache = new Map<number, T.CylinderGeometry>()
  const place = new T.Object3D(),
    identity = new T.Matrix4()
  let buildingTransform = identity
  const batches = new Map<string, { mat: Paint; geometries: T.BufferGeometry[]; shadow: boolean }>()
  let seed = 6409
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296
  const between = (a: number, b: number) => a + (b - a) * random()
  const signed = (n: number) => (Math.sin(n * 121.73 + 56.3) * 43758.5453) % 1
  function emit(g: T.BufferGeometry, mat: Paint, shadow = true) {
    g.applyMatrix4(buildingTransform)
    g.computeBoundingBox()
    const min = g.boundingBox!.min,
      max = g.boundingBox!.max,
      area = Math.floor(min.x / 25) + ',' + Math.floor(min.z / 25)
    const id = mat.uuid + '|' + area + '|' + shadow
    let batch = batches.get(id)
    if (!batch) batches.set(id, (batch = { mat, geometries: [], shadow }))
    g.clearGroups()
    if (g.index) {
      const flat = g.toNonIndexed()
      g.dispose()
      g = flat
    }
    g.userData.smallDetail = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) < 0.85
    batch.geometries.push(g)
  }
  function box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: Paint,
    rot: V = [0, 0, 0],
    shadow = true,
  ) {
    const g = commonUnit.clone()
    const uv = g.attributes.uv
    if (m.map && m !== mural && m !== labelMaterial)
      for (let i = 0; i < uv.count; i++) {
        const face = Math.floor(i / 4),
          sx = face < 2 ? d : w,
          sy = face === 2 || face === 3 ? d : h
        uv.setXY(i, (uv.getX(i) * sx) / 2.7, (uv.getY(i) * sy) / 2.7)
      }
    place.position.set(x, y, z)
    place.scale.set(w, h, d)
    place.rotation.set(...rot)
    place.updateMatrix()
    g.applyMatrix4(place.matrix)
    emit(g, m, shadow)
  }
  function rod(a: V, b: V, r: number, m: Paint, r2 = r, n = 6, shadow = true) {
    const av = new T.Vector3(...a),
      bv = new T.Vector3(...b),
      v = bv.clone().sub(av)
    if (v.lengthSq() < 1e-6) return
    const key = n * 10000 + Math.round((r2 / r) * 100)
    let cylinder = cylinderCache.get(key)
    if (!cylinder) cylinderCache.set(key, (cylinder = new T.CylinderGeometry(r2 / r, 1, 1, n)))
    place.position.copy(av).lerp(bv, 0.5)
    place.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.clone().normalize())
    place.scale.set(r, v.length(), r)
    place.updateMatrix()
    const g = cylinder.clone().applyMatrix4(place.matrix)
    emit(g, m, shadow)
  }
  function plane(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    m: Paint,
    rot: V = [0, 0, 0],
    cell = -1,
    shadow = false,
  ) {
    const g = new T.PlaneGeometry(w, h)
    if (cell >= 0) {
      const uv = g.attributes.uv
      for (let i = 0; i < uv.count; i++)
        uv.setXY(
          i,
          ((cell % 4) + 0.012 + uv.getX(i) * 0.976) / 4,
          (4 - Math.floor(cell / 4) + 0.012 + uv.getY(i) * 0.976) / 5,
        )
    }
    g.rotateX(rot[0])
    g.rotateY(rot[1])
    g.rotateZ(rot[2])
    g.translate(x, y, z)
    emit(g, m, shadow)
  }
  const positioned = (x: number, z: number, yaw: number) =>
    new T.Matrix4().makeRotationY(yaw).setPosition(x, 0, z)
  function solid(x: number, z: number, w: number, d: number, h: number) {
    const b = new T.Box3(
      new T.Vector3(x - w / 2, 0, z - d / 2),
      new T.Vector3(x + w / 2, h, z + d / 2),
    ).applyMatrix4(buildingTransform)
    const v = b.getSize(new T.Vector3()),
      p = b.getCenter(new T.Vector3())
    colliders.push({ x: p.x, z: p.z, w: v.x, d: v.z, h })
  }

  // Sky and bounced dawn light are derived from the same panorama.
  const sky = texture('sky', true, false)
  sky.mapping = T.EquirectangularReflectionMapping
  const fog = new T.FogExp2('#c7b29d', 0.0095)
  scene.background = sky
  scene.environment = sky
  scene.environmentIntensity = 0.27
  scene.backgroundRotation.y = -2.5
  scene.environmentRotation.y = -2.5
  scene.fog = fog
  const hemi = new T.HemisphereLight('#e5ebf1', '#9b7964', 1.6)
  const sun = new T.DirectionalLight('#ffe2ad', 2.15)
  sun.position.set(-24, 27, -35)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 37, bottom: -37, near: 1, far: 115 })
  sun.shadow.bias = -0.00035
  sun.shadow.normalBias = 0.027
  root.add(hemi, sun, sun.target)
  box(0, -0.28, 0, 300, 0.55, 280, ground, [0, 0, 0], false)

  ground.normalMap = normals.earth
  const roadMat = paint('#ebe7df')
  roadMat.map = texture('road')
  roadMat.transparent = true
  roadMat.depthWrite = false
  roadMat.polygonOffset = true
  roadMat.polygonOffsetFactor = -1
  function road(x: number, z: number, width: number, length: number, rotation: number, height: number) {
    const g = new T.PlaneGeometry(width, length, 4, 20)
    g.rotateX(-Math.PI / 2)
    const a = g.attributes.position,
      uv = g.attributes.uv
    for (let i = 0; i < a.count; i++) {
      uv.setXY(i, uv.getX(i), (uv.getY(i) * length) / 13)
      a.setX(i, a.getX(i) + 0.17 * Math.sin(a.getZ(i) * 0.16) + 0.18 * Math.sin(a.getZ(i) * 0.068))
    }
    g.rotateY(rotation)
    g.translate(x, height, z)
    emit(g, roadMat, false)
  }
  road(0, 0, 7.2, 90, 0, 0.006)
  road(0, 0.04, 4.1, 69, Math.PI * 0.5, 0.004)
  road(0, 12, 3.8, 68, Math.PI * 0.5, 0.004)
  // The ridge consists of uplifted limestone bands with gullies cut into the near slopes.
  function ridge(depth: number, amplitude: number, tint: string, id: number) {
    const nx = 187,
      nz = 34,
      verts: number[] = [],
      uv: number[] = [],
      ix: number[] = [],
      colors: number[] = []
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = (i / nx - 0.5) * 340,
          t = j / nz,
          ridgeLine = 0.52 + 0.075 * Math.sin(x * 0.055 + id) + 0.055 * Math.sin(x * 0.11 - id)
        const localHeight =
          0.5 +
          0.15 * Math.sin(x * 0.027 + id) +
          0.038 * Math.cos(x * 0.13 + id) +
          0.012 * Math.sin(x * 0.4 - id)
        const contour = Math.pow(
          Math.max(0, 1 - Math.abs(t - ridgeLine) / (t < ridgeLine ? ridgeLine : 1 - ridgeLine)),
          0.68,
        )
        const gully = Math.abs(Math.sin(x * 0.147 + t * 3.4 + Math.sin(x * 0.078 + id))) ** 0.45
        const fn = (0.81 + 0.19 * gully) * localHeight * contour
        const z = -depth + (t - 0.5) * 48 + 2 * Math.sin(x * 0.047 + id)
        const y = -1.3 + amplitude * fn + signed(i * 45 + j + id) * 0.52 * contour
        verts.push(x, y, z)
        uv.push(x * 0.105, z * 0.075 + y * 0.094)
        const c = new T.Color(tint).multiplyScalar(
          0.78 + 0.23 * gully + 0.05 * Math.sin(y * 1.9) + 0.04 * Math.sin(x + t),
        )
        colors.push(c.r, c.g, c.b)
        if (j < nz && i < nx) {
          const k = j * (nx + 1) + i
          ix.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2)
        }
      }
    const g = new T.BufferGeometry()
    g.setAttribute('position', new T.Float32BufferAttribute(verts, 3))
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2))
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
    g.setIndex(ix)
    g.computeVertexNormals()
    const m = paint('#ffffff', id === 3 ? 'rock' : 'ridge')
    m.vertexColors = true
    const mountain = new T.Mesh(g, m)
    root.add(mountain)
  }
  ridge(116, 69, '#beb6b3', 3)
  ridge(88, 48, '#dccabd', 1)
  ridge(65, 24, '#c4ae8f', 5)

  const doors: { hinge: T.Group; point: T.Vector3; angle: number; open: boolean; rest: number }[] = []
  const breakables: { mesh: T.Group; point: T.Vector3; broken: boolean }[] = []
  function window(u: number, y: number, z: number, w: number, h: number, open: boolean) {
    box(u, y, z, w + 0.19, h + 0.23, 0.12, limestone)
    box(u, y, z + 0.068, w, h, 0.04, black)
    box(u, y, z + 0.103, w - 0.11, h - 0.09, 0.02, glass)
    box(u, y - h / 2 - 0.065, z + 0.09, w + 0.29, 0.13, 0.3, trim)
    box(u, y, z + 0.14, 0.042, h, 0.045, steel)
    box(u, y + 0.12 * h, z + 0.14, w, 0.043, 0.045, steel)
    if (open) {
      for (const sign of [-1, 1]) {
        const sx = u + sign * (w * 0.59)
        box(sx, y, z + 0.14, w * 0.23, h, 0.08, fadedBlue, [0, sign * 0.19, 0])
        for (let j = 0; j < 6; j++)
          box(sx, y - h * 0.42 + j * h * 0.15, z + 0.19, w * 0.23, 0.022, 0.03, steel)
      }
    } else for (let i = -1; i <= 1; i++) box(u + i * w * 0.28, y, z + 0.18, 0.023, h, 0.03, steel)
  }
  function door(u: number, z: number, wood: Paint) {
    const h = 2.28,
      w = 1.12
    box(u, h / 2, z - 0.02, w + 0.22, h + 0.16, 0.17, limestone)
    box(u, h / 2, z + 0.073, w + 0.03, h, 0.02, black)
    // Independent hinges allow an actual swinging door rather than a sign that changes state.
    const pivot = new T.Group()
    const p = new T.Vector3(u - w * 0.5, 0.01, z + 0.095).applyMatrix4(buildingTransform)
    pivot.position.copy(p)
    pivot.quaternion.setFromRotationMatrix(buildingTransform)
    const leaf = new T.Mesh(new T.BoxGeometry(w, h - 0.045, 0.074), wood)
    leaf.position.set(w * 0.5, h * 0.5, 0)
    leaf.castShadow = true
    pivot.add(leaf)
    const knob = new T.Mesh(new T.SphereGeometry(0.046, 6, 4), steel)
    knob.position.set(w * 0.86, 1.05, 0.085)
    pivot.add(knob)
    for (let i = 0; i < 3; i++) {
      const panel = new T.Mesh(new T.BoxGeometry(w * 0.82, 0.07, 0.025), darkTimber)
      panel.position.set(w * 0.5, 0.32 + i * 0.79, 0.05)
      pivot.add(panel)
    }
    root.add(pivot)
    const worldAngle = Math.atan2(buildingTransform.elements[8], buildingTransform.elements[10])
    doors.push({ hinge: pivot, point: p, angle: 0, open: false, rest: worldAngle })
  }
  function textileAwning(x: number, y: number, z: number, w: number, depth: number, variant: number) {
    const m = shadeCloth[variant % 3]
    m.side = T.DoubleSide
    const g = new T.PlaneGeometry(w, depth, 9, 4)
    g.rotateX(-Math.PI / 2)
    const a = g.attributes.position
    for (let i = 0; i < a.count; i++) {
      const xx = a.getX(i),
        zz = a.getZ(i),
        along = zz / depth + 0.5
      a.setXYZ(
        i,
        xx + x,
        y - 0.39 * along - 0.11 * Math.sin(Math.PI * along) - 0.085 * Math.cos((xx / w) * Math.PI),
        z + zz + depth / 2,
      )
    }
    g.computeVertexNormals()
    emit(g, m)
    box(x, y - 0.47, z + depth, w, 0.16, 0.045, m)
    for (const s of [-1, 1])
      rod([x + s * w * 0.48, y - 0.85, z], [x + s * w * 0.48, y - 0.38, z + depth], 0.022, steel)
    rod([x - w * 0.5, y - 0.38, z + depth], [x + w * 0.5, y - 0.38, z + depth], 0.026, steel)
  }
  function waterTank(x: number, y: number, z: number) {
    // Rooftop water cistern, ribbed plastic with fill-cap and outlet pipe.
    rod([x, y + 0.09, z], [x, y + 1.19, z], 0.52, black, 0.52, 14)
    for (let j = 0; j < 4; j++)
      rod([x, y + 0.18 + j * 0.27, z], [x, y + 0.215 + j * 0.27, z], 0.54, steel, 0.54, 14)
    rod([x, y + 1.19, z], [x, y + 1.25, z], 0.28, steel, 0.27, 10)
    rod([x + 0.43, y + 0.17, z], [x + 0.74, y + 0.17, z], 0.035, mistGrey)
    rod([x + 0.74, y + 0.17, z], [x + 0.74, y - 0.38, z], 0.035, mistGrey)
  }
  function house(
    side: number,
    cz: number,
    width: number,
    depth: number,
    index: number,
    storeys: number,
  ) {
    const front = side * (7.15 + between(0, 0.9)),
      yaw = (-side * Math.PI) / 2
    buildingTransform = positioned(front, cz, yaw)
    const floor = 2.92,
      h = storeys * floor + 0.16,
      z = -depth * 0.5,
      wall = render[index % 4]
    const shelter = index === 3
    if (shelter) {
      for (const sign of [-1, 1]) {
        box(sign * (width * 0.5 - 0.15), h * 0.5, z, 0.3, h, depth, wall)
        solid(sign * (width * 0.5 - 0.15), z, 0.3, depth, h)
      }
      box(0, h * 0.5, -depth + 0.15, width, h, 0.3, wall)
      solid(0, -depth + 0.15, width, 0.3, h)
      box(0, h - 0.15, z, width, 0.3, depth, limestone)
      for (const s of [-1, 1]) {
        const w = width * 0.28
        box((s * (width - w)) / 2, 1.44, -0.12, w, 2.88, 0.24, wall)
        solid((s * (width - w)) / 2, -0.12, w, 0.24, 2.88)
      }
      for (const s of [-1, 1]) {
        box(s * width * 0.35, 0.4, -2.9, 1.3, 0.2, 2.55, timber)
        box(s * width * 0.35, 0.55, -2.9, 1.25, 0.15, 2.43, shadeCloth[2])
      }
    } else {
      box(0, h * 0.5, z, width, h, depth, wall)
      solid(0, z, width, depth, h)
    }
    box(0, 0.2, 0.01, width, 0.4, 0.13, masonry)
    box(0, h + 0.03, z, width + 0.28, 0.22, depth + 0.28, limestone)
    // Broken parapets expose silo tanks, drainage pipes and roof beams.
    for (const s of [-1, 1]) box(s * (width * 0.5 - 0.075), h + 0.29, z, 0.15, 0.41, depth, wall)
    const intact = index % 4 !== 2
    box(-width * (intact ? 0 : 0.28), h + 0.31, 0.02, width * (intact ? 1 : 0.44), 0.4, 0.17, wall)
    if (storeys > 1) {
      for (let u = -width * 0.3; u <= width * 0.32; u += width * 0.6)
        window(u, 4.27, 0.04, 1.16, 1.19, index % 3 !== 0)
      if (index % 2 === 0) {
        box(0, 3.13, 0.53, width * 0.79, 0.16, 1.15, limestone)
        rod([-width * 0.4, 4.02, 1.04], [width * 0.4, 4.02, 1.04], 0.037, steel)
        for (let i = 0; i < 11; i++)
          rod(
            [-width * 0.39 + i * width * 0.078, 3.19, 1.04],
            [-width * 0.39 + i * width * 0.078, 4, 1.04],
            0.021,
            steel,
          )
      }
    }
    if (!shelter && index % 3 === 0 && width > 5) {
      box(0, 1.23, 0.09, width * 0.69, 2.36, 0.09, black)
      box(0, 1.24, 0.155, width * 0.66, 2.29, 0.07, shutters[index % 3])
      cellSign(0, 2.75, 0.17, width * 0.62, 0.61, 10 + [0, 2, 3, 7][Math.floor(index / 3) % 4])
      textileAwning(0, 2.52, 0.17, width * 0.82, 1.27, index)
    } else if (shelter) {
      cellSign(0, 2.58, 0.23, 2.46, 0.63, 11)
      textileAwning(0, 2.7, 0.2, width * 0.77, 1.37, 0)
    } else {
      door(-width * 0.235, 0.02, index % 2 === 0 ? timber : fadedBlue)
      window(width * 0.225, 1.61, 0.045, 1.34, 1.02, index % 2 === 0)
    }
    if (index % 3 !== 1) waterTank(between(-width * 0.25, width * 0.25), h + 0.16, -depth * 0.65)
    if (index % 2 === 0 || shelter) {
      const lx = -width * 0.38
      box(lx, 2.59, 0.15, 0.13, 0.2, 0.12, steel)
      rod([lx, 2.64, 0.16], [lx, 2.64, 0.44], 0.022, steel)
      rod([lx, 2.59, 0.42], [lx, 2.46, 0.42], 0.112, steel, 0.055, 8)
      rod([lx, 2.31, 0.42], [lx, 2.47, 0.42], 0.065, lampGlass, 0.097, 8)
    }
    // Metal downpipe, bands and a partly detached outlet.
    const px = width * 0.5 - 0.24
    rod([px, 0.31, 0.2], [px, h + 0.2, 0.2], 0.045, mistGrey)
    rod([px, 0.32, 0.2], [px, 0.18, 0.36], 0.046, mistGrey)
    if (index % 4 === 0) {
      box(px - 0.65, 2.44, 0.19, 0.72, 0.43, 0.25, mistGrey)
      for (let i = 0; i < 6; i++) box(px - 0.65, 2.29 + i * 0.051, 0.325, 0.61, 0.012, 0.018, steel)
    }
    // The writing belongs to walls, with respectful clear space around each inscription.
    if (index < 10) {
      const exposedFace = side === 1 ? -1 : 1
      const sideYaw = (exposedFace * Math.PI) / 2
      plane(
        exposedFace * (width * 0.5 + 0.018),
        1.61,
        -depth * 0.32,
        Math.min(3.3, depth * 0.53),
        0.82,
        labelMaterial,
        [0, sideYaw, 0],
        index,
      )
    }
    if (index === 4) {
      plane(width * 0.5 + 0.017, 1.85, -depth * 0.57, 2.86, 1.95, mural, [0, Math.PI / 2, 0])
      plane(width * 0.5 + 0.024, 0.7, -depth * 0.53, 2.38, 0.42, labelMaterial, [0, Math.PI / 2, 0], 14)
    }
    if (index === 1 || index === 8) cellSign(0, 2.74, 0.14, 1.55, 0.42, index === 1 ? 14 : 15)
    buildingTransform = identity
  }
  function cellSign(x: number, y: number, z: number, w: number, h: number, id: number) {
    plane(x, y, z, w, h, labelMaterial, [0, 0, 0], id)
  }
  const homes: [number, number, number, number, number, number][] = [
    [-1, -23.5, 7.8, 6.9, 0, 1],
    [-1, -15.5, 7.0, 7.0, 1, 2],
    [-1, -7.3, 7.5, 6.3, 2, 1],
    [-1, 6, 5.3, 6.0, 3, 1],
    [-1, 20.8, 8.1, 6.9, 4, 2],
    [-1, 29.6, 7.2, 6.0, 5, 1],
    [1, -25, 7.7, 7.1, 6, 1],
    [1, -16.8, 7.4, 6.4, 7, 2],
    [1, -8.2, 7.6, 7.0, 8, 1],
    [1, 5.8, 5.5, 6.5, 9, 1],
    [1, 20.8, 7.6, 6.1, 10, 2],
    [1, 29.3, 7.4, 6.4, 11, 1],
  ]
  for (const h of homes) house(...h)
  // A small pedestrian arcade terminates the vista without sealing the mountain road.
  function arch(x: number, z: number, yaw: number, span: number, rise: number) {
    buildingTransform = positioned(x, z, yaw)
    const spring = 2.22,
      thickness = 0.53
    for (const s of [-1, 1]) {
      box(s * (span * 0.5 + thickness * 0.5), spring * 0.5, 0, thickness, spring, 1.23, limestone)
      box(s * (span * 0.5 + thickness * 0.5), 0.15, 0, thickness + 0.29, 0.3, 1.38, masonry)
      box(s * (span * 0.5 + thickness * 0.5), spring - 0.07, 0, thickness + 0.23, 0.16, 1.34, limestone)
      solid(s * (span * 0.5 + thickness * 0.5), 0, thickness, 1.23, spring)
    }
    const r = span * 0.5
    for (let i = 0; i < 17; i++) {
      const a = (i / 17) * Math.PI + 0.004,
        b = ((i + 1) / 17) * Math.PI - 0.004
      const shape = new T.Shape()
      shape.moveTo(Math.cos(a) * r, spring + Math.sin(a) * rise)
      shape.lineTo(Math.cos(a) * (r + thickness), spring + Math.sin(a) * (rise + thickness))
      shape.lineTo(Math.cos(b) * (r + thickness), spring + Math.sin(b) * (rise + thickness))
      shape.lineTo(Math.cos(b) * r, spring + Math.sin(b) * rise)
      shape.closePath()
      const g = new T.ExtrudeGeometry(shape, { depth: 1.24, bevelEnabled: false })
      g.translate(0, 0, -0.62)
      emit(g, i % 5 === 0 ? masonry : limestone)
    }
    buildingTransform = identity
  }
  arch(1, -31, 0.05, 5.8, 1.94)
  for (const side of [-1, 1]) {
    for (let j = 0; j < 3; j++) {
      const x = side * (9 + j * 6.5),
        z = -35 - between(0, 3),
        w = between(4.5, 6.5),
        h = between(2.5, 4.0)
      box(x, h * 0.5, z, w, h, 5.3, render[(j + 2) % 4])
      box(x, h + 0.08, z, w + 0.16, 0.17, 5.45, limestone)
      for (const sign of [-1, 1]) window(x + sign * w * 0.25, h * 0.55, z + 2.68, 0.7, 0.83, false)
      solid(x, z, w, 5.3, h)
    }
    for (let j = 0; j < 5; j++) {
      const z = -23 + j * 12,
        x = side * between(24, 30),
        h = between(3.2, 5.1)
      box(x, h * 0.5, z, 6.4, h, 6.8, render[j % 4])
      box(x, h + 0.08, z, 6.55, 0.17, 6.95, limestone)
      solid(x, z, 6.4, 6.8, h)
      window(x - 1.7, 1.6, z + 3.43, 1.1, 1.12, true)
      window(x + 1.6, 1.6, z + 3.43, 1.12, 1.1, false)
    }
  }
  function wire(a: V, b: V, sag: number, m: Paint, r = 0.016) {
    let prev = a
    for (let j = 1; j <= 8; j++) {
      const t = j / 8,
        p: V = [
          T.MathUtils.lerp(a[0], b[0], t),
          T.MathUtils.lerp(a[1], b[1], t) - Math.sin(t * Math.PI) * sag,
          T.MathUtils.lerp(a[2], b[2], t),
        ]
      rod(prev, p, r, m, r, 4, false)
      prev = p
    }
  }
  const poles: V[] = [
    [-6.55, 6.65, 27],
    [-6.44, 6.4, 9],
    [-6.77, 6.13, -11],
    [-6.35, 6.36, -28],
  ]
  for (let i = 0; i < poles.length; i++) {
    const [x, h, z] = poles[i],
      lean = i === 2 ? 0.32 : 0.07
    rod([x, 0, z], [x + lean, h + 0.3, z + 0.08], 0.14, timber, 0.095, 9)
    rod([x - 0.66 + lean, h - 0.08, z], [x + 0.66 + lean, h - 0.08, z], 0.055, rafter)
    for (let n = 0; n < 3; n++) {
      const dx = (n - 1) * 0.51
      rod([x + dx + lean, h - 0.08, z], [x + dx + lean, h + 0.19, z], 0.047, mistGrey, 0.066, 7)
      if (i > 0) {
        const [px, ph, pz] = poles[i - 1]
        wire([px + dx + 0.07, ph + 0.16, pz], [x + dx + lean, h + 0.16, z], 0.59 + n * 0.09, cable)
      }
    }
    if (i !== 1) wire([x + lean, h - 0.24, z], [8.17, h - 0.75, z + 3.8], 1.13, cable, 0.021)
    if (i === 2) {
      wire([x + lean, h - 0.32, z], [x + 0.88, 2.8, z + 1.1], 0.86, cable, 0.021)
    }
    solid(x, z, 0.3, 0.3, h)
  }
  // Canvas shades cross an alley, separated by gaps that let bands of sunlight through.
  for (let j = 0; j < 3; j++) {
    const x = -11.1 - j * 2.42
    const awn = new T.PlaneGeometry(1.98, 6.6, 3, 8)
    awn.rotateX(-Math.PI / 2)
    const a = awn.attributes.position
    for (let i = 0; i < a.count; i++) {
      const z = a.getZ(i)
      a.setXYZ(
        i,
        x + a.getX(i),
        3.74 - 0.58 * Math.cos((z / 6.6) * Math.PI) + 0.09 * Math.sin(i * 2),
        z,
      )
    }
    awn.computeVertexNormals()
    shadeCloth[j].side = T.DoubleSide
    emit(awn, shadeCloth[j])
  }
  function olive(x: number, z: number, scale: number) {
    buildingTransform = positioned(x, z, between(-3, 3))
    const s = scale
    rod([0, 0, 0], [0.11 * s, 1.12 * s, 0.06 * s], 0.17 * s, darkTimber, 0.12 * s, 8)
    for (let i = 0; i < 7; i++) {
      const a = i * 0.898 + random() * 0.29,
        dx = Math.cos(a) * s,
        dz = Math.sin(a) * s
      const y = between(1.64, 2.22) * s
      rod(
        [0.06 * s, 0.86 * s, 0.03 * s],
        [dx * 0.62, y - s * 0.29, dz * 0.62],
        0.078 * s,
        timber,
        0.036 * s,
        7,
      )
      rod(
        [dx * 0.62, y - s * 0.29, dz * 0.62],
        [dx * 1.07, y + 0.24 * s, dz * 1.07],
        0.033 * s,
        timber,
        0.011 * s,
        5,
      )
      for (let j = 0; j < 12; j++) {
        const radius = between(0.34, 1.43),
          cx = dx * radius + between(-0.27, 0.27) * s,
          cz = dz * radius + between(-0.27, 0.27) * s
        plane(
          cx,
          y + between(-0.16, 0.52) * s,
          cz,
          0.72 * s,
          0.91 * s,
          oliveMat,
          [between(-0.6, 0.6), between(-Math.PI, Math.PI), between(-0.4, 0.4)],
          -1,
          true,
        )
      }
    }
    buildingTransform = identity
  }
  const trees = [
    [-5.95, 19.4, 1.37],
    [6.2, -3.8, 1.25],
    [-6.1, -21.4, 1.15],
    [12.8, 14.1, 1.45],
    [-16.9, 1.9, 1.03],
    [7.2, 27.1, 1.65],
    [-20.3, -26, 1.98],
    [16.4, -28, 1.5],
    [17.5, 31, 1.55],
    [-17.2, 29.4, 1.4],
  ]
  for (const [x, z, s] of trees) olive(x, z, s)
  // Village sedan: separate bonnet, sloping glazed cabin, wheel arches, lights and doors.
  function vehicle(x: number, z: number, yaw: number, bodyColour: string) {
    buildingTransform = positioned(x, z, yaw)
    const body = paint(bodyColour, undefined, 0.7, 0.27)
    const profile = (shape: [number, number][], width: number, mat: Paint) => {
      const points = new T.Shape()
      shape.forEach(([zz, yy], i) => (i ? points.lineTo(zz, yy) : points.moveTo(zz, yy)))
      points.closePath()
      const g = new T.ExtrudeGeometry(points, {
        depth: width,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.045,
        bevelSegments: 1,
        curveSegments: 1,
      })
      g.rotateY(-Math.PI / 2)
      g.translate(width * 0.5, 0, 0)
      emit(g, mat)
    }
    profile(
      [
        [-2.04, 0.46],
        [-2.05, 0.75],
        [-1.73, 0.84],
        [-0.86, 0.89],
        [0.96, 0.88],
        [1.93, 0.79],
        [2.04, 0.68],
        [2.0, 0.44],
      ],
      1.63,
      body,
    )
    profile(
      [
        [-1.05, 0.87],
        [-0.49, 1.41],
        [0.43, 1.45],
        [1.02, 0.89],
      ],
      1.43,
      carGlass,
    )
    box(0, 1.455, 0.01, 1.45, 0.073, 1.01, body)
    for (const sign of [-1, 1]) {
      const xx = sign * 0.76
      for (const [za, ya, zb, yb] of [
        [-0.99, 0.89, -0.49, 1.43],
        [-0.05, 0.9, -0.08, 1.44],
        [0.97, 0.89, 0.43, 1.44],
      ])
        rod([xx, ya, za], [xx, yb, zb], 0.042, body)
      rod([sign * 0.825, 0.89, -1.06], [sign * 0.825, 0.89, 1.06], 0.024, mistGrey)
      for (const zz of [-1.33, 1.28]) {
        const bx = sign * 0.81
        rod([bx - 0.106, 0.398, zz], [bx + 0.106, 0.398, zz], 0.375, rubber, 0.375, 16)
        rod([sign * 0.914, 0.398, zz], [sign * 0.93, 0.398, zz], 0.186, steel, 0.18, 12)
        rod([sign * 0.93, 0.398, zz], [sign * 0.947, 0.398, zz], 0.091, mistGrey, 0.081, 8)
      }
      box(sign * 0.66, 0.71, -2.055, 0.28, 0.115, 0.042, headlamp)
      box(sign * 0.65, 0.69, 2.025, 0.29, 0.125, 0.04, rust)
      box(sign * 0.83, 0.81, 0.12, 0.034, 0.037, 0.16, mistGrey)
      box(sign * 0.83, 0.81, 0.81, 0.034, 0.037, 0.16, mistGrey)
    }
    for (const ss of [-1, 1]) box(0, 0.46, ss * 2.043, 1.54, 0.12, 0.092, steel)
    box(0, 0.69, -2.073, 0.79, 0.12, 0.03, black)
    for (let i = 0; i < 10; i++) box((i - 4.5) * 0.072, 0.69, -2.094, 0.021, 0.1, 0.015, mistGrey)
    buildingTransform = identity
    const p = positioned(x, z, yaw)
    buildingTransform = p
    solid(0, 0, 1.76, 4.12, 1.45)
    buildingTransform = identity
  }
  vehicle(-5.89, -4.8, -0.09, '#97988a')
  vehicle(6.0, 23.8, -0.17, '#5e7775')
  function bench(x: number, z: number, yaw: number) {
    buildingTransform = positioned(x, z, yaw)
    for (let i = 0; i < 3; i++) box(0, 0.44, -0.17 + i * 0.17, 1.68, 0.07, 0.14, timber)
    box(0, 0.79, -0.24, 1.68, 0.21, 0.075, timber)
    for (const ss of [-1, 1]) {
      rod([ss * 0.61, 0.05, -0.21], [ss * 0.61, 0.91, -0.24], 0.034, steel)
      rod([ss * 0.61, 0.05, 0.19], [ss * 0.61, 0.43, 0.16], 0.032, steel)
    }
    buildingTransform = identity
  }
  bench(-7.0, 4.9, Math.PI * 0.5)
  bench(6.65, -15, 0.5 * Math.PI)
  // The grocer's stand and textiles give the near residential façades a human scale.
  const canvasReds = [paint('#8e4e3e'), paint('#cab58e'), paint('#656d63'), paint('#b48958')]
  function grocery(x: number, z: number, yaw: number) {
    buildingTransform = positioned(x, z, yaw)
    for (const a of [-1, 1])
      for (const b of [-1, 1])
        rod([a * 1.09, 0.03, b * 0.4], [a * 1.09, 2.04 + 0.1 * b, b * 0.4], 0.038, timber)
    box(0, 0.76, 0, 2.34, 0.13, 0.95, timber)
    for (let i = 0; i < 15; i++)
      box(-1.08 + i * 0.154, 0.51, 0.405, 0.142, 0.53, 0.052, i % 3 === 0 ? darkTimber : timber)
    for (let i = 0; i < 8; i++)
      box(-1.15 + i * 0.33, 2.08, 0, 0.329, 0.05, 1.18, canvasReds[i % 2], [0.11, 0, 0])
    box(0, 2.002, 0.58, 2.65, 0.12, 0.05, canvasReds[0])
    for (let i = 0; i < 3; i++) {
      const px = -0.73 + i * 0.73
      box(px, 0.88, 0, 0.6, 0.13, 0.56, darkTimber)
      for (const ss of [-1, 1]) box(px, 0.99, ss * 0.25, 0.63, 0.16, 0.04, timber)
      for (let j = 0; j < 8; j++) {
        const ax = px + ((j % 4) - 1.5) * 0.117,
          az = (Math.floor(j / 4) - 0.5) * 0.17
        rod([ax, 1.02, az], [ax, 1.14, az], 0.065, canvasReds[(i + 3) % 4], 0.051, 7)
      }
    }
    buildingTransform = identity
  }
  grocery(-5.97, 24.1, Math.PI * 0.5)
  grocery(6.08, -10.1, -Math.PI * 0.5)
  // Garments hang on the line anchored to residential roof parapets.
  wire([-7.3, 5.75, -16.8], [7.3, 5.82, -14.9], 0.76, cable, 0.012)
  for (let i = 0; i < 8; i++) {
    const t = 0.13 + i * 0.1,
      x = -7.3 + 14.6 * t,
      z = -16.8 + 1.9 * t,
      top = 5.75 + t * 0.07 - Math.sin(Math.PI * t) * 0.76
    const g = new T.PlaneGeometry(0.48 + random() * 0.29, 0.59 + random() * 0.42, 5, 4),
      a = g.attributes.position
    for (let j = 0; j < a.count; j++) {
      const xx = a.getX(j),
        yy = a.getY(j)
      a.setXYZ(
        j,
        x + xx,
        top - 0.44 + yy + 0.034 * Math.cos(xx * 14),
        z + 0.076 * Math.sin(xx * 16) + 0.04 * yy,
      )
    }
    g.computeVertexNormals()
    canvasReds[i % 4].side = T.DoubleSide
    emit(g, canvasReds[i % 4], false)
  }
  // Collapsed masonry sits in the setbacks; the crossing streets remain unobstructed.
  for (const [cx, cz] of [
    [6.62, 18.65],
    [-6.55, -8.75],
    [6.51, -25.8],
  ]) {
    for (let i = 0; i < 23; i++) {
      const dx = between(-0.57, 0.64),
        dz = between(-0.92, 0.85),
        layer = Math.max(0, 0.5 - 0.4 * Math.hypot(dx, dz))
      box(
        cx + dx,
        0.11 + layer * random(),
        cz + dz,
        between(0.19, 0.49),
        between(0.1, 0.2),
        between(0.16, 0.31),
        i % 3 === 0 ? masonry : limestone,
        [between(-0.43, 0.49), between(0, 3), between(-0.44, 0.45)],
      )
    }
    rod([cx - 0.24, 0.22, cz - 0.19], [cx + 0.22, 0.89, cz + 0.17], 0.017, rust)
    rod([cx + 0.22, 0.89, cz + 0.17], [cx + 0.37, 1.09, cz + 0.32], 0.017, rust)
  }
  function trunk(x: number, z: number, w: number) {
    const g = new T.Group()
    g.position.set(x, 0.01, z)
    const board = (d: Dimensions, p: V, m: Paint) => {
      const mesh = new T.Mesh(new T.BoxGeometry(...d), m)
      mesh.position.set(...p)
      mesh.castShadow = true
      g.add(mesh)
    }
    board([w, 0.59, w * 0.72], [0, 0.3, 0], timber)
    for (const s of [-1, 1]) {
      board([0.054, 0.61, w * 0.73], [s * w * 0.4, 0.31, 0], darkTimber)
      board([w, 0.053, 0.048], [0, 0.12, s * w * 0.36], darkTimber)
    }
    root.add(g)
    breakables.push({ mesh: g, point: g.position.clone(), broken: false })
  }
  trunk(6.09, 5.8, 0.9)
  trunk(-6.27, -17.1, 0.74)
  // Scattered luggage and folded household textiles sit on the shoulders of the street.
  for (const [x, z, sz] of [
    [-5.57, 14.5, 0.78],
    [6.16, -6.1, 0.63],
    [-6.0, 3.6, 0.66],
  ]) {
    box(x, 0.22, z, sz, 0.41, sz * 0.52, darkTimber, [0.02, 0.14, 0.04])
    for (const s of [-1, 1]) box(x + sz * s * 0.27, 0.22, z, 0.048, 0.42, sz * 0.54, rafter)
    rod([x - 0.07, 0.425, z], [x - 0.07, 0.493, z], 0.014, steel)
    rod([x + 0.07, 0.425, z], [x + 0.07, 0.493, z], 0.014, steel)
    rod([x - 0.07, 0.493, z], [x + 0.07, 0.493, z], 0.014, steel)
  }
  // Staggered threshold paving and worn kerbs mark the shop margins.
  for (const [side, cz, w] of homes) {
    const count = Math.floor(w / 0.78)
    for (let i = 0; i < count; i++) {
      const zz = cz - w * 0.5 + ((i + 0.5) * w) / count
      box(
        side * 7.08,
        0.03,
        zz,
        1.18,
        0.065,
        w / count - 0.028,
        i % 4 === 0 ? masonry : limestone,
        [0, between(-0.012, 0.012), 0],
        false,
      )
      if (i % 3 !== 1)
        box(
          side * 6.47,
          0.062,
          zz,
          0.13,
          0.125,
          w / count - 0.035,
          trim,
          [0, between(-0.016, 0.016), 0],
          false,
        )
    }
  }
  // A sun banner is hoisted on a fixed civic wall; it belongs to no damageable object.
  const flagCanvas = document.createElement('canvas')
  flagCanvas.width = 384
  flagCanvas.height = 246
  const ctx = flagCanvas.getContext('2d')!
  for (const [i, c] of ['#a64439', '#eee2c9', '#d8af4e'].entries()) {
    ctx.fillStyle = c
    ctx.fillRect(0, i * 82, 384, 82)
  }
  ctx.fillStyle = '#c08623'
  ctx.beginPath()
  for (let i = 0; i < 42; i++) {
    const a = (i * Math.PI) / 21 - Math.PI * 0.5,
      r = i % 2 === 0 ? 35 : 23
    if (!i) ctx.moveTo(192 + Math.cos(a) * r, 123 + Math.sin(a) * r)
    else ctx.lineTo(192 + Math.cos(a) * r, 123 + Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fill()
  const flagTex = new T.CanvasTexture(flagCanvas)
  flagTex.colorSpace = T.SRGBColorSpace
  textures.push(flagTex)
  const flagMat = paint('#faf2dc')
  flagMat.map = flagTex
  flagMat.side = T.DoubleSide
  const flags: { mesh: T.Mesh<T.PlaneGeometry, Paint>; base: Float32Array }[] = []
  for (const [x, z, top, yaw] of [
    [-7.81, 6.2, 5.04, -0.35],
    [7.49, -15.0, 7.25, 2.64],
  ]) {
    rod([x, top - 2.35, z], [x, top + 0.09, z], 0.031, mistGrey)
    const geo = new T.PlaneGeometry(1.68, 0.91, 13, 4)
    geo.translate(0.84, -0.455, 0)
    const mesh = new T.Mesh(geo, flagMat)
    mesh.position.set(x, top, z)
    mesh.rotation.y = yaw
    mesh.castShadow = true
    root.add(mesh)
    flags.push({ mesh, base: new Float32Array(geo.attributes.position.array) })
  }
  // Thin rubble avoids per-stone draw calls. The lane itself stays passable.
  const debrisGeo = new T.DodecahedronGeometry(1, 0),
    count = 260
  const debris = new T.InstancedMesh(debrisGeo, masonry, count)
  debris.receiveShadow = true
  for (let i = 0; i < count; i++) {
    const x = (random() < 0.5 ? -1 : 1) * between(5.05, 7.09),
      z = between(-29, 31),
      size = between(0.035, 0.145)
    place.position.set(x, size * 0.17, z)
    place.rotation.set(random() * 2, random() * 6, random() * 2)
    place.scale.set(size * 1.44, size * 0.52, size)
    place.updateMatrix()
    debris.setMatrixAt(i, place.matrix)
    debris.setColorAt(i, new T.Color().setScalar(between(0.59, 1)))
  }
  debris.computeBoundingSphere()
  root.add(debris)
  for (const { mat, geometries, shadow } of batches.values()) {
    const merged = mergeGeometries(geometries, false)
    if (merged) {
      merged.computeBoundingSphere()
      const mesh = new T.Mesh(merged, mat)
      mesh.castShadow = shadow
      mesh.receiveShadow = true
      const coarse = geometries.filter((g) => !g.userData.smallDetail)
      if (geometries.length - coarse.length >= 4) {
        const lod = new T.LOD(),
          center = merged.boundingSphere!.center
        lod.position.copy(center)
        mesh.position.copy(center).negate()
        lod.addLevel(mesh, 0)
        const simplified = coarse.length ? mergeGeometries(coarse, false) : null
        const distant = simplified ? new T.Mesh(simplified, mat) : new T.Group()
        distant.position.copy(mesh.position)
        distant.receiveShadow = true
        lod.addLevel(distant, 32, 0.15)
        root.add(lod)
      } else root.add(mesh)
    }
    geometries.forEach((g) => g.dispose())
  }
  batches.clear()
  commonUnit.dispose()
  cylinderCache.forEach((g) => g.dispose())

  // Camera-facing translucent soot layers rise behind roofs, away from passable routes.
  const smokeCanvas = document.createElement('canvas')
  smokeCanvas.width = smokeCanvas.height = 96
  const sc = smokeCanvas.getContext('2d')!
  for (let i = 0; i < 80; i++) {
    const a = random() * Math.PI * 2,
      r = between(0, 29),
      px = 48 + Math.cos(a) * r,
      py = 48 + Math.sin(a) * r,
      rs = between(8, 19)
    const grad = sc.createRadialGradient(px, py, 0, px, py, rs)
    grad.addColorStop(0, 'rgba(230,225,220,.12)')
    grad.addColorStop(1, 'rgba(230,225,220,0)')
    sc.fillStyle = grad
    sc.fillRect(px - rs, py - rs, rs * 2, rs * 2)
  }
  const smokeTex = new T.CanvasTexture(smokeCanvas)
  textures.push(smokeTex)
  const smokeMat = new T.SpriteMaterial({
    map: smokeTex,
    color: '#655f55',
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  })
  materials.push(smokeMat)
  const smoke = Array.from({ length: 9 }, () => {
    const s = new T.Sprite(smokeMat)
    root.add(s)
    return s
  })
  const dustGeometry = new T.BufferGeometry(),
    dustData = new Float32Array(96 * 3)
  for (let i = 0; i < dustData.length; i += 3) {
    dustData[i] = between(-19, 19)
    dustData[i + 1] = between(0.1, 7)
    dustData[i + 2] = between(-27, 28)
  }
  dustGeometry.setAttribute('position', new T.BufferAttribute(dustData, 3))
  const dustMat = new T.PointsMaterial({
    size: 0.049,
    color: '#f8ddaf',
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  })
  materials.push(dustMat)
  const dust = new T.Points(dustGeometry, dustMat)
  root.add(dust)
  const starGeo = new T.BufferGeometry(),
    starPositions: number[] = []
  for (let i = 0; i < 350; i++) {
    const az = between(0, Math.PI * 2),
      h = between(0.08, 1.48),
      r = 151
    starPositions.push(r * Math.cos(h) * Math.cos(az), r * Math.sin(h), r * Math.cos(h) * Math.sin(az))
  }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPositions, 3))
  const starMat = new T.PointsMaterial({
    color: '#dddccf',
    size: 0.13,
    opacity: 0.62,
    transparent: true,
    fog: false,
    depthWrite: false,
  })
  materials.push(starMat)
  const stars = new T.Points(starGeo, starMat)
  root.add(stars)
  let previousChapter = -1,
    quality = 2
  const palette = [
    ['#ffe1ae', '#c5b7a5', 2.24, 1.45, 0.98],
    ['#f0ba88', '#ac9b89', 1.8, 1.24, 0.83],
    ['#ffda9f', '#b9a78f', 2.4, 1.43, 0.95],
    ['#a4badc', '#68727e', 0.76, 0.82, 0.38],
    ['#e9bd93', '#b3a59a', 1.64, 1.31, 0.82],
    ['#9cb5d8', '#566270', 0.5, 0.76, 0.26],
    ['#ffe3a9', '#cabeaa', 2.38, 1.55, 1.01],
  ] as const
  const setQuality = (n: number) => {
    quality = Math.max(0, Math.min(3, Math.round(n)))
    sun.castShadow = quality > 0
    dust.visible = quality > 0
    const mapSize = [512, 512, 1024, 2048][quality]
    if (sun.shadow.mapSize.x !== mapSize) {
      sun.shadow.mapSize.set(mapSize, mapSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
    }
  }
  function interact(x: number, z: number) {
    for (const door of doors)
      if (Math.hypot(x - door.point.x, z - door.point.z) < 2.45) {
        door.open = !door.open
        return
      }
    for (const prop of breakables)
      if (!prop.broken && Math.hypot(x - prop.point.x, z - prop.point.z) < 2.15) {
        prop.broken = true
        prop.mesh.rotation.z = 0.29
        prop.mesh.scale.y = 0.46
        return
      }
  }
  function update(dt: number, time: number, chapter: number) {
    const c = Math.min(6, Math.max(0, Math.floor(chapter)))
    if (c !== previousChapter) {
      const [light, far, sunlight, skyLight, skyBrightness] = palette[c]
      sun.color.set(light)
      sun.intensity = sunlight
      hemi.intensity = skyLight
      fog.color.set(far)
      hemi.color.set(c === 3 || c === 5 ? '#96abd0' : '#e9e6e1')
      const night = c === 3 || c === 5
      stars.visible = night
      lampGlass.emissiveIntensity = night ? 2.0 : 0.02
      glass.emissive.set('#8b653b')
      glass.emissiveIntensity = night ? 0.41 : 0
      const direction: V[] = [
        [-24, 25, -34],
        [-12, 44, -23],
        [27, 16, -22],
        [18, 26, 31],
        [23, 11, -27],
        [-18, 27, 31],
        [-27, 15, -32],
      ]
      sun.position.set(...direction[c])
      sun.shadow.needsUpdate = true
      fog.density = c === 1 ? 0.014 : 0.0095
      scene.backgroundIntensity = skyBrightness
      scene.environmentIntensity = skyBrightness * 0.28
      previousChapter = c
    }
    for (const flag of flags) {
      const attr = flag.mesh.geometry.attributes.position
      for (let i = 0; i < attr.count; i++) {
        const x = flag.base[i * 3],
          y = flag.base[i * 3 + 1],
          w = x / 1.68
        attr.setXYZ(
          i,
          x - 0.065 * w * (1 + Math.sin(time * 2 + x * 3)),
          y - 0.14 * w + 0.045 * w * Math.sin(time * 2.4 - x * 3.8),
          w * (0.13 * Math.sin(time * 2.5 - x * 3.1) + 0.045 * Math.sin(time * 4 + y * 3.7)),
        )
      }
      attr.needsUpdate = true
    }
    for (const door of doors) {
      door.angle = T.MathUtils.damp(door.angle, door.open ? 1.25 : 0, 6, dt)
      door.hinge.rotation.y = door.rest + door.angle
    }
    dust.position.x = Math.sin(time * 0.12) * 1.4
    dust.position.y = Math.sin(time * 0.27) * 0.11
    smoke.forEach((s, i) => {
      s.visible = quality > 0 && (c === 1 || c === 3 || c === 4 || c === 5)
      if (s.visible) {
        const p = (time * 0.065 + i / 9) % 1
        s.position.set(-16.5 + p * 6 + Math.sin(p * 8) * 0.4, 3.5 + p * 12, -18.5 + p * 0.45)
        s.scale.setScalar(1.8 + p * 5.8)
      }
    })
  }
  function dispose() {
    scene.remove(root)
    if (scene.environment === sky) scene.environment = null
    if (scene.background === sky) scene.background = null
    const geometries = new Set<T.BufferGeometry>()
    root.traverse((o) => {
      if (o instanceof T.Mesh || o instanceof T.Points) geometries.add(o.geometry)
    })
    geometries.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    textures.forEach((t) => t.dispose())
    sun.shadow.dispose()
  }
  update(0, 0, 0)
  return { colliders, update, interact, setQuality, dispose }
}

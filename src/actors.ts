import { AnimationAction, AnimationMixer, Group, Mesh, MeshStandardMaterial } from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js'

export type ActorRole = 'sumer' | 'civilian' | 'companion' | 'opponent'
export type ActorAction =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sprint'
  | 'jump'
  | 'crouch'
  | 'interact'
  | 'climb'
  | 'help'
  | 'carry'
  | 'cover'
  | 'signal'
export interface Actor {
  root: Group
  setAction(name: ActorAction): void
  update(deltaSeconds: number): void
  setCloth(color: string): void
  dispose(): void
}

const palettes: Record<string, string>[] = [
  { shirt: '#beae89', vest: '#705344', scarf: '#b4a98f', trouser: '#665d52' },
  { shirt: '#8d928b', vest: '#364751', scarf: '#ba9678', trouser: '#4b5050' },
  { shirt: '#a78c7b', vest: '#685c4c', scarf: '#b0afa4', trouser: '#484746' },
  { shirt: '#b4a38b', vest: '#666644', scarf: '#6c5950', trouser: '#605443' },
]
const sharedModels = new Map<string, Promise<GLTF>>()

function loadModel(file: string): Promise<GLTF> {
  const cached = sharedModels.get(file)
  if (cached) return cached
  const request = new GLTFLoader()
    .loadAsync(import.meta.env.BASE_URL + 'actors/' + file)
    .catch((error) => {
      sharedModels.delete(file)
      throw error
    })
  sharedModels.set(file, request)
  return request
}

/** All figure roots face +Z and rest on the local floor. Geometry is shared across a cast. */
export async function createActor(role: ActorRole = 'sumer', variation = 0): Promise<Actor> {
  const index = Math.abs(Math.trunc(variation)) % palettes.length
  const female = role === 'civilian' && index % 2 === 0
  const gltf = await loadModel(female ? 'survivor.glb' : 'sumer.glb')
  const figure = clone(gltf.scene)
  const root = new Group()
  root.name = role
  root.add(figure)
  const colors =
    role === 'sumer'
      ? {}
      : role === 'opponent'
        ? { vest: '#494c50', scarf: '#575e64', shirt: '#756d63', trouser: '#57575b' }
        : palettes[(index + (role === 'companion' ? 1 : 0)) % palettes.length]
  const owned = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  figure.traverse((node) => {
    if (!(node instanceof Mesh)) return
    node.castShadow = true
    node.receiveShadow = true
    function tint(material: MeshStandardMaterial): MeshStandardMaterial {
      const value = (colors as Record<string, string>)[material.name]
      if (!value && !(role === 'sumer' && material.name === 'scarf')) return material
      if (!owned.has(material)) {
        const local = material.clone()
        if (value) local.color.set(value)
        owned.set(material, local)
      }
      return owned.get(material)!
    }
    node.material = Array.isArray(node.material) ? node.material.map(tint) : tint(node.material)
  })
  if (role !== 'sumer') {
    figure.scale.set(0.97 + 0.02 * index, 0.94 + 0.025 * index, 0.99)
  }
  const mixer = new AnimationMixer(figure)
  const clips = new Map(gltf.animations.map((clip) => [clip.name, clip]))
  let active: AnimationAction | undefined
  function setAction(name: ActorAction) {
    const clip = clips.get(name)
    if (!clip) return
    const next = mixer.clipAction(clip)
    if (next === active) return
    active?.fadeOut(0.15)
    next
      .reset()
      .fadeIn(active ? 0.15 : 0)
      .play()
    active = next
  }
  setAction('idle')
  mixer.update(role === 'sumer' ? 0.01 : 0.07 + index * 0.47)
  return {
    root,
    setAction,
    setCloth(color) {
      for (const [source, local] of owned)
        if (source.name === 'scarf') {
          if (color) local.color.set(color)
          else local.color.copy(source.color)
        }
    },
    update(deltaSeconds) {
      mixer.update(Math.min(deltaSeconds, 0.15))
    },
    dispose() {
      root.removeFromParent()
      mixer.stopAllAction()
      mixer.uncacheRoot(figure)
      for (const material of owned.values()) material.dispose()
      const skeletons = new Set<import('three').Skeleton>()
      figure.traverse((node) => {
        if ('isSkinnedMesh' in node) skeletons.add((node as import('three').SkinnedMesh).skeleton)
      })
      for (const skeleton of skeletons) skeleton.dispose()
    },
  }
}

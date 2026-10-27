import {
  AnimationMixer,
  Box3,
  LoadingManager,
  Mesh,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  Texture,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Material,
  type Object3D,
} from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"

export type ModelScene = {
  /** The model's animation clips, by name, in the order the file lists them. */
  animations: string[]
  /** Plays one clip in a loop by its index in `animations`, or holds the rest pose with `null`. */
  play(index: number | null): void
  dispose(): void
}

/** The direction the camera looks at the model from: a three-quarter view from slightly above. */
const VIEW_DIRECTION = new Vector3(1, 0.6, 1).normalize()

/**
 * Renders one glTF model into `container`, framed and orbitable.
 *
 * The model loads before anything touches the page, so a file that fails to
 * load leaves nothing to clean up. Aborting `signal` cancels the model's
 * downloads — the `.gltf` and everything it points at — so clicking through
 * models never leaves a queue of abandoned ones loading behind the open one. Relative URIs inside a `.gltf` (its `.bin`
 * buffer, its textures) resolve against `url`, which is why the model is
 * loaded from the preview proxy: it serves the whole game directory.
 *
 * Lighting is a neutral room environment rather than the game's own lights,
 * which live in the game's code, not in the model.
 */
export async function mountModelScene(
  container: HTMLElement,
  url: string,
  signal: AbortSignal
): Promise<ModelScene> {
  signal.throwIfAborted()
  const manager = new LoadingManager()
  signal.addEventListener("abort", () => manager.abort(), { once: true })
  const gltf = await new GLTFLoader(manager).loadAsync(url)
  signal.throwIfAborted()

  const renderer = new WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.domElement.className = "block size-full touch-none"
  container.appendChild(renderer.domElement)

  const scene = new Scene()
  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()
  scene.environment = environment

  const model = gltf.scene
  scene.add(model)

  const camera = new PerspectiveCamera(40, 1, 0.01, 1000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  frameModel(model, camera, controls)

  const mixer = new AnimationMixer(model)
  let action: AnimationAction | null = null

  function resize() {
    const width = container.clientWidth
    const height = container.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  let last = performance.now()
  renderer.setAnimationLoop((now: number) => {
    mixer.update((now - last) / 1000)
    last = now
    controls.update()
    renderer.render(scene, camera)
  })

  return {
    animations: gltf.animations.map((clip) => clip.name),
    play(index) {
      action?.stop()
      action = null
      const clip = index === null ? undefined : gltf.animations[index]
      if (clip) action = mixer.clipAction(clip).play()
    },
    dispose() {
      renderer.setAnimationLoop(null)
      observer.disconnect()
      controls.dispose()
      mixer.stopAllAction()
      model.traverse((object) => {
        if (!(object instanceof Mesh)) return
        object.geometry.dispose()
        const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material]
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof Texture) value.dispose()
          }
          material.dispose()
        }
      })
      environment.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}

/** Points the camera at the model's bounding sphere from far enough away that all of it fits. */
function frameModel(model: Object3D, camera: PerspectiveCamera, controls: OrbitControls) {
  const sphere = new Box3().setFromObject(model).getBoundingSphere(new Sphere())
  const radius = sphere.radius > 0 ? sphere.radius : 1
  const distance = (radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.15

  camera.near = distance / 100
  camera.far = distance * 100
  camera.position.copy(sphere.center).addScaledVector(VIEW_DIRECTION, distance)
  camera.updateProjectionMatrix()
  controls.target.copy(sphere.center)
  controls.maxDistance = distance * 10
  controls.update()
}

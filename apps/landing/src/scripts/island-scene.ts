/**
 * The floating island, as the hero of the landing page.
 *
 * Ported from the app's sandbox welcome screen
 * (`apps/web/lib/games/runtime/index.html`), which players see while their
 * first game is being built. The site shows the same island on purpose: it is
 * the first thing numa ever draws for you, so the landing opens on it.
 *
 * What changed from the original:
 * - It is a module with a mount function instead of a page script, and it
 *   uses the bundled `three` rather than the sandbox's vendored copy.
 * - The engine helpers it used (`createEngine`, `addEnvironment`,
 *   `createParticles`, `damp`) are reduced here to the few lines it needs.
 * - The camera follows scroll as well as the pointer: as the hero scrolls
 *   away, the camera swings round and closes in on the island.
 * - Rendering stops whenever the hero is off screen or the tab is hidden.
 */
import {
  AnimationMixer,
  Box3,
  BackSide,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Fog,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  PlaneGeometry,
  BufferAttribute,
  BufferGeometry,
  Points,
  PointsMaterial,
  ACESFilmicToneMapping,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Timer,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type Object3D,
} from "three"
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js"

/*
  The exact Cube World blobs the cube-world template locks, addressed by
  SHA-256 in numa's public asset bucket, so they never change under the page.
*/
const BLOBS = "https://pub-c9cfca53d8364237968cc4355d3c0f7c.r2.dev/blobs/"
const MODELS = {
  grass: "e2dde03b02e38ac6677a5c50c6922318ff86d7d497668b33704761df7477755b",
  dirt: "c7945d45f317446be05a884d3f5d5be989507ad657c898e5726aeb8ba6595520",
  stone: "61a87b1f3ff4fe0dd37cf05e149c7487ce8c6c0c0f571fb0a23c6084cf73f07b",
  tree1: "f4f4bd56416e432721cdc1f42c2ca2a17793660455ca494fe3bb44a738cd02f4",
  tree2: "a3dcf4fc33b70e6844afdb9f8f6a2543b373f6973f438b0377e3309b08acabee",
  tree3: "acbbf1ed786a58ce2f31843a59127e38c7cde70e7ba2e34af01df37aabca9004",
  bush: "2e1e490f8018c9956ec001936d529d5883a21ef0778a7f8a22cd67027d3b08ee",
  flowers1: "a79267e588fb84207655b42ebefaffd1f248c2ecc8f852ba30fd8a65fb4d7cfb",
  flowers2: "04068581f19bb875eb29cf118a67d9320f2ea410409353231a97e0f8f9c64899",
  grassBig: "8249d23c9497792c1b783dc7666f92e0a7dac9726bae809c24b744c39fc7a00d",
  mushroom: "99a04171502c28b0a46ca34a8153bb949ae35d1bb3d3d37a077333d69cb5e639",
  rock1: "8aafa87d57cdf4649480ed09c78e292d2573f2a53855f9dabeb5deb9d33d3b77",
  rock2: "b1450d24b1f18730502d3e4eb18273c8cc151b086ae2bea280181fd7f26f3a6f",
  fence: "fddc948a54d567616a6a664b0fa28890a05bcd0347dcfca59698c8a576a56688",
  fenceEnd: "ec925273b3f243bf8e1d2ec0fcc9eb9f685e63559cc922a272ce27ad3ff49b8f",
  chest: "1d04f0172f63952c0afcf62ca4d5fbbfd348cea1dc37185184c40c699c9f5fdf",
  crystal: "5ba846a8688282c80563c196ffd32f8e4c82f8c0635b1ca708ec065798fa08c0",
  sheep: "326e4970731ea76162c2d474c13db12142622b9102533d1920a73f41f87326e0",
  chick: "476aaee508a66e5c1318622196ceab244029eba1af110a701bcb6eaba92bebc1",
  pig: "d721e08403675db8f608a30d02952a0bc94e501871fb6c8a6ad19488ad03bbb5",
} as const

type ModelName = keyof typeof MODELS
type Models = Record<ModelName, GLTF>

interface Island {
  group: Group
  surface: Map<string, number>
  peak: { x: number; z: number; level: number }
  B: number
}

export interface IslandScene {
  /** Hero scroll progress, 0 at the top of the page and 1 once it has gone. */
  setProgress(progress: number): void
  /** Starts or stops drawing, for when the hero leaves the screen. */
  setActive(active: boolean): void
  dispose(): void
}

interface Options {
  /** Where the island's flag image comes from. */
  logoUrl: string
  /** Freeze every motion except the camera following scroll. */
  reducedMotion: boolean
}

/** Frame-rate independent smoothing towards a target, as in the engine. */
function damp(current: number, target: number, halfLife: number, dt: number) {
  return target + (current - target) * Math.pow(2, -dt / halfLife)
}

function dampAngle(current: number, target: number, halfLife: number, dt: number) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + delta * (1 - Math.pow(0.5, dt / halfLife))
}

/** A tiny seeded generator, so the island has the same shape on every visit. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export async function mountIsland(
  container: HTMLElement,
  { logoUrl, reducedMotion }: Options
): Promise<IslandScene> {
  const motion = reducedMotion ? 0 : 1
  const rng = mulberry32(7)

  const renderer = new WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFSoftShadowMap

  const canvas = renderer.domElement
  canvas.style.display = "block"
  canvas.style.width = "100%"
  canvas.style.height = "100%"

  const scene = new Scene()
  scene.fog = new Fog(0xcfe2ff, 40, 90)

  const camera = new PerspectiveCamera(32, 1, 0.1, 1000)
  scene.add(camera)

  scene.add(buildSky())
  addLights(scene)

  const pmrem = new PMREMGenerator(renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.35
  pmrem.dispose()

  const models = await loadModels()
  const B = blockSize(models.grass.scene)

  /*
    Everything inside `world` is laid out in the kit's own units, one block
    being `B`; the group scales that down so a block is one unit in the scene.
  */
  const world = new Group()
  world.scale.setScalar(1 / B)
  scene.add(world)

  const island = buildIsland(models, B, rng)
  const flag = buildFlag(island, B, logoUrl)
  island.group.add(flag.pole)
  const critters = spawnCritters(models, island, B, rng)
  world.add(island.group)

  const islets = [
    buildIslet(models, B, rng, [-13, -1.5, -10], 2.1, [["tree3", 0.5], ["grassBig", 0.8], ["flowers1", 1]]),
    buildIslet(models, B, rng, [12, -3, -11], 1.6, [["bush", 0.5], ["rock1", 1]]),
    buildIslet(models, B, rng, [-10, -7.5, 6], 1.3, [["grassBig", 0.8]]),
  ]
  for (const islet of islets) world.add(islet.group)

  const clouds = buildClouds(rng)
  scene.add(clouds.group)

  const pollen = buildPollen()
  scene.add(pollen.points)

  container.appendChild(canvas)

  /*
    The camera swings gently around the island and leans towards the pointer,
    always drifting back: a diorama on a turntable, not a model viewer. Scroll
    adds a slow dive on top, closing in and turning as the hero leaves.
  */
  const pointer = { x: 0, y: 0 }
  const onPointerMove = (event: PointerEvent) => {
    pointer.x = (event.clientX / window.innerWidth) * 2 - 1
    pointer.y = (event.clientY / window.innerHeight) * 2 - 1
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true })

  let distance = 28
  let width = 1
  let height = 1
  /*
    At rest the island sits low in the frame, under the headline and the
    composer. The shift is a view offset rather than a moved camera, so the
    perspective stays the one the scene was composed for; it eases to zero as
    the hero scrolls away and the island rises into the middle.
  */
  let shift = 0.36
  function resize() {
    width = Math.max(1, container.clientWidth)
    height = Math.max(1, container.clientHeight)
    const aspect = width / height
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    /* Narrow frames step back to keep the island whole. */
    distance = aspect < 0.8 ? 50 : aspect < 1.25 ? 40 : 36
    shift = aspect < 0.8 ? 0.36 : 0.36
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(container)
  resize()

  const target = new Vector3()
  let yaw = Math.PI / 4
  let pitch = 0.5
  let progress = 0
  let eased = 0

  const timer = new Timer()
  let frame = 0
  let active = true

  function tick(time: number) {
    frame = requestAnimationFrame(tick)
    timer.update(time)
    const dt = Math.min(timer.getDelta(), 0.1)
    const elapsed = timer.getElapsed()

    island.group.position.y = Math.sin(elapsed * 0.55) * 0.18 * motion * B
    island.group.rotation.y = Math.sin(elapsed * 0.12) * 0.05 * motion
    for (const [i, islet] of islets.entries()) {
      islet.group.position.y = islet.baseY + Math.sin(elapsed * 0.5 + i * 1.7) * 0.3 * motion * B
    }
    flag.update(elapsed * motion)
    clouds.update(dt * motion)
    critters.update(dt * motion)
    pollen.update(dt * motion)

    eased = damp(eased, progress, 0.12, dt)
    const swing = Math.sin(elapsed * 0.09) * 0.42 * motion
    yaw = damp(yaw, Math.PI / 4 + swing + pointer.x * 0.25 * motion + eased * 0.9, 0.4, dt)
    pitch = damp(pitch, 0.5 - pointer.y * 0.08 * motion - eased * 0.22, 0.4, dt)
    const reach = distance * (1 - eased * 0.48)

    target.set(0, -1.1, 0)
    camera.setViewOffset(width, height, 0, -height * shift * (1 - eased), width, height)
    camera.position.set(
      Math.sin(yaw) * Math.cos(pitch) * reach,
      Math.sin(pitch) * reach + target.y,
      Math.cos(yaw) * Math.cos(pitch) * reach
    )
    camera.lookAt(target)

    renderer.render(scene, camera)
  }

  function start() {
    if (frame) return
    timer.reset()
    frame = requestAnimationFrame(tick)
  }

  function stop() {
    cancelAnimationFrame(frame)
    frame = 0
  }

  const onVisibility = () => {
    if (document.hidden) stop()
    else if (active) start()
  }
  document.addEventListener("visibilitychange", onVisibility)

  start()

  return {
    setProgress(value) {
      progress = Math.min(1, Math.max(0, value))
    },
    setActive(value) {
      active = value
      if (value && !document.hidden) start()
      else stop()
    },
    dispose() {
      stop()
      resizeObserver.disconnect()
      window.removeEventListener("pointermove", onPointerMove)
      document.removeEventListener("visibilitychange", onVisibility)
      environment.texture.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}

/*
  The sky as a dome painted by a tiny shader rather than a background texture:
  a texture background goes through tone mapping and comes out grey, while this
  keeps the exact blue to peach of the CSS behind it.
*/
function buildSky() {
  return new Mesh(
    new SphereGeometry(300, 32, 16),
    new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new Color(0x4f9bff) },
        middle: { value: new Color(0xa9d0ff) },
        bottom: { value: new Color(0xffdcb8) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDirection;
        void main() {
          vDirection = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 middle;
        uniform vec3 bottom;
        varying vec3 vDirection;
        void main() {
          float h = vDirection.y + 0.32;
          vec3 color = h > 0.0
            ? mix(middle, top, smoothstep(0.0, 0.6, h))
            : mix(middle, bottom, smoothstep(0.0, 0.3, -h));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }
      `,
    })
  )
}

/* A warm low sun for long shadows and a cool sky fill. */
function addLights(scene: Scene) {
  scene.add(new HemisphereLight(0xd6e8ff, 0x8a6f5c, 1.1))

  const sun = new DirectionalLight(0xfff0d6, 2.6)
  sun.position.set(9, 16, 6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -9
  sun.shadow.camera.right = 9
  sun.shadow.camera.top = 9
  sun.shadow.camera.bottom = -9
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 50
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 3
  scene.add(sun)
}

async function loadModels(): Promise<Models> {
  const loader = new GLTFLoader()
  const entries = await Promise.all(
    (Object.entries(MODELS) as [ModelName, string][]).map(
      async ([name, hash]) => [name, await loader.loadAsync(BLOBS + hash)] as const
    )
  )
  return Object.fromEntries(entries) as Models
}

function blockSize(block: Object3D) {
  return new Box3().setFromObject(block).getSize(new Vector3()).x
}

/*
  Instances share geometry and materials with their source; only skinned
  models need SkeletonUtils, because a plain clone would leave every copy
  driven by the first one's bones.
*/
function instance(gltf: GLTF, skinned = false) {
  const object = skinned ? SkeletonUtils.clone(gltf.scene) : gltf.scene.clone(true)
  object.traverse((child) => {
    if ((child as Mesh).isMesh) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  return object
}

/** Sits an object's lowest point on a surface height, whatever its pivot. */
function standOn(object: Object3D, surfaceY: number) {
  object.updateMatrixWorld(true)
  const box = new Box3().setFromObject(object)
  object.position.y += surfaceY - box.min.y
  return object
}

/*
  The island is a heightmap of blocks: a rounded grassy top with a small hill
  at the back, then dirt and stone layers that shrink into a jagged point.
*/
function buildIsland(models: Models, B: number, rng: () => number): Island {
  const group = new Group()
  const RADIUS = 4.2
  const surface = new Map<string, number>()
  let peak = { x: 0, z: 0, level: 0 }

  for (let x = -5; x <= 5; x++) {
    for (let z = -5; z <= 5; z++) {
      const edge = RADIUS + Math.sin(x * 1.7 + z * 0.9) * 0.45 + Math.cos(z * 1.3 - x) * 0.35
      const distance = Math.hypot(x, z)
      if (distance > edge) continue

      const top = (Math.hypot(x + 1.5, z + 1.5) < 1.6 ? 1 : 0) + (x === -2 && z === -2 ? 1 : 0)
      surface.set(`${x},${z}`, top + 1)
      if (top + 1 > peak.level) peak = { x, z, level: top + 1 }

      for (let y = top; y >= -7; y--) {
        const sink = Math.max(0, -y) / 7.5
        const reach = edge * (1 - Math.pow(sink, 0.75)) - rng() * 0.9
        if (y < 0 && distance > reach) break
        const kind: ModelName =
          y === top ? "grass" : y > -2 || (y > -4 && rng() < 0.35) ? "dirt" : "stone"
        const block = instance(models[kind])
        block.position.set(x * B, 0, z * B)
        standOn(block, y * B)
        group.add(block)
      }
    }
  }

  const island = { group, surface, peak, B }
  decorate(models, island, rng)
  return island
}

function surfaceAt(island: Island, x: number, z: number) {
  const level = island.surface.get(`${x},${z}`)
  return level === undefined ? null : level * island.B
}

/* Hand placed rather than scattered: random scatter this small reads as clutter. */
function decorate(models: Models, island: Island, rng: () => number) {
  const B = island.B
  const place = (
    name: ModelName,
    x: number,
    z: number,
    { rotate = rng() * Math.PI * 2, scale = 1, jitter = 0.3 } = {}
  ) => {
    const surfaceY = surfaceAt(island, x, z)
    if (surfaceY === null) return
    const object = instance(models[name])
    object.scale.multiplyScalar(scale)
    object.rotation.y = rotate
    object.position.set(x * B + (rng() - 0.5) * B * jitter, 0, z * B + (rng() - 0.5) * B * jitter)
    standOn(object, surfaceY)
    island.group.add(object)
  }

  place("tree2", -1, -3, { scale: 0.7 })
  place("tree1", -3, -1, { scale: 0.65 })
  place("tree3", -3, 1, { scale: 0.6 })
  place("tree1", 3, -2, { scale: 0.55 })
  place("bush", -2, 0, { scale: 0.7 })
  place("bush", 2, 2, { scale: 0.6 })
  place("mushroom", -1, -1, { scale: 0.9 })
  place("rock2", 3, 1)
  place("rock1", 1, 3)
  place("crystal", 2, -3, { scale: 1.2 })

  for (const [x, z] of [[1, -1], [2, 0], [0, 2], [-2, 3], [3, 3], [-3, 3], [0, -2]] as const) {
    place(rng() > 0.5 ? "flowers1" : "flowers2", x, z)
  }
  for (const [x, z] of [[1, 1], [-1, 2], [4, 0], [2, 1], [-4, 0], [0, 4], [1, -3]] as const) {
    place("grassBig", x, z, { scale: 0.9 })
  }

  place("fenceEnd", 3, 4, { rotate: 0, jitter: 0 })
  place("fence", 2, 4, { rotate: 0, jitter: 0 })
  place("fenceEnd", 1, 4, { rotate: Math.PI, jitter: 0 })
  place("chest", 2, 3, { rotate: Math.PI, jitter: 0 })
}

/* Smaller islands adrift far off, bobbing out of step with the main one. */
function buildIslet(
  models: Models,
  B: number,
  rng: () => number,
  [x, y, z]: [number, number, number],
  radius: number,
  props: [ModelName, number][]
) {
  const group = new Group()
  const cells: [number, number][] = []
  const span = Math.ceil(radius)

  for (let cx = -span; cx <= span; cx++) {
    for (let cz = -span; cz <= span; cz++) {
      const distance = Math.hypot(cx, cz)
      if (distance > radius + rng() * 0.3) continue
      cells.push([cx, cz])
      for (let cy = 0; cy >= -3; cy--) {
        const reach = radius * (1 - Math.pow(-cy / 3.5, 0.8)) - rng() * 0.5
        if (cy < 0 && distance > reach) break
        const kind: ModelName = cy === 0 ? "grass" : cy === -1 ? "dirt" : "stone"
        const block = instance(models[kind])
        block.position.set(cx * B, 0, cz * B)
        standOn(block, cy * B)
        group.add(block)
      }
    }
  }

  for (const [name, scale] of props) {
    const cell = cells[Math.floor(rng() * cells.length)]
    if (!cell) continue
    const prop = instance(models[name])
    prop.scale.multiplyScalar(scale)
    prop.rotation.y = rng() * Math.PI * 2
    prop.position.set(cell[0] * B, 0, cell[1] * B)
    standOn(prop, B)
    group.add(prop)
  }

  group.position.set(x * B, y * B, z * B)
  return { group, baseY: group.position.y }
}

/*
  numa's mark as a small pennant on the highest point of the island. The cloth
  is a plane whose vertices ripple outward from the pole each frame.
*/
function buildFlag(island: Island, B: number, logoUrl: string) {
  const pole = new Group()
  const height = 1.9
  const stick = new Mesh(
    new CylinderGeometry(0.03, 0.035, height, 8),
    new MeshStandardMaterial({ color: 0x8b6b4a, roughness: 0.8 })
  )
  stick.position.y = height / 2
  stick.castShadow = true
  pole.add(stick)

  const knob = new Mesh(
    new SphereGeometry(0.06, 12, 8),
    new MeshStandardMaterial({ color: 0xf2c94c, metalness: 0.6, roughness: 0.3 })
  )
  knob.position.y = height + 0.04
  pole.add(knob)

  const geometry = new PlaneGeometry(0.9, 0.6, 16, 8)
  geometry.translate(0.45, 0, 0)
  const positions = geometry.attributes.position as BufferAttribute
  const rest = (positions.array as Float32Array).slice()
  const cloth = new Mesh(
    geometry,
    new MeshStandardMaterial({ map: flagTexture(logoUrl), side: DoubleSide, roughness: 0.9 })
  )
  cloth.position.set(0.03, height - 0.35, 0)
  cloth.castShadow = true
  pole.add(cloth)

  const { x, z, level } = island.peak
  pole.scale.setScalar(B * 1.35)
  pole.position.set(x * B, level * B, z * B)
  pole.rotation.y = Math.PI / 4

  return {
    pole,
    update(t: number) {
      for (let i = 0; i < positions.count; i++) {
        const px = rest[i * 3] ?? 0
        const py = rest[i * 3 + 1] ?? 0
        const along = px / 0.9
        positions.setZ(i, Math.sin(px * 6 - t * 4.2 + py * 1.5) * 0.07 * along)
        positions.setY(i, py - along * 0.04)
      }
      positions.needsUpdate = true
      geometry.computeVertexNormals()
    },
  }
}

/* The pennant face: numa's mark drawn on white cloth once the image loads. */
function flagTexture(logoUrl: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 256
  canvas.height = 170
  const context = canvas.getContext("2d")
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  if (!context) return texture

  context.fillStyle = "#ffffff"
  context.fillRect(0, 0, canvas.width, canvas.height)
  const image = new Image()
  image.onload = () => {
    const h = 104
    const w = (image.width / image.height) * h
    context.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h)
    texture.needsUpdate = true
  }
  image.src = logoUrl
  return texture
}

/*
  Animals wandering the meadow: each picks a spot on the flat open part of the
  island, walks there, then idles or grazes a while. Targets come from the
  surface map, so nobody ever walks off the edge or into the hill.
*/
function spawnCritters(models: Models, island: Island, B: number, rng: () => number) {
  const cells = [...island.surface.entries()]
    .filter(([, level]) => level === 1)
    .map(([key]) => key.split(",").map(Number) as [number, number])
    .filter(([x, z]) => Math.hypot(x, z) < 3.2 && x > -1)

  const roster = [
    { name: "sheep", walk: "Walk", idle: ["Idle", "Idle_Eating"], speed: 0.55, scale: 0.75 },
    { name: "sheep", walk: "Walk", idle: ["Idle_Eating", "Idle"], speed: 0.5, scale: 0.7 },
    { name: "pig", walk: "Walk", idle: ["Idle", "Idle_Eating"], speed: 0.5, scale: 0.7 },
    { name: "chick", walk: "Run", idle: ["Idle_Peck", "Idle"], speed: 0.7, scale: 0.6 },
    { name: "chick", walk: "Run", idle: ["Idle", "Idle_Peck"], speed: 0.75, scale: 0.55 },
  ] as const

  interface Critter {
    speed: number
    object: Object3D
    mixer: AnimationMixer
    walk: AnimationAction
    idle: AnimationAction[]
    groundY: number
    target: Vector3 | null
    wait: number
    current: AnimationAction | null
  }

  function play(critter: Critter, action: AnimationAction | undefined) {
    if (!action || critter.current === action) return
    action.reset().fadeIn(0.3).play()
    critter.current?.fadeOut(0.3)
    critter.current = action
  }

  const critters: Critter[] = roster.map((spec, i) => {
    const gltf = models[spec.name]
    const object = instance(gltf, true)
    object.scale.multiplyScalar(spec.scale)
    object.rotation.y = rng() * Math.PI * 2
    const [x, z] = cells[(i * 5) % cells.length] ?? [0, 0]
    object.position.set(x * B, 0, z * B)
    standOn(object, B)
    island.group.add(object)

    const mixer = new AnimationMixer(object)
    const clip = (name: string) =>
      gltf.animations.find((animation) => animation.name.endsWith(name)) ?? gltf.animations[0]!
    const critter: Critter = {
      speed: spec.speed,
      object,
      mixer,
      walk: mixer.clipAction(clip(spec.walk)),
      idle: spec.idle.map((name) => mixer.clipAction(clip(name))),
      groundY: object.position.y,
      target: null,
      wait: 1 + rng() * 3,
      current: null,
    }
    play(critter, critter.idle[0])
    return critter
  })

  const step = new Vector3()
  return {
    update(dt: number) {
      for (const critter of critters) {
        critter.mixer.update(dt)
        if (critter.target) {
          step.subVectors(critter.target, critter.object.position)
          step.y = 0
          const distance = step.length()
          if (distance < 0.05 * B) {
            critter.target = null
            critter.wait = 2 + rng() * 4
            play(critter, critter.idle[Math.floor(rng() * critter.idle.length)])
            continue
          }
          const heading = Math.atan2(step.x, step.z)
          critter.object.rotation.y = dampAngle(critter.object.rotation.y, heading, 0.15, dt)
          step.normalize().multiplyScalar(Math.min(distance, critter.speed * B * dt))
          critter.object.position.add(step)
        } else if (dt > 0 && (critter.wait -= dt) <= 0) {
          const [x, z] = cells[Math.floor(rng() * cells.length)] ?? [0, 0]
          critter.target = new Vector3(
            (x + (rng() - 0.5) * 0.6) * B,
            critter.groundY,
            (z + (rng() - 0.5) * 0.6) * B
          )
          play(critter, critter.walk)
        }
      }
    },
  }
}

/*
  Low poly cumulus at several depths, some below the island, which is what
  sells "floating" more than anything above it. Each cloud fades out before it
  loops back, so the jump never shows.
*/
function buildClouds(rng: () => number) {
  const group = new Group()
  const puff = new IcosahedronGeometry(1, 1)
  const DRIFT = 7
  const clouds: {
    cloud: Group
    material: MeshStandardMaterial
    speed: number
    home: number
    offset: number
  }[] = []

  const spots = [
    [-9, 3.5, -10, 1.3],
    [8, 5, -12, 1.1],
    [11, -1.5, 3, 1],
    [-12, -3, 2, 1.2],
    [3, -6.5, 6, 1.4],
    [-4, 6.5, -6, 0.8],
    [6, -4, -6, 0.9],
  ] as const
  for (const [x, y, z, size] of spots) {
    const cloud = new Group()
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      flatShading: true,
      transparent: true,
      opacity: 0,
    })
    const puffs = 4 + Math.floor(rng() * 3)
    for (let i = 0; i < puffs; i++) {
      const mesh = new Mesh(puff, material)
      const r = 0.6 + rng() * 0.6
      mesh.scale.set(r * 1.3, r * 0.75, r)
      mesh.position.set((i - puffs / 2) * 0.75 + rng() * 0.3, rng() * 0.35, (rng() - 0.5) * 0.6)
      cloud.add(mesh)
    }
    cloud.scale.setScalar(size)
    cloud.position.set(x, y, z)
    group.add(cloud)
    clouds.push({ cloud, material, speed: 0.15 + rng() * 0.2, home: x, offset: (rng() * 2 - 1) * DRIFT })
  }

  return {
    group,
    update(dt: number) {
      for (const entry of clouds) {
        entry.offset += entry.speed * dt
        if (entry.offset > DRIFT) entry.offset -= DRIFT * 2
        entry.cloud.position.x = entry.home + entry.offset
        const edge = 1 - Math.abs(entry.offset) / DRIFT
        entry.material.opacity = 0.92 * Math.min(1, edge / 0.3)
      }
    },
  }
}

/*
  Pollen in the sunlight: tiny warm specks drifting up past the island, which
  make the air read as air rather than a backdrop. Each speck wraps back to
  the bottom once it rises out of the volume.
*/
function buildPollen() {
  const COUNT = 90
  const positions = new Float32Array(COUNT * 3)
  const speeds = new Float32Array(COUNT)
  const random = mulberry32(11)
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (random() * 2 - 1) * 7
    positions[i * 3 + 1] = random() * 9 - 4
    positions[i * 3 + 2] = (random() * 2 - 1) * 7
    speeds[i] = 0.08 + random() * 0.14
  }
  const geometry = new BufferGeometry()
  const attribute = new BufferAttribute(positions, 3)
  geometry.setAttribute("position", attribute)
  const points = new Points(
    geometry,
    new PointsMaterial({
      color: 0xfff1c2,
      size: 0.05,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  )

  return {
    points,
    update(dt: number) {
      for (let i = 0; i < COUNT; i++) {
        let y = (positions[i * 3 + 1] ?? 0) + (speeds[i] ?? 0.1) * dt
        if (y > 5) y = -4
        positions[i * 3 + 1] = y
      }
      attribute.needsUpdate = true
    },
  }
}

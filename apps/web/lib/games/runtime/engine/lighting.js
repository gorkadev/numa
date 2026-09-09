/**
 * Light, as presets rather than parts.
 *
 * Physically-based materials look like grey plastic until something lights
 * them, and "something" is never one light: it is a key, a fill, a bounce off
 * the ground, and a shadow camera tight enough to have resolution. Choosing a
 * time of day is a decision a game can make; choosing a shadow frustum is not.
 *
 * Nothing here loads a file. The sandbox has no HDR maps and no network, so
 * the sky and the reflections are generated in code.
 */

import * as THREE from "three"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"

/**
 * Ready-made lighting moods. Each is a sun colour and angle, a sky and ground
 * colour for the bounce, and the fog that ties the two together.
 */
export const LIGHTING_PRESETS = {
  day: {
    sun: 0xfff4e0,
    sunIntensity: 1.9,
    sunPosition: [8, 14, 6],
    sky: 0xbfd9ff,
    ground: 0x6b7280,
    ambient: 0.45,
    background: 0x9ec7ff,
    fog: [0xbfd9ff, 40, 180],
  },
  sunset: {
    sun: 0xffb37a,
    sunIntensity: 1.8,
    sunPosition: [-12, 6, 4],
    sky: 0xffd0a0,
    ground: 0x3b2b3f,
    ambient: 0.45,
    background: 0xf0a06a,
    fog: [0xf0a06a, 25, 140],
  },
  night: {
    sun: 0x93b8ff,
    sunIntensity: 0.7,
    sunPosition: [-6, 12, -8],
    sky: 0x1b2440,
    ground: 0x05060c,
    ambient: 0.3,
    background: 0x080b18,
    fog: [0x080b18, 15, 90],
  },
  studio: {
    sun: 0xffffff,
    sunIntensity: 1.8,
    sunPosition: [5, 10, 7],
    sky: 0xffffff,
    ground: 0x8a8a8a,
    ambient: 0.6,
    background: 0x1a1a1f,
    fog: false,
  },
  neon: {
    sun: 0xff5fd2,
    sunIntensity: 1.6,
    sunPosition: [6, 9, -6],
    sky: 0x5a2bff,
    ground: 0x0a0618,
    ambient: 0.5,
    background: 0x0a0618,
    fog: [0x1b0a3a, 12, 90],
  },
}

/**
 * Lights a scene from a preset and returns the lights, so a game can animate
 * a sunset or dim the key light on a hit.
 *
 * @param {object} engine
 * @param {keyof typeof LIGHTING_PRESETS | object} [preset]
 */
export function addLighting(engine, preset = "day", options = {}) {
  const config =
    typeof preset === "string" ? LIGHTING_PRESETS[preset] : { ...preset }
  const { shadowRadius = 30, shadowMapSize = 2048, applyBackground = true } =
    options

  /**
   * Hemisphere light rather than a flat ambient: it tints the tops of objects
   * with the sky and their undersides with the ground, which is most of what
   * makes an outdoor scene read as outdoors, for the cost of one light.
   */
  const hemisphere = new THREE.HemisphereLight(
    config.sky,
    config.ground,
    config.ambient
  )
  engine.scene.add(hemisphere)

  const sun = new THREE.DirectionalLight(config.sun, config.sunIntensity)
  sun.position.set(...config.sunPosition)
  sun.castShadow = engine.renderer.shadowMap.enabled
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize)

  /**
   * A directional light's shadow camera is orthographic and covers a fixed
   * box. Left at its default it either misses the level or spreads its
   * resolution so thin that shadows turn into blocks — so it is fitted to the
   * area the game actually plays in.
   */
  const shadowCamera = sun.shadow.camera
  shadowCamera.left = -shadowRadius
  shadowCamera.right = shadowRadius
  shadowCamera.top = shadowRadius
  shadowCamera.bottom = -shadowRadius
  shadowCamera.near = 0.5
  shadowCamera.far = shadowRadius * 4
  shadowCamera.updateProjectionMatrix()
  /** Pushes the shadow slightly off the surface, killing the stripe artefact. */
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.02

  engine.scene.add(sun)
  engine.scene.add(sun.target)

  if (applyBackground && config.background !== undefined) {
    engine.scene.background = new THREE.Color(config.background)
  }
  if (config.fog) {
    engine.scene.fog = new THREE.Fog(config.fog[0], config.fog[1], config.fog[2])
  }

  return {
    sun,
    hemisphere,
    /**
     * Keeps the shadow box centred on the player. A 30-unit shadow camera in a
     * 500-unit world has to move, or everything outside the starting area
     * casts nothing.
     */
    followTarget(object, engine) {
      const offset = sun.position.clone().sub(sun.target.position)
      return engine.onLateUpdate(() => {
        sun.target.position.copy(object.position)
        sun.position.copy(object.position).add(offset)
      })
    },
    dispose() {
      sun.dispose()
      hemisphere.dispose()
      engine.scene.remove(sun, sun.target, hemisphere)
    },
  }
}

/**
 * A vertical gradient sky, painted into a canvas texture.
 *
 * Two colours are enough to sell a sky, and this costs one 2x256 texture with
 * no file to load. Applied as the scene background rather than as geometry, so
 * it is always behind everything and never clipped by the far plane.
 */
export function createGradientSky(engine, top = 0x2b6cff, bottom = 0xcfe4ff) {
  const canvas = document.createElement("canvas")
  canvas.width = 2
  canvas.height = 256
  const context = canvas.getContext("2d")
  const gradient = context.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, `#${new THREE.Color(top).getHexString()}`)
  gradient.addColorStop(1, `#${new THREE.Color(bottom).getHexString()}`)
  context.fillStyle = gradient
  context.fillRect(0, 0, 2, 256)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.mapping = THREE.EquirectangularReflectionMapping
  engine.scene.background = texture
  engine.onDispose(() => texture.dispose())
  return texture
}

/**
 * Generated reflections for metal and glossy materials.
 *
 * PBR materials need something to reflect; without an environment map a metal
 * sphere is a black sphere. `RoomEnvironment` is a small procedural room
 * rendered once into a cube map, so this costs no assets and one frame at
 * startup.
 */
export function addEnvironment(engine, intensity = 0.45) {
  const pmrem = new THREE.PMREMGenerator(engine.renderer)
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04)
  engine.scene.environment = environment.texture
  engine.scene.environmentIntensity = intensity
  pmrem.dispose()
  engine.onDispose(() => environment.texture.dispose())
  return environment.texture
}

/**
 * A light that follows an object — a torch, a muzzle flash, the glow of a
 * collectible. Point lights are cheap in ones and expensive in dozens, so this
 * is deliberately a single light rather than a pool.
 */
export function attachLight(engine, object, options = {}) {
  const {
    color = 0xffd28a,
    intensity = 12,
    distance = 14,
    offset = [0, 1, 0],
    flicker = 0,
  } = options

  const light = new THREE.PointLight(color, intensity, distance, 2)
  object.add(light)
  light.position.set(...offset)

  if (flicker > 0) {
    engine.onUpdate((dt, { elapsed }) => {
      light.intensity =
        intensity * (1 - flicker + flicker * (0.5 + 0.5 * Math.sin(elapsed * 21)))
    })
  }

  return light
}

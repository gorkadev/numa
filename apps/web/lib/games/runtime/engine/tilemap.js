/**
 * Tile maps for 2D games: a grid of tiles from one atlas, drawn as a single
 * mesh, plus the neighbour rule that picks edge and corner pieces so a map
 * can be written as "where is land" instead of tile by tile.
 *
 * Coordinates: one tile is one world unit by default, column grows to the
 * right (+x) and row grows downward (−y), so a grid written in code reads
 * the same way it appears on screen.
 */

import * as THREE from "three"

import { setSpriteDepth, spriteMaterial } from "./sprites.js"

/**
 * Builds one tile layer from a grid of tile names, atlas indices, or null for empty.
 *
 * Indices count left to right, top to bottom across the atlas. Every
 * non-empty cell becomes one quad of a single mesh — one draw call however
 * large the map. Stack layers (water, ground, elevated ground) with `layer`.
 *
 * @param {object} options
 * @param {THREE.Texture} options.texture Loaded with `loadPixelTexture`.
 * @param {number} options.tileSize Tile size in atlas pixels.
 * @param {Record<string, number>} [options.tiles] Names for atlas indices.
 * @param {(string|number|null)[][]} options.grid Rows, top row first.
 * @param {number} [options.pixelsPerUnit] Defaults to `tileSize`: one tile per unit.
 * @param {[number, number]} [options.origin] World position of cell (0, 0)'s centre.
 * @param {number} [options.layer] Draw-order layer (see `setSpriteDepth`).
 */
export function createTileLayer(options) {
  const { texture, tileSize, tiles = {}, grid, pixelsPerUnit = tileSize, origin = [0, 0], layer = 0 } = options

  const image = texture?.image
  if (!image?.width) throw new Error("Tile layer has no loaded texture; await loadPixelTexture() first.")
  const columns = Math.floor(image.width / tileSize)
  const rows = Math.floor(image.height / tileSize)
  const unit = tileSize / pixelsPerUnit

  const positions = []
  const uvs = []
  const indices = []

  grid.forEach((cells, row) => {
    cells.forEach((cell, column) => {
      if (cell === null || cell === undefined) return
      const index = typeof cell === "number" ? cell : tiles[cell]
      if (index === undefined) {
        throw new Error(`Unknown tile "${cell}". Available: ${Object.keys(tiles).join(", ")}.`)
      }
      if (index < 0 || index >= columns * rows) {
        throw new Error(`Tile index ${index} is outside the ${columns}x${rows} atlas.`)
      }

      const x = origin[0] + column * unit
      const y = origin[1] - row * unit
      const half = unit / 2
      const base = positions.length / 3
      positions.push(x - half, y + half, 0, x + half, y + half, 0, x - half, y - half, 0, x + half, y - half, 0)

      const u0 = (index % columns) / columns
      const u1 = ((index % columns) + 1) / columns
      const v1 = 1 - Math.floor(index / columns) / rows
      const v0 = 1 - (Math.floor(index / columns) + 1) / rows
      uvs.push(u0, v1, u1, v1, u0, v0, u1, v0)
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1)
    })
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  const mesh = new THREE.Mesh(geometry, spriteMaterial(texture))
  // A layer is one flat sheet, so it sorts by layer alone, never by y.
  setSpriteDepth(mesh, { layer, y: 0 })

  return {
    mesh,
    /** World centre of a cell. */
    cellToWorld(column, row) {
      return { x: origin[0] + column * unit, y: origin[1] - row * unit }
    },
    /** The cell under a world position. */
    worldToCell(x, y) {
      return { column: Math.round((x - origin[0]) / unit), row: Math.round((origin[1] - y) / unit) }
    },
    dispose() {
      mesh.removeFromParent()
      geometry.dispose()
      mesh.material.dispose()
    },
  }
}

/**
 * Turns a land mask into atlas indices for a 4x4 block of 16 neighbour pieces.
 *
 * The block holds a 3x3 patch (corners, edges, centre) in its first three
 * columns and rows, a one-tile-wide vertical strip in its fourth column, a
 * one-tile-tall horizontal strip in its fourth row, and a lone tile in the
 * corner — every combination of land above, below, left and right. Cells
 * outside the mask count as empty.
 *
 * @param {(boolean|number)[][]} mask Truthy where there is land, top row first.
 * @param {{ column: number, row: number, columns: number }} block Atlas cell
 *   of the block's top-left piece, and the atlas width in tiles.
 * @returns {(number|null)[][]} Atlas indices, null where the mask is empty.
 */
export function autotile16(mask, block) {
  const filled = (row, column) => Boolean(mask[row]?.[column])
  return mask.map((cells, row) =>
    cells.map((cell, column) => {
      if (!cell) return null
      const up = filled(row - 1, column)
      const down = filled(row + 1, column)
      const left = filled(row, column - 1)
      const right = filled(row, column + 1)
      const x = left ? (right ? 1 : 2) : right ? 0 : 3
      const y = up ? (down ? 1 : 2) : down ? 0 : 3
      return (block.row + y) * block.columns + block.column + x
    })
  )
}

/**
 * Checks a 2D template's declared frame and tile grids against the real PNG
 * sizes, before the bytes go to object storage and nothing reads them again.
 *
 * Sizes alone cannot prove a frame width: a 1536x256 sheet divides into six
 * 256 px frames as cleanly as into eight 192 px ones. That ambiguity is
 * settled when the manifest is generated, by checking that every frame
 * boundary falls on transparent pixels; this catches the rest — a frame
 * count, size or atlas grid that does not fit the image at all.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Width and height from a PNG's IHDR chunk, or undefined when the bytes are not a PNG. */
export function pngSize(contents: Buffer): { width: number; height: number } | undefined {
  if (contents.length < 24 || !contents.subarray(0, 8).equals(PNG_SIGNATURE)) return undefined
  if (contents.toString("ascii", 12, 16) !== "IHDR") return undefined
  return { width: contents.readUInt32BE(16), height: contents.readUInt32BE(20) }
}

type DeclaredSheets = {
  sprites?: readonly { id: string; path: string; frameWidth: number; frameHeight: number; frames: number }[]
  tilesets?: readonly { id: string; path: string; tileSize: number; columns: number; rows: number }[]
}

export function spriteSheetProblems(manifest: DeclaredSheets, files: ReadonlyMap<string, Buffer>): string[] {
  const problems: string[] = []

  for (const sprite of manifest.sprites ?? []) {
    const contents = files.get(sprite.path)
    const size = contents && pngSize(contents)
    if (!size) {
      problems.push(contents ? `sprite ${sprite.id}: ${sprite.path} is not a PNG` : `sprite ${sprite.id}: missing ${sprite.path}`)
      continue
    }
    const fits = size.width % sprite.frameWidth === 0 && size.height % sprite.frameHeight === 0
    const cells = (size.width / sprite.frameWidth) * (size.height / sprite.frameHeight)
    if (!fits) {
      problems.push(`sprite ${sprite.id}: a ${size.width}x${size.height} sheet does not divide into ${sprite.frameWidth}x${sprite.frameHeight} frames`)
    } else if (cells !== sprite.frames) {
      problems.push(`sprite ${sprite.id}: a ${size.width}x${size.height} sheet holds ${cells} frames of ${sprite.frameWidth}x${sprite.frameHeight}, not ${sprite.frames}`)
    }
  }

  for (const tileset of manifest.tilesets ?? []) {
    const contents = files.get(tileset.path)
    const size = contents && pngSize(contents)
    if (!size) {
      problems.push(contents ? `tileset ${tileset.id}: ${tileset.path} is not a PNG` : `tileset ${tileset.id}: missing ${tileset.path}`)
      continue
    }
    const columns = size.width / tileset.tileSize
    const rows = size.height / tileset.tileSize
    if (columns !== tileset.columns || rows !== tileset.rows) {
      problems.push(`tileset ${tileset.id}: a ${size.width}x${size.height} atlas is ${columns}x${rows} tiles of ${tileset.tileSize}, not ${tileset.columns}x${tileset.rows}`)
    }
  }

  return problems
}

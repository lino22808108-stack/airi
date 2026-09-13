export const FINGERPRINT_SIZE = 24
export const DEFAULT_SCENE_CHANGE_RATIO = 0.12

export function grayscaleFingerprintFromRgba(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const out = new Uint8Array(FINGERPRINT_SIZE * FINGERPRINT_SIZE)
  if (width <= 0 || height <= 0 || data.length < 4)
    return out

  const xStep = width / FINGERPRINT_SIZE
  const yStep = height / FINGERPRINT_SIZE

  for (let y = 0; y < FINGERPRINT_SIZE; y++) {
    for (let x = 0; x < FINGERPRINT_SIZE; x++) {
      const srcX = Math.min(width - 1, Math.floor((x + 0.5) * xStep))
      const srcY = Math.min(height - 1, Math.floor((y + 0.5) * yStep))
      const index = (srcY * width + srcX) * 4
      out[y * FINGERPRINT_SIZE + x] = Math.round(
        0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2],
      )
    }
  }

  return out
}

export function meanAbsDiffRatio(a: Uint8Array, b: Uint8Array): number {
  if (a.length === 0 || a.length !== b.length)
    return 1

  let sum = 0
  for (let index = 0; index < a.length; index++)
    sum += Math.abs(a[index] - b[index])

  return sum / (a.length * 255)
}

export function isSceneChange(
  previous: Uint8Array | null | undefined,
  next: Uint8Array,
  threshold = DEFAULT_SCENE_CHANGE_RATIO,
): boolean {
  if (!previous)
    return true

  return meanAbsDiffRatio(previous, next) >= threshold
}

export function dataUrlToImageAttachment(dataUrl: string): { type: 'image', data: string, mimeType: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/)
  if (!match)
    return null

  return {
    type: 'image',
    mimeType: match[1],
    data: match[2],
  }
}

export async function computeFingerprintFromDataUrl(dataUrl: string): Promise<Uint8Array | null> {
  if (typeof document === 'undefined')
    return null

  const image = await loadImage(dataUrl)
  if (!image)
    return null

  const canvas = document.createElement('canvas')
  canvas.width = FINGERPRINT_SIZE
  canvas.height = FINGERPRINT_SIZE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return null

  context.drawImage(image, 0, 0, FINGERPRINT_SIZE, FINGERPRINT_SIZE)
  const pixels = context.getImageData(0, 0, FINGERPRINT_SIZE, FINGERPRINT_SIZE)
  return grayscaleFingerprintFromRgba(pixels.data, pixels.width, pixels.height)
}

async function loadImage(dataUrl: string): Promise<HTMLImageElement | ImageBitmap | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      return await createImageBitmap(blob)
    }
    catch {
      // Fall through to HTMLImageElement.
    }
  }

  if (typeof Image === 'undefined')
    return null

  return await new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

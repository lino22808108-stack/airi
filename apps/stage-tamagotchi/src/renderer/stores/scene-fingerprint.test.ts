import { describe, expect, it } from 'vitest'

import {
  dataUrlToImageAttachment,
  FINGERPRINT_SIZE,
  grayscaleFingerprintFromRgba,
  isSceneChange,
  meanAbsDiffRatio,
} from './scene-fingerprint'

function fillRgba(value: number) {
  const pixels = new Uint8ClampedArray(FINGERPRINT_SIZE * FINGERPRINT_SIZE * 4)
  for (let index = 0; index < pixels.length; index += 4) {
    pixels[index] = value
    pixels[index + 1] = value
    pixels[index + 2] = value
    pixels[index + 3] = 255
  }
  return pixels
}

describe('scene fingerprint', () => {
  it('treats the first frame as a scene change', () => {
    const next = grayscaleFingerprintFromRgba(fillRgba(40), FINGERPRINT_SIZE, FINGERPRINT_SIZE)
    expect(isSceneChange(null, next)).toBe(true)
  })

  it('ignores tiny pixel jitter', () => {
    const previous = grayscaleFingerprintFromRgba(fillRgba(40), FINGERPRINT_SIZE, FINGERPRINT_SIZE)
    const next = grayscaleFingerprintFromRgba(fillRgba(44), FINGERPRINT_SIZE, FINGERPRINT_SIZE)
    expect(meanAbsDiffRatio(previous, next)).toBeLessThan(0.05)
    expect(isSceneChange(previous, next)).toBe(false)
  })

  it('detects a large scene change', () => {
    const previous = grayscaleFingerprintFromRgba(fillRgba(10), FINGERPRINT_SIZE, FINGERPRINT_SIZE)
    const next = grayscaleFingerprintFromRgba(fillRgba(200), FINGERPRINT_SIZE, FINGERPRINT_SIZE)
    expect(isSceneChange(previous, next)).toBe(true)
  })

  it('strips the data-url prefix for chat image attachments', () => {
    expect(dataUrlToImageAttachment('data:image/jpeg;base64,abc123')).toEqual({
      type: 'image',
      mimeType: 'image/jpeg',
      data: 'abc123',
    })
    expect(dataUrlToImageAttachment('not-an-image')).toBeNull()
  })
})

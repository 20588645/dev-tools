import { describe, expect, it } from 'vitest'

import {
  DAYLIGHT_ARC_LENGTH,
  DAYLIGHT_HORIZON_Y,
  daylightMarker,
  daylightProgressLength,
} from './home-daylight-path'

describe('home daylight path', () => {
  it('keeps the sun on a single hill above a flat horizon', () => {
    const sunrise = daylightMarker(true, 0, 0)
    const noon = daylightMarker(true, 0.5, 0)
    const sunset = daylightMarker(true, 1, 0)

    expect(sunrise.x).toBeLessThan(noon.x)
    expect(sunset.x).toBeGreaterThan(noon.x)
    expect(noon.y).toBeLessThan(DAYLIGHT_HORIZON_Y)
    expect(sunrise.y).toBe(DAYLIGHT_HORIZON_Y)
    expect(sunset.y).toBe(DAYLIGHT_HORIZON_Y)
  })

  it('slides the moon along the horizon at night instead of mirroring the day arc', () => {
    const dusk = daylightMarker(false, 1, 0)
    const midnight = daylightMarker(false, 1, 0.5)
    const dawn = daylightMarker(false, 1, 1)
    const sunrise = daylightMarker(true, 0, 0)

    expect(dusk.y).toBe(DAYLIGHT_HORIZON_Y)
    expect(midnight.y).toBe(DAYLIGHT_HORIZON_Y)
    expect(dawn.y).toBe(DAYLIGHT_HORIZON_Y)
    expect(midnight.x).toBeGreaterThan(dawn.x)
    expect(midnight.x).toBeLessThan(dusk.x)
    expect(dawn.x).toBeCloseTo(sunrise.x, 5)
    expect(daylightProgressLength(true, 0)).toBe(0)
    expect(daylightProgressLength(true, 1)).toBeCloseTo(DAYLIGHT_ARC_LENGTH, 5)
    expect(daylightProgressLength(false, 1)).toBeCloseTo(DAYLIGHT_ARC_LENGTH, 5)
  })
})

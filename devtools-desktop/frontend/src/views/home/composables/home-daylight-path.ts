/** 首页昼夜图：一条日轨山丘落在平地上，夜里月亮沿地平线走，避免上下对称的「眼睛」轮廓。 */

export const DAYLIGHT_VIEW_WIDTH = 300
export const DAYLIGHT_VIEW_HEIGHT = 140
export const DAYLIGHT_HORIZON_Y = 104

const SUNRISE = { x: 28, y: DAYLIGHT_HORIZON_Y }
const SUNSET = { x: 272, y: DAYLIGHT_HORIZON_Y }
const NOON = { x: 150, y: 18 }

export const DAYLIGHT_HILL = `M ${SUNRISE.x} ${SUNRISE.y} Q ${NOON.x} ${NOON.y} ${SUNSET.x} ${SUNSET.y} Z`
export const DAYLIGHT_ARC = `M ${SUNRISE.x} ${SUNRISE.y} Q ${NOON.x} ${NOON.y} ${SUNSET.x} ${SUNSET.y}`
export const DAYLIGHT_GROUND = `M 0 ${DAYLIGHT_HORIZON_Y} H ${DAYLIGHT_VIEW_WIDTH} V ${DAYLIGHT_VIEW_HEIGHT} H 0 Z`
export const DAYLIGHT_HORIZON = `M 16 ${DAYLIGHT_HORIZON_Y} H 284`

function quadPoint(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  t: number,
) {
  const rest = 1 - t
  return {
    x: rest * rest * start.x + 2 * rest * t * control.x + t * t * end.x,
    y: rest * rest * start.y + 2 * rest * t * control.y + t * t * end.y,
  }
}

function quadLength(
  start: { x: number; y: number },
  control: { x: number; y: number },
  end: { x: number; y: number },
  samples = 48,
) {
  let length = 0
  let previous = start
  for (let index = 1; index <= samples; index += 1) {
    const point = quadPoint(start, control, end, index / samples)
    length += Math.hypot(point.x - previous.x, point.y - previous.y)
    previous = point
  }
  return length
}

export const DAYLIGHT_ARC_LENGTH = quadLength(SUNRISE, NOON, SUNSET)

export function daylightMarker(isDay: boolean, sunT: number, nightT: number) {
  const dayT = Math.max(0, Math.min(1, sunT))
  const duskT = Math.max(0, Math.min(1, nightT))
  if (isDay) return quadPoint(SUNRISE, NOON, SUNSET, dayT)
  return {
    x: SUNSET.x + (SUNRISE.x - SUNSET.x) * duskT,
    y: DAYLIGHT_HORIZON_Y,
  }
}

export function daylightProgressLength(isDay: boolean, sunT: number) {
  if (!isDay) return DAYLIGHT_ARC_LENGTH
  return DAYLIGHT_ARC_LENGTH * Math.max(0, Math.min(1, sunT))
}

export function daylightElapsedWidth(isDay: boolean, sunT: number) {
  if (!isDay) return 0
  return daylightMarker(true, sunT, 0).x
}

export function daylightMarkerStyle(isDay: boolean, sunT: number, nightT: number) {
  const point = daylightMarker(isDay, sunT, nightT)
  return {
    left: `${point.x / DAYLIGHT_VIEW_WIDTH * 100}%`,
    top: `${point.y / DAYLIGHT_VIEW_HEIGHT * 100}%`,
  }
}

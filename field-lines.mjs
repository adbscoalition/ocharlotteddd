export const POLE_DISTANCE = 0.72;
export const FIELD_Y_SCALE = 1.45;
export const MH_MULTIPLIER = 6.5;
export const BAND_MULTIPLIERS = [0.045, 0.2, 0.5, 1, 1.7, 3.5, 4.5, 6.5];
export const BAND_LABELS = ["NS", "CE", "E", "M", "PS", "MS", "MP", "MH"];

// Shared by visible curves and the continuous family of invisible particle guides.
export function sampleFieldLine(radius, phi, t, out = [0, 0, 0]) {
  const theta = Math.PI * Math.max(0, Math.min(1, t));
  const sin = Math.max(0, Math.sin(theta)), cos = Math.cos(theta);
  const lateral = radius * sin ** 2.22;
  const verticalPull = Math.max(0.58, radius * FIELD_Y_SCALE * 0.62);
  const phaseLift = Math.sin(phi * 2) * radius * 0.06;
  out[0] = Math.cos(phi) * lateral;
  out[1] = POLE_DISTANCE * cos + verticalPull * sin ** 1.08 * cos + phaseLift * sin ** 2;
  out[2] = Math.sin(phi) * lateral;
  return out;
}

export function buildFieldLineArc(radius, phi) {
  const lengths = new Float64Array(65);
  const previous = sampleFieldLine(radius, phi, 0), point = [0, 0, 0];
  for (let i = 1; i < lengths.length; i += 1) {
    sampleFieldLine(radius, phi, i / 64, point);
    lengths[i] = lengths[i - 1] + Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
    previous[0] = point[0]; previous[1] = point[1]; previous[2] = point[2];
  }
  return lengths;
}

export function fieldLineParameter(lengths, distance) {
  const end = lengths.length - 1;
  if (distance <= 0) return 0;
  if (distance >= lengths[end]) return 1;
  let low = 0, high = end;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (lengths[middle] <= distance) low = middle; else high = middle;
  }
  return (low + (distance - lengths[low]) / (lengths[high] - lengths[low])) / end;
}

export function transformFieldVector(vector, quaternion, out = [0, 0, 0]) {
  const [x, y, z] = vector, [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + qy * tz - qz * ty;
  out[1] = y + qw * ty + qz * tx - qx * tz;
  out[2] = z + qw * tz + qx * ty - qy * tx;
  return out;
}

export function particleBand(position, center, moment, radius) {
  const x = position[0] - center[0], y = position[1] - center[1], z = position[2] - center[2];
  const parallel = x * moment[0] + y * moment[1] + z * moment[2];
  const ratio = Math.sqrt(Math.max(0, x * x + y * y + z * z - parallel * parallel)) / radius;
  const index = BAND_MULTIPLIERS.findIndex(limit => ratio <= limit * (1 + 1e-10));
  return index < 0 ? 8 : index;
}

export function fieldMapDistance(position, center, orientation, scratch = [0, 0, 0]) {
  scratch[0] = position[0] - center[0];
  scratch[1] = position[1] - center[1];
  scratch[2] = position[2] - center[2];
  transformFieldVector(scratch, [-orientation[0], -orientation[1], -orientation[2], orientation[3]], scratch);
  return Math.hypot(scratch[0], scratch[1] / FIELD_Y_SCALE, scratch[2]);
}

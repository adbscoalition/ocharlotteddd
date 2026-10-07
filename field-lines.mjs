export const POLE_DISTANCE = 0.72;
export const FIELD_Y_SCALE = 1;
export const SOURCE_RADIUS = POLE_DISTANCE;
export const EXTERIOR_FRACTION = 0.86;
export const MH_MULTIPLIER = 6.5;
export const BAND_MULTIPLIERS = [0.045, 0.2, 0.5, 1, 1.7, 3.5, 4.5, 6.5];
export const BAND_LABELS = ["NS", "CE", "E", "M", "PS", "MS", "MP", "MH"];

// Uniformly magnetized spherical source: an external dipole r = L sin²(theta)
// closes through the source's uniform internal field. The same field is sampled
// by electrons and compasses. Small display bands share the innermost flux loops.
export function sampleFieldLine(radius, phi, t, out = [0, 0, 0]) {
  const outerRadius = Math.max(SOURCE_RADIUS * 1.025, radius);
  const theta0 = Math.asin(Math.sqrt(SOURCE_RADIUS / outerRadius));
  const parameter = Math.max(0, Math.min(1, t));
  let lateral, vertical;
  if (parameter <= EXTERIOR_FRACTION) {
    const theta =
      theta0 + ((Math.PI - 2 * theta0) * parameter) / EXTERIOR_FRACTION;
    const sin = Math.sin(theta),
      r = outerRadius * sin * sin;
    lateral = r * sin;
    vertical = r * Math.cos(theta);
  } else {
    lateral = SOURCE_RADIUS * Math.sin(theta0);
    const height = SOURCE_RADIUS * Math.cos(theta0);
    vertical =
      height *
      ((2 * (parameter - EXTERIOR_FRACTION)) / (1 - EXTERIOR_FRACTION) - 1);
  }
  out[0] = Math.cos(phi) * lateral;
  out[1] = vertical;
  out[2] = Math.sin(phi) * lateral;
  return out;
}

export function transformFieldVector(vector, quaternion, out = [0, 0, 0]) {
  const [x, y, z] = vector,
    [qx, qy, qz, qw] = quaternion;
  const tx = 2 * (qy * z - qz * y),
    ty = 2 * (qz * x - qx * z),
    tz = 2 * (qx * y - qy * x);
  out[0] = x + qw * tx + qy * tz - qz * ty;
  out[1] = y + qw * ty + qz * tx - qx * tz;
  out[2] = z + qw * tz + qx * ty - qy * tx;
  return out;
}

export function particleBand(position, center, moment, radius) {
  const x = position[0] - center[0],
    y = position[1] - center[1],
    z = position[2] - center[2];
  const parallel = x * moment[0] + y * moment[1] + z * moment[2];
  const ratio =
    Math.sqrt(Math.max(0, x * x + y * y + z * z - parallel * parallel)) /
    radius;
  const index = BAND_MULTIPLIERS.findIndex(
    (limit) => ratio <= limit * (1 + 1e-10),
  );
  return index < 0 ? 8 : index;
}

export function fieldMapDistance(
  position,
  center,
  orientation,
  scratch = [0, 0, 0],
) {
  scratch[0] = position[0] - center[0];
  scratch[1] = position[1] - center[1];
  scratch[2] = position[2] - center[2];
  transformFieldVector(
    scratch,
    [-orientation[0], -orientation[1], -orientation[2], orientation[3]],
    scratch,
  );
  return Math.hypot(scratch[0], scratch[1], scratch[2]);
}

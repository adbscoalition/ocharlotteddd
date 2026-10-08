export const POLE_DISTANCE = 0.72;
export const FIELD_Y_SCALE = 1;
export const SOURCE_RADIUS = POLE_DISTANCE;
export const EXTERIOR_FRACTION = 0.75;
export const MH_MULTIPLIER = 6.5;
export const BAND_MULTIPLIERS = [0.045, 0.2, 0.5, 1, 1.7, 3.5, 4.5, 6.5];
export const BAND_LABELS = ["NS", "CE", "E", "M", "PS", "MS", "MP", "MH"];

// Curl of A = f(r) (moment cross r). The finite current distribution inside
// the source matches both B and its first derivative to the external dipole.
export function sampleDipoleField(
  position,
  center,
  moment,
  scale,
  out = [0, 0, 0],
) {
  const x = position[0] - center[0],
    y = position[1] - center[1],
    z = position[2] - center[2];
  const r2 = x * x + y * y + z * z,
    a2 = SOURCE_RADIUS ** 2;
  let f, g;
  if (r2 < a2) {
    const u = r2 / a2;
    f = (35 / 8 - (21 / 4) * u + (15 / 8) * u * u) / SOURCE_RADIUS ** 3;
    g = (-21 / 2 + (15 / 2) * u) / SOURCE_RADIUS ** 5; // f'(r)/r
  } else {
    f = 1 / (r2 * Math.sqrt(r2));
    g = (-3 * f) / r2;
  }
  const axial = (2 * f + r2 * g) * scale,
    projection = g * scale * (moment[0] * x + moment[1] * y + moment[2] * z);
  out[0] = axial * moment[0] - projection * x;
  out[1] = axial * moment[1] - projection * y;
  out[2] = axial * moment[2] - projection * z;
  return out;
}

const returnPaths = new Map();
function sourceReturnPath(radius) {
  if (returnPaths.has(radius)) return returnPaths.get(radius);
  const foot = Math.sqrt(SOURCE_RADIUS ** 3 / radius),
    height = Math.sqrt(SOURCE_RADIUS ** 2 - foot ** 2);
  const half = [[foot, -height]],
    ds = SOURCE_RADIUS / 300;
  const direction = (rho, y) => {
    const b = sampleDipoleField([rho, y, 0], [0, 0, 0], [0, 1, 0], 1);
    const magnitude = Math.hypot(b[0], b[1]);
    return [b[0] / magnitude, b[1] / magnitude];
  };
  for (let i = 0; i < 2000; i++) {
    const [rho, y] = half.at(-1),
      a = direction(rho, y),
      b = direction(rho + (a[0] * ds) / 2, y + (a[1] * ds) / 2);
    const c = direction(rho + (b[0] * ds) / 2, y + (b[1] * ds) / 2),
      d = direction(rho + c[0] * ds, y + c[1] * ds);
    const next = [
      rho + (ds * (a[0] + 2 * b[0] + 2 * c[0] + d[0])) / 6,
      y + (ds * (a[1] + 2 * b[1] + 2 * c[1] + d[1])) / 6,
    ];
    if (next[1] >= 0) {
      const fraction = -y / (next[1] - y);
      half.push([rho + (next[0] - rho) * fraction, 0]);
      break;
    }
    half.push(next);
  }
  const points = half.concat(
    half
      .slice(0, -1)
      .reverse()
      .map(([rho, y]) => [rho, -y]),
  );
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] +
        Math.hypot(
          points[i][0] - points[i - 1][0],
          points[i][1] - points[i - 1][1],
        ),
    );
  const path = { points, lengths, total: lengths.at(-1) };
  // Radius changes replace the displayed population; retain only a few sets.
  if (returnPaths.size >= 32) returnPaths.clear();
  returnPaths.set(radius, path);
  return path;
}

// Exterior dipole curves join numerically traced, curved source return paths.
// No straight interior connector or spline corner is added to the magnetic field.
export function sampleFieldLine(radius, phi, t, out = [0, 0, 0]) {
  const outerRadius = Math.max(SOURCE_RADIUS * 1.025, radius);
  const theta0 = Math.asin(Math.sqrt(SOURCE_RADIUS / outerRadius));
  const parameter = Math.max(0, Math.min(1, t));
  let lateral, vertical;
  if (parameter <= EXTERIOR_FRACTION) {
    const s = parameter / EXTERIOR_FRACTION;
    const theta =
      theta0 + ((Math.PI - 2 * theta0) * (1 - Math.cos(Math.PI * s))) / 2;
    const sin = Math.sin(theta),
      r = outerRadius * sin * sin;
    lateral = r * sin;
    vertical = r * Math.cos(theta);
  } else {
    const path = sourceReturnPath(outerRadius);
    const distance =
      (path.total * (parameter - EXTERIOR_FRACTION)) / (1 - EXTERIOR_FRACTION);
    let low = 0,
      high = path.lengths.length - 1;
    while (low + 1 < high) {
      const mid = (low + high) >> 1;
      if (path.lengths[mid] < distance) low = mid;
      else high = mid;
    }
    const fraction =
      (distance - path.lengths[low]) / (path.lengths[high] - path.lengths[low]);
    lateral =
      path.points[low][0] +
      (path.points[high][0] - path.points[low][0]) * fraction;
    vertical =
      path.points[low][1] +
      (path.points[high][1] - path.points[low][1]) * fraction;
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

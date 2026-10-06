// Dimensionless dipole field and charge-to-mass ratio: motion is scaled for display.
// A softened core keeps the illustrative field finite inside the model.
export function sampleMagneticField(position, center, moment, radius, intensity, out) {
  const x = (position[0] - center[0]) / radius;
  const y = (position[1] - center[1]) / radius;
  const z = (position[2] - center[2]) / radius;
  const r2 = x * x + y * y + z * z + 0.36;
  const inverseR3 = 1 / (r2 * Math.sqrt(r2));
  const projection = 3 * (moment[0] * x + moment[1] * y + moment[2] * z) / r2;
  out[0] = intensity * inverseR3 * (projection * x - moment[0]);
  out[1] = intensity * inverseR3 * (projection * y - moment[1]);
  out[2] = intensity * inverseR3 * (projection * z - moment[2]);
  return out;
}

// Magnetic-only Boris rotation. Unlike Euler integration it preserves speed:
// a magnetic field changes velocity direction, but does no work on the charge.
export function advanceElectron(position, velocity, field, dt) {
  const halfDt = dt / 2;
  position[0] += velocity[0] * halfDt;
  position[1] += velocity[1] * halfDt;
  position[2] += velocity[2] * halfDt;
  rotateElectronVelocity(velocity, field, dt);
  position[0] += velocity[0] * halfDt;
  position[1] += velocity[1] * halfDt;
  position[2] += velocity[2] * halfDt;
}

export function rotateElectronVelocity(velocity, field, dt) {
  const chargeToMass = -5;
  const tx = chargeToMass * field[0] * dt / 2;
  const ty = chargeToMass * field[1] * dt / 2;
  const tz = chargeToMass * field[2] * dt / 2;
  const scale = 2 / (1 + tx * tx + ty * ty + tz * tz);
  const vx = velocity[0], vy = velocity[1], vz = velocity[2];
  const px = vx + vy * tz - vz * ty;
  const py = vy + vz * tx - vx * tz;
  const pz = vz + vx * ty - vy * tx;
  velocity[0] = vx + scale * (py * tz - pz * ty);
  velocity[1] = vy + scale * (pz * tx - px * tz);
  velocity[2] = vz + scale * (px * ty - py * tx);
}

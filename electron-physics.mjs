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

function rotateAroundAxis(vector, axis, angle) {
  const x = vector[0], y = vector[1], z = vector[2];
  const c = Math.cos(angle), s = Math.sin(angle);
  const dot = axis[0] * x + axis[1] * y + axis[2] * z;
  vector[0] = x * c + (axis[1] * z - axis[2] * y) * s + axis[0] * dot * (1 - c);
  vector[1] = y * c + (axis[2] * x - axis[0] * z) * s + axis[1] * dot * (1 - c);
  vector[2] = z * c + (axis[0] * y - axis[1] * x) * s + axis[2] * dot * (1 - c);
}

export function releaseCapturedParticle(particle, center, radius) {
  const x = particle.position[0] - center[0];
  const y = particle.position[1] - center[1];
  const z = particle.position[2] - center[2];
  const distance = Math.hypot(x, y, z) || 1;
  const kick = radius * 0.4;
  particle.velocity[0] += (particle.carriedVelocity?.[0] || 0) + x / distance * kick;
  particle.velocity[1] += (particle.carriedVelocity?.[1] || 0) + y / distance * kick;
  particle.velocity[2] += (particle.carriedVelocity?.[2] || 0) + z / distance * kick;
  particle.phase = "released";
  particle.releaseCooldown = 0.8;
  particle.carriedVelocity = [0, 0, 0];
}

// Illustrative confinement and co-rotation are added to the magnetic Lorentz force.
// These effective forces model the requested field capture, rather than bare
// magnetic attraction of physical free electrons.
export function advanceFieldParticle(particle, center, moment, radius, intensity, spinAxis, angularSpeed, dt, field) {
  const position = particle.position, velocity = particle.velocity;
  const relative = particle.relative || (particle.relative = [0, 0, 0]);
  for (let j = 0; j < 3; j += 1) relative[j] = position[j] - center[j];
  const distance = Math.hypot(relative[0], relative[1], relative[2]);
  const normalizedRadius = distance / radius;
  sampleMagneticField(position, center, moment, radius, intensity, field);
  const strength = Math.hypot(field[0], field[1], field[2]);
  const threshold = 0.08 + 0.18 * particle.launchSpeed ** 2;
  const coupling = strength / (strength + 0.3);
  particle.releaseCooldown = Math.max(0, (particle.releaseCooldown || 0) - dt);

  if (particle.phase === "captured" && strength < threshold * 0.5) {
    releaseCapturedParticle(particle, center, radius);
  } else if (particle.phase !== "captured" && particle.releaseCooldown === 0) {
    if (strength >= threshold) {
      particle.phase = normalizedRadius <= 0.7 ? "captured" : "capturing";
    } else if (particle.phase !== "released") {
      particle.phase = "free";
    }
  }

  if (intensity > 0 && particle.releaseCooldown === 0) {
    const unitDistance = Math.max(distance, radius * 0.01);
    const captured = particle.phase === "captured";
    const targetRadius = radius * (0.2 + 0.35 / (1 + intensity));
    const radialSpeed = (velocity[0] * relative[0] + velocity[1] * relative[1] + velocity[2] * relative[2]) / unitDistance;
    // An inner confinement well stops captured particles collapsing to a point.
    const acceleration = captured
      ? -12 * coupling * (distance - targetRadius) - 4 * coupling * radialSpeed
      : -radius * 3 * Math.min(intensity, 20) * normalizedRadius / (0.36 + normalizedRadius ** 2) ** 1.5;
    const damping = Math.exp(-(captured ? 0.8 : 0.15) * coupling * dt);
    for (let j = 0; j < 3; j += 1) velocity[j] = (velocity[j] + relative[j] / unitDistance * acceleration * dt) * damping;
  }

  // Preserve the charge's magnetic gyration on top of the capture motion.
  advanceElectron(position, velocity, field, dt);
  const rotationCoupling = particle.phase === "captured" ? coupling : particle.phase === "capturing" ? coupling * 0.3 : 0;
  const rotationRate = angularSpeed * rotationCoupling;
  if (rotationRate !== 0) {
    for (let j = 0; j < 3; j += 1) relative[j] = position[j] - center[j];
    // Exact advection avoids unstable centrifugal steps at high RPM.
    rotateAroundAxis(relative, spinAxis, rotationRate * dt);
    rotateAroundAxis(velocity, spinAxis, rotationRate * dt);
    for (let j = 0; j < 3; j += 1) position[j] = center[j] + relative[j];
    particle.carriedVelocity[0] = rotationRate * (spinAxis[1] * relative[2] - spinAxis[2] * relative[1]);
    particle.carriedVelocity[1] = rotationRate * (spinAxis[2] * relative[0] - spinAxis[0] * relative[2]);
    particle.carriedVelocity[2] = rotationRate * (spinAxis[0] * relative[1] - spinAxis[1] * relative[0]);
  } else {
    particle.carriedVelocity[0] = particle.carriedVelocity[1] = particle.carriedVelocity[2] = 0;
  }
}

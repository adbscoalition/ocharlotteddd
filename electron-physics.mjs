import { POLE_DISTANCE, FIELD_Y_SCALE, MH_MULTIPLIER, BAND_MULTIPLIERS, sampleFieldLine, buildFieldLineArc, fieldLineParameter, transformFieldVector, fieldMapDistance } from "./field-lines.mjs";

export const REPLACEMENT_DISTANCE = 100;
export const REPLACEMENT_SPEED = 15;

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

function assignGuide(particle, radius, band) {
  particle.guideBand = Math.max(0, Math.min(7, band));
  particle.guideRadius = Math.max(0.045, radius * BAND_MULTIPLIERS[particle.guideBand] * particle.guideSpread);
  particle.arc = buildFieldLineArc(particle.guideRadius, particle.phi);
}

export function initializeFieldParticle(particle, center, radius, orientation, speed, random = Math.random) {
  particle.position ||= [0, 0, 0];
  particle.random = random;
  particle.velocity ||= [0, 0, 0];
  particle.local ||= [0, 0, 0];
  particle.scratch ||= [0, 0, 0];
  particle.previous ||= [0, 0, 0];
  particle.previousLocal ||= [0, 0, 0];
  particle.entryPole = random() < 0.5 ? 1 : -1;
  particle.phi = random() * Math.PI * 2;
  particle.energy = (0.35 + random() * 1.3) * speed * speed;
  particle.pitch = 0.08 + random() * 0.92;
  particle.guideSpread = 0.88 + random() * 0.24;
  particle.launchSpeed = speed;
  particle.gyroPhase = random() * Math.PI * 2;
  particle.gyroScale = 0.004 + random() * 0.006;
  particle.phase = "free";
  particle.visits = 0;
  particle.ejectionReason = null;
  particle.ejectionRoute = null;
  particle.lastOutcome = null;
  particle.inbound = false;
  // Start in a narrow polar inlet, not on a spherical shell.
  const inletRadius = radius * (0.04 + random() * 0.16);
  particle.local[0] = Math.cos(particle.phi) * inletRadius;
  particle.local[1] = particle.entryPole * (POLE_DISTANCE + radius * (0.6 + random() * 2.8));
  particle.local[2] = Math.sin(particle.phi) * inletRadius;
  transformFieldVector(particle.local, orientation, particle.position);
  for (let j = 0; j < 3; j += 1) particle.position[j] += center[j];
  transformFieldVector([0, -particle.entryPole * radius * speed * 0.7, 0], orientation, particle.velocity);
  particle.bandSeed = random();
  particle.guideBand = Math.min(7, Math.floor(particle.bandSeed * 8));
}

export function placeIncomingReplacement(particle, center, radius, orientation) {
  const distance = radius * MH_MULTIPLIER * FIELD_Y_SCALE + REPLACEMENT_DISTANCE;
  transformFieldVector([0, particle.entryPole * distance, 0], orientation, particle.position);
  for (let j = 0; j < 3; j += 1) particle.position[j] += center[j];
  transformFieldVector([0, -particle.entryPole * REPLACEMENT_SPEED, 0], orientation, particle.velocity);
  particle.phase = "free";
  particle.inbound = true;
}

function ejectParticle(particle, center, radius, orientation, reason) {
  const sign = particle.lineDistance <= 0 ? 1 : -1;
  const outwardSpeed = radius * (0.9 + Math.sqrt(particle.energy)) * particle.launchSpeed;
  const random = particle.random || Math.random;
  particle.ejectionRoute = random() < 0.8 ? "pole" : "random";
  if (particle.ejectionRoute === "pole") {
    transformFieldVector([0, sign * outwardSpeed, 0], orientation, particle.scratch);
  } else {
    const y = random() * 2 - 1, angle = random() * Math.PI * 2;
    const radial = Math.sqrt(1 - y * y);
    particle.scratch[0] = Math.cos(angle) * radial * outwardSpeed;
    particle.scratch[1] = y * outwardSpeed;
    particle.scratch[2] = Math.sin(angle) * radial * outwardSpeed;
  }
  // Retain some motion from the moving field, plus the outgoing polar stream.
  for (let j = 0; j < 3; j += 1) particle.velocity[j] = particle.velocity[j] * 0.25 + particle.scratch[j];
  particle.phase = "released";
  particle.ejectionReason = reason;
  particle.lastOutcome = particle.ejectionRoute === "pole" ? "eject_pole" : "eject_random";
}

// Illustrative guiding-center transport on exactly the same curve family as the
// rendered field: polar inlet -> helical travel -> band exchange/mirror/ejection.
export function advanceFieldParticle(particle, center, radius, intensity, orientation, angularSpeed, dt, spinAxis = [0, 1, 0]) {
  const position = particle.position, velocity = particle.velocity;
  if (particle.inbound) {
    if (fieldMapDistance(position, center, orientation, particle.scratch) > radius * MH_MULTIPLIER) {
      for (let j = 0; j < 3; j += 1) position[j] += velocity[j] * dt;
      return;
    }
    particle.inbound = false;
    particle.entryPole = particle.scratch[1] >= 0 ? 1 : -1;
  }
  if (particle.phase === "released" || intensity === 0) {
    if (intensity === 0 && particle.phase === "captured") {
      particle.phase = "released";
      particle.ejectionReason = "weak_field";
      particle.ejectionRoute = "free";
    } else if (particle.phase !== "released") particle.phase = "free";
    for (let j = 0; j < 3; j += 1) position[j] += velocity[j] * dt;
    return;
  }

  if (particle.phase !== "captured") {
    transformFieldVector([0, particle.entryPole * POLE_DISTANCE, 0], orientation, particle.scratch);
    for (let j = 0; j < 3; j += 1) particle.scratch[j] += center[j] - position[j];
    const distance = Math.hypot(...particle.scratch);
    const strength = intensity / (1 + (distance / radius) ** 3);
    const coupling = strength / (strength + 0.035 * (1 + particle.energy));
    particle.phase = coupling > 0.15 ? "capturing" : "free";
    const streamSpeed = radius * particle.launchSpeed * (0.8 + 0.5 * Math.sqrt(Math.min(intensity, 20)));
    const blend = 1 - Math.exp(-6 * coupling * dt);
    for (let j = 0; j < 3; j += 1) {
      const desired = particle.scratch[j] / Math.max(distance, radius * 0.01) * streamSpeed;
      velocity[j] += (desired - velocity[j]) * blend;
      position[j] += velocity[j] * dt;
    }
    if (distance < radius * 0.045 + streamSpeed * dt && coupling > 0.2) {
      particle.phase = "captured";
      // Distribute inlet particles over all bands, with stronger fields allowing
      // more inward transport rather than a shared radial equilibrium.
      assignGuide(particle, radius, Math.floor(particle.bandSeed * 8));
      particle.lineDirection = particle.entryPole;
      particle.lineDistance = particle.entryPole > 0 ? 0 : particle.arc[64];
      sampleFieldLine(particle.guideRadius, particle.phi, particle.entryPole > 0 ? 0 : 1, particle.local);
    }
    return;
  }

  const strength = intensity / (0.36 + (particle.guideRadius / radius) ** 2) ** 1.5;
  if (strength < 0.0015 * (1 + particle.energy)) {
    // Loss of confinement leaves the particle where it is with its actual
    // field-line/rotational velocity, rather than teleporting it to a pole.
    particle.phase = "released";
    particle.ejectionReason = "weak_field";
    particle.ejectionRoute = "free";
    for (let j = 0; j < 3; j += 1) position[j] += velocity[j] * dt;
    return;
  }
  for (let j = 0; j < 3; j += 1) particle.previousLocal[j] = particle.local[j];
  particle.energy += dt * 0.003 * (angularSpeed / (2 * Math.PI)) ** 2 / (1 + intensity);
  const parallelSpeed = radius * particle.launchSpeed * 2.8 * Math.sqrt(1 + intensity * 0.15);
  particle.lineDistance += particle.lineDirection * parallelSpeed * dt;
  const totalLength = particle.arc[64];
  if (particle.lineDistance < 0 || particle.lineDistance > totalLength) {
    particle.lineDistance = Math.max(0, Math.min(totalLength, particle.lineDistance));
    const pole = particle.lineDistance === 0 ? 1 : -1;
    sampleFieldLine(particle.guideRadius, particle.phi, pole > 0 ? 0 : 1, particle.local);
    transformFieldVector(particle.local, orientation, position);
    for (let j = 0; j < 3; j += 1) position[j] += center[j];
    particle.visits += 1;
    particle.energy += (0.025 + Math.abs(angularSpeed) / (2 * Math.PI) * 0.006) / (1 + intensity * 0.15);
    const lossCone = 0.12 + 0.2 / (1 + intensity);
    if (particle.pitch < lossCone || particle.energy > 1.4 + intensity * 1.5) {
      ejectParticle(particle, center, radius, orientation, particle.pitch < lossCone ? "loss_cone" : "energized");
      return;
    }
    // Exchange neighboring flux bands only at a pole, where all guides meet.
    // Energetic particles drift outward; well-confined particles migrate inward.
    const inward = intensity / (1 + particle.energy) > 0.4;
    const stay = (particle.random || Math.random)() < 0.4;
    let nextBand = stay ? particle.guideBand : particle.guideBand + (inward ? -1 : 1);
    if (nextBand < 0) nextBand = 1;
    if (nextBand > 7) {
      ejectParticle(particle, center, radius, orientation, "outer_band");
      return;
    }
    particle.lastOutcome = nextBand === particle.guideBand ? "stay" : "band_change";
    if (nextBand !== particle.guideBand) assignGuide(particle, radius, nextBand);
    particle.lineDirection *= -1;
    particle.lineDistance = pole > 0 ? 0 : particle.arc[64];
  }

  const t = fieldLineParameter(particle.arc, particle.lineDistance);
  sampleFieldLine(particle.guideRadius, particle.phi, t, particle.local);
  // A small gyro orbit surrounds the guide, without imposing a spherical shell.
  particle.gyroPhase -= dt * (8 + Math.sqrt(intensity) * 3);
  const gyroradius = radius * particle.gyroScale * particle.pitch * Math.sin(Math.PI * t) / Math.sqrt(1 + intensity);
  sampleFieldLine(particle.guideRadius, particle.phi, t - 0.0001, particle.previous);
  sampleFieldLine(particle.guideRadius, particle.phi, t + 0.0001, particle.scratch);
  const tx = particle.scratch[0] - particle.previous[0];
  const ty = particle.scratch[1] - particle.previous[1];
  const tz = particle.scratch[2] - particle.previous[2];
  const tangentLength = Math.hypot(tx, ty, tz) || 1;
  const sinPhi = Math.sin(particle.phi), cosPhi = Math.cos(particle.phi);
  const cosGyro = Math.cos(particle.gyroPhase), sinGyro = Math.sin(particle.gyroPhase);
  // Gyro orbit lies in the plane perpendicular to the local guide tangent.
  particle.local[0] += gyroradius * (-cosGyro * sinPhi + sinGyro * ty / tangentLength * cosPhi);
  particle.local[1] += gyroradius * sinGyro * -(tx * cosPhi + tz * sinPhi) / tangentLength;
  particle.local[2] += gyroradius * (cosGyro * cosPhi + sinGyro * ty / tangentLength * sinPhi);
  transformFieldVector(particle.local, orientation, position);
  for (let j = 0; j < 3; j += 1) particle.scratch[j] = (particle.local[j] - particle.previousLocal[j]) / dt;
  transformFieldVector(particle.scratch, orientation, velocity);
  velocity[0] += angularSpeed * (spinAxis[1] * position[2] - spinAxis[2] * position[1]);
  velocity[1] += angularSpeed * (spinAxis[2] * position[0] - spinAxis[0] * position[2]);
  velocity[2] += angularSpeed * (spinAxis[0] * position[1] - spinAxis[1] * position[0]);
  for (let j = 0; j < 3; j += 1) {
    position[j] += center[j];
  }
}

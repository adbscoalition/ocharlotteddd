import {
  SOURCE_RADIUS,
  MH_MULTIPLIER,
  particleBand,
  transformFieldVector,
  sampleDipoleField,
} from "./field-lines.mjs";

export const CHARGE_TO_MASS = -5;
export const REENTRY_RADIUS_FACTOR = 2;
export const REENTRY_SPEED_FACTOR = 2;
const ATTRACTING_BANDS = [0.2, 0.5, 1, 1.7, 3.5, 4.5, 6.5];

// Smooth finite current source and external dipole, shared with the rendered
// flux lines. B and its first derivative are continuous at the source surface.
// B at the M-band equator equals intensity in display units.
export function sampleMagneticField(
  position,
  center,
  moment,
  radius,
  intensity,
  out = [0, 0, 0],
) {
  return sampleDipoleField(
    position,
    center,
    moment,
    intensity * radius ** 3,
    out,
  );
}

// Exact local helical advance between symmetric electric kicks. Integrating
// both displacement and gyro phase avoids the Boris angle/straight-chord error
// when central cyclotron periods are shorter than the available step budget.
export function advanceElectron(
  position,
  velocity,
  field,
  dt,
  acceleration = null,
  flow = null,
) {
  const half = dt / 2;
  for (let j = 0; j < 3; j++)
    if (acceleration) velocity[j] += acceleration[j] * half;
  const strength = Math.hypot(...field);
  if (strength < 1e-30) {
    for (let j = 0; j < 3; j++) position[j] += velocity[j] * dt;
  } else {
    const bx = field[0] / strength,
      by = field[1] / strength,
      bz = field[2] / strength;
    const vx = velocity[0] - (flow?.[0] || 0),
      vy = velocity[1] - (flow?.[1] || 0),
      vz = velocity[2] - (flow?.[2] || 0);
    const parallel = vx * bx + vy * by + vz * bz,
      px = vx - parallel * bx,
      py = vy - parallel * by,
      pz = vz - parallel * bz;
    const cx = py * bz - pz * by,
      cy = pz * bx - px * bz,
      cz = px * by - py * bx;
    const omega = CHARGE_TO_MASS * strength,
      angle = omega * dt,
      sin = Math.sin(angle),
      cos = Math.cos(angle);
    const sinc =
      Math.abs(angle) < 1e-5 ? dt * (1 - (angle * angle) / 6) : sin / omega;
    const cosc =
      Math.abs(angle) < 1e-5
        ? (omega * dt * dt) / 2
        : (2 * Math.sin(angle / 2) ** 2) / omega;
    position[0] +=
      ((flow?.[0] || 0) + parallel * bx) * dt + px * sinc + cx * cosc;
    position[1] +=
      ((flow?.[1] || 0) + parallel * by) * dt + py * sinc + cy * cosc;
    position[2] +=
      ((flow?.[2] || 0) + parallel * bz) * dt + pz * sinc + cz * cosc;
    velocity[0] = (flow?.[0] || 0) + parallel * bx + px * cos + cx * sin;
    velocity[1] = (flow?.[1] || 0) + parallel * by + py * cos + cy * sin;
    velocity[2] = (flow?.[2] || 0) + parallel * bz + pz * cos + cz * sin;
  }
  for (let j = 0; j < 3; j++) {
    if (acceleration) velocity[j] += acceleration[j] * half;
  }
}

export function populationSpeed(radius, distance, speed = 1, spread = 1) {
  return (
    (radius * speed * spread * 3.8) / Math.sqrt(1 + (2 * distance) / radius)
  );
}
export const reentryRadius = (radius) =>
  radius * MH_MULTIPLIER * REENTRY_RADIUS_FACTOR;
export const reentrySpeed = (radius) => radius * REENTRY_SPEED_FACTOR;

function directionAwayFromPoles(random, out) {
  // Uniform azimuth/cosine over the nonpolar part of the shell, not uniform theta.
  const y = (random() * 2 - 1) * 0.85,
    phi = random() * Math.PI * 2,
    radial = Math.sqrt(1 - y * y);
  out[0] = Math.cos(phi) * radial;
  out[1] = y;
  out[2] = Math.sin(phi) * radial;
}

export function initializeFieldParticle(
  p,
  center,
  radius,
  orientation,
  speed,
  random = Math.random,
) {
  for (const key of [
    "position",
    "velocity",
    "field",
    "moment",
    "scratch",
    "acceleration",
    "flow",
    "trialVelocity",
  ])
    p[key] ||= [0, 0, 0];
  p.random = random;
  p.phase = "free";
  p.inbound = false;
  p.age = 0;
  p.visits = 0;
  p.ejectionReason = null;
  p.ejectionRoute = null;
  p.lastOutcome = null;
  p.lastBand = null;
  p.parallelSign = 0;
  p.launchSpeed = speed;
  p.speedSpread = 0.7 + random() * 0.6;
  p.scatterTime = 0.5 - Math.log(Math.max(1e-6, 1 - random())) * 1.8;
  p.mirrorCount = 0;
  p.magneticMoment = 0;
  p.pitch = 0;
  p.substeps = 1;
  // Populate a volume of different flux bands, rather than two polar beams.
  const distance =
    SOURCE_RADIUS * 1.1 +
    radius * (0.08 + (MH_MULTIPLIER * 0.9 - 0.08) * random() ** 1.8);
  directionAwayFromPoles(random, p.scratch);
  for (let j = 0; j < 3; j++)
    p.position[j] = center[j] + p.scratch[j] * distance;
  transformFieldVector([0, 1, 0], orientation, p.moment);
  sampleMagneticField(p.position, center, p.moment, radius, 1, p.field);
  const magnitude = Math.hypot(...p.field) || 1;
  for (let j = 0; j < 3; j++) p.field[j] /= magnitude;
  const [bx, by, bz] = p.field;
  const nx = Math.abs(by) < 0.9 ? bz : by,
    ny = Math.abs(by) < 0.9 ? 0 : -bx,
    nz = Math.abs(by) < 0.9 ? -bx : 0;
  const norm = Math.hypot(nx, ny, nz) || 1,
    angle = random() * Math.PI * 2;
  const n = [nx / norm, ny / norm, nz / norm],
    w = [by * n[2] - bz * n[1], bz * n[0] - bx * n[2], bx * n[1] - by * n[0]];
  const pitch = 0.3 + random() * 1.15,
    parallel = (random() < 0.5 ? -1 : 1) * Math.cos(pitch);
  const velocity = populationSpeed(radius, distance, speed, p.speedSpread);
  for (let j = 0; j < 3; j++)
    p.velocity[j] =
      velocity *
      (parallel * p.field[j] +
        Math.sin(pitch) * (Math.cos(angle) * n[j] + Math.sin(angle) * w[j]));
}

export function placeIncomingReplacement(p, center, radius, orientation) {
  directionAwayFromPoles(p.random || Math.random, p.scratch);
  transformFieldVector(p.scratch, orientation, p.scratch);
  const distance = reentryRadius(radius),
    speed = reentrySpeed(radius);
  for (let j = 0; j < 3; j++) {
    p.position[j] = center[j] + p.scratch[j] * distance;
    p.velocity[j] = -p.scratch[j] * speed;
  }
  p.phase = "free";
  p.inbound = true;
  p.ejectionReason = null;
  p.ejectionRoute = null;
  p.lastBand = null;
}

// The separate radial electric potential and differential plasma rotation are
// CLT assumptions. They never masquerade as magnetic attraction or change old
// positions. Setting electricCoupling=0 gives a pure magnetic reference run.
export function sampleElectricMotion(
  position,
  center,
  radius,
  intensity,
  angularSpeed,
  axis,
  acceleration,
  flow,
  attraction = 1,
  magneticAxis = axis,
) {
  const x = position[0] - center[0],
    y = position[1] - center[1],
    z = position[2] - center[2];
  const ratio2 = (x * x + y * y + z * z) / (radius * radius);
  const strength = (intensity / (1 + intensity)) * attraction;
  const capture = (1.4 * strength) / (1 + ratio2) ** 1.5;
  acceleration[0] = -x * capture;
  acceleration[1] = -y * capture;
  acceleration[2] = -z * capture;
  // Smooth electric potential wells, not magnetic attraction or scripted moves.
  // Ring wells pull toward neighbouring bands; softened pole wells act locally.
  const parallel =
    x * magneticAxis[0] + y * magneticAxis[1] + z * magneticAxis[2];
  const px = x - parallel * magneticAxis[0],
    py = y - parallel * magneticAxis[1],
    pz = z - parallel * magneticAxis[2];
  const rho = Math.hypot(px, py, pz),
    q = rho / radius,
    axial = parallel / radius;
  let radialForce = 0,
    axialForce = 0;
  for (const band of ATTRACTING_BANDS) {
    const width = 0.11 + band * 0.12,
      height = 0.75 + band * 0.2,
      difference = q - band;
    const exponent =
      (difference * difference) / (2 * width * width) +
      (axial * axial) / (2 * height * height);
    if (exponent > 12) continue;
    const well =
      (1.2 * strength * radius * Math.exp(-exponent)) / Math.sqrt(1 + band);
    radialForce -= (well * difference) / (width * width);
    axialForce -= (well * axial) / (height * height);
  }
  const poleWidth = 0.18 + Math.min(0.12, radius * 0.01);
  for (let sign = -1; sign <= 1; sign += 2) {
    const poleParallel = parallel - sign * SOURCE_RADIUS;
    const weight =
      (24 * strength) /
      (1 +
        (rho * rho + poleParallel * poleParallel) / (poleWidth * poleWidth)) **
        1.5;
    radialForce -= weight * rho;
    axialForce -= weight * poleParallel;
  }
  const radialWeight = rho > 1e-12 ? radialForce / rho : 0;
  acceleration[0] += radialWeight * px + axialForce * magneticAxis[0];
  acceleration[1] += radialWeight * py + axialForce * magneticAxis[1];
  acceleration[2] += radialWeight * pz + axialForce * magneticAxis[2];
  const rotation = angularSpeed / (1 + ratio2 * ratio2);
  flow[0] = rotation * (axis[1] * z - axis[2] * y);
  flow[1] = rotation * (axis[2] * x - axis[0] * z);
  flow[2] = rotation * (axis[0] * y - axis[1] * x);
}

function scatterVelocity(p, dt, intensity) {
  p.scatterTime -= dt;
  if (p.scatterTime > 0) return;
  const random = p.random || Math.random;
  directionAwayFromPoles(random, p.scratch);
  const angle = ((random() - 0.5) * 0.16) / Math.sqrt(1 + intensity),
    cos = Math.cos(angle),
    sin = Math.sin(angle);
  const [x, y, z] = p.scratch,
    [vx, vy, vz] = p.velocity,
    dot = x * vx + y * vy + z * vz;
  p.velocity[0] = vx * cos + (y * vz - z * vy) * sin + x * dot * (1 - cos);
  p.velocity[1] = vy * cos + (z * vx - x * vz) * sin + y * dot * (1 - cos);
  p.velocity[2] = vz * cos + (x * vy - y * vx) * sin + z * dot * (1 - cos);
  p.scatterTime = 0.5 - Math.log(Math.max(1e-6, 1 - random())) * 1.8;
}

function markReleased(p, reason) {
  if (p.phase === "released") return;
  p.phase = "released";
  p.ejectionReason = reason;
  const speed = Math.hypot(...p.velocity) || 1,
    parallel =
      Math.abs(
        p.velocity[0] * p.moment[0] +
          p.velocity[1] * p.moment[1] +
          p.velocity[2] * p.moment[2],
      ) / speed;
  p.ejectionRoute = parallel > 0.7 ? "pole" : "random";
  p.lastOutcome = p.ejectionRoute === "pole" ? "eject_pole" : "eject_random";
}

export function advanceFieldParticle(
  p,
  center,
  radius,
  intensity,
  orientation,
  angularSpeed,
  dt,
  spinAxis = [0, 1, 0],
) {
  p.lastOutcome = null;
  transformFieldVector([0, 1, 0], orientation, p.moment);
  const initialDistance = Math.hypot(
    p.position[0] - center[0],
    p.position[1] - center[1],
    p.position[2] - center[2],
  );
  if (p.inbound && initialDistance <= radius * MH_MULTIPLIER) p.inbound = false;
  if (intensity === 0) {
    if (p.phase === "captured" || p.phase === "capturing")
      markReleased(p, "weak_field");
    else if (p.phase !== "released") p.phase = "free";
    advanceElectron(p.position, p.velocity, [0, 0, 0], dt);
    return;
  }
  sampleMagneticField(p.position, center, p.moment, radius, intensity, p.field);
  const speed = Math.hypot(...p.velocity),
    fieldStrength = Math.hypot(...p.field);
  // Exact local gyromotion handles rapid central cycles. Substeps still resolve
  // spatial variation and changes to electric forces; this is not a field-line guide.
  p.substeps = Math.min(
    64,
    Math.max(
      1,
      Math.ceil(
        Math.max(
          Math.min(8, (5 * fieldStrength * dt) / 0.35),
          (speed * dt) / Math.max(0.008, initialDistance * 0.025),
        ),
      ),
    ),
  );
  const h = dt / p.substeps,
    coupling = p.electricCoupling ?? 1;
  for (let i = 0; i < p.substeps; i++) {
    sampleMagneticField(
      p.position,
      center,
      p.moment,
      radius,
      intensity,
      p.field,
    );
    sampleElectricMotion(
      p.position,
      center,
      radius,
      intensity,
      angularSpeed,
      spinAxis,
      p.acceleration,
      p.flow,
      p.attraction ?? 1,
      p.moment,
    );
    if (coupling !== 1)
      for (let j = 0; j < 3; j++) {
        p.acceleration[j] *= coupling;
        p.flow[j] *= coupling;
      }
    for (let j = 0; j < 3; j++) {
      p.scratch[j] = p.position[j];
      p.trialVelocity[j] = p.velocity[j];
    }
    advanceElectron(
      p.scratch,
      p.trialVelocity,
      p.field,
      h / 2,
      p.acceleration,
      p.flow,
    );
    sampleMagneticField(
      p.scratch,
      center,
      p.moment,
      radius,
      intensity,
      p.field,
    );
    sampleElectricMotion(
      p.scratch,
      center,
      radius,
      intensity,
      angularSpeed,
      spinAxis,
      p.acceleration,
      p.flow,
      p.attraction ?? 1,
      p.moment,
    );
    if (coupling !== 1)
      for (let j = 0; j < 3; j++) {
        p.acceleration[j] *= coupling;
        p.flow[j] *= coupling;
      }
    advanceElectron(p.position, p.velocity, p.field, h, p.acceleration, p.flow);
  }
  if (!p.inbound && p.scattering !== false) scatterVelocity(p, dt, intensity);
  sampleMagneticField(p.position, center, p.moment, radius, intensity, p.field);
  const strength = Math.hypot(...p.field) || 1e-30,
    totalSpeed = Math.hypot(...p.velocity) || 1e-30;
  const parallel =
    (p.velocity[0] * p.field[0] +
      p.velocity[1] * p.field[1] +
      p.velocity[2] * p.field[2]) /
    strength;
  const perpendicular2 = Math.max(
    0,
    totalSpeed * totalSpeed - parallel * parallel,
  );
  p.pitch = Math.sqrt(perpendicular2) / totalSpeed;
  p.magneticMoment = perpendicular2 / (2 * strength);
  const distance = Math.hypot(
    p.position[0] - center[0],
    p.position[1] - center[1],
    p.position[2] - center[2],
  );
  const magnetization =
    Math.sqrt(perpendicular2) /
    (5 * strength * Math.max(SOURCE_RADIUS, distance / 3));
  if (!p.inbound && distance > radius * MH_MULTIPLIER)
    markReleased(p, "escape");
  else if (p.phase !== "released")
    p.phase = p.inbound
      ? "free"
      : magnetization < 0.35
        ? "captured"
        : "capturing";
  const band = particleBand(p.position, center, p.moment, radius);
  if (p.phase === "captured") {
    if (p.lastBand !== null && p.lastBand !== band) {
      p.lastOutcome = "band_change";
      p.visits++;
    }
    // Count actual mirror reversals from the parallel velocity, rather than
    // choosing a bounce or moving an electron to a scripted polar endpoint.
    const direction =
      parallel > totalSpeed * 0.04 ? 1 : parallel < -totalSpeed * 0.04 ? -1 : 0;
    if (direction) {
      if (p.parallelSign && direction !== p.parallelSign) {
        p.mirrorCount++;
        p.visits++;
        if (!p.lastOutcome) p.lastOutcome = "stay";
      }
      p.parallelSign = direction;
    }
  }
  p.lastBand = band;
}

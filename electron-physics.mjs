import {
  SOURCE_RADIUS,
  MH_MULTIPLIER,
  particleBand,
  transformFieldVector,
  sampleDipoleField,
  BAND_MULTIPLIERS,
} from "./field-lines.mjs";

export const CHARGE_TO_MASS = -5;
export const POLE_SPAWN_FACTOR = 1.08;
export const REENTRY_SPEED_FACTOR = 2;
export const RECYCLE_RADIUS_FACTOR = 4;
export const MAX_REENTRY_TIME = 20;
const CAPTURE_RANGE = MH_MULTIPLIER * 2;
const ELECTRIC_RESPONSE_SCALE = 0.003;
const OUTER_ATTRACTION = 0.12;

// The illustrative CLT electric trap responds at low strength, while B itself
// remains linear in intensity. Both terms still vanish for an inactive source.
const captureStrength = (intensity, attraction) =>
  (intensity / (ELECTRIC_RESPONSE_SCALE + intensity)) * attraction;

// A rotating source does not force particles into arbitrarily fast corotation.
// Model finite plasma entrainment; preserve direction and permit rotational lag.
export function entrainedRotation(angularSpeed, intensity) {
  if (intensity <= 0 || angularSpeed === 0) return 0;
  const limit = 1.25 * Math.sqrt(intensity / (ELECTRIC_RESPONSE_SCALE + intensity));
  return angularSpeed / Math.hypot(1, angularSpeed / limit);
}

export function captureBindingDepth(
  position, center, radius, intensity, attraction = 1,
) {
  const x = position[0] - center[0],
    y = position[1] - center[1],
    z = position[2] - center[2];
  const ratio2 = (x * x + y * y + z * z) / (radius * radius);
  const edge2 = MH_MULTIPLIER ** 2;
  if (ratio2 >= edge2) return 0;
  const inner = 1.4 * (1 / Math.sqrt(1 + ratio2) - 1 / Math.sqrt(1 + edge2));
  const outer =
    OUTER_ATTRACTION * CAPTURE_RANGE ** 2 *
    (1 / Math.sqrt(1 + ratio2 / CAPTURE_RANGE ** 2) -
      1 / Math.sqrt(1 + edge2 / CAPTURE_RANGE ** 2));
  return captureStrength(intensity, attraction) * radius ** 2 * (inner + outer);
}

// Modeled plasma relaxation removes excess kinetic energy, not orbital motion
// below the trapping energy. Pure magnetic reference runs omit this term.
export function captureRelaxationRate(
  position, center, radius, intensity, attraction, localField,
) {
  const x = position[0] - center[0],
    y = position[1] - center[1],
    z = position[2] - center[2];
  const distance2 = x * x + y * y + z * z;
  const envelope = (1 + distance2 / (radius * MH_MULTIPLIER) ** 2) ** 2;
  return captureStrength(intensity, attraction) * (0.15 + 0.025 * localField) / envelope;
}

export function relaxCaptureEnergy(velocity, rate, bindingDepth, radius, dt, tangent = null) {
  const speed2 = velocity.reduce((sum, v) => sum + v * v, 0);
  const target2 = Math.max(0.02 * radius ** 2, 1.2 * bindingDepth);
  if (rate <= 0 || speed2 <= target2) return;
  // Keep bounded azimuthal momentum: cooling an otherwise circulating ring
  // drains its support and causes artificial inward collapse, especially at MH.
  const orbital = tangent ? Math.max(-4 * radius, Math.min(4 * radius,
    velocity.reduce((sum, v, j) => sum + v * tangent[j], 0))) : 0;
  const residual2 = velocity.reduce((sum, v, j) =>
    sum + (v - (tangent ? orbital * tangent[j] : 0)) ** 2, 0);
  const residualTarget2 = Math.max(0.02 * radius ** 2, target2 - orbital * orbital);
  if (residual2 <= residualTarget2) return;
  const factor = Math.sqrt(
    (residualTarget2 + (residual2 - residualTarget2) * Math.exp(-2 * rate * dt)) / residual2,
  );
  for (let j = 0; j < 3; j++) {
    const preserved = tangent ? orbital * tangent[j] : 0;
    velocity[j] = preserved + (velocity[j] - preserved) * factor;
  }
}

function particleTangent(p, center) {
  const x = p.position[0] - center[0], y = p.position[1] - center[1], z = p.position[2] - center[2];
  const [ax, ay, az] = p.moment;
  const tangent = p.tangent ||= [0, 0, 0];
  tangent[0] = ay * z - az * y;
  tangent[1] = az * x - ax * z;
  tangent[2] = ax * y - ay * x;
  const norm = Math.hypot(...tangent);
  if (norm < 1e-9) return null;
  for (let j = 0; j < 3; j++) tangent[j] /= norm;
  return tangent;
}
const ATTRACTING_BANDS = [0.2, 0.5, 1, 1.7, 3.5, 4.5, 6.5].map((band) => ({
  band,
  inverseWidth2: 1 / (0.11 + band * 0.12) ** 2,
  inverseHeight2: 1 / (0.75 + band * 0.2) ** 2,
  gain: 1.5 / Math.sqrt(1 + band),
}));

function transportRing(shell) {
  for (let i = 0; i < ATTRACTING_BANDS.length - 1; i++) {
    const a = ATTRACTING_BANDS[i].band, b = ATTRACTING_BANDS[i + 1].band;
    const midpoint = (a + b) / 2, width = (b - a) * 0.15;
    if (shell < midpoint - width) return a;
    if (shell < midpoint + width) {
      const t = (shell - midpoint + width) / (2 * width);
      return a + (b - a) * t * t * (3 - 2 * t);
    }
  }
  return ATTRACTING_BANDS.at(-1).band;
}

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
export const reentryRadius = () => SOURCE_RADIUS * POLE_SPAWN_FACTOR;
export const reentrySpeed = (radius) => radius * REENTRY_SPEED_FACTOR;

function randomDirection(random, out, maxCosine = 1) {
  // Uniform azimuth and cosine latitude give equal probability per solid angle.
  const y = (random() * 2 - 1) * maxCosine,
    phi = random() * Math.PI * 2,
    radial = Math.sqrt(1 - y * y);
  out[0] = Math.cos(phi) * radial;
  out[1] = y;
  out[2] = Math.sin(phi) * radial;
}

function directionAwayFromPoles(random, out) {
  randomDirection(random, out, 0.85);
}

export function outsideReplacementBoundary(position, center, radius) {
  return (
    Math.hypot(
      position[0] - center[0],
      position[1] - center[1],
      position[2] - center[2],
    ) >
    radius * MH_MULTIPLIER * RECYCLE_RADIUS_FACTOR
  );
}

export function initializeFieldParticle(
  p,
  center,
  radius,
  orientation,
  speed,
  random = Math.random,
  launch = {},
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
    "componentField",
    "componentAcceleration",
    "componentFlow",
  ])
    p[key] ||= [0, 0, 0];
  p.sourceFields ||= [
    [0, 0, 0],
    [0, 0, 0],
  ];
  p.sourceStrengths ||= [0, 0];
  p.random = random;
  p.phase = "free";
  p.inbound = false;
  p.age = 0;
  p.outsideTime = 0;
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
  // Seed rings evenly with independent azimuths and a finite thickness. This is
  // an initial condition only: no assigned band constrains subsequent motion.
  const band = BAND_MULTIPLIERS[1 + Math.floor(random() * 7)];
  const phi = random() * Math.PI * 2;
  const rho = radius * band * (0.9 + random() * 0.08);
  const height = radius * (0.025 + band * 0.035) * (random() * 2 - 1);
  transformFieldVector([Math.cos(phi) * rho, height, Math.sin(phi) * rho], orientation, p.scratch);
  for (let j = 0; j < 3; j++) p.position[j] = center[j] + p.scratch[j];
  transformFieldVector([0, 1, 0], orientation, p.moment);
  const intensity = launch.intensity ?? 1;
  sampleMagneticField(p.position, center, p.moment, radius, intensity, p.field);
  sampleElectricMotion(p.position, center, radius, intensity, launch.angularSpeed ?? 0,
    launch.spinAxis ?? p.moment, p.acceleration, p.flow, launch.attraction ?? 2,
    p.moment, launch.inflow ?? 1);
  const radial = transformFieldVector([Math.cos(phi), 0, Math.sin(phi)], orientation);
  const tangent = transformFieldVector([-Math.sin(phi), 0, Math.cos(phi)], orientation);
  const dot = (a, b) => a.reduce((sum, v, j) => sum + v * b[j], 0);
  const magnetic = CHARGE_TO_MASS * dot(p.field, p.moment);
  const radialForce = dot(p.acceleration, radial);
  const tangentialFlow = dot(p.flow, tangent);
  const linear = magnetic * rho;
  const constant = rho * (radialForce + magnetic * tangentialFlow);
  const discriminant = linear * linear - 4 * constant;
  let orbitalSpeed;
  if (discriminant >= 0 && intensity > 0) {
    // The slow circular branch balances electric, magnetic and centrifugal
    // forces. Use the product of roots to avoid cancellation at strong B.
    const fast = (linear + (linear >= 0 ? 1 : -1) * Math.sqrt(discriminant)) / 2;
    orbitalSpeed = Math.abs(fast) > 1e-12 ? constant / fast : 0;
  } else orbitalSpeed = tangentialFlow;
  if (intensity <= 0) orbitalSpeed = populationSpeed(radius, rho, 1, p.speedSpread);
  orbitalSpeed *= speed * (0.92 + random() * 0.16);
  const thermal = Math.max(Math.abs(orbitalSpeed) * 0.08, radius * 0.015);
  const radialSpeed = (random() * 2 - 1) * thermal;
  const parallelSpeed = (random() * 2 - 1) * thermal;
  for (let j = 0; j < 3; j++)
    p.velocity[j] = orbitalSpeed * tangent[j] + radialSpeed * radial[j] + parallelSpeed * p.moment[j];
}

export function placeIncomingReplacement(p, center, radius, orientation) {
  const random = p.random || Math.random;
  // Different dipole footpoints feed different loops: L = r / sin²(theta).
  // A narrow axial cap sends nearly every replacement into the same CE trap.
  const shell = Math.max(reentryRadius(radius) * 2,
    radius * BAND_MULTIPLIERS[1 + Math.floor(random() * 7)] * (0.9 + random() * 0.08));
  const cosine = Math.sqrt(1 - reentryRadius(radius) / shell);
  const sign = random() < 0.5 ? -1 : 1;
  const phi = random() * Math.PI * 2;
  const radial = Math.sqrt(1 - cosine * cosine);
  p.scratch[0] = Math.cos(phi) * radial;
  p.scratch[1] = sign * cosine;
  p.scratch[2] = Math.sin(phi) * radial;
  transformFieldVector(p.scratch, orientation, p.scratch);
  const distance = reentryRadius(radius),
    speed = reentrySpeed(radius);
  for (let j = 0; j < 3; j++) {
    p.position[j] = center[j] + p.scratch[j] * distance;
  }
  transformFieldVector([0, 1, 0], orientation, p.moment);
  sampleMagneticField(p.position, center, p.moment, radius, 1, p.field);
  const magnitude = Math.hypot(...p.field) || 1;
  const tangent = transformFieldVector([-Math.sin(phi), 0, Math.cos(phi)], orientation);
  const pitch = 0.08 + random() * 0.12;
  const orbitSign = random() < 0.5 ? -1 : 1;
  for (let j = 0; j < 3; j++)
    p.velocity[j] = speed * (sign * Math.cos(pitch) * p.field[j] / magnitude + orbitSign * Math.sin(pitch) * tangent[j]);
  p.phase = "free";
  p.inbound = false;
  p.outsideTime = 0;
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
  inflow = 0,
) {
  const x = position[0] - center[0],
    y = position[1] - center[1],
    z = position[2] - center[2];
  const ratio2 = (x * x + y * y + z * z) / (radius * radius);
  const strength = captureStrength(intensity, attraction);
  const capture =
    strength *
    (1.4 / (1 + ratio2) ** 1.5 +
      OUTER_ATTRACTION / (1 + ratio2 / CAPTURE_RANGE ** 2) ** 1.5);
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
  for (const {
    band,
    inverseWidth2,
    inverseHeight2,
    gain,
  } of ATTRACTING_BANDS) {
    const difference = q - band;
    const exponent =
      (difference * difference * inverseWidth2 +
        axial * axial * inverseHeight2) /
      2;
    if (exponent > 12) continue;
    const well = gain * strength * radius * Math.exp(-exponent);
    radialForce -= well * difference * inverseWidth2;
    axialForce -= well * axial * inverseHeight2;
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
  const rotation =
    entrainedRotation(angularSpeed, intensity) / (1 + ratio2 * ratio2);
  flow[0] = rotation * (axis[1] * z - axis[2] * y);
  flow[1] = rotation * (axis[2] * x - axis[0] * z);
  flow[2] = rotation * (axis[0] * y - axis[1] * x);
  // Optional CLT transport flow, not a consequence of rotation alone. Its
  // motional electric field produces inward E-cross-B drift where magnetized.
  // Soften at the heart and fade in outer bands; never move positions directly.
  const distance2 = x * x + y * y + z * z;
  const inflowRate =
    (((0.08 * inflow * Math.abs(angularSpeed) * intensity) / (1 + intensity)) *
      distance2) /
    (distance2 + SOURCE_RADIUS ** 2) /
    (1 + ratio2 * ratio2);
  // Capturing plasma transport settles around the nearest ring instead of
  // flowing through every ring to the axis forever. Far away it remains inward.
  let transport = 1;
  const distance = Math.sqrt(distance2);
  // Exterior dipole L labels an entire loop, including its polar legs. Using
  // perpendicular distance alone mistakes every polar entrant for CE.
  const u = distance2 / SOURCE_RADIUS ** 2;
  const fluxScale = distance >= SOURCE_RADIUS ? distance ** 3 :
    SOURCE_RADIUS ** 3 / (35 / 8 - 21 * u / 4 + 15 * u * u / 8);
  const shell = rho > 1e-9 ? fluxScale / (rho * rho * radius) : Infinity;
  if (Number.isFinite(shell) && shell > 1e-9 && attraction > 0)
    transport -= Math.min(1, attraction) * transportRing(shell) / shell /
      (1 + (shell / CAPTURE_RANGE) ** 8);
  flow[0] -= inflowRate * transport * x;
  flow[1] -= inflowRate * transport * y;
  flow[2] -= inflowRate * transport * z;
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

function sampleParticleField(
  p,
  position,
  center,
  radius,
  intensity,
  environment,
) {
  if (environment) environment.sampleMagnetic(position, p.field, p);
  else
    sampleMagneticField(position, center, p.moment, radius, intensity, p.field);
}
function sampleParticleElectric(
  p,
  position,
  center,
  radius,
  intensity,
  angularSpeed,
  spinAxis,
  environment,
) {
  if (environment)
    environment.sampleElectric(
      position,
      p.field,
      p.attraction ?? 1,
      p.acceleration,
      p.flow,
      p,
    );
  else
    sampleElectricMotion(
      position,
      center,
      radius,
      intensity,
      angularSpeed,
      spinAxis,
      p.acceleration,
      p.flow,
      p.attraction ?? 1,
      p.moment,
      p.inflow ?? 0,
    );
  p.bindingDepth = environment
    ? environment.bindingDepth(position, p.attraction ?? 1)
    : captureBindingDepth(position, center, radius, intensity, p.attraction ?? 1);
  p.captureRate = environment
    ? environment.relaxationRate(position, p.attraction ?? 1, p.sourceFields)
    : captureRelaxationRate(position, center, radius, intensity, p.attraction ?? 1, Math.hypot(...p.field));
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
  environment = null,
) {
  p.lastOutcome = null;
  if (environment) {
    const index = environment.dominant(p.position, p.sourceIndex ?? -1);
    if (p.sourceIndex !== undefined && index !== p.sourceIndex) {
      p.transfers = (p.transfers || 0) + 1;
      p.parallelSign = 0;
      p.lastBand = null;
    }
    p.sourceIndex = index;
    const source = environment.sources[index];
    center = source.center;
    radius = source.radius;
    intensity = source.intensity;
    orientation = source.orientation;
  }
  transformFieldVector([0, 1, 0], orientation, p.moment);
  const initialDistance = Math.hypot(
    p.position[0] - center[0],
    p.position[1] - center[1],
    p.position[2] - center[2],
  );
  if (
    p.inbound &&
    (environment
      ? environment.contains(p.position)
      : initialDistance <= radius * MH_MULTIPLIER)
  )
    p.inbound = false;
  if (environment ? !environment.isActive() : intensity === 0) {
    if (p.phase === "captured" || p.phase === "capturing")
      markReleased(p, "weak_field");
    else if (environment || p.phase !== "released") p.phase = "free";
    advanceElectron(p.position, p.velocity, [0, 0, 0], dt);
    return;
  }
  sampleParticleField(p, p.position, center, radius, intensity, environment);
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
    sampleParticleField(p, p.position, center, radius, intensity, environment);
    sampleParticleElectric(
      p,
      p.position,
      center,
      radius,
      intensity,
      angularSpeed,
      spinAxis,
      environment,
    );
    if (coupling !== 1)
      for (let j = 0; j < 3; j++) {
        p.acceleration[j] *= coupling;
        p.flow[j] *= coupling;
      }
    relaxCaptureEnergy(p.velocity, p.captureRate * coupling, p.bindingDepth * coupling, radius, h / 2, particleTangent(p, center));
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
    sampleParticleField(p, p.scratch, center, radius, intensity, environment);
    sampleParticleElectric(
      p,
      p.scratch,
      center,
      radius,
      intensity,
      angularSpeed,
      spinAxis,
      environment,
    );
    if (coupling !== 1)
      for (let j = 0; j < 3; j++) {
        p.acceleration[j] *= coupling;
        p.flow[j] *= coupling;
      }
    advanceElectron(p.position, p.velocity, p.field, h, p.acceleration, p.flow);
    relaxCaptureEnergy(p.velocity, p.captureRate * coupling, p.bindingDepth * coupling, radius, h / 2, particleTangent(p, center));
  }
  if (!p.inbound && p.scattering !== false) scatterVelocity(p, dt, intensity);
  sampleParticleField(p, p.position, center, radius, intensity, environment);
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
  if (
    !p.inbound &&
    (environment
      ? !environment.contains(p.position)
      : distance > radius * MH_MULTIPLIER)
  )
    markReleased(p, "escape");
  else {
    if (p.phase === "released") {
      p.ejectionReason = null;
      p.ejectionRoute = null;
      p.parallelSign = 0;
    }
    const bindingDepth = coupling * (environment
      ? environment.bindingDepth(p.position, p.attraction ?? 1)
      : captureBindingDepth(p.position, center, radius, intensity, p.attraction ?? 1));
    p.phase = p.inbound
      ? "free"
      : magnetization < 0.35 || totalSpeed * totalSpeed / 2 < bindingDepth
        ? "captured"
        : "capturing";
  }
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

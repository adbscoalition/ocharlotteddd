import {
  sampleMagneticField,
  sampleElectricMotion,
  CHARGE_TO_MASS,
  entrainedRotation,
  captureBindingDepth,
  captureRelaxationRate,
} from "./electron-physics.mjs";
import { MH_MULTIPLIER, transformFieldVector } from "./field-lines.mjs";

export function sourceDistance(position, source) {
  return Math.hypot(
    position[0] - source.center[0],
    position[1] - source.center[1],
    position[2] - source.center[2],
  );
}
export function insideAnyField(position, sources) {
  return sources.some(
    (s) => sourceDistance(position, s) <= s.radius * MH_MULTIPLIER,
  );
}
export function dominantSource(
  position,
  sources,
  previous = -1,
  scratch = [0, 0, 0],
) {
  let winner = 0,
    maximum = -1,
    previousStrength = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    sampleMagneticField(
      position,
      s.center,
      s.moment,
      s.radius,
      s.intensity,
      scratch,
    );
    const strength = Math.hypot(...scratch);
    if (i === previous) previousStrength = strength;
    if (strength > maximum) {
      maximum = strength;
      winner = i;
    }
  }
  return previous >= 0 &&
    previous < sources.length &&
    previousStrength > 0 &&
    previousStrength * 1.12 >= maximum
    ? previous
    : winner;
}
export function sampleCombinedMagnetic(
  position,
  sources,
  out = [0, 0, 0],
  scratch = [0, 0, 0],
) {
  out.fill(0);
  for (const s of sources) {
    if (s.intensity === 0) continue;
    sampleMagneticField(
      position,
      s.center,
      s.moment,
      s.radius,
      s.intensity,
      scratch,
    );
    for (let j = 0; j < 3; j++) out[j] += scratch[j];
  }
  return out;
}

// Interaction is an explicit rotating-plasma flow model. Superposed magnetic
// fields alone do not create a dissipative stirring force in empty space.
export function stirringVelocity(
  position,
  sources,
  gain,
  out = [0, 0, 0],
  scratch = [0, 0, 0],
  strengths = null,
) {
  out.fill(0);
  if (sources.length < 2 || gain === 0) return out;
  const [a, b] = sources;
  if (a.intensity === 0 || b.intensity === 0) return out;
  let ba, bb;
  if (strengths) [ba, bb] = strengths;
  else {
    sampleMagneticField(
      position,
      a.center,
      a.moment,
      a.radius,
      a.intensity,
      scratch,
    );
    ba = Math.hypot(...scratch);
    sampleMagneticField(
      position,
      b.center,
      b.moment,
      b.radius,
      b.intensity,
      scratch,
    );
    bb = Math.hypot(...scratch);
  }
  const sum = ba + bb;
  if (sum < 1e-20) return out;
  const overlap = (2 * Math.min(ba, bb)) / sum;
  const envelope =
    1 /
    Math.sqrt(
      (1 + (sourceDistance(position, a) / (a.radius * 3)) ** 4) *
        (1 + (sourceDistance(position, b) / (b.radius * 3)) ** 4),
    );
  const ma = a.intensity * a.radius ** 3,
    mb = b.intensity * b.radius ** 3,
    contrast = (ma - mb) / (ma + mb);
  const dominant = ma >= mb ? a : b;
  const rate =
    (0.12 *
      gain *
      overlap *
      envelope *
      (Math.abs(entrainedRotation(a.angularSpeed, a.intensity)) +
        Math.abs(entrainedRotation(b.angularSpeed, b.intensity)))) /
    2;
  if (rate === 0) return out;
  const t = 0.5 - contrast * 0.15;
  const x = position[0] - a.center[0] * (1 - t) - b.center[0] * t;
  const y = position[1] - a.center[1] * (1 - t) - b.center[1] * t;
  const z = position[2] - a.center[2] * (1 - t) - b.center[2] * t;
  const axis = dominant.spinAxis;
  out[0] = rate * (axis[1] * z - axis[2] * y);
  out[1] = rate * (axis[2] * x - axis[0] * z);
  out[2] = rate * (axis[0] * y - axis[1] * x);
  const dx = b.center[0] - a.center[0],
    dy = b.center[1] - a.center[1],
    dz = b.center[2] - a.center[2],
    distance = Math.hypot(dx, dy, dz);
  if (distance > 1e-9) {
    const entrainment =
      (-contrast * rate * Math.min(a.radius, b.radius) * 0.8) / distance;
    out[0] += entrainment * dx;
    out[1] += entrainment * dy;
    out[2] += entrainment * dz;
  }
  return out;
}

export function sampleCombinedElectric(
  position,
  sources,
  magnetic,
  attraction,
  stirring,
  acceleration,
  flow,
  work,
  cachedFields = null,
  inflow = 0,
) {
  acceleration.fill(0);
  flow.fill(0);
  let sx = 0,
    sy = 0,
    sz = 0;
  const A = work.componentAcceleration,
    U = work.componentFlow;
  const strengths = (work.sourceStrengths ||= [0, 0]);
  strengths.fill(0);
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    if (s.intensity === 0) continue;
    const B =
      cachedFields?.[i] ??
      sampleMagneticField(
        position,
        s.center,
        s.moment,
        s.radius,
        s.intensity,
        work.componentField,
      );
    strengths[i] = Math.hypot(...B);
    sampleElectricMotion(
      position,
      s.center,
      s.radius,
      s.intensity,
      s.angularSpeed,
      s.spinAxis,
      A,
      U,
      attraction,
      s.moment,
      inflow,
    );
    for (let j = 0; j < 3; j++) acceleration[j] += A[j];
    sx += U[1] * B[2] - U[2] * B[1];
    sy += U[2] * B[0] - U[0] * B[2];
    sz += U[0] * B[1] - U[1] * B[0];
  }
  stirringVelocity(
    position,
    sources,
    stirring,
    U,
    work.componentField,
    strengths,
  );
  const [bx, by, bz] = magnetic;
  sx += U[1] * bz - U[2] * by;
  sy += U[2] * bx - U[0] * bz;
  sz += U[0] * by - U[1] * bx;
  const b2 = bx * bx + by * by + bz * bz;
  if (b2 < 1e-20) {
    acceleration[0] -= CHARGE_TO_MASS * sx;
    acceleration[1] -= CHARGE_TO_MASS * sy;
    acceleration[2] -= CHARGE_TO_MASS * sz;
  } else {
    // Add electric fields, not plasma velocities. Decompose summed E into an
    // exact perpendicular drift and parallel acceleration, including cancellation.
    flow[0] = (by * sz - bz * sy) / b2;
    flow[1] = (bz * sx - bx * sz) / b2;
    flow[2] = (bx * sy - by * sx) / b2;
    const parallel = (CHARGE_TO_MASS * (sx * bx + sy * by + sz * bz)) / b2;
    acceleration[0] -= parallel * bx;
    acceleration[1] -= parallel * by;
    acceleration[2] -= parallel * bz;
  }
}

export class FieldSystem {
  constructor(sources, stirring = 1, inflow = 0) {
    this.sources = sources;
    this.stirring = stirring;
    this.inflow = inflow;
    this.scratch = [0, 0, 0];
  }
  sampleMagnetic(position, out, work) {
    // Reuse component B samples in the immediately following electric query.
    // Every midpoint gets a fresh sample; this never caches across time or position.
    if (!work.sourceFields)
      return sampleCombinedMagnetic(
        position,
        this.sources,
        out,
        work.componentField,
      );
    out.fill(0);
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i],
        B = work.sourceFields[i];
      sampleMagneticField(
        position,
        s.center,
        s.moment,
        s.radius,
        s.intensity,
        B,
      );
      for (let j = 0; j < 3; j++) out[j] += B[j];
    }
    return out;
  }
  sampleElectric(position, magnetic, attraction, acceleration, flow, work) {
    sampleCombinedElectric(
      position,
      this.sources,
      magnetic,
      attraction,
      this.stirring,
      acceleration,
      flow,
      work,
      work.sourceFields,
      this.inflow,
    );
  }
  contains(position) {
    return insideAnyField(position, this.sources);
  }
  bindingDepth(position, attraction) {
    let depth = 0;
    for (const source of this.sources)
      depth += captureBindingDepth(
        position, source.center, source.radius, source.intensity, attraction,
      );
    return depth;
  }
  relaxationRate(position, attraction, sourceFields) {
    let rate = 0;
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      rate += captureRelaxationRate(
        position, source.center, source.radius, source.intensity, attraction,
        Math.hypot(...sourceFields[i]),
      );
    }
    return rate;
  }
  dominant(position, previous) {
    return dominantSource(position, this.sources, previous, this.scratch);
  }
  isActive() {
    return this.sources.some((s) => s.intensity > 0);
  }
  prepareOrientations() {
    for (const s of this.sources)
      transformFieldVector([0, 1, 0], s.orientation, s.moment);
  }
}

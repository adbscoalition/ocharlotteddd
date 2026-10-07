import test from "node:test";
import assert from "node:assert/strict";
import {
  FieldSystem,
  sampleCombinedMagnetic,
  sampleCombinedElectric,
  dominantSource,
  insideAnyField,
  stirringVelocity,
} from "../field-system.mjs";
import {
  sampleMagneticField,
  sampleElectricMotion,
  advanceFieldParticle,
  initializeFieldParticle,
  CHARGE_TO_MASS,
} from "../electron-physics.mjs";
const source = (center, intensity = 1) => ({
  center,
  radius: 4,
  intensity,
  moment: [0, 1, 0],
  orientation: [0, 0, 0, 1],
  spinAxis: [0, 1, 0],
  angularSpeed: 3,
});
const near = (a, b, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const work = () => ({
  componentField: [0, 0, 0],
  componentAcceleration: [0, 0, 0],
  componentFlow: [0, 0, 0],
});
test("combined magnetic force uses vector addition, including opposite-source cancellation", () => {
  const a = source([0, 0, 0]),
    b = source([3, 1, -2], 0.7),
    p = [2, 2, 1];
  const ba = sampleMagneticField(p, a.center, a.moment, a.radius, a.intensity),
    bb = sampleMagneticField(p, b.center, b.moment, b.radius, b.intensity);
  sampleCombinedMagnetic(p, [a, b]).forEach((v, i) => near(v, ba[i] + bb[i]));
  b.center = [0, 0, 0];
  b.intensity = 1;
  b.moment = [0, -1, 0];
  sampleCombinedMagnetic(p, [a, b]).forEach((v) => near(v, 0));
});
test("secondary field captures locally while stronger sources dominate a larger region", () => {
  const a = source([-3, 0, 0], 2),
    b = source([3, 0, 0], 0.5);
  assert.equal(dominantSource([-3, 1, 0], [a, b]), 0);
  assert.equal(dominantSource([3, 1, 0], [a, b]), 1);
  const counts = [0, 0];
  for (let x = -10; x <= 10; x += 0.5)
    for (let z = -8; z <= 8; z += 0.5)
      counts[dominantSource([x, 1, z], [a, b])]++;
  assert.ok(counts[0] > counts[1] * 1.5);
});
test("capture geometry is the union of both MH volumes", () => {
  const a = source([0, 0, 0]),
    b = source([60, 0, 0]);
  assert.ok(insideAnyField([60, 0, 2], [a, b]));
  assert.ok(!insideAnyField([30, 0, 0], [a, b]));
});
test("combined electric decomposition preserves summed motional E rather than adding velocities", () => {
  const a = source([0, 0, 0]),
    b = source([3, 1, -2], 0.7),
    p = [2, 2, 1];
  b.spinAxis = [1, 0, 0];
  b.angularSpeed = 7;
  const B = sampleCombinedMagnetic(p, [a, b]),
    A = [0, 0, 0],
    U = [0, 0, 0],
    expected = [0, 0, 0];
  sampleCombinedElectric(p, [a, b], B, 2, 0, A, U, work());
  for (const s of [a, b]) {
    const bs = sampleMagneticField(
        p,
        s.center,
        s.moment,
        s.radius,
        s.intensity,
      ),
      as = [0, 0, 0],
      us = [0, 0, 0];
    sampleElectricMotion(
      p,
      s.center,
      s.radius,
      s.intensity,
      s.angularSpeed,
      s.spinAxis,
      as,
      us,
      2,
      s.moment,
    );
    const c = cross(us, bs);
    expected.forEach((_, i) => (expected[i] += as[i] - CHARGE_TO_MASS * c[i]));
  }
  const c = cross(U, B);
  A.forEach((v, i) => near(v - CHARGE_TO_MASS * c[i], expected[i]));
});
test("opposing B can cancel while a net electric field remains finite", () => {
  const a = source([0, 0, 0]),
    b = source([0, 0, 0]);
  b.moment = [0, -1, 0];
  b.angularSpeed = 1;
  const p = [2, 1, 0],
    B = sampleCombinedMagnetic(p, [a, b]),
    A = [0, 0, 0],
    U = [0, 0, 0];
  sampleCombinedElectric(p, [a, b], B, 0, 0, A, U, work());
  assert.ok(A.every(Number.isFinite));
  assert.ok(Math.hypot(...A) > 0);
  assert.deepEqual(U, [0, 0, 0]);
});
test("stirring responds to overlap and rotation and vanishes when disabled or either source is zero", () => {
  const a = source([-2, 0, 0], 2),
    b = source([2, 0, 0], 0.5);
  assert.ok(Math.hypot(...stirringVelocity([0, 1, 1], [a, b], 1)) > 0);
  const nearFlow = Math.hypot(...stirringVelocity([0, 1, 1], [a, b], 1)),
    farFlow = Math.hypot(...stirringVelocity([200, 1, 1], [a, b], 1));
  assert.ok(farFlow < nearFlow * 0.01);
  assert.deepEqual(stirringVelocity([0, 1, 1], [a, b], 0), [0, 0, 0]);
  b.intensity = 0;
  assert.deepEqual(stirringVelocity([0, 1, 1], [a, b], 1), [0, 0, 0]);
  b.intensity = 1;
  a.angularSpeed = b.angularSpeed = 0;
  assert.deepEqual(stirringVelocity([0, 1, 1], [a, b], 1), [0, 0, 0]);
});
test("coincident sources and equal-strength boundaries remain finite without ownership flicker", () => {
  const a = source([0, 0, 0]),
    b = source([0, 0, 0]);
  assert.equal(dominantSource([1, 1, 1], [a, b], 1), 1);
  assert.ok(stirringVelocity([1, 1, 1], [a, b], 1).every(Number.isFinite));
});
test("single source through the combined solver agrees with original force integration", () => {
  const s = source([0, 0, 0]),
    env = new FieldSystem([s], 0),
    a = {},
    b = {};
  for (const p of [a, b]) {
    initializeFieldParticle(p, s.center, s.radius, s.orientation, 1, () => 0.4);
    p.scattering = false;
  }
  for (let i = 0; i < 120; i++) {
    advanceFieldParticle(a, s.center, 4, 1, s.orientation, 3, 1 / 120);
    advanceFieldParticle(
      b,
      s.center,
      4,
      1,
      s.orientation,
      3,
      1 / 120,
      s.spinAxis,
      env,
    );
  }
  a.position.forEach((v, i) => near(v, b.position[i], 1e-7));
  a.velocity.forEach((v, i) => near(v, b.velocity[i], 1e-7));
});
test("both fields capture integrated particles; ownership can transfer without a position jump", () => {
  const a = source([-3, 0, 0], 1.8),
    b = source([3, 0, 0], 0.6),
    env = new FieldSystem([a, b], 1);
  for (const [index, s] of [a, b].entries()) {
    const p = {};
    initializeFieldParticle(p, s.center, 4, s.orientation, 1, () => 0.4);
    p.scattering = false;
    p.position = [s.center[0] + 0.4, 0.2, 0.2];
    p.velocity = [0, 0, 0.1];
    p.sourceIndex = 1 - index;
    const before = [...p.position];
    advanceFieldParticle(
      p,
      a.center,
      4,
      1.8,
      a.orientation,
      3,
      1 / 120,
      a.spinAxis,
      env,
    );
    assert.equal(p.sourceIndex, index);
    assert.equal(p.phase, "captured");
    assert.equal(p.transfers, 1);
    assert.ok(Math.hypot(...p.position.map((v, i) => v - before[i])) < 0.1);
  }
});
test("zero-strength combined sources give ballistic motion and no magnetized electrons", () => {
  const a = source([0, 0, 0], 0),
    b = source([3, 0, 0], 0),
    p = {};
  initializeFieldParticle(p, a.center, 4, a.orientation, 1, () => 0.4);
  p.position = [1, 2, 3];
  p.velocity = [2, -1, 0.5];
  p.phase = "captured";
  advanceFieldParticle(
    p,
    a.center,
    4,
    0,
    a.orientation,
    3,
    0.1,
    a.spinAxis,
    new FieldSystem([a, b], 2),
  );
  [1.2, 1.9, 3.05].forEach((v, i) => near(v, p.position[i]));
  assert.notEqual(p.phase, "captured");
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceElectron,
  advanceFieldParticle,
  initializeFieldParticle,
  sampleMagneticField,
  placeIncomingReplacement,
  reentryRadius,
  reentrySpeed,
  populationSpeed,
  sampleElectricMotion,
  outsideReplacementBoundary,
} from "../electron-physics.mjs";
import {
  sampleFieldLine,
  transformFieldVector,
  SOURCE_RADIUS,
  EXTERIOR_FRACTION,
  fieldMapDistance,
} from "../field-lines.mjs";
const near = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`);
const identity = [0, 0, 0, 1],
  center = [0, 0, 0],
  moment = [0, 1, 0];
const seeded =
  (s = 42) =>
  () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
const fresh = (random = seeded(), radius = 4) => {
  const p = {};
  initializeFieldParticle(p, center, radius, identity, 1, random);
  return p;
};
const evolve = (p, I, seconds, radius = 4, rpm = 0) => {
  for (let i = 0; i < Math.round(seconds * 120); i++) {
    const a = ((i / 120) * rpm * Math.PI * 2) / 60;
    advanceFieldParticle(
      p,
      center,
      radius,
      I,
      [0, Math.sin(a / 2), 0, Math.cos(a / 2)],
      (rpm * Math.PI * 2) / 60,
      1 / 120,
    );
  }
};

test("zero B gives exact ballistic motion", () => {
  const p = [1, 2, 3],
    v = [2, -1, 0.5];
  advanceElectron(p, v, [0, 0, 0], 0.4);
  p.forEach((x, i) => near(x, [1.8, 1.6, 3.2][i]));
  assert.deepEqual(v, [2, -1, 0.5]);
});
test("negative charge bends opposite to v cross B; reversing B reverses bending", () => {
  const a = [1, 0, 0],
    b = [1, 0, 0];
  advanceElectron([0, 0, 0], a, [0, 0, 1], 0.01);
  advanceElectron([0, 0, 0], b, [0, 0, -1], 0.01);
  assert.ok(a[1] > 0);
  near(a[0], b[0]);
  near(a[1], -b[1]);
});
test("helical advance preserves magnetic-only speed for long runs including strong B", () => {
  for (const B of [0.1, 10, 1000]) {
    const p = [0, 0, 0],
      v = [1.2, -0.3, 0.8],
      speed = Math.hypot(...v);
    for (let i = 0; i < 10000; i++) advanceElectron(p, v, [0, 0, B], 1 / 120);
    near(Math.hypot(...v), speed);
    near(v[2], 0.8);
    assert.ok(p.every(Number.isFinite));
  }
});
test("parallel motion is unaffected by uniform B", () => {
  const p = [0, 0, 0],
    v = [0, 2, 0];
  advanceElectron(p, v, [0, 30, 0], 0.5);
  assert.deepEqual(p, [0, 1, 0]);
  assert.deepEqual(v, [0, 2, 0]);
});
test("uniform B gives the expected Larmor radius", () => {
  const p = [0, 0, 0],
    v = [1, 0, 0],
    r = 0.2;
  for (let i = 0; i < 1000; i++) {
    advanceElectron(p, v, [0, 0, 1], 0.001);
    near(Math.hypot(p[0], p[1] - r), r, 1e-9);
  }
});
test("electric acceleration supplies work with the correct ballistic displacement", () => {
  const p = [0, 0, 0],
    v = [0, 0, 0];
  advanceElectron(p, v, [0, 0, 0], 0.5, [2, 0, 0]);
  near(v[0], 1);
  near(p[0], 0.25);
});
test("motional electric field conserves relative speed in uniform plasma flow", () => {
  const p = [0, 0, 0],
    v = [4, 0, 0],
    flow = [3, 0, 0];
  for (let i = 0; i < 1000; i++)
    advanceElectron(p, v, [0, 0, 2], 1 / 120, null, flow);
  near(Math.hypot(v[0] - 3, v[1], v[2]), 1);
});

test("dipole amplitude scales linearly, reverses with polarity and falls as r cubed", () => {
  const a = sampleMagneticField([4, 0, 0], center, moment, 4, 1),
    b = sampleMagneticField([8, 0, 0], center, moment, 4, 1),
    c = sampleMagneticField([4, 0, 0], center, moment, 4, 2),
    d = sampleMagneticField([4, 0, 0], center, [0, -1, 0], 4, 1);
  near(a[1], -1);
  near(b[1], a[1] / 8);
  near(c[1], a[1] * 2);
  near(d[1], -a[1]);
  assert.ok(sampleMagneticField([0, 4, 0], center, moment, 4, 1)[1] > 0);
});
test("the internal return field is finite and points south to north", () => {
  const B = sampleMagneticField(center, center, moment, 4, 1);
  assert.ok(B.every(Number.isFinite) && B[1] > 0);
  const zero = sampleMagneticField(center, center, moment, 4, 0);
  assert.ok(zero.every((x) => x === 0));
});
test("dipole field is divergence-free outside and inside the source", () => {
  for (const p of [
    [2, 3, 1],
    [4, -2, -1],
    [0.1, 0.2, 0.15],
  ]) {
    const h = 1e-5;
    let divergence = 0;
    for (let j = 0; j < 3; j++) {
      const a = [...p],
        b = [...p];
      a[j] += h;
      b[j] -= h;
      divergence +=
        (sampleMagneticField(a, center, moment, 4, 1)[j] -
          sampleMagneticField(b, center, moment, 4, 1)[j]) /
        (2 * h);
    }
    near(divergence, 0, 1e-6);
  }
});
test("normal magnetic flux is continuous through the source surface", () => {
  for (const n of [
    [1, 0, 0],
    [0, 1, 0],
    [0.6, 0.8, 0],
  ]) {
    const inside = n.map((x) => x * SOURCE_RADIUS * (1 - 1e-9)),
      outside = n.map((x) => x * SOURCE_RADIUS * (1 + 1e-9));
    const a = sampleMagneticField(inside, center, moment, 4, 1),
      b = sampleMagneticField(outside, center, moment, 4, 1);
    near(
      a.reduce((s, x, j) => s + x * n[j], 0),
      b.reduce((s, x, j) => s + x * n[j], 0),
      2e-5,
    );
  }
});
test("every visible flux loop closes through the source and links both hemispheres", () => {
  for (const r of [0.1, 1, 4, 26]) {
    const start = sampleFieldLine(r, 0.7, 0),
      end = sampleFieldLine(r, 0.7, 1);
    start.forEach((x, j) => near(x, end[j]));
    assert.ok(start[1] > 0);
    assert.ok(sampleFieldLine(r, 0.7, EXTERIOR_FRACTION)[1] < 0);
    assert.ok(Math.hypot(...sampleFieldLine(r, 0.7, 0.93)) < SOURCE_RADIUS);
  }
});
test("visible curve tangents align with the same B sampled by electrons and compasses", () => {
  for (const r of [1, 4, 26])
    for (const t of [0.08, 0.2, 0.4, 0.65, 0.8, 0.91, 0.97]) {
      const p = sampleFieldLine(r, 0.5, t),
        a = sampleFieldLine(r, 0.5, t - 1e-5),
        b = sampleFieldLine(r, 0.5, t + 1e-5),
        tangent = b.map((x, j) => x - a[j]),
        B = sampleMagneticField(p, center, moment, 4, 1);
      const cos =
        tangent.reduce((s, x, j) => s + x * B[j], 0) /
        (Math.hypot(...tangent) * Math.hypot(...B));
      assert.ok(cos > 0.99999, `${r} ${t} alignment ${cos}`);
    }
});

test("initial particles fill a varied volume instead of polar beams or a single shell", () => {
  const rand = seeded(),
    ps = Array.from({ length: 200 }, () => fresh(rand));
  const radii = ps.map((p) => Math.hypot(...p.position));
  assert.ok(new Set(radii.map((r) => r.toFixed(3))).size > 180);
  assert.ok(
    ps.filter(
      (p) => Math.hypot(p.position[0], p.position[2]) > Math.abs(p.position[1]),
    ).length > 90,
  );
  assert.ok(
    ps.every((p) => p.position.concat(p.velocity).every(Number.isFinite)),
  );
});
test("inner population speeds exceed outer speeds without magnetic work", () => {
  const speeds = [0.2, 1, 3, 6].map((d) => populationSpeed(4, d * 4));
  speeds.slice(1).forEach((v, i) => assert.ok(v < speeds[i]));
});
test("random replacements launch exactly at 2 MH and 2 M meters per second", () => {
  const rand = seeded();
  for (const radius of [1.09, 4.107028973825681, 21.44, 40.60553621054448])
    for (let i = 0; i < 100; i++) {
      const p = fresh(rand, radius);
      placeIncomingReplacement(p, center, radius, identity);
      near(Math.hypot(...p.position), reentryRadius(radius), 1e-9);
      near(Math.hypot(...p.velocity), reentrySpeed(radius), 1e-9);
      assert.ok(
        Math.abs(p.position[1]) / Math.hypot(...p.position) <= 0.85 + 1e-10,
      );
      assert.ok(p.inbound);
    }
});
test("replacement directions cover azimuth and latitude without polar concentration", () => {
  const rand = seeded(),
    octants = new Set();
  let meanY = 0;
  for (let i = 0; i < 1000; i++) {
    const p = fresh(rand);
    placeIncomingReplacement(p, center, 4, identity);
    octants.add(p.position.map(Math.sign).join(","));
    meanY += p.position[1] / 52;
  }
  assert.equal(octants.size, 8);
  assert.ok(Math.abs(meanY / 1000) < 0.04);
});
test("tilted replacement positions remain at 2 MH and avoid the tilted polar caps", () => {
  const q = [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    p = fresh();
  placeIncomingReplacement(p, [1, 2, 3], 4, q);
  const r = p.position.map((x, j) => x - [1, 2, 3][j]),
    axis = transformFieldVector(moment, q);
  near(Math.hypot(...r), 52);
  assert.ok(
    Math.abs(r.reduce((s, x, j) => s + x * axis[j], 0)) / 52 <= 0.85 + 1e-10,
  );
  near(Math.hypot(...p.velocity), 8);
});
test("inward-moving zero-field particles can cross MH and stay ballistic", () => {
  const p = fresh();
  placeIncomingReplacement(p, center, 4, identity);
  p.velocity = p.position.map((v) => (-v * 8) / 52);
  evolve(p, 0, 3.4);
  assert.equal(p.inbound, false);
  assert.ok(fieldMapDistance(p.position, center, identity) < 26);
  near(Math.hypot(...p.velocity), 8);
});
test("incoming and escaping particles respond to B, including outside MH", () => {
  for (const inbound of [true, false]) {
    const p = fresh();
    p.position = [30, 12, 2];
    p.velocity = [0, -8, 0];
    p.inbound = inbound;
    p.phase = inbound ? "free" : "released";
    p.electricCoupling = 0;
    p.scattering = false;
    evolve(p, 10, 0.5);
    near(Math.hypot(...p.velocity), 8);
    assert.ok(Math.hypot(p.velocity[0], p.velocity[2]) > 0.01);
  }
});
test("zero CLT disables magnetic and electric forces even at high rotation", () => {
  const p = fresh(),
    before = [...p.position],
    v = [...p.velocity];
  evolve(p, 0, 1, 4, 350);
  p.position.forEach((x, j) => near(x, before[j] + v[j]));
  p.velocity.forEach((x, j) => near(x, v[j]));
});
test("changing orientation changes forces without teleporting a particle", () => {
  const p = fresh();
  p.position = [8, 3, 2];
  p.velocity = [1, 2, 3];
  p.electricCoupling = 0;
  p.scattering = false;
  const before = [...p.position];
  advanceFieldParticle(
    p,
    center,
    4,
    1,
    [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    0,
    1 / 120,
  );
  assert.ok(Math.hypot(...p.position.map((x, j) => x - before[j])) < 0.05);
});
test("adaptive full-particle magnetic integration conserves speed in a nonuniform dipole", () => {
  const p = fresh();
  p.electricCoupling = 0;
  p.scattering = false;
  const speed = Math.hypot(...p.velocity);
  evolve(p, 10, 8);
  near(Math.hypot(...p.velocity), speed, 1e-8);
});
test("magnetic mirror bouncing emerges from the Lorentz solver without prescribed paths", () => {
  const p = fresh();
  p.position = [4, 0, 0];
  p.velocity = [5.2, 3, 0];
  p.electricCoupling = 0;
  p.scattering = false;
  let maxY = 0;
  for (let i = 0; i < 2400; i++) {
    advanceFieldParticle(p, center, 4, 10, identity, 0, 1 / 120);
    maxY = Math.max(maxY, Math.abs(p.position[1]));
  }
  assert.ok(p.mirrorCount > 10, `mirrors ${p.mirrorCount}`);
  assert.ok(maxY < 1.2);
  near(Math.hypot(...p.velocity), Math.hypot(5.2, 3), 1e-8);
});
test("field strength increases the magnetized population", () => {
  const run = (I) => {
    const rand = seeded();
    const ps = Array.from({ length: 64 }, () => fresh(rand));
    for (const p of ps) evolve(p, I, 2);
    return ps.filter((p) => p.phase === "captured").length;
  };
  assert.ok(run(10) > run(0.02));
});
test("stronger B invokes additional integration steps", () => {
  const a = fresh(),
    b = fresh();
  for (const p of [a, b]) {
    p.position = [4, 0, 0];
    p.velocity = [1, 2, 3];
    p.electricCoupling = 0;
    p.scattering = false;
  }
  advanceFieldParticle(a, center, 4, 0.1, identity, 0, 1 / 120);
  advanceFieldParticle(b, center, 4, 50, identity, 0, 1 / 120);
  assert.ok(b.substeps > a.substeps);
});
test("electric capture acceleration vanishes with zero field strength", () => {
  const a = [0, 0, 0],
    u = [0, 0, 0];
  sampleElectricMotion([4, 2, 1], center, 4, 0, 12, moment, a, u);
  assert.ok(a.every((x) => x === 0)); // no magnetic force couples u when B=0
});
test("scattering rotates velocity without adding kinetic energy", () => {
  const p = fresh();
  p.electricCoupling = 0;
  p.scatterTime = 0;
  const speed = Math.hypot(...p.velocity);
  advanceFieldParticle(p, center, 4, 1, identity, 0, 1 / 120);
  near(Math.hypot(...p.velocity), speed, 1e-9);
});
test("extreme supported radius, speed, intensity and rotation remain finite", () => {
  for (const radius of [1.09, 4.107, 40.606]) {
    const p = {};
    initializeFieldParticle(p, center, radius, identity, 3, seeded());
    evolve(p, 50, 3, radius, 350);
    assert.ok(p.position.concat(p.velocity).every(Number.isFinite));
    assert.ok(p.substeps <= 64);
  }
});

test("all field components and their radial derivatives match across the source", () => {
  for (const n of [
    [1, 0, 0],
    [0, 1, 0],
    [0.6, 0.8, 0],
  ]) {
    const h = 1e-6,
      at = (r) =>
        sampleMagneticField(
          n.map((x) => x * r),
          center,
          moment,
          4,
          1,
        );
    const a = at(SOURCE_RADIUS - h),
      b = at(SOURCE_RADIUS),
      c = at(SOURCE_RADIUS + h);
    for (let j = 0; j < 3; j++) {
      near(a[j], c[j], 0.004);
      near((b[j] - a[j]) / h, (c[j] - b[j]) / h, 0.035);
    }
  }
});
test("source return paths curve inward instead of using a straight vertical connector", () => {
  for (const r of [0.1, 1, 4, 26, 266]) {
    const foot = sampleFieldLine(r, 0, EXTERIOR_FRACTION);
    const middle = sampleFieldLine(r, 0, (1 + EXTERIOR_FRACTION) / 2);
    assert.ok(middle[0] < foot[0] * 0.7, `${r}: ${middle[0]} vs ${foot[0]}`);
    near(middle[1], 0, 1e-9);
    for (let i = 1; i < 25; i++) {
      const t = EXTERIOR_FRACTION + ((1 - EXTERIOR_FRACTION) * i) / 25;
      const p = sampleFieldLine(r, 0, t),
        a = sampleFieldLine(r, 0, t - 1e-5),
        b = sampleFieldLine(r, 0, t + 1e-5);
      const B = sampleMagneticField(p, center, moment, 4, 1),
        d = b.map((x, j) => x - a[j]);
      assert.ok(
        d.reduce((sum, x, j) => sum + x * B[j], 0) /
          (Math.hypot(...d) * Math.hypot(...B)) >
          0.9999,
      );
      assert.ok(Math.hypot(...p) <= SOURCE_RADIUS + 1e-6);
    }
  }
});
test("tight gyromotion retains the exact phase and displacement at arbitrary field strength", () => {
  for (const strength of [1, 1e3, 1e7]) {
    const p = [0, 0, 0],
      v = [1, 0, 0.5],
      dt = 1 / 120,
      omega = -5 * strength,
      angle = omega * dt;
    advanceElectron(p, v, [0, 0, strength], dt);
    near(v[0], Math.cos(angle), 1e-10);
    near(v[1], -Math.sin(angle), 1e-10);
    near(p[0], Math.sin(angle) / omega, 1e-12);
    near(p[1], (Math.cos(angle) - 1) / omega, 1e-12);
    near(p[2], 0.5 * dt);
  }
});
test("band and pole wells attract gradually from both sides without position changes", () => {
  for (const [p, j, sign] of [
    [[3.5, 0, 0], 0, 1],
    [[4.3, 0, 0], 0, -1],
    [[6.2, 0, 0], 0, 1],
    [[7.5, 0, 0], 0, -1],
    [[0, 0.6, 0], 1, 1],
    [[0, 1, 0], 1, -1],
    [[0, -0.6, 0], 1, -1],
  ]) {
    const original = [...p],
      a = [0, 0, 0],
      u = [0, 0, 0];
    sampleElectricMotion(p, center, 4, 1, 0, moment, a, u, 2);
    assert.ok(a[j] * sign > 0, `${p} acceleration ${a}`);
    assert.deepEqual(p, original);
  }
});
test("attraction control scales electric capture and can disable it", () => {
  const p = [2.7, 0.3, 1.1],
    a = [0, 0, 0],
    b = [0, 0, 0],
    off = [0, 0, 0],
    flow = [0, 0, 0];
  sampleElectricMotion(p, center, 4, 1, 0, moment, a, flow, 1);
  sampleElectricMotion(p, center, 4, 1, 0, moment, b, flow, 3);
  sampleElectricMotion(p, center, 4, 1, 0, moment, off, flow, 0);
  for (let j = 0; j < 3; j++) {
    near(b[j], 3 * a[j]);
    near(off[j], 0);
  }
});

test("replacement launch directions are isotropic and independent of spawn position", () => {
  const rand = seeded(312),
    mean = [0, 0, 0],
    octants = new Set();
  let inward = 0,
    radialMean = 0,
    polar = 0;
  for (let i = 0; i < 4000; i++) {
    const p = fresh(rand);
    placeIncomingReplacement(p, center, 4, identity);
    const radial =
      p.position.reduce((sum, v, j) => sum + v * p.velocity[j], 0) / (52 * 8);
    inward += radial < 0;
    radialMean += radial;
    p.velocity.forEach((v, j) => (mean[j] += v / 8));
    octants.add(p.velocity.map(Math.sign).join(","));
    if (Math.abs(p.velocity[1] / 8) > 0.9) polar++;
  }
  assert.equal(octants.size, 8);
  assert.ok(inward > 1800 && inward < 2200);
  assert.ok(Math.abs(radialMean / 4000) < 0.04);
  mean.forEach((v) => assert.ok(Math.abs(v / 4000) < 0.04));
  assert.ok(polar > 300 && polar < 500);
});

test("random replacement directions stay ballistic without fields", () => {
  const p = fresh();
  placeIncomingReplacement(p, center, 4, identity);
  const position = [...p.position],
    velocity = [...p.velocity];
  evolve(p, 0, 1);
  p.position.forEach((v, i) => near(v, position[i] + velocity[i]));
  p.velocity.forEach((v, i) => near(v, velocity[i]));
});

test("outward replacement recycling has room to travel beyond the spawn shell", () => {
  assert.equal(outsideReplacementBoundary([52, 0, 0], center, 4), false);
  assert.equal(outsideReplacementBoundary([104, 0, 0], center, 4), false);
  assert.equal(outsideReplacementBoundary([104.01, 0, 0], center, 4), true);
  assert.equal(outsideReplacementBoundary([54, 1, -3], [2, 1, -3], 4), false);
});

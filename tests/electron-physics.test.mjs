import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceElectron, sampleMagneticField } from '../electron-physics.mjs';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test('zero field produces straight-line motion', () => {
  const position = [1, 2, 3], velocity = [2, -1, 0.5];
  advanceElectron(position, velocity, [0, 0, 0], 0.4);
  position.forEach((value, i) => near(value, [1.8, 1.6, 3.2][i]));
  assert.deepEqual(velocity, [2, -1, 0.5]);
});

test('negative charge bends opposite to v cross B and reversing B reverses bending', () => {
  const positiveFieldVelocity = [1, 0, 0], negativeFieldVelocity = [1, 0, 0];
  advanceElectron([0, 0, 0], positiveFieldVelocity, [0, 0, 1], 0.01);
  advanceElectron([0, 0, 0], negativeFieldVelocity, [0, 0, -1], 0.01);
  assert.ok(positiveFieldVelocity[1] > 0);
  near(positiveFieldVelocity[0], negativeFieldVelocity[0]);
  near(positiveFieldVelocity[1], -negativeFieldVelocity[1]);
});

test('magnetic force preserves speed over long runs, including strong fields', () => {
  for (const strength of [0.1, 10, 1000]) {
    const position = [0, 0, 0], velocity = [1.2, -0.3, 0.8];
    const speed = Math.hypot(...velocity);
    for (let i = 0; i < 10000; i += 1) advanceElectron(position, velocity, [0, 0, strength], 1 / 120);
    near(Math.hypot(...velocity), speed, 1e-9);
    near(velocity[2], 0.8);
    assert.ok(position.every(Number.isFinite));
  }
});

test('parallel velocity is unaffected by the magnetic field', () => {
  const position = [0, 0, 0], velocity = [0, 2, 0];
  advanceElectron(position, velocity, [0, 30, 0], 0.5);
  assert.deepEqual(velocity, [0, 2, 0]);
  assert.deepEqual(position, [0, 1, 0]);
});

test('dipole field tracks strength, polarity, distance and rotation', () => {
  const center = [0, 0.82, 0], moment = [0, 1, 0];
  const equator = sampleMagneticField([4, 0.82, 0], center, moment, 4, 1, [0, 0, 0]);
  assert.ok(equator[1] < 0);
  const pole = sampleMagneticField([0, 4.82, 0], center, moment, 4, 1, [0, 0, 0]);
  assert.ok(pole[1] > 0);
  const stronger = sampleMagneticField([4, 0.82, 0], center, moment, 4, 2, [0, 0, 0]);
  near(stronger[1], equator[1] * 2);
  const flipped = sampleMagneticField([4, 0.82, 0], center, [0, -1, 0], 4, 1, [0, 0, 0]);
  near(flipped[1], -equator[1]);
  const far = sampleMagneticField([8, 0.82, 0], center, moment, 4, 1, [0, 0, 0]);
  assert.ok(Math.abs(far[1]) < Math.abs(equator[1]));
  const rotated = sampleMagneticField([0, 4.82, 0], center, [-1, 0, 0], 4, 1, [0, 0, 0]);
  near(rotated[0], -equator[1]);
  const core = sampleMagneticField(center, center, moment, 4, 50, [0, 0, 0]);
  assert.ok(core.every(Number.isFinite));
  const zero = sampleMagneticField([4, 0.82, 0], center, moment, 4, 0, [0, 0, 0]);
  assert.ok(zero.every(value => value === 0));
});

const { advanceFieldParticle } = await import('../electron-physics.mjs');
const particleAt = (position, velocity = [0, 0, 0]) => ({
  position: [...position], velocity: [...velocity], carriedVelocity: [0, 0, 0],
  phase: 'free', launchSpeed: 0.65, releaseCooldown: 0,
});
const evolve = (particle, intensity, rpm, seconds, radius = 4, center = [0, 0, 0], axis = [0, 1, 0]) => {
  const field = [0, 0, 0];
  for (let i = 0; i < seconds * 120; i += 1) {
    advanceFieldParticle(particle, center, axis, radius, intensity, axis, rpm * Math.PI * 2 / 60, 1 / 120, field);
  }
};

test('zero field leaves a free particle unconfined even at high RPM', () => {
  const p = particleAt([4, 0, 0], [1, 0.5, 0]);
  evolve(p, 0, 350, 1);
  near(p.position[0], 5); near(p.position[1], 0.5);
  assert.deepEqual(p.velocity, [1, 0.5, 0]);
  assert.equal(p.phase, 'free');
});

test('strong fields capture more particles and hold them closer to the center', () => {
  const run = intensity => {
    const particles = Array.from({ length: 24 }, (_, i) => {
      const angle = i * Math.PI / 12;
      return particleAt([Math.cos(angle) * 5, (i % 3 - 1) * 0.7, Math.sin(angle) * 5], [0.2, 0.1, 0.2]);
    });
    particles.forEach(p => evolve(p, intensity, 120, 8));
    return { count: particles.filter(p => p.phase === 'captured').length, meanRadius: particles.reduce((sum, p) => sum + Math.hypot(...p.position), 0) / particles.length };
  };
  const weak = run(0.02), normal = run(1), strong = run(10);
  assert.ok(normal.count > weak.count);
  assert.ok(strong.count >= normal.count);
  assert.ok(strong.meanRadius < normal.meanRadius);
  assert.ok(normal.meanRadius < weak.meanRadius);
});

test('captured particles co-rotate faster at higher RPM and around the chosen axis', () => {
  const slow = particleAt([1.5, 0, 0]), fast = particleAt([1.5, 0, 0]);
  slow.phase = fast.phase = 'captured';
  evolve(slow, 1, 0, 0.05);
  evolve(fast, 1, 120, 0.05);
  assert.ok(Math.abs(fast.position[2]) > Math.abs(slow.position[2]) + 0.1);
  const tilted = particleAt([0, 1.5, 0]);
  tilted.phase = 'captured';
  evolve(tilted, 1, 120, 0.05, 4, [0,0,0], [-1,0,0]);
  assert.ok(Math.abs(tilted.position[2]) > 0.1);
});

test('weakening the field releases captured particles with their rotational motion', () => {
  const p = particleAt([1.5, 0, 0]);
  p.phase = 'captured';
  evolve(p, 1, 120, 0.1);
  const beforeSpeed = Math.hypot(...p.velocity);
  evolve(p, 0, 120, 0.05);
  assert.equal(p.phase, 'released');
  assert.ok(Math.hypot(...p.velocity) > beforeSpeed + 1);
  const speed = Math.hypot(...p.velocity);
  evolve(p, 0, 350, 1);
  near(Math.hypot(...p.velocity), speed);
  assert.equal(p.phase, 'released');
});

test('capture has no forced lifetime and remains stable at maximum strength and RPM', () => {
  for (const radius of [0.01, 4, 250]) {
    const p = particleAt([radius * 0.4, 0, 0]);
    p.phase = 'captured';
    evolve(p, 50, 350, 30, radius);
    assert.ok(p.position.concat(p.velocity).every(Number.isFinite));
    assert.equal(p.phase, 'captured');
    assert.ok(Math.hypot(...p.position) < radius);
  }
});

test('capture acts between rendered curves and outside the M band', () => {
  const p = particleAt([7.25, 1.13, -3.54], [0,0,0]);
  const before = Math.hypot(...p.position);
  evolve(p, 1, 120, 1);
  assert.ok(Math.hypot(...p.position) < before);
  evolve(p, 1, 120, 8);
  assert.equal(p.phase, 'captured');
});

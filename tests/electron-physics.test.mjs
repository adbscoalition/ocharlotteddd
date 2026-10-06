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

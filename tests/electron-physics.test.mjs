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

const { advanceFieldParticle, initializeFieldParticle, guidingSpeed } = await import('../electron-physics.mjs');
const { sampleFieldLine, buildFieldLineArc, fieldLineParameter, particleBand, transformFieldVector } = await import('../field-lines.mjs');
const identity = [0,0,0,1];
const seeded = (seed = 42) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const fresh = (random = seeded()) => { const p = {}; initializeFieldParticle(p,[0,0,0],4,identity,1,random); return p; };
const guided = (band = 3, fraction = 0.3) => {
  const p = fresh();
  p.guideBand = band; p.guideRadius = 4 * [0.045,0.2,0.5,1,1.7,3.5,4.5,6.5][band];
  p.arc = buildFieldLineArc(p.guideRadius,p.phi); p.lineDistance = p.arc[64] * fraction;
  p.lineDirection = 1; p.phase = 'captured'; p.gyroScale = 0; p.pitch = 0.8;
  p.pitchTarget = 0.8; p.driftRate = 0; p.speedSpread = 1; p.scatterTime = 100;
  sampleFieldLine(p.guideRadius,p.phi,fieldLineParameter(p.arc,p.lineDistance),p.local);
  p.position = [...p.local];
  return p;
};
const evolve = (p,intensity,seconds,rpm=0,radius=4) => {
  for(let i=0;i<seconds*120;i++) {
    const angle=i/120*rpm*Math.PI*2/60;
    const q=[0,Math.sin(angle/2),0,Math.cos(angle/2)];
    advanceFieldParticle(p,[0,0,0],radius,intensity,q,rpm*Math.PI*2/60,1/120);
  }
};

test('polar inlets launch near both magnetic poles rather than a sphere',()=>{
  const random=seeded(); let north=0,south=0;
  for(let i=0;i<100;i++) {
    const p=fresh(random);
    assert.ok(Math.hypot(p.position[0],p.position[2]) <= 4*0.5);
    assert.ok(Math.abs(p.position[1]) > 0.72+4*0.5);
    if(p.entryPole>0)north++;else south++;
  }
  assert.ok(north>20 && south>20);
});

test('particles enter via a pole and are captured onto a field guide',()=>{
  const p=fresh(); const pole=p.entryPole;
  for(let i=0;i<1200 && p.phase!=='captured';i++)advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  assert.equal(p.phase,'captured');
  assert.equal(p.lineDirection,pole);
  assert.ok(Math.hypot(p.position[0],p.position[1]-pole*0.72,p.position[2])<0.3);
});

test('guided motion follows the exact visible curve family and its tangent',()=>{
  const p=guided(); const before=[...p.position];
  advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  const t=fieldLineParameter(p.arc,p.lineDistance);
  const expected=sampleFieldLine(p.guideRadius,p.phi,t);
  p.position.forEach((value,i)=>near(value,expected[i]));
  const a=sampleFieldLine(p.guideRadius,p.phi,t-0.001), b=sampleFieldLine(p.guideRadius,p.phi,t+0.001);
  const direction=p.position.map((v,i)=>v-before[i]);
  const tangent=b.map((v,i)=>v-a[i]);
  const dot=direction.reduce((sum,v,i)=>sum+v*tangent[i],0)/(Math.hypot(...direction)*Math.hypot(...tangent));
  assert.ok(dot>0.999);
});

test('particles exchange bands continuously at pole reflections',()=>{
  const p=guided(4,0.9999); p.random=()=>0.8; const oldBand=p.guideBand;
  advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  assert.equal(p.phase,'captured'); assert.notEqual(p.guideBand,oldBand);
  assert.equal(p.lineDirection,-1); assert.equal(p.visits,1);
  assert.ok(Math.hypot(p.position[0],p.position[1]+0.72,p.position[2])<0.2);
});

test('loss-cone particles eject outward through a pole',()=>{
  const p=guided(3,0.9999); p.pitch=0.08; p.random=()=>0.2;
  advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  assert.equal(p.phase,'released'); assert.equal(p.ejectionReason,'loss_cone');
  assert.ok(p.velocity[1]<0);
  const before=p.position[1]; evolve(p,1,0.5);
  assert.ok(p.position[1]<before);
});

test('weakening confinement ejects particles where they are without teleporting',()=>{
  const p=guided(6,0.4);
  advanceFieldParticle(p,[0,0,0],4,1,identity,12,1/120);
  const before=[...p.position], velocity=[...p.velocity];
  advanceFieldParticle(p,[0,0,0],4,0,identity,12,1/120);
  assert.equal(p.phase,'released'); assert.equal(p.ejectionReason,'weak_field');
  p.position.forEach((v,i)=>near(v,before[i]+velocity[i]/120));
});

test('zero field leaves free particles ballistic even at high RPM',()=>{
  const p=fresh(), before=[...p.position], velocity=[...p.velocity];
  evolve(p,0,1,350);
  assert.equal(p.phase,'free');
  p.position.forEach((v,i)=>near(v,before[i]+velocity[i]));
});

test('field rotation and universal tilt transform guide paths and retain spin velocity',()=>{
  const p=guided(3,0.3), q=[0,0,Math.sin(Math.PI/4),Math.cos(Math.PI/4)];
  advanceFieldParticle(p,[1,2,3],4,1,q,12,1/120,[-1,0,0]);
  const point=transformFieldVector(p.local,q);
  p.position.forEach((v,i)=>near(v,point[i]+[1,2,3][i]));
  assert.ok(p.velocity.every(Number.isFinite));
  const stationary=guided(), rotating=guided();
  advanceFieldParticle(stationary,[0,0,0],4,1,identity,0,1/120);
  advanceFieldParticle(rotating,[0,0,0],4,1,identity,12,1/120);
  assert.ok(Math.hypot(...rotating.velocity)>Math.hypot(...stationary.velocity));
});

test('band readouts change as a particle travels along an outer guide',()=>{
  const pole=sampleFieldLine(18,0,0), equator=sampleFieldLine(18,0,0.5);
  assert.equal(particleBand(pole,[0,0,0],[0,1,0],4),0);
  assert.equal(particleBand(equator,[0,0,0],[0,1,0],4),6);
  const q=[0,0,Math.SQRT1_2,Math.SQRT1_2], rotated=transformFieldVector(equator,q);
  assert.equal(particleBand(rotated,[0,0,0],[-1,0,0],4),6);
});

test('strength changes retention and guided particles span multiple bands',()=>{
  const run=intensity=>{
    const random=seeded(); const ps=Array.from({length:64},()=>fresh(random));
    ps.forEach(p=>evolve(p,intensity,12,120));
    return {captured:ps.filter(p=>p.phase==='captured').length, bands:new Set(ps.filter(p=>p.phase==='captured').map(p=>particleBand(p.position,[0,0,0],[0,1,0],4)))};
  };
  const weak=run(.02), normal=run(1), strong=run(10);
  assert.ok(normal.captured>weak.captured); assert.ok(strong.captured>=normal.captured);
  assert.ok(normal.bands.size>=5);
});

test('transport remains finite at extreme radius, strength, speed and rotation',()=>{
  for(const radius of [.01,4,250]){
    const p={};initializeFieldParticle(p,[0,0,0],radius,identity,3,seeded());
    evolve(p,50,10,350,radius);
    assert.ok(p.position.concat(p.velocity).every(Number.isFinite));
  }
});

const { placeIncomingReplacement } = await import('../electron-physics.mjs');
const { fieldMapDistance } = await import('../field-lines.mjs');

test('replacements start exactly 100 meters beyond the polar MH surface at 15 m/s',()=>{
  const center=[1,2,3],radius=4,q=[0,0,Math.SQRT1_2,Math.SQRT1_2];
  const p=fresh();
  placeIncomingReplacement(p,center,radius,q);
  const distance=Math.hypot(...p.position.map((v,i)=>v-center[i]));
  near(distance-radius*6.5*1.45,100);
  near(Math.hypot(...p.velocity),15);
  const direction=p.position.map((v,i)=>v-center[i]);
  assert.ok(direction.reduce((sum,v,i)=>sum+v*p.velocity[i],0)<0);
  assert.ok(p.inbound);
});

test('inbound replacements travel 15 meters in one second without respawning or entering capture early',()=>{
  const p=fresh(); placeIncomingReplacement(p,[0,0,0],4,identity);
  const before=[...p.position];
  evolve(p,1,1,0);
  near(Math.hypot(...p.position.map((v,i)=>v-before[i])),15);
  assert.ok(p.inbound); assert.equal(p.phase,'free');
  near(Math.hypot(...p.velocity),15);
});

test('an inbound replacement joins polar capture after crossing the MH boundary',()=>{
  const p=fresh(); placeIncomingReplacement(p,[0,0,0],4,identity);
  const before=fieldMapDistance(p.position,[0,0,0],identity);
  assert.ok(before>26);
  evolve(p,1,7,0);
  assert.equal(p.inbound,false);
  assert.ok(fieldMapDistance(p.position,[0,0,0],identity)<26);
  p.pitch=0.8; evolve(p,1,6,0);
  assert.equal(p.phase,'captured');
});


test('a pole reflection can keep the particle on the same band',()=>{
  const p=guided(4,0.9999); p.random=()=>0.2;
  const band=p.guideBand, guide=p.guideRadius;
  advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  assert.equal(p.phase,'captured'); assert.equal(p.guideBand,band); near(p.guideRadius,guide);
  assert.equal(p.lastOutcome,'stay'); assert.equal(p.lineDirection,-1);
});

test('some pole encounters eject in a random direction',()=>{
  const p=guided(3,0.9999); p.pitch=0.08; p.random=()=>0.9;
  advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  assert.equal(p.phase,'released'); assert.equal(p.ejectionRoute,'random');
  assert.ok(Math.hypot(p.velocity[0],p.velocity[2])>1);
});

test('most ejections are polar while a minority have random directions',()=>{
  const random=seeded(123); let polar=0,other=0;
  for(let i=0;i<1000;i++) {
    const p=guided(3,0.9999); p.pitch=0.08; p.random=random;
    advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
    if(p.ejectionRoute==='pole')polar++;else other++;
  }
  assert.ok(polar>700&&polar<900); assert.ok(other>100&&other<300);
});

test('inner populations travel faster than outer populations with equal launch settings',()=>{
  const speeds=[];
  for(let band=0;band<8;band++) {
    const p=guided(band,0.5),before=p.lineDistance;
    speeds.push(guidingSpeed(p,4));
    advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
    near((p.lineDistance-before)*120,speeds[band],1e-9);
  }
  speeds.slice(1).forEach((v,i)=>assert.ok(v<speeds[i]));
  assert.ok(speeds[0]>3*speeds[7]);
});

test('ejected electrons still bend magnetically without gaining kinetic energy',()=>{
  const p=fresh();p.phase='released';p.position=[4,0,0];p.velocity=[0,0,5];
  evolve(p,1,0.5);
  near(Math.hypot(...p.velocity),5,1e-10);
  assert.ok(Math.abs(p.velocity[0])>1);
  assert.ok(Math.abs(p.position[0]-4)>0.1);
});

test('off-axis replacements respond to B before crossing the map boundary',()=>{
  const p=fresh();p.inbound=true;p.position=[30,12,2];p.velocity=[0,-15,0];
  evolve(p,10,0.5);
  assert.ok(p.inbound);
  near(Math.hypot(...p.velocity),15,1e-10);
  assert.ok(Math.hypot(p.velocity[0],p.velocity[2])>0.01);
});

test('pitch scattering changes gradually and does not jitter particle positions',()=>{
  const p=guided(3,0.5);p.scatterTime=0;p.random=()=>0.1;
  const before=p.pitch,position=[...p.position];
  advanceFieldParticle(p,[0,0,0],4,1,identity,0,1/120);
  assert.ok(p.pitch<before&&p.pitch>before-0.01);
  assert.ok(Math.hypot(...p.position.map((v,i)=>v-position[i]))<0.2);
  assert.ok(p.scatterTime>0);
});

test('gyro motion tightens and rotates faster in a stronger field',()=>{
  const run=intensity=>{
    const p=guided(3,0.5);p.gyroScale=0.02;const phase=p.gyroPhase;
    advanceFieldParticle(p,[0,0,0],4,intensity,identity,0,1/120);
    const guide=sampleFieldLine(p.guideRadius,p.phi,fieldLineParameter(p.arc,p.lineDistance));
    return {radius:Math.hypot(...p.local.map((v,i)=>v-guide[i])),angle:Math.abs(p.gyroPhase-phase)};
  };
  const weak=run(0.2),strong=run(10);
  assert.ok(strong.radius<weak.radius);assert.ok(strong.angle>weak.angle);
});

test('invisible guide radii and orbital phases form a varied continuous population',()=>{
  const random=seeded(24),ps=Array.from({length:128},()=>fresh(random));
  for(const p of ps){p.pitch=0.8;p.pitchTarget=0.8;evolve(p,1,5);}
  const captured=ps.filter(p=>p.phase==='captured');
  assert.ok(captured.length>80);
  assert.ok(new Set(captured.map(p=>p.guideRadius.toFixed(4))).size>80);
  assert.ok(new Set(captured.map(p=>p.phi.toFixed(3))).size>80);
});

test('released velocity matches actual world displacement through rotating guides',()=>{
  const p=guided(4,0.4),before=[...p.position],dt=1/120,angle=12*dt;
  const q=[0,Math.sin(angle/2),0,Math.cos(angle/2)];
  advanceFieldParticle(p,[0,0,0],4,1,q,12,dt);
  p.velocity.forEach((v,i)=>near(v,(p.position[i]-before[i])/dt));
  const atRelease=[...p.position],velocity=[...p.velocity];
  advanceFieldParticle(p,[0,0,0],4,0,q,12,dt);
  p.position.forEach((v,i)=>near(v,atRelease[i]+velocity[i]*dt));
});

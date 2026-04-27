import * as THREE from "three";
import { OrbitControls } from "../vendor/OrbitControls.js";

const BAND_CONFIG = [
  { id: "ns", label: "NS", name: "Polar", multiplier: 0.045, color: "#ff2f2f", opacity: 0.78 },
  { id: "ce", label: "CE", name: "Central Extreme", multiplier: 0.2, color: "#ff8a1c", opacity: 0.7 },
  { id: "e", label: "E", name: "Extreme", multiplier: 0.5, color: "#ffd84d", opacity: 0.62 },
  { id: "m", label: "M", name: "Maximum", multiplier: 1, color: "#45df75", opacity: 0.72 },
  { id: "ps", label: "PS", name: "Plasmasphere", multiplier: 1.7, color: "#37e1ea", opacity: 0.5 },
  { id: "ms", label: "MS", name: "Magnetosphere", multiplier: 3.5, color: "#3e7bff", opacity: 0.42 },
  { id: "mp", label: "MP", name: "Magnetopause", multiplier: 4.5, color: "#a75cff", opacity: 0.36 },
  { id: "mh", label: "MH", name: "Magnetosheath", multiplier: 6.5, color: "#35105f", opacity: 0.3 },
];

const DEFAULTS = {
  clt: 1000,
  mBand: 4,
  rpm: 120,
  flips: 0.3,
  tilt: 13,
};

const FIELD_CENTER_Y = 0.82;
const MIN_CAMERA_RADIUS = 5.5;
const VISUAL_ROTATION_GAIN = 1;
const FIELD_Y_SCALE = 1.45;
const FIELD_XZ_SCALE = 1;
const POLE_DISTANCE = 0.72;
const DUST_COUNT = 420;
const FLIP_FLASH_SECONDS = 1.2;
const FOG_BANDS = new Set(["ns", "ce", "e", "m", "ps", "ms", "mp", "mh"]);

const elements = {
  appShell: document.querySelector("#appShell"),
  canvas: document.querySelector("#scene"),
  simStage: document.querySelector(".sim-stage"),
  cltInput: document.querySelector("#cltInput"),
  mBandInput: document.querySelector("#mBandInput"),
  rpmRange: document.querySelector("#rpmRange"),
  rpmInput: document.querySelector("#rpmInput"),
  flipsRange: document.querySelector("#flipsRange"),
  flipsInput: document.querySelector("#flipsInput"),
  flipNowButton: document.querySelector("#flipNowButton"),
  fullscreenButton: document.querySelector("#fullscreenButton"),
  menuToggleButton: document.querySelector("#menuToggleButton"),
  tiltRange: document.querySelector("#tiltRange"),
  tiltInput: document.querySelector("#tiltInput"),
  resetButton: document.querySelector("#resetButton"),
  legend: document.querySelector("#legend"),
  polarityStatus: document.querySelector("#polarityStatus"),
  microteslaReadout: document.querySelector("#microteslaReadout"),
  tungstenReadout: document.querySelector("#tungstenReadout"),
  fieldScaleReadout: document.querySelector("#fieldScaleReadout"),
  viewerBandReadout: document.querySelector("#viewerBandReadout"),
  localCltReadout: document.querySelector("#localCltReadout"),
  scaleNote: document.querySelector("#scaleNote"),
};

let state = { ...DEFAULTS };
let fieldLines = [];
let fieldShells = [];
let tracers = [];
let fieldCurves = [];
let polarityPositive = true;
let lastFlipBucket = 0;
let lastFlipAt = -999;
let currentDisplayRadius = 6.5;
let flipStartRotation = 0;
let flipTargetRotation = 0;
let flipStartedAt = -999;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x111211, 10, 28);

const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 100);
camera.position.set(4.6, 2.45, 5.85);

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.9;
controls.maxDistance = 14;
controls.target.set(0, FIELD_CENTER_Y, 0);

const fieldGroup = new THREE.Group();
const flipGroup = new THREE.Group();
const lineGroup = new THREE.Group();
const shellGroup = new THREE.Group();
const tracerGroup = new THREE.Group();
const vfxGroup = new THREE.Group();
fieldGroup.position.y = FIELD_CENTER_Y;
fieldGroup.add(flipGroup);
flipGroup.add(shellGroup, lineGroup, tracerGroup, vfxGroup);
scene.add(fieldGroup);

const modelGroup = createFemaleModel();
scene.add(modelGroup);

const capNorth = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0x5a0505, roughness: 0.5 }),
);
const capSouth = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 24, 16),
  new THREE.MeshStandardMaterial({ color: 0x4f83ff, emissive: 0x071d58, roughness: 0.5 }),
);
flipGroup.add(capNorth, capSouth);

const dust = createDustCloud();
flipGroup.add(dust.points);

const flipWave = new THREE.Mesh(
  new THREE.SphereGeometry(1, 72, 36),
  new THREE.MeshBasicMaterial({
    color: 0xf6fbff,
    transparent: true,
    opacity: 0,
    wireframe: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
vfxGroup.add(flipWave);

const axisBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.018, 0.018, 2.5, 16, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xe8fff2,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
flipGroup.add(axisBeam);

scene.add(new THREE.HemisphereLight(0xfff4dd, 0x26292b, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.9);
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x61ffbb, 9, 9);
rimLight.position.set(-3, 1.5, -2);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CylinderGeometry(96, 96, 0.22, 160),
  new THREE.MeshStandardMaterial({
    color: 0x171917,
    metalness: 0.04,
    roughness: 0.86,
  }),
);
floor.position.y = -0.18;
scene.add(floor);

const grid = new THREE.GridHelper(70, 70, 0x5a665b, 0x373b38);
grid.material.transparent = true;
grid.material.opacity = 0.11;
scene.add(grid);

renderLegend();
bindControls();
syncInputs();
updateField();
resize();
window.addEventListener("resize", resize);

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;
  const radiansPerSecond = ((state.rpm * Math.PI * 2) / 60) * VISUAL_ROTATION_GAIN;
  fieldGroup.rotation.y += radiansPerSecond * delta;

  updateFlipRotation(elapsed);
  updatePolarity(elapsed);
  updateVfx(elapsed);
  updateViewerFieldReadout();
  controls.update();
  renderer.render(scene, camera);
});

function createFemaleModel() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd4a077, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x1f1510, roughness: 0.6 });
  const top = new THREE.MeshStandardMaterial({ color: 0x334c44, roughness: 0.58 });
  const skirtMat = new THREE.MeshStandardMaterial({ color: 0x8a3f63, roughness: 0.62 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x171615, roughness: 0.66 });

  const hips = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 18), skirtMat);
  hips.scale.set(1.28, 0.55, 0.72);
  hips.position.y = 0.76;
  group.add(hips);

  const waist = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.16, 8, 24), top);
  waist.scale.set(0.92, 1, 0.72);
  waist.position.y = 0.92;
  group.add(waist);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.145, 0.34, 10, 32), top);
  torso.scale.set(1.05, 1, 0.68);
  torso.position.y = 1.07;
  group.add(torso);

  const shoulder = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.42, 6, 18), top);
  shoulder.rotation.z = Math.PI / 2;
  shoulder.position.y = 1.23;
  group.add(shoulder);

  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.38, 48, 1, true), skirtMat);
  skirt.position.y = 0.72;
  skirt.rotation.x = Math.PI;
  group.add(skirt);

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.09, 6, 18), skin);
  neck.position.y = 1.34;
  group.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 36, 24), skin);
  head.scale.set(0.9, 1.08, 0.88);
  head.position.y = 1.46;
  group.add(head);

  const face = new THREE.Mesh(new THREE.SphereGeometry(0.096, 32, 18), skin);
  face.scale.set(0.9, 0.94, 0.34);
  face.position.set(0, 1.45, 0.074);
  group.add(face);

  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.137, 36, 20), hair);
  hairCap.scale.set(1.02, 1.1, 0.98);
  hairCap.position.set(0, 1.48, -0.012);
  group.add(hairCap);

  const hairBack = new THREE.Mesh(new THREE.CapsuleGeometry(0.073, 0.23, 8, 20), hair);
  hairBack.scale.set(0.85, 1, 0.62);
  hairBack.position.set(0, 1.36, -0.09);
  group.add(hairBack);

  const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.075, 24, 14), hair);
  fringe.scale.set(1.15, 0.48, 0.42);
  fringe.position.set(0.035, 1.525, 0.065);
  group.add(fringe);

  addCapsule(group, { x: -0.09, y: 0.39, z: 0.015 }, 0.045, 0.62, dark, { z: 0.035 });
  addCapsule(group, { x: 0.09, y: 0.39, z: 0.015 }, 0.045, 0.62, dark, { z: -0.035 });
  addCapsule(group, { x: -0.28, y: 1.02, z: 0.005 }, 0.03, 0.52, skin, { z: -0.22 });
  addCapsule(group, { x: 0.28, y: 1.02, z: 0.005 }, 0.03, 0.52, skin, { z: 0.22 });

  const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.22), dark);
  leftShoe.position.set(-0.095, 0.025, 0.055);
  group.add(leftShoe);

  const rightShoe = leftShoe.clone();
  rightShoe.position.x = 0.095;
  group.add(rightShoe);

  const rulerMaterial = new THREE.LineBasicMaterial({ color: 0xf0e6cd, transparent: true, opacity: 0.8 });
  const ruler = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0.48, 0, 0), new THREE.Vector3(0.48, 1.6, 0)]),
    rulerMaterial,
  );
  group.add(ruler);
  [0, 0.8, 1.6].forEach((height) => {
    const tick = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.42, height, 0),
        new THREE.Vector3(0.54, height, 0),
      ]),
      rulerMaterial,
    );
    group.add(tick);
  });

  return group;
}

function addCapsule(group, position, radius, length, material, rotation = {}) {
  const limb = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 8, 18), material);
  limb.position.set(position.x, position.y, position.z);
  limb.rotation.set(rotation.x || 0, rotation.y || 0, rotation.z || 0);
  group.add(limb);
  return limb;
}

function createDustCloud() {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(DUST_COUNT * 3);
  const colors = new Float32Array(DUST_COUNT * 3);
  const phases = new Float32Array(DUST_COUNT);
  const tungsten = new THREE.Color(0xcbd6ff);
  const copper = new THREE.Color(0x61ffc0);
  const violet = new THREE.Color(0xa96cff);

  for (let i = 0; i < DUST_COUNT; i += 1) {
    const color = i % 7 === 0 ? violet : i % 4 === 0 ? copper : tungsten;
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
    phases[i] = Math.random() * Math.PI * 2;
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.055,
    vertexColors: true,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  return { points: new THREE.Points(geometry, material), phases };
}

function updateDustCloud(radius) {
  const positions = dust.points.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const phase = dust.phases[i];
    const shellBias = Math.random() ** 0.55;
    const localRadius = radius * (0.08 + shellBias * 0.92);
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * radius * FIELD_Y_SCALE * 1.22;
    const banding = 0.84 + Math.sin(phase * 4) * 0.16;
    positions.setXYZ(i, Math.cos(theta) * localRadius * banding, y, Math.sin(theta) * localRadius * banding);
  }
  positions.needsUpdate = true;
  dust.points.material.size = Math.max(0.045, Math.min(0.16, radius * 0.006));
}

function updateAxisScale(radius) {
  axisBeam.scale.set(1, Math.max(1.2, radius * FIELD_Y_SCALE * 0.92), 1);
  axisBeam.position.y = 0;
}

function updateCameraForRadius(radius) {
  const focusRadius = Math.max(MIN_CAMERA_RADIUS, Math.min(radius, state.mBand * 1.85));
  const target = new THREE.Vector3(0, FIELD_CENTER_Y, 0);
  const direction = camera.position.clone().sub(target).normalize();
  const distance = focusRadius * 1.72;

  camera.near = 0.02;
  camera.far = Math.max(120, radius * 7);
  camera.position.copy(target).add(direction.multiplyScalar(distance));
  camera.updateProjectionMatrix();

  controls.target.copy(target);
  controls.maxDistance = Math.max(14, radius * 4);
  controls.minDistance = 1.4;

  scene.fog.near = Math.max(10, focusRadius * 0.55);
  scene.fog.far = Math.max(34, radius * 2.8);
}

function bindControls() {
  bindDecimalInput(elements.cltInput, "clt", 0, 50000, 2, updateIntensityReadouts);
  bindDecimalInput(elements.mBandInput, "mBand", 0.01, 250, 2, updateField);
  bindRangePair(elements.rpmRange, elements.rpmInput, "rpm", 0, 350, 1, noop);
  bindRangePair(elements.flipsRange, elements.flipsInput, "flips", 0, 10, 2, noop);
  bindRangePair(elements.tiltRange, elements.tiltInput, "tilt", -45, 45, 1, updateAxialTilt);
  elements.flipNowButton.addEventListener("click", () => {
    triggerPolarityFlip(clock.elapsedTime);
  });
  elements.menuToggleButton.addEventListener("click", toggleMenu);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    elements.fullscreenButton.textContent = document.fullscreenElement ? "×" : "⛶";
    requestAnimationFrame(resize);
  });

  elements.resetButton.addEventListener("click", () => {
    state = { ...DEFAULTS };
    syncInputs("all");
    updateField();
  });
}

function bindRangePair(range, input, key, min, max, decimals, onChange) {
  const updateFromRange = () => {
    state[key] = clampNumber(range.value, min, max, DEFAULTS[key]);
    range.value = state[key];
    input.value = formatInputNumber(state[key], decimals);
    onChange();
  };
  range.addEventListener("input", updateFromRange);
  bindDecimalInput(input, key, min, max, decimals, () => {
    range.value = state[key];
    onChange();
  });
}

function bindDecimalInput(input, key, min, max, decimals, onChange) {
  input.addEventListener("input", () => {
    const parsed = parseLooseNumber(input.value);
    if (parsed === null) return;
    state[key] = clampNumber(parsed, min, max, DEFAULTS[key]);
    onChange();
  });

  input.addEventListener("blur", () => {
    const parsed = parseLooseNumber(input.value);
    if (parsed === null) {
      input.value = formatInputNumber(state[key], decimals);
      return;
    }
    state[key] = clampNumber(parsed, min, max, DEFAULTS[key]);
    input.value = formatInputNumber(state[key], decimals);
    onChange();
  });
}

function syncInputs() {
  elements.cltInput.value = formatInputNumber(state.clt, 2);
  elements.mBandInput.value = formatInputNumber(state.mBand, 2);
  elements.rpmRange.value = state.rpm;
  elements.rpmInput.value = formatInputNumber(state.rpm, 1);
  elements.flipsRange.value = state.flips;
  elements.flipsInput.value = formatInputNumber(state.flips, 2);
  elements.tiltRange.value = state.tilt;
  elements.tiltInput.value = formatInputNumber(state.tilt, 1);
}

function noop() {}

function updateAxialTilt() {
  fieldGroup.rotation.z = THREE.MathUtils.degToRad(state.tilt);
}

function updateField() {
  clearObjects(fieldLines, lineGroup);
  clearObjects(fieldShells, shellGroup);
  clearObjects(tracers, tracerGroup);
  fieldLines = [];
  fieldShells = [];
  tracers = [];
  fieldCurves = [];

  const mPhysicalRadius = Math.max(state.mBand, 0.001);
  const mhRadius = Math.max(state.mBand * 6.5, 0.01);
  currentDisplayRadius = mhRadius;

  BAND_CONFIG.forEach((band, bandIndex) => {
    const radius = Math.max(mPhysicalRadius * band.multiplier, 0.045);
    const color = new THREE.Color(band.color);

    if (FOG_BANDS.has(band.id)) {
      const halo = createBandHalo(radius, color, band.opacity * 0.044);
      shellGroup.add(halo);
      fieldShells.push(halo);
    }

    const lineCount = getFluxLineCount(band.id);
    const tubeRadius = Math.max(0.012, Math.min(0.08, radius * (band.id === "m" ? 0.008 : 0.005)));
    for (let i = 0; i < lineCount; i += 1) {
      const phi = ((i + 0.5) / lineCount) * Math.PI * 2 + bandIndex * 0.11;
      const loop = createDipoleLoop(radius, phi, color, band.id === "m" ? 0.82 : band.opacity * 0.7, tubeRadius);
      loop.curve.userData = { color: band.color, radius };
      lineGroup.add(loop.group);
      fieldLines.push(loop.group);
      fieldCurves.push(loop.curve);
    }
  });

  createPolarPlumes(mPhysicalRadius);
  createTracers(fieldCurves);
  updateDustCloud(mhRadius);
  updateAxisScale(mhRadius);
  updateCameraForRadius(mhRadius);

  updateAxialTilt();
  positionPolarityCaps();

  elements.fieldScaleReadout.textContent = `MH R ${formatNumber(mhRadius, 1)} m`;
  elements.scaleNote.textContent = `True radius scale: M ${formatNumber(state.mBand, 2)} m, MH ${formatNumber(mhRadius, 1)} m`;
  updateIntensityReadouts();
  updateLegendDistances();
  updateViewerFieldReadout();
}

function createBandHalo(radius, color, opacity) {
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 56, 28),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.set(FIELD_XZ_SCALE, FIELD_Y_SCALE, FIELD_XZ_SCALE);
  return halo;
}

function getFluxLineCount(bandId) {
  if (bandId === "ns") return 4;
  if (bandId === "ce") return 5;
  if (bandId === "e") return 6;
  if (bandId === "m") return 8;
  if (bandId === "ps") return 10;
  if (bandId === "ms") return 10;
  if (bandId === "mp") return 12;
  if (bandId === "mh") return 14;
  return 8;
}

function createDipoleLoop(radius, phi, color, opacity, tubeRadius) {
  const points = [];
  const radialDirection = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
  const verticalPull = Math.max(0.58, radius * FIELD_Y_SCALE * 0.62);
  const phaseLift = Math.sin(phi * 2.0) * radius * 0.06;
  for (let i = 0; i <= 160; i += 1) {
    const t = i / 160;
    const theta = Math.PI * t;
    const sin = Math.sin(theta);
    const cos = Math.cos(theta);
    const lateral = radius * FIELD_XZ_SCALE * sin ** 2.22;
    const y = POLE_DISTANCE * cos + verticalPull * sin ** 1.08 * cos + phaseLift * sin ** 2;
    points.push(new THREE.Vector3(radialDirection.x * lateral, y, radialDirection.z * lateral));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, 160, tubeRadius, 8, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: Math.min(1, opacity * 1.35 + 0.12),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  const glow = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 160, tubeRadius * 2.7, 8, false),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(0.42, opacity * 0.36 + 0.08),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  group.add(glow);

  const arrowT = 0.33;
  const arrowPosition = curve.getPointAt(arrowT);
  const arrowDirection = curve.getTangentAt(arrowT).normalize();
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(tubeRadius * 3.1, 0.035), Math.max(tubeRadius * 8, 0.14), 18),
    material.clone(),
  );
  arrow.position.copy(arrowPosition);
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), arrowDirection);
  arrow.material.opacity = Math.min(1, opacity + 0.34);
  group.add(arrow);

  return { group, curve };
}

function createPolarPlumes(mPhysicalRadius) {
  const poleConfigs = [
    { sign: 1, color: "#ff5a4f", offset: 0 },
    { sign: -1, color: "#60a8ff", offset: Math.PI / 8 },
  ];

  for (const pole of poleConfigs) {
    for (let i = 0; i < 12; i += 1) {
      const phi = (i / 12) * Math.PI * 2 + pole.offset;
      const plume = createPolarPlume(mPhysicalRadius, pole.sign, phi, new THREE.Color(pole.color));
      plume.curve.userData = { color: pole.color, radius: mPhysicalRadius };
      lineGroup.add(plume.group);
      fieldLines.push(plume.group);
      fieldCurves.push(plume.curve);
    }
  }
}

function createPolarPlume(radius, sign, phi, color) {
  const points = [];
  const radialDirection = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
  const height = Math.max(2.8, radius * 2.25);
  const spread = Math.max(0.28, radius * 0.18);

  for (let i = 0; i <= 96; i += 1) {
    const t = i / 96;
    const climb = t ** 0.82;
    const plumeSpread = t ** 1.12;
    const outwardCurl = Math.sin((t * Math.PI) / 2) ** 2.2;
    const flutter = Math.sin(t * Math.PI * 2.4 + phi * 1.7) * radius * 0.026 * t;
    const lateral = spread * (0.5 * plumeSpread + 0.65 * outwardCurl) + flutter;
    const y = sign * (POLE_DISTANCE + height * climb);
    points.push(new THREE.Vector3(radialDirection.x * lateral, y, radialDirection.z * lateral));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const group = new THREE.Group();
  for (let segment = 0; segment < 8; segment += 1) {
    const start = segment / 8;
    const end = (segment + 1) / 8;
    const segmentPoints = [];
    for (let j = 0; j <= 14; j += 1) {
      segmentPoints.push(curve.getPointAt(start + (end - start) * (j / 14)));
    }
    const segmentCurve = new THREE.CatmullRomCurve3(segmentPoints);
    const fade = 1 - segment / 8;
    const tubeRadius = Math.max(0.018, Math.min(0.08, radius * 0.012)) * (0.55 + fade * 0.72);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1, 0.14 + fade * 0.96),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(segmentCurve, 28, tubeRadius, 8, false), material));
  }

  const arrowT = 0.58;
  const arrowTubeRadius = Math.max(0.018, Math.min(0.075, radius * 0.011));
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(arrowTubeRadius * 3.2, arrowTubeRadius * 9, 18),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  arrow.position.copy(curve.getPointAt(arrowT));
  arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(arrowT).normalize());
  group.add(arrow);

  return { group, curve };
}

function createTracers(curves) {
  curves.forEach((curve, index) => {
    if (index % 3 !== 0) return;
    const color = new THREE.Color(curve.userData?.color || "#f6fbff");
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    for (let i = 0; i < 2; i += 1) {
      const tracer = new THREE.Mesh(new THREE.SphereGeometry(0.06, 18, 12), material.clone());
      tracer.userData.curve = curve;
      tracer.userData.phase = (index * 0.173 + i * 0.43) % 1;
      tracer.userData.speed = 0.09 + (index % 5) * 0.012;
      tracerGroup.add(tracer);
      tracers.push(tracer);
    }
  });
}

function updateVfx(elapsed) {
  for (const tracer of tracers) {
    const phase = (tracer.userData.phase + elapsed * tracer.userData.speed) % 1;
    const t = polarityPositive ? phase : 1 - phase;
    tracer.position.copy(tracer.userData.curve.getPointAt(t));
    const pulse = 0.95 + Math.sin(elapsed * 10.5 + tracer.userData.phase) * 0.35;
    tracer.scale.setScalar(pulse);
  }

  const dustPositions = dust.points.geometry.attributes.position;
  const dustPhases = dust.phases;
  for (let i = 0; i < dustPositions.count; i += 1) {
    const x = dustPositions.getX(i);
    const z = dustPositions.getZ(i);
    const angle = Math.atan2(z, x) + 0.0009 * state.rpm;
    const radius = Math.hypot(x, z);
    dustPositions.setXYZ(
      i,
      Math.cos(angle) * radius,
      dustPositions.getY(i) + Math.sin(elapsed * 1.7 + dustPhases[i]) * 0.0018,
      Math.sin(angle) * radius,
    );
  }
  dustPositions.needsUpdate = true;

  const flashAge = elapsed - lastFlipAt;
  if (flashAge < FLIP_FLASH_SECONDS) {
    const progress = flashAge / FLIP_FLASH_SECONDS;
    axisBeam.material.opacity = 0.34 + Math.sin(progress * Math.PI) * 0.42;
  } else {
    axisBeam.material.opacity = 0.34 + Math.sin(elapsed * 5.5) * 0.06;
  }
  flipWave.material.opacity = 0;
  shellGroup.scale.setScalar(1);
  lineGroup.scale.setScalar(1);
}

function clearObjects(objects, parent) {
  for (const object of objects) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    });
    parent.remove(object);
  }
}

function updatePolarity(elapsedSeconds) {
  if (state.flips <= 0) {
    if (!polarityPositive) {
      polarityPositive = true;
      positionPolarityCaps();
    }
    elements.polarityStatus.textContent = "Polarity stable";
    return;
  }

  const flipPeriodSeconds = 60 / state.flips;
  const flipBucket = Math.floor(elapsedSeconds / flipPeriodSeconds);
  if (flipBucket !== lastFlipBucket) {
    lastFlipBucket = flipBucket;
    triggerPolarityFlip(elapsedSeconds);
  }
  const nextFlip = flipPeriodSeconds - (elapsedSeconds % flipPeriodSeconds);
  elements.polarityStatus.textContent = `Next flip ${Math.ceil(nextFlip)}s`;
}

function updateFlipRotation(elapsedSeconds) {
  const progress = Math.min(1, Math.max(0, elapsedSeconds - flipStartedAt));
  if (progress >= 1) {
    flipGroup.rotation.z = flipTargetRotation;
    return;
  }
  const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
  flipGroup.rotation.z = THREE.MathUtils.lerp(flipStartRotation, flipTargetRotation, eased);
}

function triggerPolarityFlip(elapsedSeconds) {
  polarityPositive = !polarityPositive;
  lastFlipAt = elapsedSeconds;
  flipStartRotation = flipGroup.rotation.z;
  flipTargetRotation = flipStartRotation + Math.PI;
  flipStartedAt = elapsedSeconds;
}

function positionPolarityCaps() {
  capNorth.position.set(0, POLE_DISTANCE, 0);
  capSouth.position.set(0, -POLE_DISTANCE, 0);
}

function renderLegend() {
  elements.legend.innerHTML = BAND_CONFIG.map(
    (band) => `
      <div class="legend-item" data-band="${band.id}">
        <i class="swatch" style="color: ${band.color}; background: ${band.color}"></i>
        <div class="legend-label">
          <strong>${band.label}</strong>
          <span>${band.name}</span>
        </div>
        <div class="legend-distance">0.0 m</div>
      </div>
    `,
  ).join("");
}

function updateLegendDistances() {
  for (const band of BAND_CONFIG) {
    const row = elements.legend.querySelector(`[data-band="${band.id}"] .legend-distance`);
    row.textContent = `${formatNumber(state.mBand * band.multiplier, 2)} m`;
  }
}

function updateViewerFieldReadout() {
  const epicenter = new THREE.Vector3(0, FIELD_CENTER_Y, 0);
  const distance = camera.position.distanceTo(epicenter);
  const band = getBandAtDistance(distance);
  const localClt = state.clt * band.strength;
  elements.viewerBandReadout.textContent = `${band.label} · ${formatNumber(distance, 1)} m`;
  elements.localCltReadout.textContent = `${formatNumber(localClt, localClt >= 100 ? 0 : 1)} CLT`;
}

function getBandAtDistance(distance) {
  const mRadius = Math.max(state.mBand, 0.001);
  const ratio = distance / mRadius;
  const bands = [
    { label: "NS", max: 0.045, strength: 1.55 },
    { label: "CE", max: 0.2, strength: 1.25 },
    { label: "E", max: 0.5, strength: 1.12 },
    { label: "M", max: 1, strength: 1 },
    { label: "PS", max: 1.7, strength: 0.65 },
    { label: "MS", max: 3.5, strength: 0.28 },
    { label: "MP", max: 4.5, strength: 0.1 },
    { label: "MH", max: 6.5, strength: 0.05 },
  ];
  return bands.find((band) => ratio <= band.max) || { label: "Outside", strength: 0 };
}

function toggleMenu() {
  const hidden = elements.appShell.classList.toggle("menu-hidden");
  elements.menuToggleButton.textContent = hidden ? "☰" : "×";
  elements.menuToggleButton.setAttribute("aria-label", hidden ? "Show controls menu" : "Hide controls menu");
  elements.menuToggleButton.title = hidden ? "Show controls menu" : "Hide controls menu";
  requestAnimationFrame(resize);
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await elements.simStage.requestFullscreen();
    }
    requestAnimationFrame(resize);
  } catch {
    elements.polarityStatus.textContent = "Fullscreen unavailable";
  }
}

function updateIntensityReadouts() {
  const microtesla = (state.clt / 1000) * 7.25;
  const tungsten = tungstenConcentration(state.clt);
  const glow = Math.min(1, 0.35 + Math.log10(state.clt + 10) / 4.2);
  elements.microteslaReadout.textContent = `${formatNumber(microtesla, 3)} μT`;
  elements.tungstenReadout.textContent = `${formatNumber(tungsten, 4)} mg/m³`;
  dust.points.material.opacity = 0.12 + glow * 0.28;
  axisBeam.material.opacity = 0.18 + glow * 0.22;
}

function tungstenConcentration(clt) {
  const power = 1.09;
  const numerator = clt ** power;
  const denominator = numerator + 1737 ** power;
  return 0.55 * (numerator / denominator);
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseLooseNumber(value) {
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed === "." || trimmed === "-" || trimmed === "-.") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatInputNumber(value, decimals) {
  const fixed = Number(value).toFixed(decimals);
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatNumber(value, decimals) {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function resize() {
  const rect = elements.canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

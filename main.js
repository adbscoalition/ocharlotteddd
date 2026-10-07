import * as THREE from "three";
import { OrbitControls } from "./OrbitControls.js";
import { ElectronInspector } from "./electron-inspector.js";
import { InteractionLines } from "./interaction-lines.js";
import { FieldProbes } from "./field-probes.js";
import {
  sampleFieldLine,
  sampleDipoleField,
  POLE_DISTANCE,
} from "./field-lines.mjs";
import { reentryRadius, reentrySpeed } from "./electron-physics.mjs";

const BAND_CONFIG = [
  {
    id: "ns",
    label: "NS",
    name: "Polar",
    multiplier: 0.045,
    color: "#ff2f2f",
    opacity: 0.78,
  },
  {
    id: "ce",
    label: "CE",
    name: "Central Extreme",
    multiplier: 0.2,
    color: "#ff8a1c",
    opacity: 0.7,
  },
  {
    id: "e",
    label: "E",
    name: "Extreme",
    multiplier: 0.5,
    color: "#ffd84d",
    opacity: 0.62,
  },
  {
    id: "m",
    label: "M",
    name: "Maximum",
    multiplier: 1,
    color: "#45df75",
    opacity: 0.72,
  },
  {
    id: "ps",
    label: "PS",
    name: "Plasmasphere",
    multiplier: 1.7,
    color: "#37e1ea",
    opacity: 0.5,
  },
  {
    id: "ms",
    label: "MS",
    name: "Magnetosphere",
    multiplier: 3.5,
    color: "#3e7bff",
    opacity: 0.42,
  },
  {
    id: "mp",
    label: "MP",
    name: "Magnetopause",
    multiplier: 4.5,
    color: "#a75cff",
    opacity: 0.36,
  },
  {
    id: "mh",
    label: "MH",
    name: "Magnetosheath",
    multiplier: 6.5,
    color: "#35105f",
    opacity: 0.3,
  },
];

const DEFAULTS = {
  clt: 1000,
  mBand: calculateMBand(1000),
  rpm: 120,
  flips: 0.3,
  tilt: 13,
  universalTilt: 0,
  fieldJitter: 0,
  showElectrons: false,
  electronCount: 1600,
  electronSpeed: 1,
  electronAttraction: 2,
  rotationInflow: 1,
  electronTrails: false,
  showCompasses: false,
  showFieldLines: true,
  secondaryEnabled: false,
  secondaryCLT: 650,
  secondaryX: 4,
  secondaryY: 0,
  secondaryZ: 0,
  secondaryRPM: 90,
  secondaryFlips: 0.3,
  secondaryJitter: 0,
  secondaryTilt: -13,
  secondaryReverse: false,
  stirring: 1,
  paused: false,
  capturedOnly: false,
  stablePaths: false,
  electronColorMode: "status",
  electronColor: "#ffd34d",
};

const HUMAN_HEIGHT = 1.68;
// Anatomical left chest. Every field transform, force and distance uses this
// same heart anchor; the upright model is separate from magnetic transforms.
const FIELD_CENTER = new THREE.Vector3(0.055, 1.24, 0.045);
const MIN_CAMERA_RADIUS = 5.5;
const VISUAL_ROTATION_GAIN = 1;
const FIELD_Y_SCALE = 1;
const DUST_COUNT = 420;

const elements = {
  ...Object.fromEntries(
    [
      "secondaryFlipsRange",
      "secondaryFlipsInput",
      "secondaryFlipNowButton",
      "secondaryPolarityStatus",
      "secondaryJitterRange",
      "secondaryJitterInput",
      "secondaryFieldReadout",
      "secondaryViewerReadout",
    ].map((id) => [id, document.getElementById(id)]),
  ),
  ...Object.fromEntries(
    [
      "secondaryToggle",
      "secondaryControls",
      "secondaryCLTInput",
      "secondaryMOutput",
      "secondaryDistanceInput",
      "secondaryXInput",
      "secondaryYInput",
      "secondaryZInput",
      "secondaryRPMInput",
      "secondaryTiltInput",
      "secondaryReverseToggle",
      "stirringRange",
      "stirringOutput",
      "secondaryCaptureOutput",
      "pauseButton",
      "stepButton",
      "capturedOnlyToggle",
      "stablePathsToggle",
      "refreshPathsButton",
      "electronColorMode",
      "electronColorInput",
      "singleColorRow",
      "electronColorHint",
    ].map((id) => [id, document.getElementById(id)]),
  ),
  appShell: document.querySelector("#appShell"),
  canvas: document.querySelector("#scene"),
  rendererStatus: document.querySelector("#rendererStatus"),
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
  universalTiltRange: document.querySelector("#universalTiltRange"),
  universalTiltInput: document.querySelector("#universalTiltInput"),
  jitterRange: document.querySelector("#jitterRange"),
  jitterInput: document.querySelector("#jitterInput"),
  electronsToggle: document.querySelector("#electronsToggle"),
  electronCountRange: document.querySelector("#electronCountRange"),
  electronCountOutput: document.querySelector("#electronCountOutput"),
  electronSpeedRange: document.querySelector("#electronSpeedRange"),
  electronSpeedOutput: document.querySelector("#electronSpeedOutput"),
  electronAttractionRange: document.querySelector("#electronAttractionRange"),
  electronAttractionOutput: document.querySelector("#electronAttractionOutput"),
  rotationInflowRange: document.querySelector("#rotationInflowRange"),
  rotationInflowOutput: document.querySelector("#rotationInflowOutput"),
  electronTrailsToggle: document.querySelector("#electronTrailsToggle"),
  electronStateOutput: document.querySelector("#electronStateOutput"),
  electronBandOutput: document.querySelector("#electronBandOutput"),
  electronOutcomeOutput: document.querySelector("#electronOutcomeOutput"),
  electronReentryOutput: document.querySelector("#electronReentryOutput"),
  respawnElectronsButton: document.querySelector("#respawnElectronsButton"),
  compassesToggle: document.querySelector("#compassesToggle"),
  fieldLinesToggle: document.querySelector("#fieldLinesToggle"),
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
let simulationTime = 0;
let fieldLines = [];
let fieldShells = [];
let tracers = [];
let fieldCurves = [];
let polarityPositive = true;
let lastFlipBucket = 0;
let currentDisplayRadius = 6.5;
let flipStartRotation = 0;
let flipTargetRotation = 0;
let flipStartedAt = -999;
let secondaryFlipStart = 0;
let secondaryFlipTarget = 0;
let secondaryFlipStartedAt = -999;
let secondaryFlipRotation = 0;
let secondaryLastFlipBucket = 0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x111211, 10, 28);

const camera = new THREE.PerspectiveCamera(48, 1, 0.01, 100);
camera.position.set(4.6, 2.45, 5.85);

const renderer = new THREE.WebGLRenderer({
  canvas: elements.canvas,
  antialias: true,
  alpha: true,
});
let graphicsInterrupted = false;
let pixelRatioLimit = 1.5;
// Limit the drawing buffer, especially on mobile and high-density screens.
const MAX_RENDER_PIXELS = 2_000_000;
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, elements.canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 1.9;
controls.maxDistance = 14;
controls.target.copy(FIELD_CENTER);

// Tilt the whole field about its center, before local spin and polarity flips.
const universalTiltGroup = new THREE.Group();
universalTiltGroup.position.copy(FIELD_CENTER);
scene.add(universalTiltGroup);

const jitterGroup = new THREE.Group();
universalTiltGroup.add(jitterGroup);
const fieldGroup = new THREE.Group();
const flipGroup = new THREE.Group();
const lineGroup = new THREE.Group();
const shellGroup = new THREE.Group();
const tracerGroup = new THREE.Group();
const vfxGroup = new THREE.Group();
fieldGroup.add(flipGroup);
flipGroup.add(shellGroup, lineGroup, tracerGroup, vfxGroup);
jitterGroup.add(fieldGroup);

const modelGroup = createFemaleModel();
scene.add(modelGroup);
const secondaryModelGroup = createFemaleModel();
secondaryModelGroup.traverse((child) => {
  if (child.material?.color?.getHex() === 0x356357)
    child.material.color.set(0x77549a);
});
scene.add(secondaryModelGroup);
const secondaryUniversalGroup = new THREE.Group();
const secondaryJitterGroup = new THREE.Group();
const secondaryFieldGroup = new THREE.Group();
const secondaryFlipGroup = new THREE.Group();
scene.add(secondaryUniversalGroup);
secondaryUniversalGroup.add(secondaryJitterGroup);
secondaryJitterGroup.add(secondaryFieldGroup);
secondaryFieldGroup.add(secondaryFlipGroup);

const capNorth = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 24, 16),
  new THREE.MeshStandardMaterial({
    color: 0xff3a3a,
    emissive: 0x5a0505,
    roughness: 0.5,
  }),
);
const capSouth = new THREE.Mesh(
  new THREE.SphereGeometry(0.055, 24, 16),
  new THREE.MeshStandardMaterial({
    color: 0x4f83ff,
    emissive: 0x071d58,
    roughness: 0.5,
  }),
);
flipGroup.add(capNorth, capSouth);
const secondaryCapNorth = capNorth.clone();
const secondaryCapSouth = capSouth.clone();
secondaryCapNorth.position.y = POLE_DISTANCE;
secondaryCapSouth.position.y = -POLE_DISTANCE;
secondaryFlipGroup.add(secondaryCapNorth, secondaryCapSouth);

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

const fieldProbes = new FieldProbes(scene, FIELD_CENTER.toArray());
const fieldAxis = new THREE.Vector3();
const fieldSpinAxis = new THREE.Vector3();
const fieldOrientation = new THREE.Quaternion();
const spinOrientation = new THREE.Quaternion();
const secondaryOrientation = new THREE.Quaternion();
const secondarySpinOrientation = new THREE.Quaternion();
const secondaryCenter = FIELD_CENTER.clone();
const sources = [0, 1].map(() => ({
  center: [0, 0, 0],
  radius: 1,
  intensity: 0,
  orientation: [0, 0, 0, 1],
  moment: [0, 1, 0],
  spinAxis: [0, 1, 0],
  angularSpeed: 0,
}));
const interactionLines = new InteractionLines(scene);
const electronInspector = new ElectronInspector({
  canvas: elements.canvas,
  camera,
  scene,
  probes: fieldProbes,
  getSources: () => (state.secondaryEnabled ? sources : [sources[0]]),
});

renderLegend();
bindControls();
syncInputs();
updateSecondary(false);
updateField();
resize();
window.addEventListener("resize", resize);

const clock = new THREE.Clock();
elements.canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  graphicsInterrupted = true;
  pixelRatioLimit = 1;
  elements.rendererStatus.hidden = false;
});
elements.canvas.addEventListener("webglcontextrestored", () => {
  resize();
  // Discard time spent recovering rather than advancing the simulation.
  clock.getDelta();
  graphicsInterrupted = false;
  elements.rendererStatus.hidden = true;
});
renderer.setAnimationLoop(() => {
  if (graphicsInterrupted) return;
  const delta = Math.min(clock.getDelta(), 0.05);
  advanceSimulation(state.paused ? 0 : delta);
  updateViewerFieldReadout();
  controls.update();
  electronInspector.update();
  renderer.render(scene, camera);
});

function advanceSimulation(delta) {
  simulationTime += delta;
  const radiansPerSecond = (state.rpm * Math.PI * 2) / 60;
  fieldGroup.rotation.y += radiansPerSecond * delta;
  secondaryFieldGroup.rotation.y +=
    ((state.secondaryRPM * Math.PI * 2) / 60) * delta;
  updateFieldJitter(simulationTime);
  updateFlipRotation(simulationTime);
  updatePolarity(simulationTime);
  updateSecondaryPolarity(simulationTime);
  if (delta > 0) updateVfx(simulationTime);
  updateSourceMetadata();
  if (state.showElectrons || state.showCompasses) {
    fieldProbes.update(
      delta,
      fieldAxis,
      state.clt / 1000,
      fieldSpinAxis,
      radiansPerSecond,
      fieldOrientation,
    );
    updateElectronStateReadout();
  }
  if (state.secondaryEnabled) interactionLines.update(simulationTime, sources);
  electronInspector.update();
}

function updateSourceMetadata() {
  flipGroup.getWorldQuaternion(fieldOrientation);
  fieldAxis.set(0, 1, 0).applyQuaternion(fieldOrientation);
  jitterGroup.getWorldQuaternion(spinOrientation);
  fieldSpinAxis.set(0, 1, 0).applyQuaternion(spinOrientation);
  const primary = sources[0];
  FIELD_CENTER.toArray(primary.center);
  primary.radius = state.mBand;
  primary.intensity = state.clt / 1000;
  fieldOrientation.toArray(primary.orientation);
  fieldAxis.toArray(primary.moment);
  fieldSpinAxis.toArray(primary.spinAxis);
  primary.angularSpeed = (state.rpm * Math.PI * 2) / 60;
  secondaryFlipGroup.getWorldQuaternion(secondaryOrientation);
  secondaryJitterGroup.getWorldQuaternion(secondarySpinOrientation);
  const secondary = sources[1];
  secondaryCenter.toArray(secondary.center);
  secondary.radius = calculateMBand(state.secondaryCLT);
  secondary.intensity = state.secondaryCLT / 1000;
  secondaryOrientation.toArray(secondary.orientation);
  new THREE.Vector3(0, 1, 0)
    .applyQuaternion(secondaryOrientation)
    .toArray(secondary.moment);
  new THREE.Vector3(0, 1, 0)
    .applyQuaternion(secondarySpinOrientation)
    .toArray(secondary.spinAxis);
  secondary.angularSpeed = (state.secondaryRPM * Math.PI * 2) / 60;
}

function updateSecondary(fitCamera = true) {
  secondaryModelGroup.position.set(
    state.secondaryX,
    state.secondaryY,
    state.secondaryZ,
  );
  secondaryCenter.copy(FIELD_CENTER).add(secondaryModelGroup.position);
  secondaryUniversalGroup.position.copy(secondaryCenter);
  secondaryUniversalGroup.rotation.z = THREE.MathUtils.degToRad(
    state.universalTilt,
  );
  secondaryFieldGroup.rotation.z = THREE.MathUtils.degToRad(
    state.secondaryTilt,
  );
  secondaryFlipGroup.rotation.z =
    (state.secondaryReverse ? Math.PI : 0) + secondaryFlipRotation;
  secondaryModelGroup.visible = secondaryUniversalGroup.visible =
    state.secondaryEnabled;
  elements.secondaryControls.hidden = !state.secondaryEnabled;
  elements.secondaryFieldReadout.textContent = `${formatNumber((state.secondaryCLT / 1000) * 7.25, 3)} μT · ${formatNumber(tungstenConcentration(state.secondaryCLT), 4)} mg/m³ tungsten · MH ${formatNumber(calculateMBand(state.secondaryCLT) * 6.5, 2)} m`;
  elements.secondaryMOutput.value = formatInputNumber(
    calculateMBand(state.secondaryCLT),
    2,
  );
  if (document.activeElement !== elements.secondaryDistanceInput)
    elements.secondaryDistanceInput.value = formatInputNumber(
      Math.hypot(state.secondaryX, state.secondaryY, state.secondaryZ),
      2,
    );
  updateSourceMetadata();
  fieldProbes.setSources(
    state.secondaryEnabled ? sources : null,
    state.stirring,
  );
  interactionLines.group.visible =
    state.secondaryEnabled && state.showFieldLines;
  interactionLines.update(simulationTime, sources, true);
  syncProbeControls();
  if (fitCamera) updateCameraForRadius(currentDisplayRadius);
  updateViewerFieldReadout();
  updateLegendDistances();
}

function syncTimeControls() {
  elements.pauseButton.textContent = state.paused ? "▶" : "Ⅱ";
  elements.pauseButton.setAttribute(
    "aria-label",
    state.paused ? "Resume simulation" : "Pause simulation",
  );
  elements.pauseButton.title = state.paused
    ? "Resume simulation"
    : "Pause simulation";
  elements.pauseButton.setAttribute("aria-pressed", String(state.paused));
  elements.stepButton.disabled = !state.paused;
}

function createFemaleModel() {
  const group = new THREE.Group();
  group.name = "female-model";
  group.userData.heartPosition = FIELD_CENTER.toArray();
  const skin = new THREE.MeshStandardMaterial({
    color: 0xc99475,
    roughness: 0.74,
  });
  const hair = new THREE.MeshStandardMaterial({
    color: 0x38241f,
    roughness: 0.72,
  });
  const dress = new THREE.MeshStandardMaterial({
    color: 0x356357,
    roughness: 0.72,
    side: THREE.DoubleSide,
  });
  const trim = new THREE.MeshStandardMaterial({
    color: 0xcab384,
    metalness: 0.25,
    roughness: 0.5,
  });
  const shoes = new THREE.MeshStandardMaterial({
    color: 0x272b28,
    roughness: 0.68,
  });
  const white = new THREE.MeshStandardMaterial({
    color: 0xe8dccf,
    roughness: 0.6,
  });
  const iris = new THREE.MeshStandardMaterial({
    color: 0x4c6550,
    roughness: 0.5,
  });
  const pupil = new THREE.MeshBasicMaterial({ color: 0x181b18 });
  const lips = new THREE.MeshStandardMaterial({
    color: 0xa76666,
    roughness: 0.7,
  });
  const sphere = new THREE.SphereGeometry(1, 32, 24);
  const ellipsoid = (name, material, position, scale) => {
    const mesh = new THREE.Mesh(sphere, material);
    mesh.name = name;
    mesh.position.fromArray(position);
    mesh.scale.fromArray(scale);
    group.add(mesh);
    return mesh;
  };
  const limb = (name, a, b, radius, material) => {
    const start = new THREE.Vector3().fromArray(a),
      end = new THREE.Vector3().fromArray(b);
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(
        radius,
        Math.max(0.001, start.distanceTo(end) - 2 * radius),
        8,
        24,
      ),
      material,
    );
    mesh.name = name;
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      end.sub(start).normalize(),
    );
    group.add(mesh);
    return mesh;
  };
  // Shaped bodice and skirt, articulated limbs, and a detailed unobscured face.
  const profile = [
    [0.215, 0.68],
    [0.222, 0.7],
    [0.195, 0.79],
    [0.16, 0.9],
    [0.105, 1.015],
    [0.103, 1.06],
    [0.124, 1.145],
    [0.159, 1.24],
    [0.178, 1.31],
    [0.184, 1.34],
    [0.11, 1.39],
    [0.059, 1.41],
  ];
  const clothing = new THREE.Mesh(
    new THREE.LatheGeometry(
      profile.map(([r, y]) => new THREE.Vector2(r, y)),
      64,
    ),
    dress,
  );
  clothing.scale.z = 0.66;
  group.add(clothing);
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.106, 0.006, 8, 48),
    trim,
  );
  belt.rotation.x = Math.PI / 2;
  belt.scale.y = 0.66;
  belt.position.y = 1.035;
  group.add(belt);
  ellipsoid("neck", skin, [0, 1.425, 0], [0.045, 0.076, 0.039]);
  // One continuous face surface avoids the separate jaw looking like a beard.
  const faceGeometry = new THREE.SphereGeometry(1, 48, 40);
  const faceVertices = faceGeometry.attributes.position;
  for (let i = 0; i < faceVertices.count; i++) {
    const x = faceVertices.getX(i),
      y = faceVertices.getY(i),
      z = faceVertices.getZ(i);
    const jawWidth = 0.78 + 0.22 * THREE.MathUtils.smoothstep(y, -1, 0.1);
    const cheek =
      z > 0
        ? 0.003 *
          Math.exp(
            -(((Math.abs(x) - 0.5) / 0.28) ** 2 + ((y + 0.12) / 0.35) ** 2),
          )
        : 0;
    faceVertices.setXYZ(i, x * 0.096 * jawWidth, y * 0.119, z * 0.09 + cheek);
  }
  faceGeometry.computeVertexNormals();
  const face = new THREE.Mesh(faceGeometry, skin);
  face.name = "head";
  face.position.set(0, 1.547, 0.005);
  group.add(face);
  ellipsoid("nose-bridge", skin, [0, 1.548, 0.09], [0.009, 0.023, 0.015]);
  ellipsoid("nose", skin, [0, 1.527, 0.103], [0.012, 0.012, 0.015]);
  for (const sign of [-1, 1]) {
    ellipsoid("ear", skin, [sign * 0.095, 1.545, 0], [0.016, 0.026, 0.012]);
    ellipsoid(
      "eye-white",
      white,
      [sign * 0.034, 1.568, 0.095],
      [0.016, 0.008, 0.004],
    );
    ellipsoid(
      "iris",
      iris,
      [sign * 0.034, 1.568, 0.099],
      [0.006, 0.006, 0.0018],
    );
    ellipsoid(
      "pupil",
      pupil,
      [sign * 0.034, 1.568, 0.101],
      [0.0025, 0.0038, 0.001],
    );
    const brow = ellipsoid(
      "brow",
      hair,
      [sign * 0.035, 1.589, 0.094],
      [0.019, 0.0025, 0.003],
    );
    brow.rotation.z = -sign * 0.1;
    ellipsoid(
      "eye-highlight",
      white,
      [sign * 0.034 - 0.0015, 1.57, 0.103],
      [0.0013, 0.0013, 0.0007],
    );
    const shoulder = [sign * 0.177, 1.335, 0],
      elbow = [sign * 0.23, 1.115, 0.005],
      wrist = [sign * 0.25, 0.924, 0.025];
    ellipsoid("shoulder", dress, shoulder, [0.057, 0.065, 0.044]);
    limb("upper-arm", shoulder, elbow, 0.038, skin);
    ellipsoid("elbow", skin, elbow, [0.034, 0.038, 0.032]);
    limb("forearm", elbow, wrist, 0.029, skin);
    ellipsoid(
      "hand",
      skin,
      [sign * 0.252, 0.878, 0.029],
      [0.027, 0.053, 0.021],
    );
    ellipsoid("thumb", skin, [sign * 0.224, 0.9, 0.043], [0.012, 0.027, 0.012]);
    const hip = [sign * 0.085, 0.82, 0],
      knee = [sign * 0.076, 0.43, 0.005],
      ankle = [sign * 0.07, 0.065, 0];
    limb("thigh", hip, knee, 0.056, skin);
    ellipsoid("knee", skin, knee, [0.041, 0.048, 0.041]);
    limb("calf", knee, ankle, 0.04, skin);
    ellipsoid(
      "shoe",
      shoes,
      [sign * 0.07, 0.035, 0.046],
      [0.054, 0.034, 0.102],
    );
  }
  ellipsoid("upper-lip", lips, [0, 1.504, 0.089], [0.019, 0.0028, 0.003]);
  ellipsoid("lower-lip", lips, [0, 1.499, 0.089], [0.015, 0.0026, 0.003]);
  const curveMesh = (name, points, radius, material) => {
    const curve = new THREE.CatmullRomCurve3(
      points.map((p) => new THREE.Vector3().fromArray(p)),
    );
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, radius, 6, false),
      material,
    );
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  const crownGeometry = new THREE.SphereGeometry(
    1,
    48,
    32,
    0,
    Math.PI * 2,
    0,
    Math.PI / 2,
  );
  const crownVertices = crownGeometry.attributes.position;
  for (let i = 0; i < crownVertices.count; i++) {
    const x = crownVertices.getX(i),
      y = crownVertices.getY(i),
      z = crownVertices.getZ(i);
    const sweptHairline = Math.max(0, z) ** 2 * (0.045 + 0.007 * x);
    crownVertices.setXYZ(
      i,
      x * 0.106,
      Math.min(HUMAN_HEIGHT, 1.551 + y * 0.129 + sweptHairline),
      z * 0.103 - 0.012,
    );
  }
  crownGeometry.computeVertexNormals();
  const crown = new THREE.Mesh(crownGeometry, hair);
  crown.name = "hair-crown";
  group.add(crown);
  ellipsoid("hair-back", hair, [0, 1.46, -0.073], [0.096, 0.19, 0.046]);
  for (const sign of [-1, 1]) {
    const lock = ellipsoid(
      "hair-side",
      hair,
      [sign * 0.101, 1.479, -0.028],
      [0.024, 0.135, 0.045],
    );
    lock.rotation.z = sign * 0.075;
  }
  const hairHighlight = new THREE.MeshStandardMaterial({
    color: 0x765348,
    roughness: 0.72,
  });
  // Fine strands follow the crown surface instead of floating above it.
  for (let strand = 0; strand < 7; strand++) {
    const points = [];
    for (let step = 0; step <= 8; step++) {
      const theta = 0.24 + step * 0.15;
      const phi = 0.5 + strand * 0.14 + theta * 0.45;
      const x = Math.cos(phi) * Math.sin(theta),
        y = Math.cos(theta),
        z = Math.sin(phi) * Math.sin(theta);
      points.push([
        x * 0.1075,
        Math.min(
          HUMAN_HEIGHT,
          1.552 + y * 0.129 + Math.max(0, z) ** 2 * (0.045 + 0.007 * x),
        ),
        z * 0.1045 - 0.012,
      ]);
    }
    curveMesh("hair-top-strand", points, 0.001, hairHighlight);
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.03;
    curveMesh(
      "hair-strand",
      [
        [x * 0.6, 1.66, -0.062],
        [x, 1.56, -0.116],
        [x * 1.1, 1.4, -0.112],
        [x * 0.9, 1.29, -0.088],
      ],
      0.0018,
      hairHighlight,
    );
  }
  // Thin clear lenses, light metal rims, a bridge and curved temple arms.
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0xcbbfa9,
    roughness: 0.32,
    metalness: 0.55,
  });
  // Thin clear lenses do not need a full-scene transmission render target.
  // Alpha blending keeps the eyes visible without multisampled float buffers.
  const lensMaterial = new THREE.MeshPhongMaterial({
    color: 0xeaf6ff,
    specular: 0xffffff,
    shininess: 100,
    transparent: true,
    opacity: 0.09,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const sign of [-1, 1]) {
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.0014, 8, 48),
      frameMaterial,
    );
    rim.name = "glasses-frame";
    rim.position.set(sign * 0.035, 1.568, 0.114);
    rim.scale.y = 0.68;
    group.add(rim);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.023, 48),
      lensMaterial,
    );
    lens.name = "glasses-lens";
    lens.position.copy(rim.position);
    lens.scale.y = 0.68;
    group.add(lens);
    curveMesh(
      "glasses-temple",
      [
        [sign * 0.059, 1.571, 0.114],
        [sign * 0.092, 1.571, 0.068],
        [sign * 0.107, 1.558, 0.014],
        [sign * 0.099, 1.547, -0.018],
      ],
      0.0013,
      frameMaterial,
    );
  }
  curveMesh(
    "glasses-bridge",
    [
      [-0.011, 1.571, 0.114],
      [0, 1.576, 0.118],
      [0.011, 1.571, 0.114],
    ],
    0.0013,
    frameMaterial,
  );
  // A small marker identifies the anatomical heart inside the chest.
  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.012, 20, 12),
    new THREE.MeshBasicMaterial({
      color: 0xff8a88,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    }),
  );
  heart.name = "heart-source";
  heart.position.copy(FIELD_CENTER);
  heart.renderOrder = 3;
  group.add(heart);
  const rulerMaterial = new THREE.LineBasicMaterial({
    color: 0xb4baa7,
    transparent: true,
    opacity: 0.45,
  });
  const ruler = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.4, 0, 0),
      new THREE.Vector3(0.4, HUMAN_HEIGHT, 0),
    ]),
    rulerMaterial,
  );
  group.add(ruler);
  for (const height of [0, HUMAN_HEIGHT / 2, HUMAN_HEIGHT]) {
    group.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.375, height, 0),
          new THREE.Vector3(0.425, height, 0),
        ]),
        rulerMaterial,
      ),
    );
  }
  return group;
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
    positions.setXYZ(
      i,
      Math.cos(theta) * localRadius * banding,
      y,
      Math.sin(theta) * localRadius * banding,
    );
  }
  positions.needsUpdate = true;
  dust.points.material.size = Math.max(0.045, Math.min(0.16, radius * 0.006));
}

function updateCameraForRadius(radius) {
  const separation = state.secondaryEnabled
    ? Math.hypot(state.secondaryX, state.secondaryY, state.secondaryZ)
    : 0;
  const secondaryRadius = state.secondaryEnabled
    ? calculateMBand(state.secondaryCLT)
    : 0;
  const focusRadius = Math.max(
    MIN_CAMERA_RADIUS,
    Math.min(radius, state.mBand * 1.85),
    secondaryRadius * 1.85,
    separation * 0.65 + 2,
  );
  radius = Math.max(radius, secondaryRadius * 6.5 + separation);
  const target = state.secondaryEnabled
    ? FIELD_CENTER.clone().lerp(secondaryCenter, 0.5)
    : FIELD_CENTER.clone();
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
  bindRangePair(
    elements.secondaryFlipsRange,
    elements.secondaryFlipsInput,
    "secondaryFlips",
    0,
    10,
    2,
    () => {
      secondaryLastFlipBucket =
        state.secondaryFlips > 0
          ? Math.floor((simulationTime * state.secondaryFlips) / 60)
          : 0;
    },
  );
  bindRangePair(
    elements.secondaryJitterRange,
    elements.secondaryJitterInput,
    "secondaryJitter",
    0,
    15,
    1,
    () => updateFieldJitter(simulationTime),
  );
  elements.secondaryFlipNowButton.addEventListener("click", () =>
    triggerSecondaryFlip(simulationTime),
  );
  elements.pauseButton.addEventListener("click", () => {
    state.paused = !state.paused;
    syncTimeControls();
  });
  elements.stepButton.addEventListener("click", () => {
    if (state.paused) advanceSimulation(1 / 60);
  });
  elements.secondaryToggle.addEventListener("change", () => {
    state.secondaryEnabled = elements.secondaryToggle.checked;
    updateSecondary();
  });
  for (const [id, key, min, max] of [
    ["secondaryCLTInput", "secondaryCLT", 0, 50000],
    ["secondaryXInput", "secondaryX", -100, 100],
    ["secondaryYInput", "secondaryY", -20, 20],
    ["secondaryZInput", "secondaryZ", -100, 100],
    ["secondaryRPMInput", "secondaryRPM", 0, 350],
    ["secondaryTiltInput", "secondaryTilt", -180, 180],
  ])
    bindDecimalInput(elements[id], key, min, max, 2, updateSecondary);
  elements.secondaryDistanceInput.addEventListener("input", () => {
    const value = parseLooseNumber(elements.secondaryDistanceInput.value);
    if (value === null) return;
    const distance = clampNumber(value, 0, 150, 4);
    const current = Math.hypot(
      state.secondaryX,
      state.secondaryY,
      state.secondaryZ,
    );
    if (current < 1e-9) state.secondaryX = distance;
    else
      for (const key of ["secondaryX", "secondaryY", "secondaryZ"])
        state[key] *= distance / current;
    for (const key of ["secondaryX", "secondaryY", "secondaryZ"])
      elements[key + "Input"].value = formatInputNumber(state[key], 2);
    updateSecondary();
  });
  elements.secondaryReverseToggle.addEventListener("change", () => {
    state.secondaryReverse = elements.secondaryReverseToggle.checked;
    updateSecondary(false);
  });
  elements.stirringRange.addEventListener("input", () => {
    state.stirring = Number(elements.stirringRange.value);
    elements.stirringOutput.value = `${formatInputNumber(state.stirring, 1)}×`;
    if (fieldProbes.environment)
      fieldProbes.environment.stirring = state.stirring;
  });
  elements.refreshPathsButton.addEventListener("click", () =>
    fieldProbes.freezePaths(),
  );
  elements.electronColorMode.addEventListener("change", () => {
    state.electronColorMode = elements.electronColorMode.value;
    syncProbeControls();
  });
  elements.electronColorInput.addEventListener("input", () => {
    state.electronColor = elements.electronColorInput.value;
    syncProbeControls();
  });
  bindDecimalInput(elements.cltInput, "clt", 0, 50000, 2, updateAutomaticMBand);
  bindRangePair(elements.rpmRange, elements.rpmInput, "rpm", 0, 350, 1, noop);
  bindRangePair(
    elements.flipsRange,
    elements.flipsInput,
    "flips",
    0,
    10,
    2,
    noop,
  );
  bindRangePair(
    elements.tiltRange,
    elements.tiltInput,
    "tilt",
    -45,
    45,
    1,
    updateAxialTilt,
  );
  bindRangePair(
    elements.universalTiltRange,
    elements.universalTiltInput,
    "universalTilt",
    -180,
    180,
    1,
    updateAxialTilt,
  );
  bindRangePair(
    elements.jitterRange,
    elements.jitterInput,
    "fieldJitter",
    0,
    15,
    1,
    () => updateFieldJitter(simulationTime),
  );
  for (const [element, key] of [
    [elements.electronsToggle, "showElectrons"],
    [elements.compassesToggle, "showCompasses"],
    [elements.electronTrailsToggle, "electronTrails"],
    [elements.fieldLinesToggle, "showFieldLines"],
    [elements.capturedOnlyToggle, "capturedOnly"],
    [elements.stablePathsToggle, "stablePaths"],
  ]) {
    element.addEventListener("change", () => {
      state[key] = element.checked;
      syncProbeControls();
    });
  }
  for (const [element, key, min, max] of [
    [elements.electronCountRange, "electronCount", 100, 5000],
    [elements.electronSpeedRange, "electronSpeed", 0.1, 3],
  ]) {
    element.addEventListener("input", () => {
      state[key] = clampNumber(element.value, min, max, DEFAULTS[key]);
      fieldProbes.configure(
        state.mBand,
        state.electronCount,
        state.electronSpeed,
      );
      syncProbeControls();
    });
  }
  elements.respawnElectronsButton.addEventListener("click", () => {
    fieldProbes.respawn();
    updateElectronStateReadout();
  });
  elements.electronAttractionRange.addEventListener("input", () => {
    state.electronAttraction = clampNumber(
      elements.electronAttractionRange.value,
      0,
      5,
      DEFAULTS.electronAttraction,
    );
    syncProbeControls();
  });
  elements.rotationInflowRange.addEventListener("input", () => {
    state.rotationInflow = clampNumber(
      elements.rotationInflowRange.value,
      0,
      3,
      DEFAULTS.rotationInflow,
    );
    syncProbeControls();
  });
  elements.flipNowButton.addEventListener("click", () => {
    triggerPolarityFlip(simulationTime);
  });
  elements.menuToggleButton.addEventListener("click", toggleMenu);
  elements.fullscreenButton.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => {
    elements.fullscreenButton.textContent = document.fullscreenElement
      ? "×"
      : "⛶";
    requestAnimationFrame(resize);
  });

  elements.resetButton.addEventListener("click", () => {
    state = { ...DEFAULTS };
    simulationTime = 0;
    flipStartedAt = -999;
    flipTargetRotation = flipStartRotation = lastFlipBucket = 0;
    secondaryFlipStart =
      secondaryFlipTarget =
      secondaryFlipRotation =
      secondaryLastFlipBucket =
        0;
    secondaryFlipStartedAt = -999;
    electronInspector.clear();
    polarityPositive = true;
    fieldGroup.rotation.y =
      secondaryFieldGroup.rotation.y =
      flipGroup.rotation.z =
        0;
    syncInputs("all");
    updateSecondary(false);
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
  elements.secondaryFlipsRange.value = state.secondaryFlips;
  elements.secondaryFlipsInput.value = formatInputNumber(
    state.secondaryFlips,
    2,
  );
  elements.secondaryJitterRange.value = state.secondaryJitter;
  elements.secondaryJitterInput.value = formatInputNumber(
    state.secondaryJitter,
    1,
  );
  elements.secondaryToggle.checked = state.secondaryEnabled;
  for (const key of [
    "secondaryCLT",
    "secondaryX",
    "secondaryY",
    "secondaryZ",
    "secondaryRPM",
    "secondaryTilt",
  ])
    elements[key + "Input"].value = formatInputNumber(state[key], 2);
  elements.secondaryReverseToggle.checked = state.secondaryReverse;
  elements.stirringRange.value = state.stirring;
  elements.stirringOutput.value = `${formatInputNumber(state.stirring, 1)}×`;
  syncTimeControls();
  elements.cltInput.value = formatInputNumber(state.clt, 2);
  elements.mBandInput.value = formatInputNumber(state.mBand, 2);
  elements.rpmRange.value = state.rpm;
  elements.rpmInput.value = formatInputNumber(state.rpm, 1);
  elements.flipsRange.value = state.flips;
  elements.flipsInput.value = formatInputNumber(state.flips, 2);
  elements.tiltRange.value = state.tilt;
  elements.tiltInput.value = formatInputNumber(state.tilt, 1);
  elements.universalTiltRange.value = state.universalTilt;
  elements.universalTiltInput.value = formatInputNumber(state.universalTilt, 1);
  elements.jitterRange.value = state.fieldJitter;
  elements.jitterInput.value = formatInputNumber(state.fieldJitter, 1);
  updateFieldJitter(0);
  syncProbeControls();
}

function syncProbeControls() {
  elements.capturedOnlyToggle.checked = state.capturedOnly;
  elements.stablePathsToggle.checked = state.stablePaths;
  elements.electronColorMode.value = state.electronColorMode;
  elements.electronColorInput.value = state.electronColor;
  elements.singleColorRow.hidden = state.electronColorMode !== "single";
  elements.electronColorHint.textContent = {
    status:
      "Cyan: free · Green: interacting · Gold: captured · White: escaping",
    single: "All live electrons use your chosen color.",
    distance:
      "Warm near the source heart → violet at and beyond MH. Uses the dominant field’s radius.",
    speed:
      "Blue: slower → red: faster. Scale follows the dominant field’s radius and launch speed.",
  }[state.electronColorMode];
  fieldProbes.setStablePaths(state.stablePaths);
  fieldProbes.setDisplay(
    state.capturedOnly,
    state.electronColorMode,
    state.electronColor,
  );
  elements.refreshPathsButton.disabled =
    !state.showElectrons || !state.stablePaths;
  elements.electronsToggle.checked = state.showElectrons;
  elements.compassesToggle.checked = state.showCompasses;
  elements.electronTrailsToggle.checked = state.electronTrails;
  elements.fieldLinesToggle.checked = state.showFieldLines;
  elements.electronCountRange.value = state.electronCount;
  elements.electronSpeedRange.value = state.electronSpeed;
  elements.electronAttractionRange.value = state.electronAttraction;
  elements.electronCountOutput.value = state.electronCount;
  elements.electronSpeedOutput.value = `${formatInputNumber(state.electronSpeed, 1)}×`;
  elements.electronAttractionOutput.value = `${formatInputNumber(state.electronAttraction, 1)}×`;
  fieldProbes.attraction = state.electronAttraction;
  fieldProbes.inflow = state.rotationInflow;
  if (fieldProbes.environment)
    fieldProbes.environment.inflow = state.rotationInflow;
  elements.rotationInflowRange.value = state.rotationInflow;
  elements.rotationInflowOutput.value = `${formatInputNumber(state.rotationInflow, 1)}×`;
  for (const element of [
    elements.electronCountRange,
    elements.electronSpeedRange,
    elements.electronAttractionRange,
    elements.rotationInflowRange,
    elements.electronTrailsToggle,
    elements.respawnElectronsButton,
    elements.capturedOnlyToggle,
    elements.stablePathsToggle,
    elements.electronColorMode,
    elements.electronColorInput,
  ]) {
    element.disabled = !state.showElectrons;
  }
  fieldProbes.setVisibility(
    state.showElectrons,
    state.showCompasses,
    state.electronTrails,
  );
  lineGroup.visible = state.showFieldLines && !state.secondaryEnabled;
  shellGroup.visible = lineGroup.visible;
  tracerGroup.visible = lineGroup.visible;
  interactionLines.group.visible =
    state.showFieldLines && state.secondaryEnabled;
  if (interactionLines.group.visible)
    interactionLines.update(simulationTime, sources, true);
  dust.points.visible = false;
  const seeThroughFloor = state.showElectrons || state.showFieldLines;
  floor.material.transparent = seeThroughFloor;
  floor.material.opacity = seeThroughFloor ? 0.15 : 1;
  floor.material.depthWrite = !seeThroughFloor;
  floor.material.needsUpdate = true;
  updateElectronStateReadout();
}

function updateElectronStateReadout() {
  const counts = fieldProbes.counts;
  if (state.secondaryEnabled) {
    const captured = fieldProbes.captureCounts;
    elements.secondaryCaptureOutput.textContent = `Captured: Charlotte 1 ${captured[0]} · Charlotte 2 ${captured[1]}. Counts follow actual local forces.`;
  }
  const text = state.showElectrons
    ? `${counts.free} free (${fieldProbes.inboundCount} not yet entered) · ${counts.capturing} interacting · ${counts.captured} captured · ${counts.released} escaping · ${fieldProbes.ejections} total escapes · ${fieldProbes.reentryTimeouts} outside retries`
    : "Electrons hidden";
  if (elements.electronStateOutput.textContent !== text)
    elements.electronStateOutput.textContent = text;
  const events = fieldProbes.events;
  const outcomeText = state.showElectrons
    ? `${events.stays} bounces · ${events.bandChanges} band crossings · ${events.poleEjections} polar escapes · ${events.randomEjections} other escapes`
    : "";
  if (elements.electronOutcomeOutput.textContent !== outcomeText)
    elements.electronOutcomeOutput.textContent = outcomeText;
  elements.electronReentryOutput.textContent = `Escaped replacements spawn around either pole, ${formatNumber(reentryRadius(), 3)} m from the heart, with random launch directions at ${formatNumber(reentrySpeed(state.mBand), 2)} m/s (2 × M). Crossing MH allows time to return; replacement occurs beyond 4 × MH or after 20 simulation seconds continuously outside all fields.`;
  elements.electronBandOutput.hidden = !state.showElectrons;
  if (state.showElectrons) {
    const bandCounts = fieldProbes.bandCounts;
    for (let i = 0; i < bandCounts.length; i += 1) {
      const output = elements.electronBandOutput.querySelector(
        `[data-band-index="${i}"]`,
      );
      if (output.textContent !== String(bandCounts[i]))
        output.textContent = bandCounts[i];
    }
  }
}

function noop() {}

function updateAxialTilt() {
  universalTiltGroup.rotation.z = THREE.MathUtils.degToRad(state.universalTilt);
  fieldGroup.rotation.z = THREE.MathUtils.degToRad(state.tilt);
  secondaryUniversalGroup.rotation.z = THREE.MathUtils.degToRad(
    state.universalTilt,
  );
}

function updateFieldJitter(time) {
  const amplitude = THREE.MathUtils.degToRad(state.fieldJitter);
  // Smooth, bounded irregular shaking; no independent per-frame random jumps.
  jitterGroup.rotation.set(
    amplitude * (0.65 * Math.sin(time * 5.1) + 0.35 * Math.sin(time * 11.3)),
    amplitude *
      (0.65 * Math.sin(time * 4.3 + 1.1) + 0.35 * Math.sin(time * 9.7 - 1.1)),
    amplitude *
      (0.65 * Math.sin(time * 6.7 + 0.7) + 0.35 * Math.sin(time * 13.1 - 0.7)),
  );
  const secondaryAmplitude = THREE.MathUtils.degToRad(state.secondaryJitter);
  secondaryJitterGroup.rotation.set(
    secondaryAmplitude *
      (0.65 * Math.sin(time * 5.1 + 0.8) + 0.35 * Math.sin(time * 11.3 - 0.8)),
    secondaryAmplitude *
      (0.65 * Math.sin(time * 4.3 + 1.7) + 0.35 * Math.sin(time * 9.7 - 1.7)),
    secondaryAmplitude *
      (0.65 * Math.sin(time * 6.7 + 1.4) + 0.35 * Math.sin(time * 13.1 - 1.4)),
  );
}

function calculateMBand(clt) {
  // The formula's continuous limit at zero CLT is 1.09 meters.
  if (clt <= 0) return 1.09;
  return 1.09 + 40.7 / (1 + (5142 / clt) ** 1.542);
}

function updateAutomaticMBand() {
  if (calculateMBand(state.clt) === state.mBand) {
    updateIntensityReadouts();
    return;
  }
  updateField();
}

function updateField() {
  state.mBand = calculateMBand(state.clt);
  elements.mBandInput.value = formatInputNumber(state.mBand, 2);
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

    const lineCount = getFluxLineCount(band.id);
    const tubeRadius = Math.max(
      0.004,
      Math.min(0.025, radius * (band.id === "m" ? 0.0025 : 0.0015)),
    );
    for (let i = 0; i < lineCount; i += 1) {
      const phi = ((i + 0.5) / lineCount) * Math.PI * 2 + bandIndex * 0.11;
      const loop = createDipoleLoop(
        radius,
        phi,
        color,
        band.id === "m" ? 0.82 : band.opacity * 0.7,
        tubeRadius,
      );
      loop.curve.userData = { color: band.color, radius };
      lineGroup.add(loop.group);
      fieldLines.push(loop.group);
      fieldCurves.push(loop.curve);
    }
  });

  createTracers(fieldCurves);
  updateDustCloud(mhRadius);
  updateCameraForRadius(mhRadius);

  updateAxialTilt();
  positionPolarityCaps();

  elements.fieldScaleReadout.textContent = `MH R ${formatNumber(mhRadius, 1)} m`;
  elements.scaleNote.textContent = `True radius scale: M ${formatNumber(state.mBand, 2)} m, MH ${formatNumber(mhRadius, 1)} m`;
  updateIntensityReadouts();
  updateLegendDistances();
  updateViewerFieldReadout();
  flipGroup.getWorldQuaternion(fieldOrientation);
  fieldProbes.setOrientation(fieldOrientation);
  updateSourceMetadata();
  fieldProbes.setSources(
    state.secondaryEnabled ? sources : null,
    state.stirring,
  );
  fieldProbes.configure(state.mBand, state.electronCount, state.electronSpeed);
  syncProbeControls();
  updateElectronStateReadout();
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
  const curve = new THREE.Curve();
  const point = [0, 0, 0],
    tangent = [0, 0, 0];
  curve.closed = true;
  curve.getPoint = (t, target = new THREE.Vector3()) =>
    target.fromArray(sampleFieldLine(radius, phi, t, point));
  // Reserve a quarter of the mesh for the curved source return at every scale.
  // Uniform arc-length sampling formerly skipped the center on large outer loops.
  curve.getPointAt = curve.getPoint;
  curve.getTangent = (t, target = new THREE.Vector3()) => {
    sampleFieldLine(radius, phi, t, point);
    sampleDipoleField(point, [0, 0, 0], [0, 1, 0], 1, tangent);
    return target.fromArray(tangent).normalize();
  };
  curve.getTangentAt = curve.getTangent;
  const geometry = new THREE.TubeGeometry(curve, 320, tubeRadius, 8, true);
  // Keep bundled central flux thin enough to see its curved return and heart.
  const positions = geometry.attributes.position;
  for (let i = 0; i <= 320; i++) {
    sampleFieldLine(radius, phi, i === 320 ? 0 : i / 320, point);
    const width =
      0.16 +
      0.84 * Math.min(1, Math.hypot(...point) / (POLE_DISTANCE * 3)) ** 2;
    for (let j = 0; j <= 8; j++) {
      const vertex = i * 9 + j;
      positions.setXYZ(
        vertex,
        point[0] + (positions.getX(vertex) - point[0]) * width,
        point[1] + (positions.getY(vertex) - point[1]) * width,
        point[2] + (positions.getZ(vertex) - point[2]) * width,
      );
    }
  }
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: Math.min(0.7, opacity * 0.85 + 0.08),
    blending: THREE.NormalBlending,
    depthWrite: false,
  });

  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometry, material));
  const arrowT = 0.33;
  const arrowPosition = curve.getPointAt(arrowT);
  const arrowDirection = curve.getTangentAt(arrowT).normalize();
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(
      Math.max(tubeRadius * 3.1, 0.035),
      Math.max(tubeRadius * 8, 0.14),
      18,
    ),
    material.clone(),
  );
  arrow.position.copy(arrowPosition);
  arrow.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    arrowDirection,
  );
  arrow.material.opacity = Math.min(1, opacity + 0.34);
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
      const tracer = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 18, 12),
        material.clone(),
      );
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
    const t = phase; // The field orientation already applies polarity reversal.
    tracer.position.copy(tracer.userData.curve.getPointAt(t));
    const pulse =
      0.95 + Math.sin(elapsed * 10.5 + tracer.userData.phase) * 0.35;
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

  flipWave.material.opacity = 0;
  shellGroup.scale.setScalar(1);
  lineGroup.scale.setScalar(1);
}

function clearObjects(objects, parent) {
  for (const object of objects) {
    object.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
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
  flipGroup.rotation.z = THREE.MathUtils.lerp(
    flipStartRotation,
    flipTargetRotation,
    eased,
  );
}

function triggerPolarityFlip(elapsedSeconds) {
  polarityPositive = !polarityPositive;
  flipStartRotation = flipGroup.rotation.z;
  flipTargetRotation = flipStartRotation + Math.PI;
  flipStartedAt = elapsedSeconds;
}

function triggerSecondaryFlip(time) {
  secondaryFlipStart = secondaryFlipRotation;
  secondaryFlipTarget = secondaryFlipStart + Math.PI;
  secondaryFlipStartedAt = time;
}

function updateSecondaryPolarity(time) {
  if (!state.secondaryEnabled) return;
  if (state.secondaryFlips > 0) {
    const period = 60 / state.secondaryFlips;
    const bucket = Math.floor(time / period);
    if (bucket !== secondaryLastFlipBucket) {
      secondaryLastFlipBucket = bucket;
      triggerSecondaryFlip(time);
    }
    elements.secondaryPolarityStatus.textContent = `Next flip ${Math.ceil(period - (time % period))}s`;
  } else elements.secondaryPolarityStatus.textContent = "Polarity stable";
  const progress = Math.min(1, Math.max(0, time - secondaryFlipStartedAt));
  const eased = 0.5 - Math.cos(progress * Math.PI) * 0.5;
  secondaryFlipRotation = THREE.MathUtils.lerp(
    secondaryFlipStart,
    secondaryFlipTarget,
    eased,
  );
  secondaryFlipGroup.rotation.z =
    (state.secondaryReverse ? Math.PI : 0) + secondaryFlipRotation;
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
    const row = elements.legend.querySelector(
      `[data-band="${band.id}"] .legend-distance`,
    );
    row.textContent = state.secondaryEnabled
      ? `1: ${formatNumber(state.mBand * band.multiplier, 2)} m · 2: ${formatNumber(calculateMBand(state.secondaryCLT) * band.multiplier, 2)} m`
      : `${formatNumber(state.mBand * band.multiplier, 2)} m`;
  }
}

function updateViewerFieldReadout() {
  const epicenter = FIELD_CENTER;
  const distance = camera.position.distanceTo(epicenter);
  const band = getBandAtDistance(distance);
  const localClt = state.clt * band.strength;
  elements.viewerBandReadout.textContent = `${band.label} · ${formatNumber(distance, 1)} m`;
  elements.localCltReadout.textContent = `${formatNumber(localClt, localClt >= 100 ? 0 : 1)} CLT`;
  if (state.secondaryEnabled) {
    const distance = camera.position.distanceTo(secondaryCenter);
    const band = getBandAtDistance(
      distance,
      calculateMBand(state.secondaryCLT),
    );
    const localClt = state.secondaryCLT * band.strength;
    elements.secondaryViewerReadout.textContent = `Viewer: ${band.label} · ${formatNumber(distance, 1)} m · ${formatNumber(localClt, localClt >= 100 ? 0 : 1)} CLT. Polar re-entry: ${formatNumber(reentryRadius(), 3)} m at ${formatNumber(reentrySpeed(calculateMBand(state.secondaryCLT)), 2)} m/s.`;
  }
}

function getBandAtDistance(distance, radius = state.mBand) {
  const mRadius = Math.max(radius, 0.001);
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
  return (
    bands.find((band) => ratio <= band.max) || { label: "Outside", strength: 0 }
  );
}

function toggleMenu() {
  const hidden = elements.appShell.classList.toggle("menu-hidden");
  elements.menuToggleButton.textContent = hidden ? "☰" : "×";
  elements.menuToggleButton.setAttribute(
    "aria-label",
    hidden ? "Show controls menu" : "Hide controls menu",
  );
  elements.menuToggleButton.title = hidden
    ? "Show controls menu"
    : "Hide controls menu";
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
  if (trimmed === "" || trimmed === "." || trimmed === "-" || trimmed === "-.")
    return null;
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
  const maxDimension = renderer.capabilities.maxTextureSize;
  const pixelRatio = Math.min(
    window.devicePixelRatio || 1,
    pixelRatioLimit,
    Math.sqrt(MAX_RENDER_PIXELS / (width * height)),
    maxDimension / width,
    maxDimension / height,
  );
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

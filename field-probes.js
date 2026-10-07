import * as THREE from "three";
import { advanceFieldParticle, initializeFieldParticle, placeIncomingReplacement, sampleMagneticField } from "./electron-physics.mjs";
import { particleBand, fieldMapDistance, MH_MULTIPLIER } from "./field-lines.mjs";

const STEP = 1 / 120;
const TRAIL_LENGTH = 40;
const TRAIL_SAMPLE_TIME = 1 / 60;
const UP = new THREE.Vector3(0, 1, 0);
const PARTICLE_COLORS = {
  free: [0.3, 0.85, 1],
  capturing: [0.35, 1, 0.7],
  captured: [1, 0.8, 0.2],
  released: [1, 1, 1],
};

export class FieldProbes {
  constructor(scene, center) {
    this.center = center;
    this.radius = 4;
    this.speed = 1;
    this.accumulator = 0;
    this.particles = [];
    this.field = [0, 0, 0];
    this.moment = [0, 1, 0];
    this.spinAxis = [0, 1, 0];
    this.orientation = [0, 0, 0, 1];
    this.previousOrientation = new THREE.Quaternion();
    this.targetOrientation = new THREE.Quaternion();
    this.stepQuaternion = new THREE.Quaternion();
    this.stepOrientation = [0, 0, 0, 1];
    this.ejections = 0;
    this.events = { stays: 0, bandChanges: 0, poleEjections: 0, randomEjections: 0 };
    this.replacements = 0;
    this.inboundCount = 0;
    this.mapPoint = [0, 0, 0];
    this.bandCounts = new Array(9).fill(0);
    this.counts = { free: 0, capturing: 0, captured: 0, released: 0 };
    this.direction = new THREE.Vector3();
    this.electronGroup = new THREE.Group();
    this.compassGroup = new THREE.Group();
    scene.add(this.electronGroup, this.compassGroup);

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.25, "rgba(255,255,255,1)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "white";
    context.fillRect(20, 29, 24, 6);

    this.points = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0xffffff,
        vertexColors: true,
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        opacity: 0.85,
        size: 0.2,
      }),
    );
    this.trails = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.16,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
      }),
    );
    // Particles can travel outside their initial bounds before being released again.
    this.points.frustumCulled = this.trails.frustumCulled = false;
    this.electronGroup.add(this.trails, this.points);
    this.compasses = this.createCompasses();
    this.setVisibility(false, false, false);
  }

  createCompasses() {
    const red = new THREE.MeshBasicMaterial({ color: 0xff635c });
    const blue = new THREE.MeshBasicMaterial({ color: 0x80bbff });
    const body = new THREE.MeshBasicMaterial({ color: 0xc9dbd9, transparent: true, opacity: 0.35 });
    const cone = new THREE.ConeGeometry(0.075, 0.38, 8);
    const ringGeometry = new THREE.TorusGeometry(0.25, 0.014, 6, 32);
    const compasses = [];
    // Fixed probes surround the field center in three horizontal layers.
    for (const height of [-0.65, 0, 0.65]) {
      for (let i = 0; i < 6; i += 1) {
        const angle = i * Math.PI / 3 + (height === 0 ? 0 : Math.PI / 6);
        const anchor = new THREE.Group();
        const needle = new THREE.Group();
        const north = new THREE.Mesh(cone, red);
        north.position.y = 0.19;
        const south = new THREE.Mesh(cone, blue);
        south.position.y = -0.19;
        south.rotation.z = Math.PI;
        needle.add(north, south);
        const ring = new THREE.Mesh(ringGeometry, body);
        ring.rotation.x = Math.PI / 2;
        anchor.add(ring, needle);
        this.compassGroup.add(anchor);
        compasses.push({ anchor, needle, offset: [Math.cos(angle), height, Math.sin(angle)] });
      }
    }
    return compasses;
  }

  configure(radius, count, speed) {
    this.radius = radius;
    this.speed = speed;
    this.accumulator = 0;
    this.points.material.size = Math.min(0.22, radius * 0.028);
    this.points.geometry.dispose();
    this.trails.geometry.dispose();
    this.points.geometry = new THREE.BufferGeometry();
    this.trails.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 3);
    this.trailPositions = new Float32Array(count * (TRAIL_LENGTH - 1) * 6);
    const colors = new Float32Array(this.trailPositions.length);
    this.trailColors = colors;
    this.points.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.points.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.trails.geometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.trails.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.particles = Array.from({ length: count }, () => ({
      position: [0, 0, 0], velocity: [0, 0, 0], history: new Float32Array(TRAIL_LENGTH * 3),
      historyColors: new Float32Array(TRAIL_LENGTH * 3), head: 0, age: 0, trailTime: 0,
    }));
    this.respawn();
    for (const compass of this.compasses) {
      compass.anchor.position.set(
        this.center[0] + compass.offset[0] * radius * 1.1,
        this.center[1] + compass.offset[1] * radius,
        this.center[2] + compass.offset[2] * radius * 1.1,
      );
      compass.anchor.scale.setScalar(radius * 0.32);
    }
  }

  releaseParticle(particle, replacement = false) {
    initializeFieldParticle(particle, this.center, this.radius, this.orientation, this.speed);
    if (replacement) {
      placeIncomingReplacement(particle, this.center, this.radius, this.orientation);
      this.replacements += 1;
    }
    particle.age = 0;
    particle.head = 0;
    particle.trailTime = 0;
    for (let j = 0; j < TRAIL_LENGTH; j += 1) {
      particle.history.set(particle.position, j * 3);
      particle.historyColors.set(PARTICLE_COLORS[particle.phase], j * 3);
    }
  }

  respawn() {
    this.ejections = 0;
    this.events = { stays: 0, bandChanges: 0, poleEjections: 0, randomEjections: 0 };
    this.replacements = 0;
    for (const particle of this.particles) this.releaseParticle(particle);
    this.accumulator = 0;
    this.writeGeometry();
  }

  setVisibility(electrons, compasses, trails) {
    this.electronGroup.visible = electrons;
    this.compassGroup.visible = compasses;
    this.trails.visible = trails;
    if (!electrons) this.accumulator = 0;
  }

  setOrientation(orientation) {
    this.orientation[0] = orientation.x;
    this.orientation[1] = orientation.y;
    this.orientation[2] = orientation.z;
    this.orientation[3] = orientation.w;
    this.previousOrientation.copy(orientation);
  }

  update(delta, axis, intensity, spinAxis = axis, angularSpeed = 0, orientation = null) {
    if (!this.electronGroup.visible && !this.compassGroup.visible) return;
    this.moment[0] = axis.x;
    this.moment[1] = axis.y;
    this.moment[2] = axis.z;
    this.spinAxis[0] = spinAxis.x;
    this.spinAxis[1] = spinAxis.y;
    this.spinAxis[2] = spinAxis.z;
    if (orientation) this.targetOrientation.copy(orientation);
    else this.targetOrientation.fromArray(this.orientation);
    this.targetOrientation.toArray(this.orientation);
    if (this.electronGroup.visible) {
      this.accumulator += Math.min(delta, 0.05);
      const steps = Math.floor((this.accumulator + 1e-12) / STEP);
      for (let step = 0; step < steps; step += 1) {
        // Resolve field rotation within a frame. Applying the final pose to all
        // substeps creates artificial zigzags in otherwise genuine trails.
        this.stepQuaternion.slerpQuaternions(this.previousOrientation, this.targetOrientation, (step + 1) / steps);
        this.stepQuaternion.toArray(this.stepOrientation);
        for (const particle of this.particles) {
          const previousPhase = particle.phase;
          const previousVisits = particle.visits;
          advanceFieldParticle(particle, this.center, this.radius, intensity, this.stepOrientation, angularSpeed, STEP, this.spinAxis);
          if (particle.phase === "released" && previousPhase !== "released") {
            this.ejections += 1;
            if (particle.ejectionRoute === "pole") this.events.poleEjections += 1;
            else this.events.randomEjections += 1;
          }
          if (particle.visits > previousVisits) {
            const outcome = { stay: "stays", band_change: "bandChanges" }[particle.lastOutcome];
            if (outcome) this.events[outcome] += 1;
          }
          particle.age += STEP;
          if (!particle.inbound && (particle.phase === "released" || particle.phase === "free")
            && fieldMapDistance(particle.position, this.center, this.orientation, this.mapPoint) > this.radius * MH_MULTIPLIER) {
            this.releaseParticle(particle, true);
          }
          particle.trailTime += STEP;
          if (particle.trailTime >= TRAIL_SAMPLE_TIME) {
            particle.trailTime -= TRAIL_SAMPLE_TIME;
            particle.head = (particle.head + 1) % TRAIL_LENGTH;
            // Record only actual world positions and colors at that time. Field
            // rotation, band changes and ejection never transform old samples.
            particle.history.set(particle.position, particle.head * 3);
            particle.historyColors.set(PARTICLE_COLORS[particle.phase], particle.head * 3);
          }
        }
        this.accumulator -= STEP;
      }
      this.accumulator = Math.max(0, this.accumulator);
      this.writeGeometry();
    }
    this.previousOrientation.copy(this.targetOrientation);
    if (this.compassGroup.visible) {
      for (const compass of this.compasses) {
        sampleMagneticField(compass.anchor.position.toArray(), this.center, this.moment, this.radius, intensity, this.field);
        this.direction.fromArray(this.field);
        compass.needle.visible = this.direction.lengthSq() > 1e-16;
        if (compass.needle.visible) compass.needle.quaternion.setFromUnitVectors(UP, this.direction.normalize());
      }
    }
  }

  writeGeometry() {
    if (!this.positions) return;
    this.counts = { free: 0, capturing: 0, captured: 0, released: 0 };
    this.bandCounts.fill(0);
    this.inboundCount = 0;
    this.particles.forEach((particle, i) => {
      this.counts[particle.phase] += 1;
      if (particle.inbound) this.inboundCount += 1;
      const outside = particle.inbound || fieldMapDistance(particle.position, this.center, this.orientation, this.mapPoint) > this.radius * MH_MULTIPLIER;
      this.bandCounts[outside ? 8 : particleBand(particle.position, this.center, this.moment, this.radius)] += 1;
      this.colors.set(PARTICLE_COLORS[particle.phase], i * 3);
      this.positions.set(particle.position, i * 3);
      if (!this.trails.visible) return;
      for (let j = 0; j < TRAIL_LENGTH - 1; j += 1) {
        const a = ((particle.head - j + TRAIL_LENGTH) % TRAIL_LENGTH) * 3;
        const b = ((particle.head - j - 1 + TRAIL_LENGTH) % TRAIL_LENGTH) * 3;
        const offset = (i * (TRAIL_LENGTH - 1) + j) * 6;
        for (let endpoint = 0; endpoint < 2; endpoint += 1) {
          const source = endpoint === 0 ? a : b;
          const target = offset + endpoint * 3;
          const fade = 1 - (j + endpoint) / (TRAIL_LENGTH - 1);
          for (let k = 0; k < 3; k += 1) {
            this.trailPositions[target + k] = particle.history[source + k];
            this.trailColors[target + k] = particle.historyColors[source + k] * fade;
          }
        }
      }
    });
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (this.trails.visible) {
      this.trails.geometry.attributes.position.needsUpdate = true;
      this.trails.geometry.attributes.color.needsUpdate = true;
    }
  }
}

import * as THREE from "three";
import { advanceElectron, sampleMagneticField } from "./electron-physics.mjs";

const STEP = 1 / 120;
const TRAIL_LENGTH = 24;
const UP = new THREE.Vector3(0, 1, 0);

export class FieldProbes {
  constructor(scene, center) {
    this.center = center;
    this.radius = 4;
    this.speed = 1;
    this.accumulator = 0;
    this.particles = [];
    this.field = [0, 0, 0];
    this.midpoint = [0, 0, 0];
    this.moment = [0, 1, 0];
    this.direction = new THREE.Vector3();
    this.electronGroup = new THREE.Group();
    this.compassGroup = new THREE.Group();
    scene.add(this.electronGroup, this.compassGroup);

    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const context = canvas.getContext("2d");
    const glow = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, "rgba(230,255,255,1)");
    glow.addColorStop(0.25, "rgba(74,224,255,1)");
    glow.addColorStop(1, "rgba(74,224,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "white";
    context.fillRect(20, 29, 24, 6);

    this.points = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({
        color: 0x88eeff,
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        size: 0.2,
      }),
    );
    this.trails = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        transparent: true,
        opacity: 0.6,
        vertexColors: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    // Particles can travel outside their initial bounds before being released again.
    this.points.frustumCulled = this.trails.frustumCulled = false;
    this.electronGroup.add(this.trails, this.points);
    this.compasses = this.createCompasses();
    this.setVisibility(false, false, true);
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
    this.points.material.size = radius * 0.06;
    this.points.geometry.dispose();
    this.trails.geometry.dispose();
    this.points.geometry = new THREE.BufferGeometry();
    this.trails.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(count * 3);
    this.trailPositions = new Float32Array(count * (TRAIL_LENGTH - 1) * 6);
    const colors = new Float32Array(this.trailPositions.length);
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < TRAIL_LENGTH - 1; j += 1) {
        const fade = 1 - j / (TRAIL_LENGTH - 1);
        const offset = (i * (TRAIL_LENGTH - 1) + j) * 6;
        colors.set([0.25 * fade, 0.8 * fade, fade, 0.25 * fade, 0.8 * fade, fade], offset);
      }
    }
    this.points.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.trails.geometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
    this.trails.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.particles = Array.from({ length: count }, () => ({
      position: [0, 0, 0], velocity: [0, 0, 0], history: new Float32Array(TRAIL_LENGTH * 3), head: 0, age: 0,
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

  releaseParticle(particle) {
    const angle = Math.random() * Math.PI * 2;
    const y = Math.random() * 2 - 1;
    const radial = Math.sqrt(1 - y * y);
    const distance = this.radius * (0.45 + Math.random() * 0.9);
    particle.position[0] = this.center[0] + Math.cos(angle) * radial * distance;
    particle.position[1] = this.center[1] + y * distance;
    particle.position[2] = this.center[2] + Math.sin(angle) * radial * distance;
    const velocityAngle = Math.random() * Math.PI * 2;
    const velocityY = Math.random() * 2 - 1;
    const velocityRadial = Math.sqrt(1 - velocityY * velocityY);
    const speed = this.radius * 0.65 * this.speed;
    particle.velocity[0] = Math.cos(velocityAngle) * velocityRadial * speed;
    particle.velocity[1] = velocityY * speed;
    particle.velocity[2] = Math.sin(velocityAngle) * velocityRadial * speed;
    particle.age = 0;
    particle.head = 0;
    for (let j = 0; j < TRAIL_LENGTH; j += 1) particle.history.set(particle.position, j * 3);
  }

  respawn() {
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

  update(delta, axis, intensity) {
    if (!this.electronGroup.visible && !this.compassGroup.visible) return;
    this.moment[0] = axis.x;
    this.moment[1] = axis.y;
    this.moment[2] = axis.z;
    if (this.electronGroup.visible) {
      this.accumulator += Math.min(delta, 0.05);
      while (this.accumulator >= STEP) {
        for (const particle of this.particles) {
          for (let j = 0; j < 3; j += 1) this.midpoint[j] = particle.position[j] + particle.velocity[j] * STEP / 2;
          sampleMagneticField(this.midpoint, this.center, this.moment, this.radius, intensity, this.field);
          advanceElectron(particle.position, particle.velocity, this.field, STEP);
          particle.age += STEP;
          const distance = Math.hypot(
            particle.position[0] - this.center[0],
            particle.position[1] - this.center[1],
            particle.position[2] - this.center[2],
          );
          if (distance > this.radius * 3 || particle.age > 25) {
            this.releaseParticle(particle);
          }
        }
        this.accumulator -= STEP;
      }
      for (const particle of this.particles) {
        particle.head = (particle.head + 1) % TRAIL_LENGTH;
        particle.history.set(particle.position, particle.head * 3);
      }
      this.writeGeometry();
    }
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
    this.particles.forEach((particle, i) => {
      this.positions.set(particle.position, i * 3);
      if (!this.trails.visible) return;
      for (let j = 0; j < TRAIL_LENGTH - 1; j += 1) {
        const a = ((particle.head - j + TRAIL_LENGTH) % TRAIL_LENGTH) * 3;
        const b = ((particle.head - j - 1 + TRAIL_LENGTH) % TRAIL_LENGTH) * 3;
        const offset = (i * (TRAIL_LENGTH - 1) + j) * 6;
        for (let k = 0; k < 3; k += 1) {
          this.trailPositions[offset + k] = particle.history[a + k];
          this.trailPositions[offset + 3 + k] = particle.history[b + k];
        }
      }
    });
    this.points.geometry.attributes.position.needsUpdate = true;
    if (this.trails.visible) this.trails.geometry.attributes.position.needsUpdate = true;
  }
}

import * as THREE from "three";
import { particleBand, MH_MULTIPLIER } from "./field-lines.mjs";
import { sampleCombinedMagnetic, sourceDistance } from "./field-system.mjs";

const BAND_NAMES = ["NS", "CE", "E", "M", "PS", "MS", "MP", "MH"];
const STATUS_NAMES = {
  free: "Free",
  capturing: "Interacting",
  captured: "Captured",
  released: "Escaping",
};

export class ElectronInspector {
  constructor({ canvas, camera, scene, probes, getSources }) {
    Object.assign(this, { canvas, camera, probes, getSources });
    this.panel = document.getElementById("electronInspector");
    this.outputs = Object.fromEntries(
      [
        "title",
        "status",
        "field",
        "band",
        "distance",
        "speed",
        "magnetic",
        "motion",
        "note",
      ].map((key) => [
        key,
        document.getElementById(
          "electronDetail" + key[0].toUpperCase() + key.slice(1),
        ),
      ]),
    );
    this.projected = new THREE.Vector3();
    this.magnetic = [0, 0, 0];
    this.scratch = [0, 0, 0];
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.78, 1, 48),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    this.marker.visible = false;
    this.marker.renderOrder = 10;
    this.marker.frustumCulled = false;
    scene.add(this.marker);
    document
      .getElementById("clearElectronButton")
      .addEventListener("click", () => this.clear());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.clear();
    });
    canvas.addEventListener("pointerdown", (event) => {
      if (event.isPrimary && event.button === 0)
        this.pointer = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
    });
    canvas.addEventListener("pointerup", (event) => {
      const start = this.pointer;
      this.pointer = null;
      if (
        start?.id === event.pointerId &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 6
      )
        this.pick(event.clientX, event.clientY);
    });
    canvas.addEventListener("pointercancel", () => {
      this.pointer = null;
    });
  }
  text(key, value) {
    if (this.outputs[key].textContent !== value)
      this.outputs[key].textContent = value;
  }
  clear() {
    this.selected = null;
    this.panel.hidden = true;
    this.marker.visible = false;
  }
  pick(x, y) {
    if (!this.probes.electronGroup.visible) return;
    const rect = this.canvas.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    let closest = -1,
      score = 144;
    // A fixed pixel target remains usable across zoom levels and on touch
    // screens. Ignore clipped particles and particles hidden by display filters.
    this.probes.particles.forEach((particle, index) => {
      if (!this.probes.visibility[index]) return;
      this.projected.fromArray(particle.position).project(this.camera);
      if (this.projected.z < -1 || this.projected.z > 1) return;
      const px = rect.left + ((this.projected.x + 1) * rect.width) / 2;
      const py = rect.top + ((1 - this.projected.y) * rect.height) / 2;
      const distance = (px - x) ** 2 + (py - y) ** 2;
      if (distance < score) {
        score = distance;
        closest = index;
      }
    });
    if (closest < 0) {
      this.clear();
      return;
    }
    const particle = this.probes.particles[closest];
    this.selected = {
      particle,
      id: particle.id,
      index: closest,
      population: this.probes.particles,
    };
    this.panel.hidden = false;
    this.update();
  }
  update() {
    if (!this.probes.electronGroup.visible) {
      this.clear();
      return;
    }
    if (!this.selected) return;
    const { particle, id, index, population } = this.selected;
    if (population !== this.probes.particles || particle.id !== id) {
      this.text(
        "status",
        population !== this.probes.particles
          ? "Population restarted"
          : "Escaped · replaced",
      );
      this.text(
        "note",
        "This electron is no longer active. Click another particle to inspect it.",
      );
      this.selected = null;
      this.marker.visible = false;
      return;
    }
    const sources = this.getSources();
    const sourceIndex = Math.min(particle.sourceIndex ?? 0, sources.length - 1);
    const source = sources[sourceIndex];
    const distance = sourceDistance(particle.position, source);
    this.text("title", `Electron #${id}`);
    this.text("status", STATUS_NAMES[particle.phase]);
    this.text(
      "field",
      sources.some((s) => s.intensity > 0)
        ? `Charlotte ${sourceIndex + 1}`
        : "No active field",
    );
    this.text(
      "band",
      distance > source.radius * MH_MULTIPLIER
        ? "Outside MH"
        : BAND_NAMES[
            particleBand(
              particle.position,
              source.center,
              source.moment,
              source.radius,
            )
          ],
    );
    this.text("distance", `${distance.toFixed(2)} m`);
    this.text("speed", `${Math.hypot(...particle.velocity).toFixed(2)} m/s`);
    sampleCombinedMagnetic(
      particle.position,
      sources,
      this.magnetic,
      this.scratch,
    );
    this.text(
      "magnetic",
      `${(Math.hypot(...this.magnetic) * 7.25).toFixed(3)} μT`,
    );
    this.text(
      "motion",
      `${particle.mirrorCount} bounces · ${Math.max(0, particle.visits - particle.mirrorCount)} band changes · ${particle.transfers ?? 0} transfers`,
    );
    this.text(
      "note",
      `${particle.age.toFixed(1)} s old${this.probes.visibility[index] ? "" : " · Hidden by capture filter"}${particle.inbound ? " · Has not entered MH" : ""}`,
    );
    this.marker.visible = !!this.probes.visibility[index];
    this.marker.position.fromArray(particle.position);
    this.marker.quaternion.copy(this.camera.quaternion);
    const height = Math.max(1, this.canvas.getBoundingClientRect().height);
    this.marker.scale.setScalar(
      ((this.camera.position.distanceTo(this.marker.position) *
        2 *
        Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) /
        height) *
        12,
    );
  }
}

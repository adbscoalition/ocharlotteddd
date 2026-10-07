import * as THREE from "three";
import { sampleCombinedMagnetic, sourceDistance } from "./field-system.mjs";

// Streamlines of the actual summed field, in world coordinates. They are
// directional field guides; recorded electron trajectories are separate.
export class InteractionLines {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.lastTime = -Infinity;
    this.field = [0, 0, 0];
    this.scratch = [0, 0, 0];
    this.lines = Array.from({ length: 32 }, (_, i) => {
      const line = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: [0xffd84d, 0x45df75, 0x37e1ea, 0x8d82ff][
            Math.floor(i / 4) % 4
          ],
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
      line.frustumCulled = false;
      this.group.add(line);
      return line;
    });
  }
  direction(p, sources) {
    sampleCombinedMagnetic(p, sources, this.field, this.scratch);
    const length = Math.hypot(...this.field);
    return length < 1e-12 ? [0, 0, 0] : this.field.map((v) => v / length);
  }
  trace(seed, sources, sign) {
    const points = [seed];
    let p = seed;
    for (let i = 0; i < 190; i++) {
      const distance = Math.min(...sources.map((s) => sourceDistance(p, s)));
      const h =
        sign *
        Math.min(
          Math.max(...sources.map((s) => s.radius)) * 0.12,
          0.035 + distance * 0.07,
        );
      const k1 = this.direction(p, sources);
      if (Math.hypot(...k1) < 0.5) break;
      const k2 = this.direction(
        p.map((v, j) => v + (h * k1[j]) / 2),
        sources,
      );
      const k3 = this.direction(
        p.map((v, j) => v + (h * k2[j]) / 2),
        sources,
      );
      const k4 = this.direction(
        p.map((v, j) => v + h * k3[j]),
        sources,
      );
      p = p.map(
        (v, j) => v + (h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j])) / 6,
      );
      points.push(p);
      if (sources.every((s) => sourceDistance(p, s) > s.radius * 13)) break;
      if (
        i > 45 &&
        Math.hypot(...p.map((v, j) => v - seed[j])) < Math.abs(h) * 0.8
      )
        break;
    }
    return points;
  }
  update(time, sources, force = false) {
    if (!this.group.visible || (!force && time - this.lastTime < 0.1)) return;
    this.lastTime = time;
    const bands = [0.5, 1, 1.7, 3.5];
    let index = 0;
    for (const source of sources) {
      const q = new THREE.Quaternion().fromArray(source.orientation);
      for (const band of bands)
        for (let j = 0; j < 4; j++) {
          const angle = ((j + 0.35) * Math.PI) / 2;
          const seed = new THREE.Vector3(
            Math.cos(angle) * source.radius * band,
            0,
            Math.sin(angle) * source.radius * band,
          )
            .applyQuaternion(q)
            .add(new THREE.Vector3().fromArray(source.center))
            .toArray();
          const points = this.trace(seed, sources, -1)
            .reverse()
            .slice(0, -1)
            .concat(this.trace(seed, sources, 1));
          const line = this.lines[index++];
          line.geometry.dispose();
          line.geometry = new THREE.BufferGeometry().setFromPoints(
            points.map((p) => new THREE.Vector3().fromArray(p)),
          );
        }
    }
  }
}

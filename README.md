# CLT Field Simulator

A local Three.js simulator for a fictional Charlotte Magnetic Field.

## Run

```sh
python3 -m http.server 5173
```

Then open:

```text
http://127.0.0.1:5173/
```

The app supports CLT intensity and an automatically calculated M-band radius, true rpm rotation, polarity flips per minute, magnetic axial tilt, colored CLT radius bands, live microtesla output, and tungsten concentration.

The M-band radius follows `M = 1.09 + 40.70 / (1 + (5142 / CLT)^1.542)` in meters. Changing CLT updates the radius, all field bands, electron population, compasses, camera framing and distance readouts. The radius display is read-only and rounded to two decimals; geometry uses the unrounded result. At zero CLT, the formula’s limit is 1.09 m. At the default 1,000 CLT, M is approximately 4.10703 m; at 5,142 CLT, it is 21.44 m.

Universal axial tilt (-180° to 180°) tilts all field bands together around the field center while the human stays upright. It starts at 0° and combines with the existing magnetic axial tilt, rotation, and polarity flips. Reset restores both tilt controls to their defaults.

Enable **Show free electrons** for 1,600 particles by default, adjustable from 100 to 5,000. Initial particles fill a varied volume around the source with random positions, pitch angles and gyrophases. Inner populations start faster and outer populations start slower. Cyan particles are free, green particles are interacting, gold particles are magnetized, and white particles are escaping. Initial-population launch speed is adjustable independently of replacement speed.

Escaped particles are replaced one-for-one at a **random position exactly 2 × MH from the field center**, moving toward the center at **2 × M meters per second**. Both quantities use the full-precision M formula: MH = 6.5 × M, so the spawn radius is 13 × M. At 1,000 CLT, this is approximately 53.39138 m with an initial speed of 8.21406 m/s. Directions sample azimuth and cosine latitude uniformly outside the polar caps (within ±0.85 cosine latitude); replacement particles never spawn on a polar beam. Incoming particles remain subject to the fields and are exempt from escape replacement until they first cross inside MH. Subsequent speed and direction respond to local forces. No fixed 100 m offset or 15 m/s rule remains.

Magnetism uses a **single closed dipole field** for electron forces, visible magnetic loops and compass needles. The source is a uniformly magnetized sphere of radius 0.72 m, centered on the upright human. Outside it, the dipole field falls as inverse distance cubed; inside, a finite uniform field returns from south to north. Normal magnetic flux is continuous at the surface, and the field is divergence-free. Exterior lines obey `r = L sin²(theta)` from northern to southern source footprints and close through the internal return path. Small display bands inside the source share the innermost external loops; band readouts still classify actual perpendicular distance from the magnetic axis. Spherical field halos and decorative dust are hidden. Polar plume/axis-beam geometry stays removed.

**Every electron follows integrated local forces** rather than snapping onto a guide, moving to a pole or selecting a scripted orbit. A symmetric Boris push bends negative-charge velocity and preserves magnetic-only speed. Integration samples the field at the drift midpoint and adapts to cyclotron rotation and spatial travel, capped at 64 substeps per 120 Hz physics tick for interactive performance. Helical motion, mirror reversals, curved drift and band crossings follow from the sampled field and velocities. Incoming and escaping particles use the same solver. Field rotation and tilt change the forces; they do not rotate particle positions or recorded histories.

The separate CLT electric model includes a softened radial trapping potential and an assumed rotating plasma flow with differential rotation. The motional electric term `E = -u × B` is integrated as a Boris rotation of velocity relative to that flow. These electric terms can do work; magnetic force alone does not supply attraction or energy. Weak stochastic pitch scattering rotates velocity without adding speed. Their coefficients and source strength are model assumptions for the fictional CLT field, not a self-consistent plasma or Maxwell solver. The adaptive step cap and display-unit charge-to-mass ratio limit fidelity at extreme fields. Live readouts distinguish magnetized/interacting particles, real parallel-velocity reversals, band crossings and actual escape directions; escape paths are not assigned an arbitrary pole/random probability.

Trails stay **off by default**. When enabled, they retain actual world positions and original state colors at 60 Hz over 0.65 seconds, with only age fading. Rotation, tilt and changes in particle state never move old samples. Physics ticks interpolate field orientation between display frames. Replacing a particle resets that particle’s trail; fresh injection, reset, or a change of radius/count/initial speed starts a new population and history.

Enable **Show compasses** for 18 fixed probes sampling exactly the same vector field as electrons. Red tips point along B and disappear at zero CLT. **Show field lines** controls closed loops and direction tracers independently of physics. Zero CLT disables magnetic and electric forces, leaving ballistic motion. Universal tilt and polarity reversal rotate the field while the human stays upright. Reset restores the formula-derived radius, 1,600 electrons and trails off.

Physics references researched for the implementation and linked in the UI:

- [Feynman Lectures: magnetic flux, vector potential and magnetic/electric work](https://www.feynmanlectures.caltech.edu/II_15.html)
- [Richard Fitzpatrick, UT Austin: dipole field lines, radiation-belt orbits and mirrors](https://farside.ph.utexas.edu/teaching/plasma/Plasmahtml/node24.html)
- [UT Austin: magnetic mirror and loss-cone physics](https://farside.ph.utexas.edu/teaching/plasma/Plasmahtml/node23.html)
- [PlasmaPy: Boris charged-particle integration](https://docs.plasmapy.org/en/stable/api/plasmapy.simulation.particle_integrators.BorisIntegrator.html)

Run physics verification with `node --test tests/electron-physics.test.mjs`. Checks cover field divergence and surface flux, closed-loop/vector alignment, speed conservation, actual mirror bouncing, nonpolar replacement geometry and scaling, field-responsive entry/escape, zero field, continuous position under tilt and finite extreme settings.

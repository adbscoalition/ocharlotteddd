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

The M-band radius follows `M = 1.09 + 40.70 / (1 + (5142 / CLT)^1.542)` in meters. Changing CLT updates the radius, all field bands, electron guides, compasses, camera framing and distance readouts. The radius display is read-only and rounded to two decimals; geometry uses the unrounded result. At zero CLT, the formula’s limit is 1.09 m. At the default 1,000 CLT, M is approximately 4.10703 m; at 5,142 CLT, it is 21.44 m.

Universal axial tilt (-180° to 180°) tilts all field bands together around the field center while the human stays upright. It starts at 0° and combines with the existing magnetic axial tilt, rotation, and polarity flips. Reset restores both tilt controls to their defaults.

Enable **Show free electrons** to inject 800 particles by default, adjustable from 100 to 2,000. Initial particles enter near both poles with different offsets, entry angles, transverse velocities, energies and pitch angles. Cyan particles are free, green particles are entering, gold particles are guided, and white particles are ejected. Launch speed, trails, and fresh injection are adjustable. Incoming particles turn under a sampled Lorentz force; a separate CLT trapping/collision term provides the fictional capture behavior. Capture eases the remaining entry offset into the guiding orbit instead of snapping position.

Each captured particle has its own continuous flux radius and azimuth from the **same curve family used for visible magnetic lines**. There is no spherical confinement surface. Parallel transport follows arc length, with faster inner populations and slower outer populations. Independent azimuthal drift and weaker outer-band entrainment allow particles to orbit and slip relative to field rotation. Gyro motion lies perpendicular to the local guide tangent, becomes tighter and faster in stronger fields, and widens in weaker regions. Parallel motion slows near mirror regions. Pitch-angle scattering uses independent random encounter times and smooth transitions, without random position jitter.

At pole encounters particles may stay on the same band, transfer to a neighboring band, or eject. Transfers are stochastic, biased by field strength and particle energy. Low pitch angles enter the loss cone; high energy or weak confinement permits escape. Most pole ejections (80%) are polar, with a minority (20%) in random directions. Ejected particles continue to feel magnetic deflection, and magnetic-only free flight conserves speed through the Boris integrator. Loss of confinement releases a particle at its current position with velocity calculated from actual world displacement. Live state, outcome and current-position band counts show distribution and transport.

Trails are disabled by default and can be enabled with **Electron trails**. They are a fixed-time history of actual **world-space positions**, sampled at 60 Hz for 0.65 seconds. Field rotation, tilt, capture, band changes and ejection never reproject or reset old samples. Each sample retains its original state color, with only its age fading. Rotation is interpolated across the 120 Hz physics substeps to avoid artificial zigzags from frame-level pose changes. Replacing an escaped particle resets that particle’s history. Fresh injection, reset, or changing the radius, count or launch-speed settings starts a new population and history.

When an ejected or free particle crosses outside the rotating MH ellipsoid, it is replaced one-for-one exactly 100 meters beyond the polar MH surface, heading toward the field at 15 m/s. Incoming speed is initially fixed independently of the launch-speed control. Incoming particles remain subject to magnetic deflection and are exempt from escape detection until they enter MH; they count as Outside during approach. Zero CLT leaves particles ballistic and disables capture and guidance.

This is a **scaled, illustrative guiding-center model for a fictional field**, not a calibrated plasma solver. A magnetic field changes direction without doing work: the faster inner population is an assumed energy distribution, while capture requires the separate CLT trapping model. Gyro radii, frequencies, scattering, drift and loss-cone thresholds are display-scale approximations. The user-facing motion-model disclosure links these references:

- [OpenStax: charged-particle helices and magnetic mirrors](https://openstax.org/books/university-physics-volume-2/pages/11-3-motion-of-a-charged-particle-in-a-magnetic-field)
- [Richard Fitzpatrick, UT Austin: guiding-center motion and magnetic drift](https://farside.ph.utexas.edu/teaching/plasma/Plasmahtml/node19.html)
- [Particle In Cell: magnetic rotation with the Boris method](https://www.particleincell.com/2011/vxb-rotation/)

Enable **Show compasses** for 18 fixed 3D probes. Red tips point along the local sampled dipole field and disappear at zero CLT. Uncheck **Show field lines** to hide curves, halos, curve tracers, and background dust while keeping the continuous invisible guides, electrons, and compasses active. Polar plume lines and the axis beam remain removed. The floor becomes translucent while electrons are shown so both polar streams are visible. Reset restores defaults; the human always stays upright.

Run the magnetic physics checks with `node --test tests/electron-physics.test.mjs`.

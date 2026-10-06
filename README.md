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

The app supports independent CLT intensity and M-band radius controls, true rpm rotation, polarity flips per minute, magnetic axial tilt, colored CLT radius bands, live microtesla output, and tungsten concentration.

Universal axial tilt (-180° to 180°) tilts all field bands together around the field center while the human stays upright. It starts at 0° and combines with the existing magnetic axial tilt, rotation, and polarity flips. Reset restores both tilt controls to their defaults.

Enable **Show free electrons** to release 800 particles by default, adjustable from 100 to 2,000. Launch speed, trail visibility, and manual release are adjustable. Cyan particles are free, green particles are being drawn in, gold particles are captured, and white particles have been released. The readout counts each state. Escaped particles beyond the outer MH radius (6.5 M-band radii) are replaced; captured particles have no time limit. Changing radius, count, or launch speed releases a fresh cloud.

Enable **Show compasses** to place 18 fixed 3D probes around the field center. Red needle tips align with the local magnetic field and disappear at zero CLT. Both probes sample a continuous softened dipole field whose direction follows the displayed north pole through magnetic tilt, universal tilt, spin, and polarity flips. Field strength scales with CLT and falls off with distance. Electron capture samples this field everywhere; it does not depend on the number or visibility of rendered lines.

The illustrative particle model adds inward attraction, damping, and an inner confinement well to magnetic Lorentz bending. Local strength and launch energy determine capture; strong fields hold particles closer to the center. Captured particles co-rotate about the field's actual spin axis at the selected RPM with strength-dependent coupling. Exact rotational advection keeps high-RPM motion stable. Weakening the field releases particles with outward and retained rotational motion, and zero CLT removes attraction, capture, and co-rotation. Magnetic bending alone preserves speed; confinement and rotational entrainment can change particle energy. These effective capture forces model the fictional field, rather than bare magnetic attraction of physical free electrons.

Uncheck **Show field lines** to hide the field curves, halos, and curve tracers while keeping particle capture and compasses active. Polar plume lines and the polar axis beam have been removed. Reset restores line visibility and the default particle controls; the human always stays upright.

Run the magnetic physics checks with `node --test tests/electron-physics.test.mjs`.

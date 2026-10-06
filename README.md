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

Enable **Show free electrons** to release independent cyan particles with fading trails. Electron count, launch speed, trail visibility, and manual release are adjustable. Escaped particles (beyond three M-band radii) and particles older than 25 display seconds are released again; changing radius, count, or launch speed also releases a new cloud.

Enable **Show compasses** to place 18 fixed 3D probes around the field center. Red needle tips align with the local magnetic field and disappear at zero CLT. Both probes sample a softened dipole field whose direction follows the displayed north pole through magnetic tilt, universal tilt, spin, and polarity flips. The field strength scales with CLT and falls off with distance. Electrons remain in world space and bend according to the negative-charge Lorentz force; a fixed-step magnetic Boris integrator preserves speed. This is an illustrative, slowed, dimensionless simulation, without electric fields, particle interactions, or collisions. The existing colored lines are a stylized field display, not exact dipole trajectories.

Run the magnetic physics checks with `node --test tests/electron-physics.test.mjs`.

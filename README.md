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

Universal axial tilt (-180° to 180°) tilts the model and all field bands together around the field center. It starts at 0° and combines with the existing magnetic axial tilt, rotation, and polarity flips. Reset restores both tilt controls to their defaults.

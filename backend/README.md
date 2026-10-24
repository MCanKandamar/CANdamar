# CANdamar

A CAN bus analyzer for slcan adapters and CANopen drives -- in your browser or as a
Windows app. CANdamar is a fork of [CANviz](https://github.com/Chanchaldhiman/CANviz) by
Chanchal Dhiman.

- Live frame table, DBC decode, plotting (also without a DBC), record and replay
- J1939 and CANopen (CiA 301 / 402) decoders, SDO read/write with segmented upload and
  an EDS object browser
- slcan normal / listen-only mode, COM port detection, RTR frames
- Works with python-can interfaces: slcan, gs_usb (Candlelight), SocketCAN, PCAN,
  Kvaser, Seeed/GY USB-CAN analyzers and a virtual bus

```bash
candamar --interface slcan --channel COM3 --bitrate 500000
candamar-desktop      # same UI in its own window (needs the "desktop" extra)
```

The `canviz` command is installed as an alias of `candamar`.

Installation, documentation and the Windows app: https://github.com/MCanKandamar/CANdamar

MIT licence.

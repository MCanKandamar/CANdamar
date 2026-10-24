# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for the one-file Windows executable (CANviz.exe).

Build with packaging/windows/build_exe.ps1, which first builds the frontend
into backend/canviz/static and installs canviz[desktop] + PyInstaller.
"""

import os

from PyInstaller.utils.hooks import (
    collect_data_files,
    collect_dynamic_libs,
    collect_submodules,
    copy_metadata,
    get_package_paths,
)

HERE = SPECPATH  # noqa: F821 -- defined by PyInstaller

# gs_usb: PyInstaller's pyusb runtime hook looks for libusb-1.0.dll in the
# bundle root, so put a copy of the 64-bit DLL from the libusb package there.
_libusb_dir = get_package_paths("libusb")[1]
LIBUSB_DLL = os.path.join(_libusb_dir, "_platform", "windows", "x86_64", "libusb-1.0.dll")

# Modules imported by name at runtime, which static analysis cannot see
hiddenimports = (
    collect_submodules("canviz")
    + collect_submodules("uvicorn")          # loops / protocols chosen at startup
    + collect_submodules("can.interfaces")   # python-can loads interfaces by name
    + collect_submodules("gs_usb")
    + collect_submodules("usb")
    + collect_submodules("serial.tools")
    + collect_submodules("canopen")
    + collect_submodules("cantools")
    + collect_submodules("pretty_j1939")
    + ["python_multipart", "multipart"]
)

datas = (
    collect_data_files("canviz")             # built frontend in canviz/static
    + collect_data_files("libusb")           # bundled libusb-1.0.dll for gs_usb
    + collect_data_files("pretty_j1939")
    + collect_data_files("cantools")
    + copy_metadata("python-can")            # python-can reads its plugin entry points
    + copy_metadata("canviz")
)

binaries = collect_dynamic_libs("libusb") + [(LIBUSB_DLL, ".")]

a = Analysis(  # noqa: F821
    [f"{HERE}/canviz_desktop.py"],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=["tkinter", "matplotlib", "numpy.tests", "PyQt5", "PyQt6", "PySide2", "PySide6"],
    noarchive=False,
)
pyz = PYZ(a.pure)  # noqa: F821

exe = EXE(  # noqa: F821
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="CANviz",
    icon=f"{HERE}/canviz.ico",
    console=False,          # windowed app; logs go to %LOCALAPPDATA%\CANviz\canviz.log
    upx=False,
    runtime_tmpdir=None,
)

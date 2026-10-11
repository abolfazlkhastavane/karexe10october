# -*- mode: python ; coding: utf-8 -*-
# ساخت فایل اجرایی ویندوز:
#   1) از داخل پوشهٔ app اجرا کنید:  pyinstaller build.spec
#   2) خروجی در پوشهٔ dist/BarnameMotaleati ساخته می‌شود؛ کل آن پوشه را
#      منتقل/نصب کنید (نه فقط فایل exe تنها) چون فایل‌های web/ و assets/
#      و داده‌های قابل‌ویرایش (دروس، قالب‌ها و ...) کنار همان exe قرار می‌گیرند.
import os
from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_dynamic_libs

datas = [("web", "web")]
binaries = []
hiddenimports = ["core", "core.config", "core.schedule", "core.lessons", "core.templates", "core.table_io", "core.license_client", "core.export_pdf", "core.export_word", "api"]

for pkg in ["webview", "pythonnet", "clr_loader"]:
    try:
        d, b, h = collect_all(pkg)
        datas += d
        binaries += b
        hiddenimports += h
    except Exception:
        pass

# اطمینان از قرارگیری کامل فایل‌های DLL و runtime مربوط به pythonnet و clr_loader
try:
    datas += collect_data_files("pythonnet")
    binaries += collect_dynamic_libs("pythonnet")
    datas += collect_data_files("clr_loader")
    binaries += collect_dynamic_libs("clr_loader")
except Exception:
    pass

hiddenimports += ["clr", "pythonnet", "clr_loader", "clr_loader.ffi", "clr_loader.netfx"]

a = Analysis(
    ["main.py"],
    pathex=[os.path.abspath(".")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="BarnameMotaleati",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,   # پنجرهٔ کنسول سیاه نمایش داده نشود
    icon=None,       # در صورت داشتن آیکون: مسیر یک فایل .ico را اینجا بگذارید
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    name="BarnameMotaleati",
)

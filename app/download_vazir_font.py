#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
دانلود و نصب فونت «وزیر» (Vazir) — نسخهٔ رسمی از مخزن rastikerdar/vazir-font

این اسکریپت مستقل است (فقط کتابخانه‌های استاندارد پایتون) و:
  1) آخرین نسخهٔ رسمی فونت را از GitHub دانلود می‌کند
     (اگر API در دسترس نبود، از لینک ثابت نسخهٔ 30.1.0 و سپس آرشیو تگ استفاده می‌کند)
  2) فقط وزن‌های اصلی فارسی را استخراج می‌کند:
        Thin(100)  Light(300)  Regular(400)  Medium(500)  Bold(700)  Black(900)
     (نسخه‌های Variable / UI / Without-Latin عمداً کنار گذاشته می‌شوند تا تداخلی پیش نیاید)
  3) سلامت هر فایل را بررسی می‌کند (فرمت TrueType، حجم، وجود همهٔ وزن‌ها)
  4) فایل‌ها را داخل پوشهٔ fonts کنار همین اسکریپت می‌گذارد؛ برنامه خودکار همهٔ
     وزن‌ها را از همان‌جا بارگذاری می‌کند (رابط برنامه + خروجی PDF).
  5) با گزینهٔ --install (ویندوز) فونت‌ها را برای کاربر فعلی روی سیستم نصب می‌کند
     تا خروجی Word هم (که فقط «نام» فونت را ذخیره می‌کند) با وزیر نمایش داده شود.

اجرا:
    python download_vazir_font.py                # دانلود به app/fonts
    python download_vazir_font.py --install      # دانلود + نصب روی ویندوز
    python download_vazir_font.py --dest "D:\\app\\fonts" --force
"""
import argparse
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile

REPO = "rastikerdar/vazir-font"
PINNED_VERSION = "v30.1.0"
SOURCES_FALLBACK = [
    f"https://github.com/{REPO}/releases/download/{PINNED_VERSION}/vazir-font-{PINNED_VERSION}.zip",
    f"https://github.com/{REPO}/archive/refs/tags/{PINNED_VERSION}.zip",
]
API_LATEST = f"https://api.github.com/repos/{REPO}/releases/latest"

WEIGHTS = {"Thin": 100, "Light": 300, "Regular": 400, "Medium": 500, "Bold": 700, "Black": 900}
FILE_RE = re.compile(r"^Vazir-(Thin|Light|Regular|Medium|Bold|Black)\.ttf$")
EXCLUDED_PARTS = {"without-latin", "ui", "variable", "wol"}
MIN_FONT_BYTES = 40 * 1024
UA = {"User-Agent": "study-scheduler-font-downloader/1.0"}


def log(msg):
    print(msg, flush=True)


def http_get(url, timeout=60, retries=3):
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                total = int(resp.headers.get("Content-Length") or 0)
                chunks, done = [], 0
                while True:
                    chunk = resp.read(64 * 1024)
                    if not chunk:
                        break
                    chunks.append(chunk)
                    done += len(chunk)
                    if total:
                        print(f"\r   {done * 100 // total:3d}%  ({done // 1024} KB)", end="", flush=True)
                if total:
                    print()
                return b"".join(chunks)
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_err = e
            log(f"   تلاش {attempt}/{retries} ناموفق بود: {e}")
            time.sleep(1.5 * attempt)
    raise RuntimeError(f"دانلود ناموفق: {url} ({last_err})")


def candidate_urls():
    urls = []
    try:
        data = json.loads(http_get(API_LATEST, timeout=20, retries=1).decode("utf-8"))
        for asset in data.get("assets", []):
            if asset.get("name", "").lower().endswith(".zip"):
                urls.append(asset["browser_download_url"])
        tag = data.get("tag_name")
        if tag:
            urls.append(f"https://github.com/{REPO}/archive/refs/tags/{tag}.zip")
    except Exception as e:  # محدودیت نرخ API یا نبود اینترنت؛ به لینک‌های ثابت می‌رویم
        log(f"   (دریافت آخرین نسخه از API ممکن نشد: {e}) — از لینک‌های ثابت استفاده می‌شود")
    for u in SOURCES_FALLBACK:
        if u not in urls:
            urls.append(u)
    return urls


def pick_fonts(zf):
    """از داخل zip، برای هر وزن یک فایل TTF معتبر (بدون UI/Without-Latin/Variable) انتخاب می‌شود."""
    chosen = {}
    for info in zf.infolist():
        if info.is_dir():
            continue
        parts = [p.lower() for p in info.filename.replace("\\", "/").split("/")]
        base = os.path.basename(info.filename)
        m = FILE_RE.match(base)
        if not m or any(p in EXCLUDED_PARTS for p in parts[:-1]):
            continue
        weight_name = m.group(1)
        # اگر چند کپی بود، فایل بزرگ‌تر (نسخهٔ کامل) را نگه می‌داریم
        if weight_name not in chosen or info.file_size > chosen[weight_name].file_size:
            chosen[weight_name] = info
    return chosen


def license_member(zf):
    for info in zf.infolist():
        if os.path.basename(info.filename).upper() == "OFL.TXT":
            return info
    return None


def is_valid_ttf(data):
    return len(data) >= MIN_FONT_BYTES and data[:4] in (b"\x00\x01\x00\x00", b"true", b"OTTO")


def download_and_extract(dest, force=False):
    os.makedirs(dest, exist_ok=True)
    last_error = None
    for url in candidate_urls():
        log(f"⬇  دانلود از: {url}")
        try:
            raw = http_get(url)
            zf = zipfile.ZipFile(io.BytesIO(raw))
            bad = zf.testzip()
            if bad:
                raise RuntimeError(f"فایل zip خراب است ({bad})")
            chosen = pick_fonts(zf)
            missing = [w for w in WEIGHTS if w not in chosen]
            if missing:
                raise RuntimeError(f"وزن‌های ناقص در این آرشیو: {', '.join(missing)}")

            written = []
            for weight_name, info in chosen.items():
                data = zf.read(info)
                if not is_valid_ttf(data):
                    raise RuntimeError(f"فایل {info.filename} فونت TrueType معتبر نیست")
                target = os.path.join(dest, f"Vazir-{weight_name}.ttf")
                if os.path.exists(target) and not force:
                    log(f"   ⏭  موجود است (برای بازنویسی --force): {os.path.basename(target)}")
                else:
                    with open(target, "wb") as f:
                        f.write(data)
                    log(f"   ✔ {os.path.basename(target)}  ({len(data) // 1024} KB)")
                written.append(target)

            lic = license_member(zf)
            if lic:
                with open(os.path.join(dest, "OFL.txt"), "wb") as f:
                    f.write(zf.read(lic))
            return written
        except Exception as e:
            last_error = e
            log(f"   ✘ از این منبع نشد: {e}")
    raise RuntimeError(f"هیچ‌کدام از منابع کار نکرد. آخرین خطا: {last_error}")


def install_windows_user_fonts(font_paths):
    if os.name != "nt":
        log("ℹ  گزینهٔ --install فقط روی ویندوز اثر دارد؛ رد شد.")
        return
    import ctypes
    import winreg

    fonts_dir = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Windows", "Fonts")
    os.makedirs(fonts_dir, exist_ok=True)
    key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows NT\CurrentVersion\Fonts")
    for src in font_paths:
        name = os.path.splitext(os.path.basename(src))[0].replace("-", " ")  # Vazir Bold
        dst = os.path.join(fonts_dir, os.path.basename(src))
        shutil.copyfile(src, dst)
        winreg.SetValueEx(key, f"{name} (TrueType)", 0, winreg.REG_SZ, dst)
        ctypes.windll.gdi32.AddFontResourceW(dst)
        log(f"   ✔ نصب شد: {name}")
    winreg.CloseKey(key)
    log("✅ فونت‌ها برای کاربر فعلی نصب شدند. Word را ببندید و دوباره باز کنید.")


def main():
    default_dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")
    ap = argparse.ArgumentParser(description="دانلود فونت وزیر برای برنامهٔ مطالعاتی")
    ap.add_argument("--dest", default=default_dest, help="پوشهٔ مقصد (پیش‌فرض: fonts کنار این اسکریپت)")
    ap.add_argument("--force", action="store_true", help="بازنویسی فایل‌های موجود")
    ap.add_argument("--install", action="store_true", help="نصب فونت برای کاربر فعلی ویندوز (برای خروجی Word)")
    args = ap.parse_args()

    try:
        paths = download_and_extract(args.dest, force=args.force)
    except Exception as e:
        log(f"\n❌ {e}")
        log("اینترنت/فیلترشکن را بررسی کنید یا فایل‌های Vazir-*.ttf را دستی داخل پوشهٔ fonts بگذارید.")
        sys.exit(1)

    log(f"\n✅ {len(paths)} وزن فونت وزیر در «{args.dest}» آماده است.")
    if args.install:
        install_windows_user_fonts(paths)
    else:
        log("ℹ  برای اینکه خروجی Word هم با وزیر دیده شود، با --install اجرا کنید (ویندوز).")


if __name__ == "__main__":
    main()

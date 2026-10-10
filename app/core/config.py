"""
مدیریت مسیرها و تنظیمات برنامه.

دو نوع مسیر داریم:
  - RESOURCE_DIR : فایل‌های خواندنی همراه برنامه (رابط وب، فونت پیش‌فرض).
                   وقتی برنامه با PyInstaller به exe تبدیل شود، این مسیر
                   داخل بستهٔ موقت اجرا (sys._MEIPASS) قرار می‌گیرد.
  - DATA_DIR      : فایل‌های قابل‌ویرایش کاربر (دروس، قالب‌ها، تصاویر،
                   تنظیمات، لایسنس). همیشه کنار فایل exe / اسکریپت اصلی
                   قرار دارد تا کاربر به‌راحتی به آن‌ها دسترسی داشته باشد
                   و با هر بار آپدیت برنامه از بین نروند.
"""
import json
import os
import sys

APP_VERSION = "2.0.0"

# ==========================================================================
# مقادیر ثابت برنامه — فقط با ویرایش همین‌جا (قبل از build) قابل تغییرند.
# عمداً از طریق تنظیمات داخل برنامه یا فایل settings.json قابل ویرایش نیستند.
# ==========================================================================
APP_TITLE = "برنامه مطالعاتی دکتر مهدی کریمی"
# ⚠️ قبل از ساخت exe این آدرس را با آدرس Worker خودتان (+ /api/validate) عوض کنید:
LICENSE_API_URL = "https://red-rice-664d.a84364610.workers.dev/api/validate"

# آدرس شبکه‌های اجتماعی — عمداً ثابت داخل کد (غیرقابل ویرایش از تنظیمات کاربری)
INSTAGRAM_LINK = "https://instagram.com/dr.mehdi.karimi"
TELEGRAM_LINK = "https://t.me/dr_mehdi_karimi"


def _is_frozen():
    return getattr(sys, "frozen", False)


def get_resource_dir():
    """مسیر فایل‌های همراه بسته (فقط خواندنی)."""
    if _is_frozen():
        return getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
    # app/core/config.py -> app/
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def get_data_dir():
    """مسیر فایل‌های قابل‌ویرایش کاربر (کنار exe یا اسکریپت اصلی)."""
    if _is_frozen():
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


RESOURCE_DIR = get_resource_dir()
DATA_DIR = get_data_dir()

WEB_DIR = os.path.join(RESOURCE_DIR, "web")

# پوشهٔ فونت هم مثل نسخهٔ قدیمی، کنار exe/اسکریپت (داخل DATA_DIR) قرار دارد
# تا کاربر بتواند فونت را بدون بازساخت برنامه عوض کند.
FONTS_DIR = os.path.join(DATA_DIR, "fonts")

TEMPLATES_DIR = os.path.join(DATA_DIR, "templates")
AKS_DIR = os.path.join(DATA_DIR, "aks")
LESSON_CODES_FILE = os.path.join(DATA_DIR, "lesson_codes.json")
SETTINGS_FILE = os.path.join(DATA_DIR, "settings.json")
MOTIVATIONAL_FILE = os.path.join(DATA_DIR, "motivational_sentences.json")
LICENSE_CONFIG_FILE = os.path.join(DATA_DIR, "license_config.json")
LOG_FILE = os.path.join(DATA_DIR, "schedule_app.log")

BLACKLISTED_LESSON_FILES = {"all-s.xlsx", "all-l.xlsx"}

DEFAULT_MOTIVATIONAL_SENTENCES = [
    "🌟 «{{name}}، تو می‌تونی به هر چیزی که باور داری برسی!»",
    "☀️ «{{name}}، هر روز داری بهتر از دیروز می‌شی!»",
    "💫 «با پشتکار و تلاش، {{name}} می‌تونه هر هدفی رو فتح کنه!»",
    "🌈 «{{name}}، دنیای یادگیری با تو قشنگ‌تره!»",
    "🚀 «هیچ مانعی نمی‌تونه جلوی درخشش {{name}} رو بگیره!»",
    "🌱 «قدم‌به‌قدم، {{name}} داره به موفقیت نزدیک‌تر می‌شه.»",
    "✨ «ایمان دارم که {{name}} می‌تونه کارهای بزرگی انجام بده!»",
    "💪 «{{name}}، تو قوی‌تر از اون چیزی هستی که فکر می‌کنی!»",
    "📚 «هر درس جدید، یه فرصت تازه برای درخشش {{name}}‌ه!»",
    "🌸 «{{name}}، باور به خودت اولین قدم موفقیته!»",
    "🌞 «با ذهن باز و قلب مهربون، {{name}} همیشه پیشرفت می‌کنه.»",
    "💖 «{{name}}، خودت و تلاش‌هات قابل تحسینی!»",
    "🔥 «{{name}}، هیچ رویایی برای تو دور از دسترس نیست!»",
    "🎯 «تمرکز و اراده‌ی {{name}} کلید موفقیته!»",
    "🌻 «{{name}}، در مسیر یادگیری بدرخش!»",
]

# تنها کلیدهای مجاز در settings.json (هر کلید دیگری، از جمله عنوان یا آدرس سرور، نادیده گرفته می‌شود)
DEFAULT_SETTINGS = {
    "theme_accent": "#d9a036",
    "default_days": 10,
    "hours_shortcuts": "0.5, 1, 1.15, 1.30, 1.45, 2, 2.30, 3",
    "tests_shortcuts": "5, 10, 15, 20, 25, 30, 40, 50",
    "descriptive_shortcuts": "5, 10, 15, 20, 25, 30, 40, 50",
}


_WEIGHT_WORDS = [
    ("thin", 100), ("extralight", 200), ("light", 300), ("regular", 400), ("medium", 500),
    ("semibold", 600), ("extrabold", 800), ("bold", 700), ("black", 900),
]
_SKIP_WORDS = ("variable", "-fd", "wol", "code", "-ui")


def _font_family_and_weight(filename):
    base = os.path.splitext(filename)[0]
    lower = base.lower()
    if any(w in lower for w in _SKIP_WORDS):
        return None, None

    # تشخیص خانوادهٔ فونت
    family = "Vazir"
    if "ibmplexsansarabic" in lower or "ibm" in lower:
        family = "IBM Plex Sans Arabic"
    elif "shabnam" in lower:
        family = "Shabnam"
    elif "samim" in lower:
        family = "Samim"
    elif "tajawal" in lower:
        family = "Tajawal"
    elif "vazir" in lower:
        family = "Vazir"

    weight = 400
    for word, w_val in _WEIGHT_WORDS:
        if word in lower:
            weight = w_val
            break

    return family, weight


def get_font_faces():
    """
    همهٔ فونت‌های موجود در پوشهٔ fonts کنار exe.
    خروجی: [{"family": "Vazir", "url": "file:///...", "weight": 400, "path": ...}, ...]
    """
    import glob as _glob
    import pathlib

    faces = []
    seen = set()
    for ext in ("*.ttf", "*.otf"):
        for path in sorted(_glob.glob(os.path.join(FONTS_DIR, ext))):
            base = os.path.basename(path)
            family, weight = _font_family_and_weight(base)
            if not family:
                continue
            key = (family, weight)
            if key in seen:
                continue
            seen.add(key)
            faces.append({
                "family": family,
                "url": pathlib.Path(os.path.abspath(path)).as_uri(),
                "weight": weight,
                "path": path
            })
    return faces


def ensure_data_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(TEMPLATES_DIR, exist_ok=True)
    os.makedirs(AKS_DIR, exist_ok=True)
    os.makedirs(FONTS_DIR, exist_ok=True)


def load_json(path, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _editable_only(d):
    return {k: v for k, v in (d or {}).items() if k in DEFAULT_SETTINGS}


def get_settings():
    settings = dict(DEFAULT_SETTINGS)
    settings.update(_editable_only(load_json(SETTINGS_FILE, {})))
    settings["app_title"] = APP_TITLE  # ثابت؛ فقط برای نمایش به رابط وب داده می‌شود
    return settings


def save_settings(new_settings):
    settings = get_settings()
    settings.update(_editable_only(new_settings))
    settings.pop("app_title", None)
    save_json(SETTINGS_FILE, settings)
    settings["app_title"] = APP_TITLE
    return settings


def get_motivational_sentences():
    sentences = load_json(MOTIVATIONAL_FILE, None)
    if not sentences:
        sentences = list(DEFAULT_MOTIVATIONAL_SENTENCES)
        save_json(MOTIVATIONAL_FILE, sentences)
    return sentences


def save_motivational_sentences(sentences):
    sentences = [s for s in (sentences or []) if str(s).strip()]
    save_json(MOTIVATIONAL_FILE, sentences)
    return sentences

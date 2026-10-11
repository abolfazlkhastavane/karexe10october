"""
اعتبارسنجی لایسنس در برابر ورکر Cloudflare.

جریان کار:
  1) در هر اجرا صفحهٔ فعال‌سازی نمایش داده می‌شود و آخرین کدی که کاربر وارد
     کرده در فیلد پر شده است؛ کاربر فقط دکمهٔ «فعال‌سازی» را می‌زند (یا کد را عوض می‌کند).
  2) کد + شناسهٔ دستگاه به ورکر ارسال می‌شود. آدرس ورکر در کد ثابت است
     (config.LICENSE_API_URL) و از بیرون قابل تغییر نیست.
  3) کد وارد‌شده همیشه به‌عنوان «آخرین کد» ذخیره می‌شود (حتی اگر نامعتبر بود)
     تا کاربر مجبور به تایپ دوباره نباشد.

حالت تست (فقط هنگام اجرا از روی سورس .py، نه در exe):
     متغیر محیطی SCHEDULER_SKIP_LICENSE=1 صفحهٔ لایسنس را رد می‌کند.
"""
import logging
import os
import platform
import sys

import requests

from . import config

logger = logging.getLogger("ScheduleApp")


def get_machine_guid():
    guid = platform.node() + "-" + platform.system() + "-" + platform.machine()
    return guid.replace(" ", "_").upper()


def dev_bypass_enabled():
    """فقط در اجرای سورس (غیر frozen) و با متغیر محیطی صریح؛ در exe هرگز فعال نمی‌شود."""
    if getattr(sys, "frozen", False):
        return False
    return os.environ.get("SCHEDULER_SKIP_LICENSE", "").strip() == "1"


def get_saved_code():
    data = config.load_json(config.LICENSE_CONFIG_FILE, {})
    # license_code: نام کلید در نسخهٔ قبلی همین برنامه
    return (data.get("last_code") or data.get("license_code") or "").strip()


def save_code(code):
    config.save_json(config.LICENSE_CONFIG_FILE, {"last_code": code})


def send_usage_ping():
    code = get_saved_code()
    if not code:
        return
    try:
        requests.post(
            config.LICENSE_API_URL,
            json={"license_code": code, "machine_guid": get_machine_guid()},
            timeout=5,
        )
    except Exception:
        pass


def activate(license_code):
    """
    اتصال به ورکر برای اعتبارسنجی. مقدار بازگشتی:
      {"success": bool, "valid": bool, "message": str}
    success=False یعنی خود اتصال به سرور مشکل داشته (نه نامعتبربودن کد).
    """
    license_code = (license_code or "").strip()
    if not license_code:
        return {"success": False, "valid": False, "message": "لطفاً کد لایسنس را وارد کنید."}

    save_code(license_code)  # حتی اگر نامعتبر باشد، در دفعهٔ بعد در فیلد پر می‌شود

    try:
        response = requests.post(
            config.LICENSE_API_URL,
            json={"license_code": license_code, "machine_guid": get_machine_guid()},
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.Timeout:
        logger.error("زمان اتصال به سرور لایسنس به پایان رسید.")
        return {"success": False, "valid": False, "message": "زمان اتصال به سرور لایسنس به پایان رسید."}
    except requests.exceptions.ConnectionError:
        logger.error("خطای اتصال به سرور لایسنس.")
        return {"success": False, "valid": False, "message": "اتصال اینترنت را بررسی کنید."}
    except Exception:
        logger.error("خطا در برقراری ارتباط با سرور لایسنس.")
        return {"success": False, "valid": False, "message": "خطا در ارتباط با سرور لایسنس. لطفاً مجدداً تلاش کنید."}

    if data.get("success") and data.get("valid"):
        return {"success": True, "valid": True, "message": data.get("message", "لایسنس با موفقیت فعال شد.")}

    return {
        "success": True,
        "valid": False,
        "message": data.get("message", "اعتبارسنجی لایسنس ناموفق بود."),
    }

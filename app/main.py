"""
نقطهٔ ورود برنامه.
یک پنجرهٔ بدون‌قاب (frameless) بر پایهٔ موتور مرورگر سیستمی (WebView2 در
ویندوز) باز می‌کند که ظاهر مرورگر (آدرس‌بار، تب و ...) در آن دیده نمی‌شود؛
نوار عنوان و دکمه‌های کنترلی به‌طور کامل توسط رابط وب خودمان رسم می‌شوند.
"""
import logging
import os
import sys

# اطمینان از این‌که پکیج core (کنار همین فایل) همیشه قابل import باشد،
# چه در حالت توسعه و چه بعد از تبدیل به exe با PyInstaller.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from core import config  # noqa: E402

config.ensure_data_dirs()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    filename=config.LOG_FILE,
)
logger = logging.getLogger("ScheduleApp")

import webview  # noqa: E402  (بعد از تنظیم مسیر ایمپورت می‌شود)
from api import Api  # noqa: E402


def main():
    api = Api()

    index_path = os.path.join(config.WEB_DIR, "index.html")

    window = webview.create_window(
        title=config.APP_TITLE,
        url=index_path,
        js_api=api,
        width=1280,
        height=820,
        min_size=(1000, 650),
        frameless=True,
        easy_drag=True,
        resizable=True,
        text_select=True,
        confirm_close=False,
    )
    api.set_window(window)

    try:
        webview.start(debug=False)
    except Exception as e:
        logger.exception("خطای اصلی برنامه: %s", e)
        raise


if __name__ == "__main__":
    main()

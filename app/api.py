"""
کلاس Api — پل ارتباطی بین رابط وب (JavaScript) و منطق پایتون.
تمام متدهای عمومی این کلاس از طریق window.pywebview.api در جاوااسکریپت
قابل فراخوانی‌اند. هر متد یک دیکشنری JSON-پذیر برمی‌گرداند؛ در صورت خطا
{"success": False, "message": "..."} و در غیر این صورت حداقل
{"success": True, ...}.
"""
import functools
import logging
import os
import platform
import subprocess
import sys

from core import config, lessons, templates, license_client
from core.schedule import ScheduleState
from core.table_io import FileExistsConflict
from core import export_word, export_pdf

logger = logging.getLogger("ScheduleApp")


def guarded(fn):
    @functools.wraps(fn)
    def wrapper(self, *args, **kwargs):
        try:
            return fn(self, *args, **kwargs)
        except FileExistsConflict as e:
            return {"success": False, "conflict": True, "message": str(e)}
        except (ValueError, FileNotFoundError) as e:
            return {"success": False, "message": str(e)}
        except Exception as e:
            logger.exception("خطای غیرمنتظره در %s", fn.__name__)
            return {"success": False, "message": f"خطای غیرمنتظره: {e}"}
    return wrapper


class Api:
    def __init__(self):
        self.window = None
        # فقط بعد از فعال‌سازی موفق (یا حالت تست هنگام اجرا از سورس) True می‌شود
        self.licensed = license_client.dev_bypass_enabled()
        self.schedule = ScheduleState()
        self.schedule.set_days(config.get_settings().get("default_days", 10))
        self._start_ping_timer()

    def _start_ping_timer(self):
        import threading
        def ping():
            if self.licensed:
                license_client.send_usage_ping()
            timer = threading.Timer(60.0, ping)
            timer.daemon = True
            timer.start()
        ping()

    def set_window(self, window):
        self.window = window

    # ==================================================================
    # راه‌اندازی اولیه
    # ==================================================================
    def _require_license(self):
        if not self.licensed:
            raise ValueError("برنامه فعال نشده است. ابتدا کد لایسنس را فعال کنید.")

    @guarded
    def get_bootstrap(self):
        self._require_license()
        return {
            "success": True,
            "settings": config.get_settings(),
            "lessons": self._lesson_list_with_codes(),
            "templates": templates.list_template_names(),
            "table": self.schedule.compute_display_table(),
            "app_version": config.APP_VERSION,
            "font_faces": [{"url": f["url"], "weight": f["weight"]} for f in config.get_font_faces()],
        }

    def _lesson_list_with_codes(self):
        codes = lessons.get_lesson_codes()
        result = []
        for name in lessons.list_lesson_names():
            result.append({"name": name, "code": codes.get(name, "")})
        result.sort(key=lambda x: (x["name"] or ""))
        return result

    # ==================================================================
    # تنظیمات
    # ==================================================================
    @guarded
    def get_settings(self):
        return {"success": True, "settings": config.get_settings()}

    @guarded
    def save_settings(self, settings):
        return {"success": True, "settings": config.save_settings(settings)}

    @guarded
    def get_motivational_sentences(self):
        return {"success": True, "sentences": config.get_motivational_sentences()}

    @guarded
    def save_motivational_sentences(self, sentences):
        return {"success": True, "sentences": config.save_motivational_sentences(sentences)}

    # ==================================================================
    # لایسنس
    # ==================================================================
    @guarded
    def get_license_status(self):
        """اطلاعات لازم برای صفحهٔ فعال‌سازی: آخرین کد واردشده (برای پر شدن فیلد) و حالت تست."""
        return {
            "success": True,
            "saved_code": license_client.get_saved_code(),
            "bypass": self.licensed and license_client.dev_bypass_enabled(),
            "app_title": config.APP_TITLE,
            "font_faces": [{"url": f["url"], "weight": f["weight"]} for f in config.get_font_faces()],
        }

    @guarded
    def activate_license(self, code):
        result = license_client.activate(code)
        if result.get("success") and result.get("valid"):
            self.licensed = True
        return result

    # ==================================================================
    # مدیریت سورس‌های درسی
    # ==================================================================
    @guarded
    def list_lessons(self):
        return {"success": True, "lessons": self._lesson_list_with_codes()}

    @guarded
    def get_topics(self, subject_name):
        return {"success": True, "topics": lessons.get_topics(subject_name)}

    @guarded
    def get_lesson_table(self, name):
        return {"success": True, "rows": lessons.get_lesson_table(name)}

    @guarded
    def save_lesson_table(self, name, rows, original_name=None, force=False):
        lessons.save_lesson_table(name, rows, original_name=original_name, force=force)
        return {"success": True, "lessons": self._lesson_list_with_codes()}

    @guarded
    def delete_lesson(self, name):
        lessons.delete_lesson(name)
        return {"success": True, "lessons": self._lesson_list_with_codes()}

    @guarded
    def get_lesson_codes(self):
        return {"success": True, "codes": lessons.get_lesson_codes()}

    @guarded
    def save_lesson_codes(self, codes):
        saved = lessons.save_lesson_codes(codes)
        return {"success": True, "codes": saved, "lessons": self._lesson_list_with_codes()}

    # ==================================================================
    # مدیریت قالب‌ها
    # ==================================================================
    @guarded
    def list_templates(self):
        return {"success": True, "templates": templates.list_template_names()}

    @guarded
    def get_template_table(self, name):
        return {"success": True, "rows": templates.get_template_table(name)}

    @guarded
    def save_template_table(self, name, rows, original_name=None, force=False):
        templates.save_template_table(name, rows, original_name=original_name, force=force)
        return {"success": True, "templates": templates.list_template_names()}

    @guarded
    def delete_template(self, name):
        templates.delete_template(name)
        return {"success": True, "templates": templates.list_template_names()}

    @guarded
    def import_template(self, template_name, lesson_name, hours):
        self.schedule.add_template_entries(template_name, lesson_name, hours)
        return {"success": True, "table": self.schedule.compute_display_table()}

    # ==================================================================
    # برنامهٔ جاری (درس‌ها، جدول، ویرایش‌ها)
    # ==================================================================
    @guarded
    def set_days(self, days):
        self.schedule.set_days(days)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def set_student_name(self, name):
        self.schedule.set_student_name(name)
        return {"success": True}

    @guarded
    def get_table(self):
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def add_subject(self, subject_name, topics, hours, tests, descriptive, add_tests, add_descriptive):
        self.schedule.add_subject(subject_name, topics, hours, tests, descriptive, add_tests, add_descriptive)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def remove_subject(self, row):
        self.schedule.remove_subject(row)
        return {"success": True, "table": self.schedule.compute_display_table()}

    def reorder_subjects(self, old_index, new_index):
        self.schedule.reorder_subjects(old_index, new_index)
        return {"table": self.schedule.compute_display_table()}

    @guarded
    def get_manual_for_edit(self, row):
        return {"success": True, "manual": self.schedule.get_manual_for_edit(row), "days": self.schedule.days}

    @guarded
    def set_manual(self, row, manual_list):
        self.schedule.set_manual(row, manual_list)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def add_manual_subject(self, manual_list):
        self.schedule.add_manual_subject(manual_list)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def update_cell(self, row, col, text):
        self.schedule.update_single_cell(row, col, text)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def merge_row(self, row, factor, tests, descriptive):
        self.schedule.merge_row(row, factor, tests, descriptive)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def clear_cells(self, cells):
        self.schedule.clear_cells(cells)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def bulk_replace(self, cells, new_content):
        self.schedule.bulk_replace(cells, new_content)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def insert_and_shift(self, cells, new_content):
        self.schedule.insert_and_shift(cells, new_content)
        return {"success": True, "table": self.schedule.compute_display_table()}

    @guarded
    def save_selection_as_template(self, name, cells):
        self.schedule.save_selection_as_template(name, cells)
        return {"success": True, "templates": templates.list_template_names()}

    @guarded
    def reset_schedule(self):
        self.schedule.reset()
        return {"success": True, "table": self.schedule.compute_display_table()}

    # ==================================================================
    # خروجی Word / PDF
    # ==================================================================
    def _pick_save_path(self, default_name, file_types):
        if not self.window:
            return None
        try:
            import webview
            result = self.window.create_file_dialog(
                webview.SAVE_DIALOG, save_filename=default_name, file_types=file_types
            )
        except Exception:
            return None
        if not result:
            return None
        return result[0] if isinstance(result, (list, tuple)) else result

    def _open_file(self, path):
        try:
            if os.name == "nt":
                os.startfile(path)  # noqa
            elif platform.system() == "Darwin":
                subprocess.run(["open", path])
            else:
                subprocess.run(["xdg-open", path])
        except Exception as e:
            logger.warning("عدم امکان بازکردن خودکار فایل: %s", e)

    @guarded
    def export_word(self):
        self._require_license()
        if not self.schedule.student_name:
            raise ValueError("لطفاً نام دانش‌آموز را وارد کنید.")
        if not self.schedule.subjects:
            raise ValueError("لطفاً حداقل یک درس اضافه کنید.")

        default_name = f"برنامه درسی {self.schedule.student_name}.docx"
        path = self._pick_save_path(default_name, ("Word Files (*.docx)",))
        if not path:
            return {"success": True, "cancelled": True}
        if not path.lower().endswith(".docx"):
            path += ".docx"

        sentences = config.get_motivational_sentences()
        doc = export_word.generate_docx(self.schedule, sentences)
        doc.save(path)
        self._open_file(path)
        return {"success": True, "path": path}

    @guarded
    def list_chapter_folders(self):
        app_dir = config.DATA_DIR
        subjects = {"زیست": ["دهم", "یازدهم", "دوازدهم"], "شیمی": ["دهم", "یازدهم", "دوازدهم"], "فیزیک": ["دهم", "یازدهم", "دوازدهم"], "ریاضی": []}
        result = {}
        for subject, grades in subjects.items():
            s_dir = os.path.join(app_dir, subject)
            os.makedirs(s_dir, exist_ok=True)
            if subject == "ریاضی":
                math_folders = [f for f in os.listdir(s_dir) if os.path.isdir(os.path.join(s_dir, f))]
                for folder in math_folders:
                    ch_dir = os.path.join(s_dir, folder)
                    chapters = [c for c in os.listdir(ch_dir) if os.path.isdir(os.path.join(ch_dir, c))]
                    result[f"ریاضی - {folder}"] = [{"name": c, "path": os.path.join(ch_dir, c)} for c in chapters]
            else:
                for grade in grades:
                    g_dir = os.path.join(s_dir, grade)
                    os.makedirs(g_dir, exist_ok=True)
                    chapters = [c for c in os.listdir(g_dir) if os.path.isdir(os.path.join(g_dir, c))]
                    result[f"{subject} - {grade}"] = [{"name": c, "path": os.path.join(g_dir, c)} for c in chapters]
        return {"success": True, "structure": result}

    @guarded
    def export_pdf(self, font_family="Vazir", template_style="classic", font_size=11, chapter_paths=None):
        self._require_license()
        if not self.schedule.student_name:
            raise ValueError("لطفاً ابتدا نام دانش‌آموز را وارد کنید.")
        if not self.schedule.subjects:
            raise ValueError("لطفاً حداقل یک درس به برنامه اضافه کنید.")

        default_name = f"برنامه مطالعاتی {self.schedule.student_name}.pdf"
        path = self._pick_save_path(default_name, ("PDF Files (*.pdf)",))
        if not path:
            return {"success": True, "cancelled": True}
        if not path.lower().endswith(".pdf"):
            path += ".pdf"

        sentences = config.get_motivational_sentences()
        export_pdf.export_pdf(self.schedule, sentences, path, font_family, template_style, font_size, chapter_paths)
        self._open_file(path)
        return {"success": True, "path": path}

    # ==================================================================
    # کنترل پنجره (برای نوار عنوان سفارشی بدون ظاهر مرورگر)
    # ==================================================================
    def window_minimize(self):
        if self.window:
            self.window.minimize()
        return {"success": True}

    def window_toggle_maximize(self):
        if self.window:
            self.window.toggle_fullscreen()
        return {"success": True}

    def window_close(self):
        if self.window:
            self.window.destroy()
        return {"success": True}

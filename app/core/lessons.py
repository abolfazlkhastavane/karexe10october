"""
مدیریت «سورس‌های درسی»: فایل‌های xlsx داخل پوشهٔ اصلی داده که ستون اول‌شان
فهرست مباحث و ستون‌های بعدی محتوای هر مبحث (به‌همراه هایپرلینک احتمالی) است.
"""
import glob
import logging
import os

import openpyxl
import pandas as pd

from . import config
from .table_io import read_table, save_table, FileExistsConflict  # noqa: F401  (re-exported)

logger = logging.getLogger("ScheduleApp")


def _is_lesson_file(filename):
    lower = filename.lower()
    return lower not in config.BLACKLISTED_LESSON_FILES and not filename.startswith("~")


def list_lesson_names():
    config.ensure_data_dirs()
    pattern = os.path.join(config.DATA_DIR, "*.xlsx")
    names = []
    for path in glob.glob(pattern):
        filename = os.path.basename(path)
        if _is_lesson_file(filename):
            names.append(os.path.splitext(filename)[0])
    return sorted(names)


def list_lesson_files_for_manager():
    """برای دیالوگ «مدیریت سورس‌های درسی» — همان نام‌ها با پسوند."""
    return [f"{name}.xlsx" for name in list_lesson_names()]


def get_topics(subject_name):
    path = os.path.join(config.DATA_DIR, f"{subject_name}.xlsx")
    if not os.path.exists(path):
        return []
    df = pd.read_excel(path, header=None)
    return [str(t) for t in df.iloc[:, 0].dropna().tolist()]


def extract_topic_data_and_links(subject_name, chosen_topics):
    """استخراج محتوای ستون‌های بعدی و هایپرلینک‌های سلول‌ها برای مباحث انتخاب‌شده."""
    path = os.path.join(config.DATA_DIR, f"{subject_name}.xlsx")
    topic_data = []
    hyperlinks = {}
    chosen_set = set(chosen_topics)
    try:
        wb = openpyxl.load_workbook(path, data_only=False)
        sheet = wb.active
        current_index = 0
        for row in sheet.iter_rows():
            first_cell = row[0]
            first_val = str(first_cell.value).strip() if first_cell.value is not None else ""
            if first_val in chosen_set:
                for cell in row[1:]:
                    if cell.value is not None and str(cell.value).strip() != "":
                        topic_data.append(str(cell.value).strip())
                        if cell.hyperlink and cell.hyperlink.target:
                            hyperlinks[current_index] = cell.hyperlink.target
                        current_index += 1
        wb.close()
    except Exception as e:
        logger.error("خطا در خواندن هایپرلینک‌های اکسل: %s", e)
    return topic_data, hyperlinks


def get_lesson_table(subject_name):
    path = os.path.join(config.DATA_DIR, f"{subject_name}.xlsx")
    if not os.path.exists(path):
        raise FileNotFoundError(f"فایل '{subject_name}.xlsx' یافت نشد.")
    return read_table(path)


def save_lesson_table(name, rows, original_name=None, force=False):
    return save_table(config.DATA_DIR, name, rows, original_name=original_name, force=force)


def delete_lesson(subject_name):
    path = os.path.join(config.DATA_DIR, f"{subject_name}.xlsx")
    if os.path.exists(path):
        os.remove(path)


# ------------------------------------------------------------------
# کدهای درسی (نمایش «کد - نام‌درس» در فهرست دروس)
# ------------------------------------------------------------------
def get_lesson_codes():
    return config.load_json(config.LESSON_CODES_FILE, {})


def save_lesson_codes(codes):
    cleaned = {}
    for name, code in (codes or {}).items():
        name = str(name).strip()
        code = str(code).strip()
        if not name or not code:
            continue
        if not code.isdigit():
            raise ValueError(f"کد برای «{name}» باید عدد باشد.")
        cleaned[name] = code
    config.save_json(config.LESSON_CODES_FILE, cleaned)
    return cleaned

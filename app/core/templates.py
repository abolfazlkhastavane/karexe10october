"""
مدیریت «قالب‌ها»: جدول‌های آمادهٔ محتوای روز‌به‌روز که می‌توان آن‌ها را
به‌عنوان یک درس تازه به برنامه وارد کرد.
"""
import glob
import os

import pandas as pd

from . import config
from .table_io import read_table, save_table, FileExistsConflict  # noqa: F401


def list_template_names():
    config.ensure_data_dirs()
    pattern = os.path.join(config.TEMPLATES_DIR, "*.xlsx")
    names = []
    for path in glob.glob(pattern):
        filename = os.path.basename(path)
        if not filename.startswith("~"):
            names.append(os.path.splitext(filename)[0])
    return sorted(names)


def get_template_table(name):
    path = os.path.join(config.TEMPLATES_DIR, f"{name}.xlsx")
    if not os.path.exists(path):
        raise FileNotFoundError(f"قالب '{name}.xlsx' یافت نشد.")
    return read_table(path)


def save_template_table(name, rows, original_name=None, force=False):
    return save_table(config.TEMPLATES_DIR, name, rows, original_name=original_name, force=force)


def delete_template(name):
    path = os.path.join(config.TEMPLATES_DIR, f"{name}.xlsx")
    if os.path.exists(path):
        os.remove(path)


def save_rows_as_new_template(name, rows):
    """ذخیرهٔ سلول‌های انتخاب‌شده از جدول اصلی به‌عنوان یک قالب جدید."""
    return save_table(config.TEMPLATES_DIR, name, rows, original_name=None, force=False)


def build_subject_entries_from_template(template_name, lesson_name, hours):
    """
    وارد کردن یک قالب به برنامه: هر ردیف قالب یک «درس» جدید در برنامه می‌شود
    (رفتار دقیقاً مطابق نسخهٔ اصلی دسکتاپ).
    """
    path = os.path.join(config.TEMPLATES_DIR, f"{template_name}.xlsx")
    if not os.path.exists(path):
        raise FileNotFoundError(f"فایل قالب '{template_name}.xlsx' یافت نشد.")

    df = pd.read_excel(path, header=None)
    display_lesson_name = lesson_name or template_name
    entries = []
    for index, row in df.iterrows():
        row_data = ["" if pd.isna(v) else str(v) for v in row.tolist()]
        entries.append({
            "subject": display_lesson_name,
            "hours": hours or "0",
            "tests": "0",
            "descriptive": "0",
            "add_tests": True,
            "add_descriptive": True,
            "manual": row_data,
            "data": [],
            "links": {},
            "display_label": f"{display_lesson_name} (ردیف {index + 1})",
        })
    return entries

"""
خواندن/نوشتن فایل‌های xlsx به‌صورت یک جدول سادهٔ متنی (بدون هدر).
هم برای «سورس‌های درسی» و هم برای «قالب‌ها» استفاده می‌شود، چون هر دو
از نظر ساختار داده یکسان‌اند: یک جدول متنی دلخواه.
"""
import os

import pandas as pd


class FileExistsConflict(Exception):
    """وقتی نام جدید با یک فایل موجود دیگر برخورد دارد و نیاز به تأیید کاربر است."""

    def __init__(self, target_path):
        self.target_path = target_path
        super().__init__(f"فایل '{os.path.basename(target_path)}' از قبل موجود است.")


def read_table(path):
    df = pd.read_excel(path, header=None)
    rows = []
    for _, row in df.iterrows():
        rows.append(["" if pd.isna(v) else str(v) for v in row.tolist()])
    return rows


def write_table(rows):
    """rows -> DataFrame آمادهٔ ذخیره؛ ردیف‌های کاملاً خالی حذف می‌شوند."""
    cleaned = []
    for row in rows:
        row = [str(c).strip() if c is not None else "" for c in row]
        if any(c for c in row):
            cleaned.append(row)
    return cleaned


def save_table(directory, name, rows, original_name=None, force=False):
    """
    ذخیرهٔ یک جدول متنی به‌صورت name.xlsx داخل directory.
    اگر original_name داده شود یعنی حالت ویرایش است (برای تغییر نام/حذف فایل قدیمی).
    اگر فایل مقصد از قبل وجود دارد و force=False، خطای FileExistsConflict داده می‌شود.
    """
    name = (name or "").strip()
    if not name:
        raise ValueError("نام نمی‌تواند خالی باشد.")

    target_path = os.path.join(directory, f"{name}.xlsx")
    original_path = os.path.join(directory, f"{original_name}.xlsx") if original_name else None
    is_rename = original_path and os.path.normcase(original_path) != os.path.normcase(target_path)

    if (is_rename or not original_path) and os.path.exists(target_path) and not force:
        raise FileExistsConflict(target_path)

    cleaned_rows = write_table(rows)
    if not cleaned_rows:
        raise ValueError("جدول نمی‌تواند خالی باشد.")

    df = pd.DataFrame(cleaned_rows)
    df.to_excel(target_path, index=False, header=False)

    if is_rename and original_path and os.path.exists(original_path):
        try:
            os.remove(original_path)
        except OSError:
            pass

    return target_path

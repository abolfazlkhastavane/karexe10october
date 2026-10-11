"""
مدل و منطق «برنامهٔ فعلی»: فهرست دروس انتخاب‌شده، توزیع مباحث روی روزها،
ادغام خانه‌ها، جایگزینی/درج‌وشیفت گروهی، و آماده‌سازی جدول برای نمایش در
رابط وب. این ماژول معادل مستقیم متدهای کلاس ScheduleApp در نسخهٔ Qt است.
"""
from . import lessons, templates


class ScheduleState:
    def __init__(self):
        self.days = 10
        self.student_name = ""
        self.subjects = []  # هر عضو: dict مطابق ساختار original subjects_data

    # ------------------------------------------------------------
    # عملیات پایه
    # ------------------------------------------------------------
    def reset(self):
        self.subjects = []
        self.student_name = ""

    def set_days(self, days):
        try:
            days = int(days)
        except (TypeError, ValueError):
            days = 10
        self.days = max(1, min(31, days))
        return self.days

    def set_student_name(self, name):
        self.student_name = (name or "").strip()

    # ------------------------------------------------------------
    # افزودن دروس
    # ------------------------------------------------------------
    def add_subject(self, subject_name, chosen_topics, hours, tests, descriptive, add_tests, add_descriptive):
        if not subject_name or not chosen_topics:
            raise ValueError("لطفاً درس و حداقل یک مبحث را انتخاب کنید.")
        data, links = lessons.extract_topic_data_and_links(subject_name, chosen_topics)
        entry = {
            "subject": subject_name,
            "hours": hours or "0",
            "tests": tests or "0",
            "descriptive": descriptive or "0",
            "add_tests": bool(add_tests),
            "add_descriptive": bool(add_descriptive),
            "manual": [],
            "data": data,
            "links": links,
            "display_label": f"{subject_name} - {', '.join(chosen_topics)}",
        }
        self.subjects.append(entry)
        return entry

    def add_manual_subject(self, manual_list):
        manual_list = list(manual_list or [])
        first = manual_list[0] if manual_list else ""
        entry = {
            "subject": "دستی",
            "hours": "0",
            "tests": "0",
            "descriptive": "0",
            "add_tests": True,
            "add_descriptive": True,
            "manual": manual_list,
            "data": [],
            "links": {},
            "display_label": f"دستی | {first} ...",
        }
        self.subjects.append(entry)
        return entry

    def add_template_entries(self, template_name, lesson_name, hours):
        entries = templates.build_subject_entries_from_template(template_name, lesson_name, hours)
        self.subjects.extend(entries)
        return entries

    def remove_subject(self, row):
        if 0 <= row < len(self.subjects):
            del self.subjects[row]
        else:
            raise ValueError("درس مورد نظر یافت نشد.")

    def reorder_subjects(self, old_index, new_index):
        if 0 <= old_index < len(self.subjects) and 0 <= new_index < len(self.subjects):
            item = self.subjects.pop(old_index)
            self.subjects.insert(new_index, item)

    # ------------------------------------------------------------
    # ویرایش دستی
    # ------------------------------------------------------------
    def get_manual_for_edit(self, row):
        if not (0 <= row < len(self.subjects)):
            raise ValueError("درس انتخاب نشده است.")
        manual = self.subjects[row].get("manual") or []
        return [(manual[i] if i < len(manual) and manual[i] is not None else "") for i in range(self.days)]

    def set_manual(self, row, manual_list):
        if not (0 <= row < len(self.subjects)):
            raise ValueError("درس انتخاب نشده است.")
        self.subjects[row]["manual"] = list(manual_list)

    def update_single_cell(self, row, col, text):
        if not (0 <= row < len(self.subjects)):
            raise ValueError("درس یافت نشد.")
        manual = self.subjects[row].setdefault("manual", [])
        while len(manual) <= col:
            manual.append(None)
        manual[col] = text

    # ------------------------------------------------------------
    # ادغام خانه‌ها (چند مبحث در یک خانه)
    # ------------------------------------------------------------
    def merge_row(self, row, factor, tests, descriptive):
        if not (0 <= row < len(self.subjects)):
            raise ValueError("درس انتخاب نشده است.")
        factor = int(factor)
        if factor < 2:
            raise ValueError("عدد ادغام باید حداقل ۲ باشد.")
        subject = self.subjects[row]
        source = subject.get("manual") or []
        if not any(v is not None for v in source):
            source = subject.get("data") or []
        source = [str(v).split("\n")[0] for v in source if v]
        if not source:
            raise ValueError("هیچ محتوایی برای ادغام وجود ندارد.")

        extra = ""
        if tests:
            extra += f"\nتعداد تست: {tests}"
        if descriptive:
            extra += f"\nتعداد تشریحی: {descriptive}"
        if extra:
            extra += "\n"

        merged = []
        for i in range(0, len(source), factor):
            chunk = source[i:i + factor]
            merged.append(" - ".join(chunk) + extra)

        subject["manual"] = merged
        subject["data"] = []
        if tests:
            subject["tests"] = tests
        if descriptive:
            subject["descriptive"] = descriptive

    # ------------------------------------------------------------
    # عملیات گروهی روی خانه‌های انتخاب‌شدهٔ جدول پیش‌نمایش
    # cells: فهرستی از [row, col]
    # ------------------------------------------------------------
    def clear_cells(self, cells):
        for row, col in cells:
            if 0 <= row < len(self.subjects):
                manual = self.subjects[row].setdefault("manual", [])
                while len(manual) <= col:
                    manual.append(None)
                manual[col] = ""

    def bulk_replace(self, cells, new_content):
        for row, col in cells:
            if 0 <= row < len(self.subjects):
                manual = self.subjects[row].setdefault("manual", [])
                while len(manual) <= col:
                    manual.append(None)
                manual[col] = new_content

    def insert_and_shift(self, cells, new_content):
        display_days = self._display_days()
        by_row = {}
        for row, col in cells:
            by_row.setdefault(row, set()).add(col)

        for row, cols in by_row.items():
            if not (0 <= row < len(self.subjects)):
                continue
            subject = self.subjects[row]
            row_len = display_days
            manual_part = subject.get("manual") or []
            current_schedule = [None] * row_len
            for i in range(min(len(manual_part), row_len)):
                v = manual_part[i]
                if v is not None and str(v).strip() != "":
                    current_schedule[i] = v
            data_iter = iter(subject.get("data") or [])
            for i in range(row_len):
                if current_schedule[i] is None:
                    current_schedule[i] = next(data_iter, "")

            final_schedule = []
            source_it = iter(current_schedule)
            while len(final_schedule) < row_len:
                if len(final_schedule) in cols:
                    final_schedule.append(new_content)
                else:
                    final_schedule.append(next(source_it, ""))

            subject["manual"] = final_schedule
            subject["data"] = []

    def save_selection_as_template(self, name, cells):
        display = self.compute_display_table()
        by_row = {}
        min_col = max_col = None
        for row, col in cells:
            if row < 0 or row >= len(display["rows"]):
                continue
            if col < 0 or col >= display["display_days"]:
                continue
            text = display["rows"][row]["cells"][col]["text"].split("\n")[0]
            by_row.setdefault(row, {})[col] = text
            min_col = col if min_col is None else min(min_col, col)
            max_col = col if max_col is None else max(max_col, col)

        if min_col is None:
            raise ValueError("هیچ خانه‌ای انتخاب نشده است.")

        rows_out = []
        for row in sorted(by_row.keys()):
            row_cells = by_row[row]
            rows_out.append([row_cells.get(c, "") for c in range(min_col, max_col + 1)])

        return templates.save_rows_as_new_template(name, rows_out)

    # ------------------------------------------------------------
    # محاسبهٔ جدول نمایشی (معادل update_table در نسخهٔ اصلی)
    # ------------------------------------------------------------
    def _display_days(self):
        display_days = self.days
        for s in self.subjects:
            row_len = max(len(s.get("manual") or []), len(s.get("data") or []))
            if row_len > display_days:
                display_days = row_len
        return display_days

    @staticmethod
    def _effective_schedule(subject, length):
        manual = subject.get("manual") or []
        final = [None] * length
        is_manual = [False] * length
        for i in range(min(len(manual), length)):
            v = manual[i]
            if v is not None:
                final[i] = v
                is_manual[i] = True
        data_iter = iter(subject.get("data") or [])
        for i in range(length):
            if final[i] is None:
                final[i] = next(data_iter, "")
        return final, is_manual

    def compute_display_table(self):
        display_days = self._display_days()
        rows = []
        for s in self.subjects:
            row_len = max(len(s.get("manual") or []), len(s.get("data") or []))
            final, is_manual = self._effective_schedule(s, row_len)
            cells = []
            for col in range(display_days):
                if col < row_len:
                    raw = final[col]
                    text = "" if raw is None else str(raw)
                    manual_flag = is_manual[col]
                    if not manual_flag and text:
                        extra = ""
                        if s.get("add_tests", True) and str(s.get("tests", "0")) != "0":
                            extra += f"\nتعداد تست: {s.get('tests')}"
                        if s.get("add_descriptive", True) and str(s.get("descriptive", "0")) != "0":
                            extra += f"\nتعداد تشریحی: {s.get('descriptive')}"
                        if extra:
                            text += extra + "\n"
                    link = (s.get("links") or {}).get(col)
                else:
                    text, manual_flag, link = "", False, None
                cells.append({"text": text, "manual": manual_flag, "link": link})
            rows.append({
                "subject": s.get("subject", ""),
                "hours": s.get("hours", "0"),
                "label": s.get("display_label") or s.get("subject", ""),
                "cells": cells,
            })

        hidden_columns = []
        for col in range(display_days):
            if all(not r["cells"][col]["text"].strip() for r in rows):
                hidden_columns.append(col)

        return {
            "days": self.days,
            "display_days": display_days,
            "hidden_columns": hidden_columns,
            "rows": rows,
            "student_name": self.student_name,
        }

    def prepare_day_data(self, day_data, total_days):
        data = list(day_data)[:total_days]
        if len(data) < total_days:
            data += [""] * (total_days - len(data))
        return [str(x) for x in data]

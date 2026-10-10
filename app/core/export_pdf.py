"""
خروجی «لوکس PDF» — پورت مستقیم _build_luxury_pdf_html و رندر headless.
"""
import base64
import glob
import logging
import os
import random
import shutil
import subprocess
import tempfile

import pandas as pd

from . import config

logger = logging.getLogger("ScheduleApp")

PALETTE = [
    {"border": "#4f46e5", "bg": "#eef2ff", "text": "#312e81"},
    {"border": "#059669", "bg": "#ecfdf5", "text": "#064e3b"},
    {"border": "#d97706", "bg": "#fffbeb", "text": "#78350f"},
    {"border": "#db2777", "bg": "#fdf2f8", "text": "#831843"},
    {"border": "#7c3aed", "bg": "#f5f3ff", "text": "#4c1d95"},
    {"border": "#0284c7", "bg": "#f0f9ff", "text": "#0c4a6e"},
]


def _pick_random_quote(filename):
    path = os.path.join(config.AKS_DIR, filename)
    if not os.path.exists(path):
        return ""
    try:
        df = pd.read_excel(path, header=None)
        data = df[0].dropna().tolist()
        return str(random.choice(data)) if data else ""
    except Exception:
        return ""


AVAILABLE_FONTS = ["Vazir", "IBM Plex Sans Arabic", "Shabnam", "Tajawal", "Samim"]

def _embedded_font_css(chosen_font=None):
    """
    @font-face فونت‌های لود شده به‌صورت base64 داخل خود HTML (۱۰۰٪ آفلاین).
    """
    css = ""
    faces = config.get_font_faces()
    for face in faces:
        family = face.get("family", "Vazir")
        if chosen_font and chosen_font != "random" and family != chosen_font:
            continue
        try:
            with open(face["path"], "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
        except OSError:
            continue
        css += (
            f"@font-face {{ font-family: '{family}'; font-weight: {face['weight']}; font-style: normal; "
            f"src: url(data:font/ttf;base64,{b64}) format('truetype'); }}\n"
        )
    return css


def build_luxury_html(schedule_state, motivational_sentences, font_family="Vazir", template_style="classic", font_size=11):
    if font_family == "random" or not font_family:
        font_family = random.choice(AVAILABLE_FONTS)
    if template_style == "random" or not template_style:
        template_style = random.choice(["classic", "modern"])

    try:
        font_size = float(font_size)
    except (TypeError, ValueError):
        font_size = 11.0
    font_size = max(7.0, min(18.0, font_size))
    student_name = schedule_state.student_name
    days = schedule_state.days
    subjects = schedule_state.subjects

    logo_img_tag = ""
    karimi_img_tag = ""

    all_images = []
    for ext in ["*.png", "*.jpg", "*.jpeg", "*.webp"]:
        all_images.extend(glob.glob(os.path.join(config.AKS_DIR, ext)))

    logo_paths = [p for p in all_images if "logo" in os.path.basename(p).lower()]
    karimi_paths = [p for p in all_images if "logo" not in os.path.basename(p).lower()]

    if not logo_paths and all_images:
        logo_paths = [all_images[0]]
    if not karimi_paths and all_images:
        karimi_paths = [all_images[-1]]

    if logo_paths:
        chosen_logo = random.choice(logo_paths)
        try:
            with open(chosen_logo, "rb") as f:
                enc = base64.b64encode(f.read()).decode("utf-8")
            ext_type = os.path.splitext(chosen_logo)[1].replace(".", "").lower()
            logo_img_tag = f'<img src="data:image/{ext_type};base64,{enc}" class="brand-logo" />'
        except Exception as e:
            logger.warning("Error loading logo image: %s", e)

    if karimi_paths:
        chosen_karimi = random.choice(karimi_paths)
        try:
            with open(chosen_karimi, "rb") as f:
                enc = base64.b64encode(f.read()).decode("utf-8")
            ext_type = os.path.splitext(chosen_karimi)[1].replace(".", "").lower()
            karimi_img_tag = f'<img src="data:image/{ext_type};base64,{enc}" class="karimi-avatar" />'
        except Exception as e:
            logger.warning("Error loading karimi photo: %s", e)

    tele_url = config.TELEGRAM_LINK

    social_links_html = f"""
    <div class="social-links-box">
        <a href="{tele_url}" target="_blank" class="social-btn tele-btn">✈️ تلگرام</a>
    </div>
    """

    quote_s = _pick_random_quote("all-s.xlsx")
    quote_l = _pick_random_quote("all-l.xlsx")

    motivational_sentence = ""
    if motivational_sentences:
        motivational_sentence = random.choice(motivational_sentences).replace("{{name}}", student_name)

    table_rows_html = ""
    for r_idx, subject_data in enumerate(subjects):
        theme = PALETTE[r_idx % len(PALETTE)]
        sub_name = subject_data["subject"]
        sub_hours = subject_data.get("hours", "0")
        links_dict = subject_data.get("links", {}) or {}

        cells_html = ""
        all_data = schedule_state.prepare_day_data(subject_data.get("data", []), days)
        manual_data = subject_data.get("manual", []) or []

        for day_i in range(days):
            cell_val = str(all_data[day_i])
            has_manual = bool(manual_data and day_i < len(manual_data) and manual_data[day_i])
            if has_manual:
                cell_val = str(manual_data[day_i])

            link_url = links_dict.get(day_i) or links_dict.get(str(day_i))
            lines = [l.strip() for l in cell_val.split("\n") if l.strip()]
            main_topic = lines[0] if lines else ""

            extra_badges = ""
            tests_cnt = subject_data.get("tests", "0")
            desc_cnt = subject_data.get("descriptive", "0")

            extra_lines = lines[1:]
            for extra_line in extra_lines:
                if "تعداد تست" in extra_line or "تست:" in extra_line:
                    num = extra_line.split(":")[-1].strip()
                    txt = f"{num}t" if num.isdigit() else extra_line
                    extra_badges += f'<span class="badge badge-test">✅ {txt}</span>'
                elif "تعداد تشریحی" in extra_line or "تشریحی:" in extra_line:
                    num = extra_line.split(":")[-1].strip()
                    txt = f"{num}d" if num.isdigit() else extra_line
                    extra_badges += f'<span class="badge badge-desc">📝 {txt}</span>'
                else:
                    extra_badges += f'<span class="badge badge-custom">{extra_line}</span>'

            if not has_manual and not extra_lines:
                if subject_data.get("add_tests", True) and str(tests_cnt) != "0":
                    extra_badges += f'<span class="badge badge-test">✅ {tests_cnt}t</span>'
                if subject_data.get("add_descriptive", True) and str(desc_cnt) != "0":
                    extra_badges += f'<span class="badge badge-desc">📝 {desc_cnt}d</span>'

            if link_url:
                main_topic_html = f'<a href="{link_url}" class="hyperlink-btn" target="_blank">🔗 {main_topic}</a>'
            else:
                main_topic_html = f'<span class="topic-text">{main_topic}</span>' if main_topic else '<span class="empty-mark">—</span>'

            cells_html += f"""
            <td class="plan-cell">
                <div class="cell-inner">
                    {main_topic_html}
                    {f'<div class="badges-row">{extra_badges}</div>' if extra_badges else ''}
                </div>
            </td>
            """

        table_rows_html += f"""
        <tr>
            <td class="subject-lead-cell" style="border-right-color: {theme['border']}; background: {theme['bg']};">
                <div class="subject-lead-name" style="color: {theme['text']};">{sub_name}</div>
                <div class="subject-lead-hours">⏳ {sub_hours} ساعت مطالعه</div>
            </td>
            {cells_html}
        </tr>
        """

    embedded_font_css = _embedded_font_css(chosen_font=font_family)
    google_font_tag = "" if embedded_font_css else (
        '<link rel="preconnect" href="https://fonts.googleapis.com">'
        '<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;600;700;900&display=swap" rel="stylesheet">'
    )

    headers_html = '<th class="th-subject">عنوان درس و مبحث</th>'
    for i in range(1, days + 1):
        headers_html += f'<th>روز {i}</th>'

    if template_style == "modern":
        # قالب مدرن و خفن با تم گلاس‌مورفیسم / گرادینت تیره و کارت‌های شیک
        return f"""
        <!DOCTYPE html>
        <html lang="fa" dir="rtl">
        <head>
            <meta charset="UTF-8">
            <title>برنامه مطالعاتی مدرن {student_name}</title>
            {google_font_tag}
            <style>
                {embedded_font_css}
                @page {{ size: A4 landscape; margin: 5mm 6mm; }}
                * {{ box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
                body {{ font-family: '{font_family}', 'Vazir', 'Vazirmatn', Tahoma, sans-serif; background: #0f172a; margin: 0; padding: 0; direction: rtl; color: #f8fafc; }}
                .canvas-wrapper {{ background: #1e293b; border: 2px solid #334155; border-radius: 20px; padding: 14px 18px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }}
                .header-container {{ display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #1e40af 100%); border-radius: 16px; padding: 10px 18px; color: #ffffff; margin-bottom: 12px; box-shadow: 0 10px 25px rgba(29, 78, 216, 0.4); }}
                .header-side {{ width: 140px; display: flex; align-items: center; justify-content: center; }}
                .header-center {{ flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }}
                .student-badge {{ font-size: 19px; font-weight: 900; letter-spacing: -0.5px; display: inline-flex; align-items: center; gap: 8px; justify-content: center; }}
                .student-badge span {{ color: #fef08a; background: rgba(0,0,0,0.25); padding: 2px 10px; border-radius: 8px; border: 1px solid rgba(254, 240, 138, 0.3); }}
                .motivational-banner {{ margin-top: 4px; font-size: 12px; color: #dbeafe; font-weight: 600; text-align: center; }}
                .brand-logo {{ max-height: 48px; max-width: 130px; object-fit: contain; filter: drop-shadow(0 4px 10px rgba(0,0,0,0.4)); }}
                .karimi-avatar {{ max-height: 48px; max-width: 130px; border-radius: 8px; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.4); }}
                .social-links-box {{ display: flex; gap: 6px; margin-top: 4px; justify-content: center; }}
                .social-btn {{ display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-decoration: none !important; color: #fff !important; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); }}
                .table-schedule {{ width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 14px; overflow: hidden; border: 1px solid #475569; table-layout: fixed; background: #0f172a; }}
                .table-schedule thead th {{ background: #0284c7; color: #ffffff; font-size: 12px; font-weight: 800; padding: 8px 4px; text-align: center; border-bottom: 2px solid #0369a1; border-left: 1px solid #0369a1; }}
                .table-schedule thead th:last-child {{ border-left: none; }}
                .th-subject {{ width: 140px; background: #0369a1 !important; }}
                .table-schedule tbody tr {{ transition: all 0.2s ease; }}
                .table-schedule tbody tr:nth-child(even) {{ background-color: #1e293b; }}
                .table-schedule tbody tr:nth-child(odd) {{ background-color: #0f172a; }}
                .subject-lead-cell {{ border-right: 6px solid #38bdf8; border-bottom: 1px solid #334155; border-left: 1px solid #334155; padding: 8px 10px; text-align: right; vertical-align: middle; background: #1e293b; }}
                .subject-lead-name {{ font-size: {font_size + 1}px; font-weight: 800; color: #38bdf8; }}
                .subject-lead-hours {{ font-size: {font_size - 2}px; color: #94a3b8; margin-top: 3px; font-weight: 600; }}
                .plan-cell {{ border-bottom: 1px solid #334155; border-left: 1px solid #1e293b; padding: 4px 2px; text-align: center; vertical-align: middle; height: 48px; }}
                .cell-inner {{ display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 100%; }}
                .topic-text {{ font-size: {font_size}px; font-weight: 500; color: #f1f5f9; line-height: 1.25; }}
                .empty-mark {{ color: #475569; font-size: 13px; }}
                .hyperlink-btn {{ display: inline-block; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); color: #ffffff !important; text-decoration: none !important; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: {font_size - 2}px; box-shadow: 0 2px 6px rgba(37, 99, 235, 0.4); border: 1px solid rgba(255, 255, 255, 0.3); }}
                .badges-row {{ display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; margin-top: 1px; }}
                .badge {{ font-size: {max(7, font_size - 3)}px; font-weight: 700; padding: 1px 4px; border-radius: 3px; display: inline-block; line-height: 1.1; }}
                .badge-test {{ background: #0284c7; color: #ffffff; border: 1px solid #38bdf8; }}
                .badge-desc {{ background: #d97706; color: #ffffff; border: 1px solid #fbbf24; }}
                .badge-custom {{ background: #334155; color: #cbd5e1; border: 1px solid #475569; }}
                .footer-box {{ display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding: 8px 14px; background: #0f172a; border-radius: 12px; border: 1px solid #334155; font-size: {font_size - 1}px; color: #94a3b8; }}
                .footer-quote {{ font-weight: 700; color: #38bdf8; }}
            </style>
        </head>
        <body>
            <div class="canvas-wrapper">
                <div class="header-container">
                    <div class="header-side">{karimi_img_tag}</div>
                    <div class="header-center">
                        <div class="student-badge">🚀 برنامه مطالعاتی پیشرفته: <span>{student_name}</span></div>
                        {f'<div class="motivational-banner">{motivational_sentence}</div>' if motivational_sentence else ''}
                        {social_links_html}
                    </div>
                    <div class="header-side">{logo_img_tag}</div>
                </div>
                <table class="table-schedule">
                    <thead><tr>{headers_html}</tr></thead>
                    <tbody>{table_rows_html}</tbody>
                </table>
                <div class="footer-box">
                    <div class="footer-quote">💡 <b>پیام مشاور:</b> {quote_s if quote_s else 'پشتکار و تعهد به برنامه، کلید رتبه برتر شدن است.'}</div>
                    <div>{f'✨ {quote_l}' if quote_l else 'سامانه برنامه‌ریزی تخصصی'}</div>
                </div>
            </div>
        </body>
        </html>
        """

    # قالب کلاسیک لوکس (شیک و باطراوت)
    return f"""
    <!DOCTYPE html>
    <html lang="fa" dir="rtl">
    <head>
        <meta charset="UTF-8">
        <title>برنامه مطالعاتی {student_name}</title>
        {google_font_tag}
        <style>
            {embedded_font_css}
            @page {{ size: A4 landscape; margin: 6mm 8mm; }}
            * {{ box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }}
            body {{ font-family: '{font_family}', 'Vazir', 'Vazirmatn', Tahoma, sans-serif; background: #f8fafc; margin: 0; padding: 0; direction: rtl; color: #0f172a; }}
            .canvas-wrapper {{ background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 18px; padding: 14px 18px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.04); }}
            .header-container {{ display: flex; align-items: center; justify-content: space-between; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4338ca 100%); border-radius: 14px; padding: 10px 18px; color: #ffffff; margin-bottom: 12px; box-shadow: 0 8px 20px rgba(49, 46, 129, 0.25); }}
            .header-side {{ width: 140px; display: flex; align-items: center; justify-content: center; }}
            .header-center {{ flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }}
            .student-badge {{ font-size: 19px; font-weight: 900; letter-spacing: -0.5px; display: inline-flex; align-items: center; gap: 8px; justify-content: center; }}
            .student-badge span {{ color: #fde047; border-bottom: 2px dashed #fde047; padding-bottom: 2px; }}
            .motivational-banner {{ margin-top: 4px; font-size: 12px; color: #e0e7ff; font-weight: 600; text-align: center; }}
            .brand-logo {{ max-height: 48px; max-width: 130px; object-fit: contain; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2)); }}
            .karimi-avatar {{ max-height: 48px; max-width: 130px; border-radius: 8px; object-fit: cover; border: 1.5px solid rgba(255,255,255,0.4); }}
            .social-links-box {{ display: flex; gap: 6px; margin-top: 4px; justify-content: center; }}
            .social-btn {{ display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-decoration: none !important; color: #fff !important; background: rgba(255,255,255,0.18); border: 1px solid rgba(255,255,255,0.3); }}
            .table-schedule {{ width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 12px; overflow: hidden; border: 1px solid #cbd5e1; table-layout: fixed; }}
            .table-schedule thead th {{ background: #1e293b; color: #f8fafc; font-size: 12px; font-weight: 700; padding: 8px 4px; text-align: center; border-bottom: 2px solid #0f172a; border-left: 1px solid #334155; }}
            .table-schedule thead th:last-child {{ border-left: none; }}
            .th-subject {{ width: 140px; background: #0f172a !important; }}
            .table-schedule tbody tr {{ transition: all 0.2s ease; }}
            .table-schedule tbody tr:nth-child(even) {{ background-color: #fbfcfe; }}
            .table-schedule tbody tr:nth-child(odd) {{ background-color: #ffffff; }}
            .subject-lead-cell {{ border-right: 5px solid #4f46e5; border-bottom: 1px solid #e2e8f0; border-left: 1px solid #e2e8f0; padding: 8px 10px; text-align: right; vertical-align: middle; }}
            .subject-lead-name {{ font-size: {font_size + 1}px; font-weight: 800; }}
            .subject-lead-hours {{ font-size: {font_size - 2}px; color: #64748b; margin-top: 3px; font-weight: 600; }}
            .plan-cell {{ border-bottom: 1px solid #e2e8f0; border-left: 1px solid #f1f5f9; padding: 4px 2px; text-align: center; vertical-align: middle; height: 48px; }}
            .cell-inner {{ display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 100%; }}
            .topic-text {{ font-size: {font_size}px; font-weight: 500; color: #1e293b; line-height: 1.25; }}
            .empty-mark {{ color: #cbd5e1; font-size: 13px; }}
            .hyperlink-btn {{ display: inline-block; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff !important; text-decoration: none !important; font-weight: 700; padding: 2px 6px; border-radius: 4px; font-size: {font_size - 2}px; box-shadow: 0 2px 6px rgba(79, 70, 229, 0.3); border: 1px solid rgba(255, 255, 255, 0.4); }}
            .badges-row {{ display: flex; flex-wrap: wrap; gap: 2px; justify-content: center; margin-top: 1px; }}
            .badge {{ font-size: {max(7, font_size - 3)}px; font-weight: 700; padding: 1px 4px; border-radius: 3px; display: inline-block; line-height: 1.1; }}
            .badge-test {{ background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }}
            .badge-desc {{ background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }}
            .badge-custom {{ background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }}
            .footer-box {{ display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding: 8px 14px; background: #f1f5f9; border-radius: 10px; border: 1px solid #e2e8f0; font-size: {font_size - 1}px; color: #475569; }}
            .footer-quote {{ font-weight: 700; color: #1e293b; }}
        </style>
    </head>
    <body>
        <div class="canvas-wrapper">
            <div class="header-container">
                <div class="header-side">{karimi_img_tag}</div>
                <div class="header-center">
                    <div class="student-badge">🎯 برنامه مطالعاتی راهبردی: <span>{student_name}</span></div>
                    {f'<div class="motivational-banner">{motivational_sentence}</div>' if motivational_sentence else ''}
                    {social_links_html}
                </div>
                <div class="header-side">{logo_img_tag}</div>
            </div>
            <table class="table-schedule">
                <thead><tr>{headers_html}</tr></thead>
                <tbody>{table_rows_html}</tbody>
            </table>
            <div class="footer-box">
                <div class="footer-quote">💡 <b>پیام مشاور:</b> {quote_s if quote_s else 'پشتکار و تعهد به برنامه، کلید رتبه برتر شدن است.'}</div>
                <div>{f'✨ {quote_l}' if quote_l else 'سامانه برنامه‌ریزی تخصصی'}</div>
            </div>
        </div>
    </body>
    </html>
    """


def _find_browser_executable():
    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        shutil.which("msedge"),
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        shutil.which("chromium"),
    ]
    for path in candidates:
        if path and os.path.exists(path):
            return path
    return None


def _render_via_headless_browser(html_path, output_pdf_path):
    browser = _find_browser_executable()
    if not browser:
        return False
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={output_pdf_path}",
        html_path,
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return os.path.exists(output_pdf_path)


def _render_via_weasyprint(html_content, output_pdf_path):
    try:
        from weasyprint import HTML  # وابستگی اختیاری
    except ImportError:
        return False
    HTML(string=html_content).write_pdf(output_pdf_path)
    return os.path.exists(output_pdf_path)


def _get_chapter_image_pages_html(chapter_paths):
    html = ""
    for path in chapter_paths or []:
        if not os.path.exists(path):
            continue
        image_files = []
        for root, dirs, files in os.walk(path):
            for file in files:
                if file.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp')):
                    image_files.append(os.path.join(root, file))
        image_files.sort()
        for img_p in image_files:
            try:
                with open(img_p, "rb") as f:
                    enc = base64.b64encode(f.read()).decode("utf-8")
                ext_type = os.path.splitext(img_p)[1].replace(".", "").lower()
                html += f"""
                <div class="page-break"></div>
                <div class="attached-image-wrapper">
                    <img src="data:image/{ext_type};base64,{enc}" class="attached-img" />
                </div>
                """
            except Exception as e:
                logger.warning("Error reading chapter image %s: %s", img_p, e)
    return html


def export_pdf(schedule_state, motivational_sentences, output_path, font_family="Vazir", template_style="classic", font_size=11, chapter_paths=None):
    html_content = build_luxury_html(schedule_state, motivational_sentences, font_family, template_style, font_size)

    extra_images_html = _get_chapter_image_pages_html(chapter_paths)
    if extra_images_html:
        extra_css = """
        <style>
            .page-break { page-break-before: always; break-before: page; }
            .attached-image-wrapper { display: flex; align-items: center; justify-content: center; height: 100vh; width: 100%; text-align: center; }
            .attached-img { max-width: 98%; max-height: 98vh; object-fit: contain; }
        </style>
        """
        html_content = html_content.replace("</head>", f"{extra_css}</head>").replace("</body>", f"{extra_images_html}</body>")
    temp_html = os.path.join(tempfile.gettempdir(), f"schedule_{random.randint(1000, 9999)}.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    try:
        rendered = False
        try:
            rendered = _render_via_headless_browser(temp_html, output_path)
        except Exception as e:
            logger.warning("Headless print failed, trying fallback: %s", e)

        if not rendered:
            rendered = _render_via_weasyprint(html_content, output_path)

        if not rendered:
            raise RuntimeError(
                "نه مرورگر سیستمی (Edge/Chrome) پیدا شد و نه کتابخانهٔ WeasyPrint نصب است. "
                "لطفاً مطمئن شوید Microsoft Edge روی سیستم نصب است."
            )
        return output_path
    finally:
        if os.path.exists(temp_html):
            try:
                os.remove(temp_html)
            except OSError:
                pass

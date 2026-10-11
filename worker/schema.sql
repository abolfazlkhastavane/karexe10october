-- اسکریپت ساخت جداول پایگاه‌داده D1
-- این کد را در داشبورد Cloudflare، داخل بخش D1 → دیتابیس خود → Console
-- کپی و اجرا (Execute) کنید. worker.js هم در صورت نبود جداول، خودش
-- آن‌ها را می‌سازد؛ اجرای دستی این اسکریپت فقط برای اطمینان و شفافیت است.

CREATE TABLE IF NOT EXISTS licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  note TEXT DEFAULT '',                        -- نام کاربر / اسم لایسنس
  status TEXT NOT NULL DEFAULT 'active',      -- 'active' یا 'disabled'
  device_limit INTEGER NOT NULL DEFAULT 1,    -- تعداد دستگاه مجاز برای هر کد
  expires_at TEXT,                             -- تاریخ انقضا YYYY-MM-DD یا NULL برای نامحدود
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  machine_guid TEXT NOT NULL,
  daily_minutes INTEGER NOT NULL DEFAULT 0,    -- دقایق استفادهٔ روزانه
  usage_date TEXT DEFAULT '',
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(license_id, machine_guid)
);

CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_id);

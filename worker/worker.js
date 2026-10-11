/**
 * ==============================================================================
 *  سرور لایسنس + پنل مدیریت  —  یک فایل تکی، بدون نیاز به Wrangler یا npm
 * ==============================================================================
 *  این فایل یک Cloudflare Worker کامل است که مستقیم از داشبورد Cloudflare
 *  (Workers & Pages → Create → ویرایشگر آنلاین) قابل Paste و Deploy کردن است.
 *
 *  نیازمندی‌ها (همه از داخل سایت Cloudflare، بدون خط فرمان):
 *    1) یک پایگاه‌داده D1  →  به این Worker با نام باینـدینگ  DB  متصل شود.
 *    2) سه متغیر محیطی (Settings → Variables) به‌صورت Secret:
 *         ADMIN_USERNAME   نام کاربری ادمین (مثلاً admin)
 *         ADMIN_PASSWORD   رمز عبور ادمین
 *         JWT_SECRET       یک رشتهٔ تصادفی و طولانی برای امضای نشست ورود
 *
 *  راهنمای کامل نصب در فایل README.md کنار همین فایل آمده است.
 * ==============================================================================
 */

// ------------------------------------------------------------------
// تنظیمات عمومی
// ------------------------------------------------------------------
const SESSION_COOKIE = "sched_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // ۱۲ ساعت

// ------------------------------------------------------------------
// کمک‌کننده‌های عمومی HTTP
// ------------------------------------------------------------------
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
      ...extraHeaders,
    },
  });
}

function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function badRequest(message) {
  return json({ success: false, message }, 400);
}

function unauthorized(message = "دسترسی غیرمجاز") {
  return json({ success: false, message }, 401);
}

// ------------------------------------------------------------------
// امضای نشست (JWT سبک با HMAC-SHA256 — بدون کتابخانهٔ خارجی)
// ------------------------------------------------------------------
function b64urlEncode(bytes) {
  let str = btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecodeToBytes(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}
async function signSession(payloadObj, secret) {
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${payload}.${b64urlEncode(sig)}`;
}
async function verifySession(token, secret) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlDecodeToBytes(sig),
    new TextEncoder().encode(payload)
  );
  if (!valid) return null;
  try {
    const obj = JSON.parse(new TextDecoder().decode(b64urlDecodeToBytes(payload)));
    if (obj.exp && Date.now() / 1000 > obj.exp) return null;
    return obj;
  } catch {
    return null;
  }
}
function getCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}
async function requireAdmin(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  const session = await verifySession(token, env.JWT_SECRET);
  if (!session || session.role !== "admin") return null;
  return session;
}

// ------------------------------------------------------------------
// کمک‌کننده‌ها برای لایسنس
// ------------------------------------------------------------------
function generateLicenseCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون حروف/ارقام مشابه
  const group = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${group()}-${group()}-${group()}-${group()}`;
}

async function ensureSchema(db) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      device_limit INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`).run();
  } catch (e) {}

  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_id INTEGER NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
      machine_guid TEXT NOT NULL,
      daily_minutes INTEGER NOT NULL DEFAULT 0,
      usage_date TEXT DEFAULT '',
      first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(license_id, machine_guid)
    )`).run();
  } catch (e) {}

  try { await db.prepare(`ALTER TABLE activations ADD COLUMN daily_minutes INTEGER DEFAULT 0`).run(); } catch (e) {}
  try { await db.prepare(`ALTER TABLE activations ADD COLUMN usage_date TEXT DEFAULT ''`).run(); } catch (e) {}
}

// ------------------------------------------------------------------
// روتر اصلی
// ------------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return json({}, 204);
    }

    try {
      if (!env.DB) {
        return html(
          errorPage(
            "پایگاه‌داده متصل نیست",
            "یک پایگاه‌داده D1 بسازید و آن را با نام باینـدینگ «DB» به این Worker متصل کنید (Settings → Bindings)."
          ),
          500
        );
      }

      // اجرای عمومی: مسیر عمومی اعتبارسنجی که برنامهٔ ویندوزی صدا می‌زند
      if (pathname === "/api/validate" && request.method === "POST") {
        return await handleValidate(request, env);
      }

      // مسیرهای ورود/خروج ادمین
      if (pathname === "/api/login" && request.method === "POST") {
        return await handleLogin(request, env);
      }
      if (pathname === "/api/logout" && request.method === "POST") {
        return new Response(null, {
          status: 204,
          headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` },
        });
      }

      // مسیرهای پنل ادمین (نیازمند ورود)
      if (pathname.startsWith("/api/licenses")) {
        const session = await requireAdmin(request, env);
        if (!session) return unauthorized("لطفاً ابتدا وارد شوید.");
        return await handleLicensesApi(request, env, pathname);
      }

      if (pathname === "/api/me") {
        const session = await requireAdmin(request, env);
        return json({ success: true, loggedIn: !!session, username: session?.username || null });
      }

      // پنل تحت وب (صفحهٔ ورود یا داشبورد)
      if (pathname === "/" || pathname === "/admin" || pathname === "/admin/") {
        await ensureSchema(env.DB);
        return html(adminPageHtml());
      }

      return json({ success: false, message: "مسیر یافت نشد" }, 404);
    } catch (err) {
      return json({ success: false, message: `خطای سرور: ${err.message}` }, 500);
    }
  },
};

// ------------------------------------------------------------------
// اعتبارسنجی لایسنس (فراخوانی‌شده توسط برنامهٔ دسکتاپ)
// ------------------------------------------------------------------
async function handleValidate(request, env) {
  await ensureSchema(env.DB);
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("بدنهٔ درخواست نامعتبر است.");
  }
  const licenseCode = (body.license_code || "").trim();
  const machineGuid = (body.machine_guid || "").trim();
  if (!licenseCode || !machineGuid) {
    return json({ success: true, valid: false, message: "کد لایسنس یا شناسهٔ دستگاه ارسال نشده است." });
  }

  const db = env.DB;
  const license = await db
    .prepare("SELECT * FROM licenses WHERE code = ?")
    .bind(licenseCode)
    .first();

  if (!license) {
    return json({ success: true, valid: false, message: "کد لایسنس یافت نشد." });
  }
  if (license.status !== "active") {
    return json({ success: true, valid: false, message: "این لایسنس غیرفعال شده است." });
  }
  if (license.expires_at) {
    const expires = new Date(license.expires_at + "T23:59:59Z").getTime();
    if (Date.now() > expires) {
      return json({ success: true, valid: false, message: "تاریخ اعتبار این لایسنس به پایان رسیده است." });
    }
  }

  const existingActivation = await db
    .prepare("SELECT * FROM activations WHERE license_id = ? AND machine_guid = ?")
    .bind(license.id, machineGuid)
    .first();

  if (existingActivation) {
    const today = new Date().toISOString().split("T")[0];
    let newMinutes = (existingActivation.daily_minutes || 0) + 1;
    if (existingActivation.usage_date !== today) {
      newMinutes = 1;
    }
    await db
      .prepare("UPDATE activations SET last_seen_at = datetime('now'), daily_minutes = ?, usage_date = ? WHERE id = ?")
      .bind(newMinutes, today, existingActivation.id)
      .run();
    return json({ success: true, valid: true, message: "لایسنس معتبر است.", expires_at: license.expires_at });
  }

  const countRow = await db
    .prepare("SELECT COUNT(*) as c FROM activations WHERE license_id = ?")
    .bind(license.id)
    .first();

  if (countRow.c >= license.device_limit) {
    return json({
      success: true,
      valid: false,
      message: `این لایسنس روی حداکثر تعداد دستگاه مجاز (${license.device_limit}) فعال شده است.`,
    });
  }

  await db
    .prepare("INSERT INTO activations (license_id, machine_guid) VALUES (?, ?)")
    .bind(license.id, machineGuid)
    .run();

  return json({ success: true, valid: true, message: "لایسنس با موفقیت روی این دستگاه فعال شد.", expires_at: license.expires_at });
}

// ------------------------------------------------------------------
// ورود ادمین
// ------------------------------------------------------------------
async function handleLogin(request, env) {
  if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD || !env.JWT_SECRET) {
    return json(
      { success: false, message: "متغیرهای محیطی ADMIN_USERNAME / ADMIN_PASSWORD / JWT_SECRET تنظیم نشده‌اند." },
      500
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest("بدنهٔ درخواست نامعتبر است.");
  }
  const { username, password } = body;
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    return unauthorized("نام کاربری یا رمز عبور نادرست است.");
  }
  const token = await signSession(
    { username, role: "admin", exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS },
    env.JWT_SECRET
  );
  return json(
    { success: true },
    200,
    {
      "Set-Cookie": `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
    }
  );
}

// ------------------------------------------------------------------
// CRUD لایسنس‌ها برای پنل ادمین
// ------------------------------------------------------------------
async function handleLicensesApi(request, env, pathname) {
  await ensureSchema(env.DB);
  const db = env.DB;
  const parts = pathname.split("/").filter(Boolean); // ["api","licenses", maybe ":id", maybe "reset-devices"]

  // GET /api/licenses  → فهرست کامل
  if (parts.length === 2 && request.method === "GET") {
    const { results } = await db
      .prepare(
        `SELECT l.*,
                (SELECT COUNT(*) FROM activations a WHERE a.license_id = l.id) as active_devices,
                (SELECT GROUP_CONCAT(machine_guid, '||') FROM activations a WHERE a.license_id = l.id) as devices,
                (SELECT COALESCE(SUM(daily_minutes), 0) FROM activations a WHERE a.license_id = l.id AND a.usage_date = date('now')) as daily_minutes
         FROM licenses l ORDER BY l.id DESC`
      )
      .all();
    return json({ success: true, licenses: results });
  }

  // POST /api/licenses  → ساخت لایسنس جدید
  if (parts.length === 2 && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const code = (body.code && body.code.trim()) || generateLicenseCode();
    const note = body.note || "";
    const deviceLimit = Number.isInteger(body.device_limit) ? body.device_limit : parseInt(body.device_limit || "1", 10) || 1;
    const expiresAt = body.expires_at || null;
    try {
      await db
        .prepare(
          "INSERT INTO licenses (code, note, status, device_limit, expires_at) VALUES (?, ?, 'active', ?, ?)"
        )
        .bind(code, note, deviceLimit, expiresAt)
        .run();
    } catch (e) {
      return badRequest("این کد لایسنس از قبل وجود دارد یا داده نامعتبر است.");
    }
    return json({ success: true, code });
  }

  // مسیرهایی که شامل شناسهٔ عددی هستند
  const id = parts[2] ? parseInt(parts[2], 10) : null;
  if (!id) return badRequest("شناسهٔ لایسنس نامعتبر است.");

  // PATCH /api/licenses/:id → ویرایش
  if (parts.length === 3 && request.method === "PATCH") {
    const body = await request.json().catch(() => ({}));
    const fields = [];
    const values = [];
    for (const key of ["note", "status", "device_limit", "expires_at"]) {
      if (key in body) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }
    if (!fields.length) return badRequest("هیچ فیلدی برای بروزرسانی ارسال نشده است.");
    values.push(id);
    await db.prepare(`UPDATE licenses SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    return json({ success: true });
  }

  // DELETE /api/licenses/:id → حذف
  if (parts.length === 3 && request.method === "DELETE") {
    await db.prepare("DELETE FROM licenses WHERE id = ?").bind(id).run();
    return json({ success: true });
  }

  // POST /api/licenses/:id/reset-devices → آزادسازی دستگاه‌های فعال‌شده
  if (parts.length === 4 && parts[3] === "reset-devices" && request.method === "POST") {
    await db.prepare("DELETE FROM activations WHERE license_id = ?").bind(id).run();
    return json({ success: true });
  }

  return json({ success: false, message: "مسیر یافت نشد" }, 404);
}

// ------------------------------------------------------------------
// صفحهٔ خطای ساده
// ------------------------------------------------------------------
function errorPage(title, message) {
  return `<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
  <title>${title}</title>
  <style>body{font-family:Tahoma,sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
  .box{max-width:520px;background:#1e293b;padding:32px;border-radius:16px;text-align:center}
  h1{color:#fca5a5}</style></head><body><div class="box"><h1>${title}</h1><p>${message}</p></div></body></html>`;
}

// ------------------------------------------------------------------
// پنل مدیریت تحت وب (تک‌صفحه‌ای، بدون وابستگی خارجی)
// ------------------------------------------------------------------
function adminPageHtml() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>پنل مدیریت لایسنس‌ها</title>
<style>
  :root{
    --bg:#0b1020; --panel:#141a30; --panel-2:#1b2340; --border:#293154;
    --text:#e8ecff; --muted:#8b93b8; --accent:#6d5efc; --accent-2:#8f7bff;
    --ok:#22c55e; --bad:#ef4444; --warn:#f59e0b;
  }
  *{box-sizing:border-box}
  body{margin:0;font-family:'Vazirmatn','Segoe UI',Tahoma,sans-serif;background:radial-gradient(1200px 800px at 80% -10%, #1c2350 0%, var(--bg) 55%);color:var(--text);min-height:100vh}
  a{color:inherit}
  .hidden{display:none !important}
  /* ---------- Login ---------- */
  #loginScreen{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
  .login-card{background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:36px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
  .login-card h1{font-size:20px;margin:0 0 4px}
  .login-card p{color:var(--muted);margin:0 0 24px;font-size:13px}
  .field{margin-bottom:14px}
  .field label{display:block;font-size:12px;color:var(--muted);margin-bottom:6px}
  .field input{width:100%;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--panel-2);color:var(--text);font-family:inherit;font-size:14px}
  .field input:focus{outline:2px solid var(--accent);border-color:var(--accent)}
  .btn{cursor:pointer;border:none;border-radius:10px;padding:11px 18px;font-weight:700;font-family:inherit;font-size:14px;transition:.15s}
  .btn-primary{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;width:100%}
  .btn-primary:hover{filter:brightness(1.1)}
  .msg{font-size:13px;margin-top:12px;padding:10px 12px;border-radius:10px}
  .msg-error{background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.3)}
  .msg-ok{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.3)}
  /* ---------- Dashboard ---------- */
  #app{max-width:1100px;margin:0 auto;padding:28px 20px 60px}
  header.top{display:flex;align-items:center;justify-content:space-between;margin-bottom:26px;flex-wrap:wrap;gap:12px}
  header.top h1{font-size:19px;margin:0}
  header.top .sub{color:var(--muted);font-size:12.5px;margin-top:2px}
  .btn-ghost{background:transparent;border:1px solid var(--border);color:var(--text)}
  .btn-ghost:hover{border-color:var(--accent)}
  .toolbar{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
  .btn-add{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff}
  table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--border);border-radius:14px;overflow:hidden}
  thead th{text-align:right;font-size:12px;color:var(--muted);padding:12px 14px;border-bottom:1px solid var(--border);background:var(--panel-2)}
  tbody td{padding:12px 14px;border-bottom:1px solid var(--border);font-size:13px;vertical-align:middle}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover{background:rgba(109,94,252,.05)}
  .code{font-family:'Consolas',monospace;letter-spacing:1px;font-weight:700}
  .pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700}
  .pill-active{background:rgba(34,197,94,.15);color:var(--ok)}
  .pill-disabled{background:rgba(239,68,68,.15);color:var(--bad)}
  .pill-expired{background:rgba(245,158,11,.15);color:var(--warn)}
  .row-actions{display:flex;gap:6px;flex-wrap:wrap}
  .mini-btn{border:1px solid var(--border);background:var(--panel-2);color:var(--text);border-radius:8px;padding:6px 9px;font-size:11px;cursor:pointer}
  .mini-btn:hover{border-color:var(--accent)}
  .mini-btn.danger:hover{border-color:var(--bad);color:#fca5a5}
  .devices{font-size:11px;color:var(--muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  /* ---------- Modal ---------- */
  .overlay{position:fixed;inset:0;background:rgba(3,6,16,.6);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
  .modal{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:26px;width:100%;max-width:420px}
  .modal h2{margin:0 0 18px;font-size:17px}
  .modal .actions{display:flex;gap:10px;margin-top:20px}
  .modal .actions .btn{flex:1}
  .empty{text-align:center;padding:50px 10px;color:var(--muted)}
</style>
</head>
<body>

<div id="loginScreen">
  <form class="login-card" id="loginForm">
    <h1>ورود به پنل مدیریت</h1>
    <p>سامانهٔ لایسنس برنامهٔ مطالعاتی</p>
    <div class="field"><label>نام کاربری</label><input type="text" id="loginUser" autocomplete="username" required></div>
    <div class="field"><label>رمز عبور</label><input type="password" id="loginPass" autocomplete="current-password" required></div>
    <button class="btn btn-primary" type="submit">ورود</button>
    <div id="loginMsg"></div>
  </form>
</div>

<div id="app" class="hidden">
  <header class="top">
    <div>
      <h1>مدیریت لایسنس‌ها</h1>
      <div class="sub" id="countSub">—</div>
    </div>
    <button class="btn btn-ghost" id="logoutBtn">خروج</button>
  </header>

  <div class="toolbar">
    <button class="btn btn-add" id="newLicenseBtn">+ ساخت لایسنس جدید</button>
    <button class="btn btn-ghost" id="refreshBtn">بروزرسانی</button>
  </div>

  <div id="tableWrap">
    <table>
      <thead><tr>
        <th>کد / نام لایسنس</th><th>یادداشت (مالک)</th><th>وضعیت</th><th>میزان استفاده امروز</th><th>دستگاه‌ها</th><th>انقضا</th><th>ساخته‌شده</th><th>عملیات</th>
      </tr></thead>
      <tbody id="licenseRows"></tbody>
    </table>
    <div id="emptyState" class="empty hidden">هنوز لایسنسی ساخته نشده است.</div>
  </div>
</div>

<div id="modalRoot"></div>

<script>
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));

async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', headers: {'Content-Type':'application/json'}, ...opts });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.message || ('خطا: ' + res.status));
  return data;
}

// ---------------- Login ----------------
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const msgEl = $('#loginMsg');
  msgEl.innerHTML = '';
  try {
    await api('/api/login', { method:'POST', body: JSON.stringify({
      username: $('#loginUser').value, password: $('#loginPass').value
    })});
    showApp();
  } catch (err) {
    msgEl.innerHTML = '<div class="msg msg-error">' + err.message + '</div>';
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  await api('/api/logout', { method:'POST' });
  location.reload();
});

async function checkSession() {
  try {
    const data = await api('/api/me');
    if (data.loggedIn) { showApp(); return; }
  } catch {}
  $('#loginScreen').classList.remove('hidden');
  $('#app').classList.add('hidden');
}

function showApp() {
  $('#loginScreen').classList.add('hidden');
  $('#app').classList.remove('hidden');
  loadLicenses();
}

// ---------------- License list ----------------
function statusPill(l) {
  if (l.status !== 'active') return '<span class="pill pill-disabled">غیرفعال</span>';
  if (l.expires_at) {
    const exp = new Date(l.expires_at + 'T23:59:59Z').getTime();
    if (Date.now() > exp) return '<span class="pill pill-expired">منقضی</span>';
  }
  return '<span class="pill pill-active">فعال</span>';
}

async function loadLicenses() {
  const data = await api('/api/licenses');
  const rows = data.licenses || [];
  $('#countSub').textContent = rows.length + ' لایسنس ثبت‌شده';
  const tbody = $('#licenseRows');
  tbody.innerHTML = '';
  $('#emptyState').classList.toggle('hidden', rows.length > 0);

  rows.forEach(l => {
    const tr = document.createElement('tr');
    const devices = l.devices ? l.devices.split('||').join(', ') : '—';
    tr.innerHTML = \`
      <td class="code"><div>\${l.code}</div>\${l.note ? '<div style="font-size:11px;color:var(--accent)">' + escapeHtml(l.note) + '</div>' : ''}</td>
      <td>\${l.note ? escapeHtml(l.note) : '<span style="color:var(--muted)">—</span>'}</td>
      <td>\${statusPill(l)}</td>
      <td><strong style="color:var(--accent)">\${l.daily_minutes || 0} دقیقه</strong></td>
      <td><div>\${l.active_devices}/\${l.device_limit}</div><div class="devices" title="\${devices}">\${devices}</div></td>
      <td>\${l.expires_at || 'نامحدود'}</td>
      <td>\${(l.created_at||'').split(' ')[0]}</td>
      <td><div class="row-actions">
        <button class="mini-btn" data-act="toggle" data-id="\${l.id}" data-status="\${l.status}">\${l.status==='active' ? 'غیرفعال کردن' : 'فعال کردن'}</button>
        <button class="mini-btn" data-act="edit" data-id="\${l.id}">ویرایش/نام‌گذاری</button>
        <button class="mini-btn" data-act="reset" data-id="\${l.id}">آزادسازی دستگاه‌ها</button>
        <button class="mini-btn danger" data-act="delete" data-id="\${l.id}">حذف</button>
      </div></td>\`;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

$('#refreshBtn').addEventListener('click', loadLicenses);

$('#licenseRows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const act = btn.dataset.act;

  if (act === 'toggle') {
    const newStatus = btn.dataset.status === 'active' ? 'disabled' : 'active';
    await api('/api/licenses/' + id, { method:'PATCH', body: JSON.stringify({ status: newStatus }) });
    loadLicenses();
  } else if (act === 'delete') {
    if (!confirm('این لایسنس برای همیشه حذف شود؟')) return;
    await api('/api/licenses/' + id, { method:'DELETE' });
    loadLicenses();
  } else if (act === 'reset') {
    if (!confirm('دستگاه‌های فعال‌شدهٔ این لایسنس آزاد شوند؟ کاربر باید دوباره فعال‌سازی کند.')) return;
    await api('/api/licenses/' + id + '/reset-devices', { method:'POST' });
    loadLicenses();
  } else if (act === 'edit') {
    openEditModal(id);
  }
});

// ---------------- New license modal ----------------
$('#newLicenseBtn').addEventListener('click', () => {
  $('#modalRoot').innerHTML = \`
  <div class="overlay" id="ov">
    <form class="modal" id="newForm">
      <h2>ساخت لایسنس جدید</h2>
      <div class="field"><label>کد لایسنس (خالی بگذارید تا خودکار ساخته شود)</label><input id="nCode" placeholder="مثلاً XXXX-XXXX-XXXX-XXXX"></div>
      <div class="field"><label>یادداشت (نام مشتری و ...)</label><input id="nNote"></div>
      <div class="field"><label>تعداد دستگاه مجاز</label><input id="nLimit" type="number" min="1" value="1"></div>
      <div class="field"><label>تاریخ انقضا (اختیاری، میلادی YYYY-MM-DD)</label><input id="nExpires" type="date"></div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" id="cancelNew">انصراف</button>
        <button type="submit" class="btn btn-add">ساخت</button>
      </div>
    </form>
  </div>\`;
  $('#cancelNew').addEventListener('click', closeModal);
  $('#ov').addEventListener('click', (e) => { if (e.target.id === 'ov') closeModal(); });
  $('#newForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/licenses', { method:'POST', body: JSON.stringify({
      code: $('#nCode').value.trim(),
      note: $('#nNote').value.trim(),
      device_limit: parseInt($('#nLimit').value || '1', 10),
      expires_at: $('#nExpires').value || null
    })});
    closeModal();
    loadLicenses();
  });
});

async function openEditModal(id) {
  const data = await api('/api/licenses');
  const l = (data.licenses || []).find(x => String(x.id) === String(id));
  if (!l) return;
  $('#modalRoot').innerHTML = \`
  <div class="overlay" id="ov">
    <form class="modal" id="editForm">
      <h2>ویرایش لایسنس \${l.code}</h2>
      <div class="field"><label>یادداشت</label><input id="eNote" value="\${l.note ? escapeHtml(l.note) : ''}"></div>
      <div class="field"><label>تعداد دستگاه مجاز</label><input id="eLimit" type="number" min="1" value="\${l.device_limit}"></div>
      <div class="field"><label>تاریخ انقضا (خالی = نامحدود)</label><input id="eExpires" type="date" value="\${l.expires_at || ''}"></div>
      <div class="actions">
        <button type="button" class="btn btn-ghost" id="cancelEdit">انصراف</button>
        <button type="submit" class="btn btn-add">ذخیره</button>
      </div>
    </form>
  </div>\`;
  $('#cancelEdit').addEventListener('click', closeModal);
  $('#ov').addEventListener('click', (e) => { if (e.target.id === 'ov') closeModal(); });
  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/licenses/' + id, { method:'PATCH', body: JSON.stringify({
      note: $('#eNote').value.trim(),
      device_limit: parseInt($('#eLimit').value || '1', 10),
      expires_at: $('#eExpires').value || null
    })});
    closeModal();
    loadLicenses();
  });
}

function closeModal() { $('#modalRoot').innerHTML = ''; }

checkSession();
</script>
</body>
</html>`;
}

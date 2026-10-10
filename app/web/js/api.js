// ==========================================================================
// پل ارتباطی با پایتون (window.pywebview.api)
// ==========================================================================
const Api = (() => {
  let readyPromise = null;

  function waitReady() {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise((resolve) => {
      if (window.pywebview && window.pywebview.api) return resolve();
      window.addEventListener("pywebviewready", () => resolve(), { once: true });
      // fallback: در صورت کندی رویداد، هر ۱۰۰ میلی‌ثانیه بررسی می‌کنیم
      const iv = setInterval(() => {
        if (window.pywebview && window.pywebview.api) {
          clearInterval(iv);
          resolve();
        }
      }, 100);
    });
    return readyPromise;
  }

  async function call(method, ...args) {
    await waitReady();
    const fn = window.pywebview.api[method];
    if (typeof fn !== "function") {
      throw new Error(`متد «${method}» در پایتون تعریف نشده است.`);
    }
    return await fn(...args);
  }

  // فراخوانی + نمایش خودکار خطا به‌صورت toast در صورت شکست؛ در موفقیت نتیجهٔ کامل را می‌دهد
  async function callT(method, ...args) {
    const res = await call(method, ...args);
    if (!res || res.success === false) {
      toastError((res && res.message) || "خطای نامشخص رخ داد.");
      return null;
    }
    return res;
  }

  return { call, callT, waitReady };
})();

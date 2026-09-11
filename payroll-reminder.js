(function payrollReminder() {
  const API_BASE = "https://api.scheax.com.tr/migration-test";
  const TOKEN_KEY = "garage_migration_test_jwt_v1";
  const pad = (value) => String(value).padStart(2, "0");
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dateOnly = (value) => {
    const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : "";
  };
  let activeNotification = null;

  async function closePayrollNotifications() {
    try {
      if (activeNotification?.close) activeNotification.close();
    } catch (_) {}
    activeNotification = null;

    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const reg of regs) {
          if (typeof reg.getNotifications !== "function") continue;
          const list = await reg.getNotifications();
          list.forEach((notification) => {
            if (["kasaflow-salary", "kasaflow-payroll"].includes(String(notification.tag || ""))) {
              notification.close();
            }
          });
        }
      }
    } catch (error) {
      console.warn("Maaş bildirimi kapatılamadı", error);
    }
  }

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
  }

  async function fetchPayroll() {
    const jwt = token();
    if (!jwt) return null;
    const response = await fetch(`${API_BASE}/api/kasaflow/payroll`, {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: "no-store"
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null);
    return payload?.status === "ok" ? payload : null;
  }

  function dueDates(person, today) {
    const startText = dateOnly(person.salary_tracking_start) || iso(today);
    const start = new Date(`${startText}T12:00:00`);
    const result = [];
    if ((person.pay_type || "monthly") === "weekly") {
      const cursor = new Date(start);
      const targetDay = Number(person.salary_weekday ?? 1);
      cursor.setDate(cursor.getDate() + ((targetDay - cursor.getDay() + 7) % 7));
      while (cursor <= today && result.length < 54) {
        result.push(iso(cursor));
        cursor.setDate(cursor.getDate() + 7);
      }
      return result;
    }
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
    while (cursor <= today && result.length < 24) {
      const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
      const due = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(Number(person.salary_day || 1), lastDay), 12);
      if (due >= start && due <= today) result.push(iso(due));
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }

  async function loadDuePayroll(forceNotification = false) {
    const payload = await fetchPayroll();
    if (!payload) return;

    const people = payload.people || [];
    const payments = payload.salary_payments || [];

    function paymentExists(person, period) {
      return payments.some((row) => {
        if (String(row.person_id) !== String(person.id)) return false;
        const paidPeriod = String(row.pay_period || "").slice(0, 10);
        if ((person.pay_type || "monthly") === "weekly") {
          return paidPeriod === String(period).slice(0, 10);
        }
        return paidPeriod.slice(0, 7) === String(period).slice(0, 7);
      });
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const due = [];

    people.filter((person) => person.is_active !== false).forEach((person) => {
      dueDates(person, today).forEach((period) => {
        if (!paymentExists(person, period)) due.push({ person, period });
      });
    });

    const uniquePeople = [...new Map(due.map((item) => [item.person.id, item.person])).values()];
    const alert = document.getElementById("salaryAlert");
    const alertText = document.getElementById("salaryAlertText");
    const badge = document.getElementById("salaryNavBadge");
    const payrollAllowed = window.KasaFlow?.canOpenView?.("avans-maas") !== false;
    alert?.classList.toggle("hidden", due.length === 0 || !payrollAllowed);
    badge?.classList.toggle("hidden", due.length === 0 || !payrollAllowed);
    if (badge) badge.textContent = String(due.length);
    if (alertText && due.length) {
      alertText.textContent = `Bu personel/personellerin maaşı var: ${uniquePeople.map((person) => person.name).join(", ")}. “Maaşı Yattı” denene kadar uyarı kapanmaz.`;
    }

    const hour = new Date().getHours();
    const notificationEnabled = localStorage.getItem("kasaflow_salary_notifications") === "1" || localStorage.getItem("garageflow_salary_notifications") === "1";
    const sentKey = `kasaflow_salary_notification_${iso(new Date())}`;
    const canNotify = forceNotification || (hour >= 9 && hour < 10 && notificationEnabled && localStorage.getItem(sentKey) !== "1");
    if (due.length && payrollAllowed && canNotify && "Notification" in window && Notification.permission === "granted") {
      const body = `Bu personel/personellerin maaşı var: ${uniquePeople.map((person) => person.name).join(", ")}`;
      try {
        const registration = await navigator.serviceWorker?.ready;
        if (registration?.showNotification) {
          await registration.showNotification("KasaFlow Maaş Hatırlatması", { body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: "kasaflow-salary", data: { url: "/#avans-maas" } });
        } else {
          activeNotification = new Notification("KasaFlow Maaş Hatırlatması", { body, icon: "/icons/icon-192.png" });
        }
        localStorage.setItem(sentKey, "1");
      } catch (error) {
        console.warn("Maaş bildirimi gösterilemedi", error);
      }
    }
  }

  window.addEventListener("kasaflow:close-payroll-notifications", closePayrollNotifications);
  window.addEventListener("garageflow:check-payroll", (event) => loadDuePayroll(event.detail?.force === true));
  window.addEventListener("kasaflow:check-payroll", (event) => loadDuePayroll(event.detail?.force === true));
  window.addEventListener("load", () => {
    loadDuePayroll(false);
    setInterval(() => loadDuePayroll(false), 5 * 60 * 1000);
  });
})();

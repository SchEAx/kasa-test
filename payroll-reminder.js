(function payrollReminder() {
  const SUPABASE_URL = "https://cgcdsvbdkubntmrqutxl.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnY2RzdmJka3VibnRtcnF1dHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjIxNTQsImV4cCI6MjA5NzY5ODE1NH0.1QUhjyJyC9cm5vNpP3zDPhXHdUEb5xc9bicRPrLg-Rs";
  if (!window.supabase) return;
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const pad = (value) => String(value).padStart(2, "0");
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  function dueDates(person, today) {
    const startText = person.salary_tracking_start || iso(today);
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
    const peopleResult = await client.from("avans_personel").select("*").order("name", { ascending: true });
    if (peopleResult.error) return;
    const paymentResult = await client.from("maas_odemeleri").select("person_id,pay_period");
    const payments = paymentResult.error ? [] : (paymentResult.data || []);
    const paidKeys = new Set(payments.map((row) => `${row.person_id}:${row.pay_period}`));
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const due = [];
    (peopleResult.data || []).filter((person) => person.is_active !== false).forEach((person) => {
      dueDates(person, today).forEach((period) => {
        if (!paidKeys.has(`${person.id}:${period}`)) due.push({ person, period });
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
          new Notification("KasaFlow Maaş Hatırlatması", { body, icon: "/icons/icon-192.png" });
        }
        localStorage.setItem(sentKey, "1");
      } catch (error) {
        console.warn("Maaş bildirimi gösterilemedi", error);
      }
    }
  }

  window.addEventListener("garageflow:check-payroll", (event) => loadDuePayroll(event.detail?.force === true));
  window.addEventListener("kasaflow:check-payroll", (event) => loadDuePayroll(event.detail?.force === true));
  window.addEventListener("load", () => {
    loadDuePayroll(false);
    setInterval(() => loadDuePayroll(false), 5 * 60 * 1000);
  });
})();

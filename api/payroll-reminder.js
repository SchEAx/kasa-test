import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

function turkeyToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dueDatesFor(person, todayText) {
  const startText = person.salary_tracking_start || todayText;
  const start = new Date(`${startText}T12:00:00Z`);
  const today = new Date(`${todayText}T23:59:59Z`);
  const pad = (value) => String(value).padStart(2, "0");
  const iso = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const result = [];
  if ((person.pay_type || "monthly") === "weekly") {
    const cursor = new Date(start);
    const target = Number(person.salary_weekday ?? 1);
    cursor.setUTCDate(cursor.getUTCDate() + ((target - cursor.getUTCDay() + 7) % 7));
    while (cursor <= today && result.length < 54) { result.push(iso(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 7); }
    return result;
  }
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12));
  while (cursor <= today && result.length < 24) {
    const lastDay = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate();
    const due = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), Math.min(Number(person.salary_day || 1), lastDay), 12));
    if (due >= start && due <= today) result.push(iso(due));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ ok: false, message: "Method not allowed" });
  if (process.env.CRON_SECRET && req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ ok: false, message: "Unauthorized" });

  const payrollUrl = process.env.PAYROLL_SUPABASE_URL;
  const payrollKey = process.env.PAYROLL_SUPABASE_SERVICE_ROLE_KEY;
  if (!payrollUrl || !payrollKey) return res.status(500).json({ ok: false, message: "Payroll Supabase environment variables are missing" });
  if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ ok: false, message: "VAPID environment variables are missing" });

  const payroll = createClient(payrollUrl, payrollKey);
  const notificationStore = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const [peopleResult, paymentResult, subscriptionResult] = await Promise.all([
    payroll.from("avans_personel").select("*"),
    payroll.from("maas_odemeleri").select("person_id,pay_period"),
    notificationStore.from("push_subscriptions").select("endpoint,subscription")
  ]);
  if (peopleResult.error || paymentResult.error || subscriptionResult.error) return res.status(500).json({ ok: false, message: peopleResult.error?.message || paymentResult.error?.message || subscriptionResult.error?.message });

  const today = turkeyToday();
  const paidKeys = new Set((paymentResult.data || []).map((row) => `${row.person_id}:${String(row.pay_period).slice(0, 10)}`));
  const due = [];
  (peopleResult.data || []).filter((person) => person.is_active !== false).forEach((person) => {
    dueDatesFor(person, today).forEach((period) => { if (!paidKeys.has(`${person.id}:${period}`)) due.push({ person, period }); });
  });
  if (!due.length) return res.status(200).json({ ok: true, sent: 0, due: 0, message: "No due payroll" });

  const peopleNames = [...new Set(due.map((item) => item.person.name))];
  const payload = JSON.stringify({ title: "KasaFlow Maaş Hatırlatması", body: `Bu personel/personellerin maaşı var: ${peopleNames.join(", ")}`, url: "/#avans-maas" });
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const results = await Promise.allSettled((subscriptionResult.data || []).map((row) => webpush.sendNotification(row.subscription, payload)));
  const expired = results.map((result, index) => ({ result, row: subscriptionResult.data[index] })).filter(({ result }) => result.status === "rejected" && [404, 410].includes(result.reason?.statusCode));
  await Promise.all(expired.map(({ row }) => notificationStore.from("push_subscriptions").delete().eq("endpoint", row.endpoint)));
  return res.status(200).json({ ok: true, due: due.length, people: peopleNames.length, sent: results.filter((result) => result.status === "fulfilled").length, failed: results.filter((result) => result.status === "rejected").length });
}

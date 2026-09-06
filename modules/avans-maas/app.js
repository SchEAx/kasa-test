const SUPABASE_URL = "https://cgcdsvbdkubntmrqutxl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnY2RzdmJka3VibnRtcnF1dHhsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjIxNTQsImV4cCI6MjA5NzY5ODE1NH0.1QUhjyJyC9cm5vNpP3zDPhXHdUEb5xc9bicRPrLg-Rs";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const money = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, "0");
const localISO = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayISO = localISO();
const currentMonth = todayISO.slice(0, 7);
let state = { people: [], advances: [], deductions: [], salaryPayments: [], salaryTableReady: true, selectedPersonId: "", editingPersonId: "" };

function showToast(text) { const toast = $("toast"); toast.textContent = text; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200); }
function parseNum(value) { return Math.max(0, Number(String(value || "").replace(",", ".")) || 0); }
function monthOf(value) { return String(value || "").slice(0, 7); }
function getPerson(id) { return state.people.find((person) => String(person.id) === String(id)); }
function advancesFor(personId) { return state.advances.filter((advance) => String(advance.person_id) === String(personId)).sort((a, b) => String(a.advance_date).localeCompare(String(b.advance_date))); }
function deductionsOf(advanceId) { return state.deductions.filter((row) => String(row.advance_id) === String(advanceId)); }
function paidOf(advance) { return deductionsOf(advance.id).reduce((total, row) => total + Number(row.amount || 0), 0); }
function remainingOf(advance) { return Math.max(0, Number(advance.amount || 0) - paidOf(advance)); }
function weekDayName(value) { return ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"][Number(value) || 0]; }
function payDayText(person) { return (person.pay_type || "monthly") === "weekly" ? `Her ${weekDayName(person.salary_weekday ?? 1)}` : `Her ayın ${person.salary_day || 1}. günü`; }
function formatDateTime(value) { if (!value) return "-"; return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); }
function formatDate(value) { if (!value) return "-"; const [year, month, day] = String(value).slice(0, 10).split("-"); return `${day}.${month}.${year}`; }
function summaryHTML(items) { return items.map(([label, value, type]) => `<div class="summary ${type || ""}"><span>${label}</span><b>${type === "count" ? (value || 0) : money.format(value || 0)}</b></div>`).join(""); }

function dueDatesFor(person, today = new Date()) {
  const startText = person.salary_tracking_start || todayISO;
  const start = new Date(`${startText}T12:00:00`);
  const end = new Date(today); end.setHours(23, 59, 59, 999);
  const result = [];
  if ((person.pay_type || "monthly") === "weekly") {
    const cursor = new Date(start);
    const targetDay = Number(person.salary_weekday ?? 1);
    cursor.setDate(cursor.getDate() + ((targetDay - cursor.getDay() + 7) % 7));
    while (cursor <= end && result.length < 54) { result.push(localISO(cursor)); cursor.setDate(cursor.getDate() + 7); }
    return result;
  }
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12);
  while (cursor <= end && result.length < 24) {
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const due = new Date(cursor.getFullYear(), cursor.getMonth(), Math.min(Number(person.salary_day || 1), lastDay), 12);
    if (due >= start && due <= end) result.push(localISO(due));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return result;
}

function paymentFor(personId, period) { return state.salaryPayments.find((row) => String(row.person_id) === String(personId) && String(row.pay_period).slice(0, 10) === String(period).slice(0, 10)); }
function duePayrollItems() {
  const items = [];
  state.people.filter((person) => person.is_active !== false).forEach((person) => {
    dueDatesFor(person).forEach((period) => { if (!paymentFor(person.id, period)) items.push({ person, period }); });
  });
  return items.sort((a, b) => a.period.localeCompare(b.period) || a.person.name.localeCompare(b.person.name, "tr"));
}

async function loadAll({ quiet = false, preservePerson = true } = {}) {
  if (!quiet) showToast("Veriler yenileniyor…");
  const selectedBefore = preservePerson ? (state.selectedPersonId || $("activePerson")?.value) : "";
  const [peopleResult, advanceResult, deductionResult, salaryResult] = await Promise.all([
    sb.from("avans_personel").select("*").order("name", { ascending: true }),
    sb.from("avans_kayitlari").select("*").order("advance_date", { ascending: true }),
    sb.from("avans_kesintileri").select("*").order("created_at", { ascending: true }),
    sb.from("maas_odemeleri").select("*").order("pay_period", { ascending: false })
  ]);
  if (peopleResult.error) return showToast(`Personel listesi okunamadı: ${peopleResult.error.message || "SQL/policy hatası"}`);
  state.people = peopleResult.data || [];
  state.advances = advanceResult.error ? [] : (advanceResult.data || []);
  state.deductions = deductionResult.error ? [] : (deductionResult.data || []);
  state.salaryTableReady = !salaryResult.error;
  state.salaryPayments = salaryResult.error ? [] : (salaryResult.data || []);
  state.selectedPersonId = state.people.some((person) => String(person.id) === String(selectedBefore)) ? selectedBefore : (state.people.find((person) => person.is_active !== false)?.id || state.people[0]?.id || "");
  renderAll();
  scheduleSalaryReminder(false);
  if (!quiet) showToast(`${state.people.length} personel yüklendi.`);
}

function fillPersonSelect() {
  const select = $("activePerson");
  select.innerHTML = state.people.length ? state.people.map((person) => `<option value="${person.id}" ${String(person.id) === String(state.selectedPersonId) ? "selected" : ""}>${person.name}${person.is_active === false ? " (Pasif)" : ""}</option>`).join("") : '<option value="">Önce personel kaydet</option>';
  select.value = state.selectedPersonId || "";
}

function renderDueList() {
  const items = duePayrollItems();
  $("dueCount").textContent = String(items.length);
  $("dueList").innerHTML = items.length ? items.map(({ person, period }) => `<div class="due-item"><div><strong>${person.name}</strong><span>${formatDate(period)} maaşı · ${money.format(person.salary || 0)}</span></div><button type="button" data-open-due="${person.id}" data-period="${period}">İşlemi Aç</button></div>`).join("") : '<p class="empty">Maaşı bekleyen personel yok. Tüm ödemeler işaretlenmiş.</p>';
  document.querySelectorAll("[data-open-due]").forEach((button) => button.addEventListener("click", () => {
    state.selectedPersonId = button.dataset.openDue;
    fillPersonSelect();
    renderPayroll(button.dataset.period);
    window.scrollTo({ top: $("activePerson").getBoundingClientRect().top + window.scrollY - 12, behavior: "smooth" });
  }));
  try { window.parent.postMessage({ type: "garageflow:payroll-due", count: items.length, people: [...new Set(items.map((item) => item.person.name))] }, location.origin); } catch (_) {}
}

function renderPeriodOptions(preferredPeriod = "") {
  const person = getPerson(state.selectedPersonId);
  const select = $("salaryDuePeriod");
  if (!person) { select.innerHTML = '<option value="">Personel seç</option>'; return ""; }
  const unpaid = dueDatesFor(person).filter((period) => !paymentFor(person.id, period));
  if (!unpaid.length) { select.innerHTML = '<option value="">Bekleyen maaş yok</option>'; return ""; }
  select.innerHTML = unpaid.map((period) => `<option value="${period}" ${period === preferredPeriod ? "selected" : ""}>${formatDate(period)}</option>`).join("");
  if (preferredPeriod && unpaid.includes(preferredPeriod)) select.value = preferredPeriod;
  return select.value;
}

function deductionForPeriod(advanceId, period, person) {
  const exact = deductionsOf(advanceId).filter((row) => String(row.deduction_month) === String(period));
  if (exact.length) return exact.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  if ((person?.pay_type || "monthly") === "monthly") {
    const legacy = deductionsOf(advanceId).filter((row) => String(row.deduction_month) === monthOf(period));
    return legacy.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  }
  return 0;
}

function renderPayroll(preferredPeriod = "") {
  const person = getPerson(state.selectedPersonId);
  const period = renderPeriodOptions(preferredPeriod || $("salaryDuePeriod").value);
  const body = $("deductionBody");
  $("migrationWarning").classList.toggle("hidden", state.salaryTableReady);
  if (!person) {
    body.innerHTML = '<tr><td colspan="4">Önce personel kaydet.</td></tr>';
    $("salaryCards").innerHTML = summaryHTML([["Maaş", 0], ["Açık Avans", 0, "danger"], ["Kesilecek", 0, "warn"], ["Yatacak", 0, "ok"]]);
    $("markSalaryPaidBtn").disabled = true;
    return;
  }
  const openAdvances = advancesFor(person.id).filter((advance) => monthOf(advance.advance_date) <= monthOf(period || todayISO) && (remainingOf(advance) > 0 || deductionForPeriod(advance.id, period, person) > 0));
  let availableSalary = Number(person.salary || 0);
  body.innerHTML = openAdvances.length ? openAdvances.map((advance) => {
    const current = deductionForPeriod(advance.id, period, person);
    const available = remainingOf(advance) + current;
    const suggested = current > 0 ? current : Math.min(available, availableSalary);
    availableSalary = Math.max(0, availableSalary - suggested);
    return `<tr><td><input type="checkbox" class="deduct-check" data-id="${advance.id}" ${suggested > 0 ? "checked" : ""}></td><td>${formatDate(advance.advance_date)}<br><small>${advance.note || "Avans"}</small></td><td>${money.format(available)}</td><td><input class="deduct-amount" data-id="${advance.id}" type="number" min="0" max="${available}" step="0.01" value="${suggested || ""}" placeholder="0"></td></tr>`;
  }).join("") : '<tr><td colspan="4">Kesilecek açık avans yok.</td></tr>';
  document.querySelectorAll(".deduct-check").forEach((checkbox) => checkbox.addEventListener("change", () => { const input = document.querySelector(`.deduct-amount[data-id="${checkbox.dataset.id}"]`); if (!checkbox.checked) input.value = ""; renderSalaryCards(); }));
  document.querySelectorAll(".deduct-amount").forEach((input) => input.addEventListener("input", renderSalaryCards));
  const hasDue = Boolean(period);
  $("markSalaryPaidBtn").disabled = !hasDue || !state.salaryTableReady || person.is_active === false;
  $("markSalaryPaidBtn").textContent = hasDue ? "✓ Maaşı Yattı" : "Bekleyen maaş yok";
  $("salaryStatusBadge").textContent = hasDue ? "Ödeme Bekliyor" : "Güncel";
  $("salaryStatusBadge").className = `status-badge ${hasDue ? "due" : "paid"}`;
  $("salaryActionNote").textContent = hasDue ? `${formatDate(period)} dönemi “Maaşı Yattı” denene kadar listeden ve bildirimden kalkmaz.` : "Bu personelin bekleyen maaş ödemesi bulunmuyor.";
  renderSalaryCards();
  renderHistory();
}

function selectedDeductions() {
  return [...document.querySelectorAll(".deduct-amount")].map((input) => {
    const checked = document.querySelector(`.deduct-check[data-id="${input.dataset.id}"]`)?.checked;
    return { advanceId: input.dataset.id, amount: checked ? parseNum(input.value) : 0, max: Number(input.max || 0) };
  });
}

function renderSalaryCards() {
  const person = getPerson(state.selectedPersonId);
  const salary = Number(person?.salary || 0);
  const openAdvance = person ? advancesFor(person.id).reduce((sum, advance) => sum + remainingOf(advance), 0) : 0;
  const deduction = selectedDeductions().reduce((sum, row) => sum + row.amount, 0);
  $("salaryCards").innerHTML = summaryHTML([["Maaş", salary], ["Açık Avans", openAdvance, "danger"], ["Kesilecek", deduction, "warn"], ["Yatacak", Math.max(0, salary - deduction), "ok"]]);
}

function renderHistory() {
  const person = getPerson(state.selectedPersonId);
  const month = $("historyMonth").value || currentMonth;
  const salaryRows = state.salaryPayments.filter((row) => String(row.person_id) === String(person?.id) && monthOf(row.pay_period) === month);
  $("salaryHistoryBody").innerHTML = salaryRows.length ? salaryRows.map((row) => `<tr><td>${formatDate(row.pay_period)}</td><td>${money.format(row.gross_salary || 0)}</td><td>${money.format(row.advance_deduction || 0)}</td><td>${money.format(row.net_paid || 0)}</td><td>${formatDateTime(row.paid_at || row.created_at)}</td></tr>`).join("") : '<tr><td colspan="5">Bu ay maaş ödemesi yok.</td></tr>';
  const list = person ? advancesFor(person.id).filter((advance) => monthOf(advance.advance_date) <= month && (remainingOf(advance) > 0 || monthOf(advance.advance_date) === month)) : [];
  let total = 0, paid = 0, remaining = 0, carried = 0;
  $("historyBody").innerHTML = list.length ? list.map((advance) => {
    const paidAmount = paidOf(advance), remainingAmount = remainingOf(advance); total += Number(advance.amount || 0); paid += paidAmount; remaining += remainingAmount; if (monthOf(advance.advance_date) < month && remainingAmount > 0) carried += remainingAmount;
    const status = remainingAmount <= 0 ? "Kapandı" : monthOf(advance.advance_date) < month ? "Devreden" : "Açık";
    return `<tr><td>${formatDate(advance.advance_date)}</td><td>${advance.note || "-"}</td><td>${money.format(advance.amount || 0)}</td><td>${money.format(paidAmount)}</td><td>${money.format(remainingAmount)}</td><td>${status}</td></tr>`;
  }).join("") : '<tr><td colspan="6">Bu ay avans kaydı veya devreden bakiye yok.</td></tr>';
  $("historySummary").innerHTML = summaryHTML([["Toplam Avans", total], ["Kesilen", paid, "ok"], ["Kalan", remaining, "danger"], ["Devreden", carried, "warn"]]);
}

function renderPeople() {
  $("personList").innerHTML = state.people.length ? state.people.map((person) => `<div class="person-item ${person.is_active === false ? "inactive" : ""}"><div><strong>${person.name}</strong><span>${money.format(person.salary || 0)} · ${payDayText(person)} · ${person.is_active === false ? "Pasif" : "Aktif"}</span></div><div class="person-actions"><button type="button" class="ghost" data-edit-person="${person.id}">Düzenle</button><button type="button" class="danger" data-toggle-person="${person.id}">${person.is_active === false ? "Aktif Et" : "Pasif Et"}</button></div></div>`).join("") : '<p class="empty">Henüz personel kaydı yok.</p>';
  document.querySelectorAll("[data-edit-person]").forEach((button) => button.addEventListener("click", () => editPerson(button.dataset.editPerson)));
  document.querySelectorAll("[data-toggle-person]").forEach((button) => button.addEventListener("click", () => togglePerson(button.dataset.togglePerson)));
}

function renderAll() { fillPersonSelect(); renderDueList(); renderPayroll(); renderPeople(); }

async function saveAdvance() {
  const personId = state.selectedPersonId, amount = parseNum($("advanceAmount").value), note = $("advanceNote").value.trim(), advanceDate = $("advanceDate").value || todayISO;
  if (!personId) return showToast("Önce personel seç.");
  if (amount <= 0) return showToast("Avans miktarı gir.");
  const result = await sb.from("avans_kayitlari").insert({ person_id: personId, amount, note, advance_date: advanceDate });
  if (result.error) return showToast(`Avans kaydedilemedi: ${result.error.message || "Hata"}`);
  $("advanceAmount").value = ""; $("advanceNote").value = "";
  await loadAll({ quiet: true }); showToast("Avans kaydedildi; kesilecek tutara eklendi.");
}

async function markSalaryPaid() {
  const person = getPerson(state.selectedPersonId), period = $("salaryDuePeriod").value;
  if (!person || !period) return showToast("Bekleyen maaş dönemi yok.");
  const rows = selectedDeductions();
  for (const row of rows) if (row.amount > row.max + 0.001) return showToast("Kesinti kalan avans tutarını geçemez.");
  const deductionTotal = rows.reduce((sum, row) => sum + row.amount, 0);
  if (deductionTotal > Number(person.salary || 0) + 0.001) return showToast("Toplam avans kesintisi maaşı geçemez.");
  const netPaid = Math.max(0, Number(person.salary || 0) - deductionTotal);
  if (!confirm(`${person.name}\n${formatDate(period)} maaşı\nYatacak: ${money.format(netPaid)}\n\nMaaş yatırıldı olarak işaretlensin mi?`)) return;
  for (const row of rows) {
    const deleteResult = await sb.from("avans_kesintileri").delete().eq("advance_id", row.advanceId).eq("deduction_month", period);
    if (deleteResult.error) return showToast(`Kesinti güncellenemedi: ${deleteResult.error.message || "Hata"}`);
    if (row.amount > 0) {
      const insertResult = await sb.from("avans_kesintileri").insert({ advance_id: row.advanceId, deduction_month: period, amount: row.amount });
      if (insertResult.error) return showToast(`Kesinti kaydedilemedi: ${insertResult.error.message || "Hata"}`);
    }
  }
  const payment = await sb.from("maas_odemeleri").upsert({ person_id: person.id, pay_period: period, gross_salary: Number(person.salary || 0), advance_deduction: deductionTotal, net_paid: netPaid, paid_at: new Date().toISOString() }, { onConflict: "person_id,pay_period" });
  if (payment.error) return showToast(`Maaş kaydedilemedi: ${payment.error.message || "Hata"}`);
  await loadAll({ quiet: true }); showToast(`${person.name} için maaş yatırıldı olarak kaydedildi.`);
  try { window.parent.postMessage({ type: "garageflow:toast", message: `${person.name} maaşı ödendi olarak kaydedildi.` }, location.origin); } catch (_) {}
}

function resetPersonForm() {
  state.editingPersonId = ""; $("personName").value = ""; $("personSalary").value = ""; $("personPayType").value = "monthly"; $("personSalaryDay").value = "15"; $("personSalaryWeekday").value = "1"; $("personTrackingStart").value = todayISO; $("personActive").checked = true; $("cancelPersonEditBtn").classList.add("hidden"); $("savePersonBtn").textContent = "Personeli Kaydet"; togglePayFields();
}

function editPerson(id) {
  const person = getPerson(id); if (!person) return;
  state.editingPersonId = person.id; $("personName").value = person.name || ""; $("personSalary").value = person.salary || 0; $("personPayType").value = person.pay_type || "monthly"; $("personSalaryDay").value = String(person.salary_day || 1); $("personSalaryWeekday").value = String(person.salary_weekday ?? 1); $("personTrackingStart").value = person.salary_tracking_start || todayISO; $("personActive").checked = person.is_active !== false; $("cancelPersonEditBtn").classList.remove("hidden"); $("savePersonBtn").textContent = "Değişiklikleri Kaydet"; togglePayFields(); window.scrollTo({ top: 0, behavior: "smooth" });
}

async function savePerson() {
  const name = $("personName").value.trim(), salary = parseNum($("personSalary").value), payType = $("personPayType").value || "monthly";
  if (!name) return showToast("Personel adı gir.");
  const payload = { name, salary, pay_type: payType, salary_day: payType === "monthly" ? Number($("personSalaryDay").value || 1) : null, salary_weekday: payType === "weekly" ? Number($("personSalaryWeekday").value ?? 1) : null, salary_tracking_start: $("personTrackingStart").value || todayISO, is_active: $("personActive").checked };
  let result = state.editingPersonId ? await sb.from("avans_personel").update(payload).eq("id", state.editingPersonId) : await sb.from("avans_personel").insert(payload);
  if (result.error && /salary_tracking_start|is_active/i.test(result.error.message || "")) {
    const legacyPayload = { name, salary, pay_type: payload.pay_type, salary_day: payload.salary_day, salary_weekday: payload.salary_weekday };
    result = state.editingPersonId ? await sb.from("avans_personel").update(legacyPayload).eq("id", state.editingPersonId) : await sb.from("avans_personel").insert(legacyPayload);
  }
  if (result.error) return showToast(`Personel kaydedilemedi: ${result.error.message || "Hata"}`);
  resetPersonForm(); await loadAll({ quiet: true }); showToast("Personel kaydedildi.");
}

async function togglePerson(id) {
  const person = getPerson(id); if (!person) return;
  const result = await sb.from("avans_personel").update({ is_active: person.is_active === false }).eq("id", id);
  if (result.error) return showToast("Personel durumu değiştirilemedi. Kurulum SQL’ini kontrol et.");
  await loadAll({ quiet: true }); showToast("Personel durumu güncellendi.");
}

function togglePayFields() { const monthly = $("personPayType").value === "monthly"; $("monthlyField").classList.toggle("hidden", !monthly); $("weeklyField").classList.toggle("hidden", monthly); }

async function requestNotifications() {
  if (!("Notification" in window)) return showToast("Bu tarayıcı bildirim desteklemiyor.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return showToast("Bildirim izni verilmedi.");
  localStorage.setItem("garageflow_salary_notifications", "1");
  localStorage.setItem("kasaflow_salary_notifications", "1");
  showToast("Maaş bildirimleri açıldı.");
  scheduleSalaryReminder(true);
}

async function scheduleSalaryReminder(force = false) {
  const due = duePayrollItems();
  if (!due.length || !("Notification" in window) || Notification.permission !== "granted") return;
  const hour = new Date().getHours();
  const key = `garageflow_payroll_notified_${todayISO}`;
  if (!force && (hour < 9 || hour >= 10 || localStorage.getItem("garageflow_salary_notifications") !== "1" || localStorage.getItem(key) === "1")) return;
  const names = [...new Set(due.map((item) => item.person.name))];
  const body = `Bu personel/personellerin maaşı var: ${names.join(", ")}`;
  try {
    const registration = await navigator.serviceWorker?.getRegistration?.();
    if (registration?.showNotification) await registration.showNotification("KasaFlow Maaş Hatırlatması", { body, icon: "/logo.png", badge: "/logo.png", tag: "kasaflow-payroll" });
    else new Notification("KasaFlow Maaş Hatırlatması", { body, icon: "/logo.png" });
    localStorage.setItem(key, "1");
  } catch (error) { console.warn(error); }
}

function bind() {
  $("todayText").textContent = `Bugün: ${formatDate(todayISO)}`; $("advanceDate").value = todayISO; $("historyMonth").value = currentMonth; $("personTrackingStart").value = todayISO;
  $("personSalaryDay").innerHTML = Array.from({ length: 31 }, (_, index) => `<option value="${index + 1}" ${index + 1 === 15 ? "selected" : ""}>Her ayın ${index + 1}. günü</option>`).join("");
  document.querySelectorAll(".tab-btn").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".tab-btn,.tab-panel").forEach((element) => element.classList.remove("active")); button.classList.add("active"); $(button.dataset.tab).classList.add("active"); }));
  $("activePerson").addEventListener("change", () => { state.selectedPersonId = $("activePerson").value; renderPayroll(); });
  $("salaryDuePeriod").addEventListener("change", () => renderPayroll($("salaryDuePeriod").value));
  $("historyMonth").addEventListener("change", renderHistory);
  $("saveAdvanceBtn").addEventListener("click", saveAdvance); $("markSalaryPaidBtn").addEventListener("click", markSalaryPaid); $("savePersonBtn").addEventListener("click", savePerson); $("cancelPersonEditBtn").addEventListener("click", resetPersonForm); $("personPayType").addEventListener("change", togglePayFields); $("syncBtn").addEventListener("click", () => loadAll()); $("notifyBtn").addEventListener("click", requestNotifications);
  togglePayFields(); setInterval(() => scheduleSalaryReminder(false), 5 * 60 * 1000);
}

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js?v=5").catch(console.warn));
bind(); resetPersonForm(); loadAll();

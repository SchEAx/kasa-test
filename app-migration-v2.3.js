const MIGRATION_TEST_MODE = true;
const MIGRATION_API_BASE = "https://api.scheax.com.tr/migration-test";
const MIGRATION_TOKEN_KEY = "garage_migration_test_jwt_v1";
const VAPID_PUBLIC_KEY = "BAi5RqXIHt50gvHTCOLT0XJxzW6f8OB_pYt_JN4nOKIIP8Cj9KkUu44hsLRZKLxxOKrZVdPFX_c5qc141bJt4Hc";

const KASAFLOW_APP_VERSION = "2.3.9";
const KASAFLOW_VERSION_KEY = "kasaflow_app_version";


const VIEWS = {
  "hizli-kayit": { title: "Hızlı Kayıt", kind: "vehicle", tab: "hizliKayit" },
  kayitlar: { title: "Kayıtlar", kind: "vehicle", tab: "liste" },
  "gun-sonu": { title: "Gün Sonu", kind: "vehicle", tab: "gunSonu" },
  siparis: { title: "Sipariş", kind: "vehicle", tab: "siparis" },
  garanti: { title: "Garanti", kind: "vehicle", tab: "garanti" },
  "avans-maas": { title: "Avans & Maaş", kind: "payroll" },
  anket: { title: "Anket", kind: "survey" },
  ayarlar: { title: "Ayarlar", kind: "settings" }
};
const THEMES = new Set(["pembe-seker", "sakiz", "lavanta", "tropik", "mandalina", "gece-pembe"]);
const ALL_VIEW_KEYS = Object.keys(VIEWS);
const DEFAULT_STAFF_VIEWS = ALL_VIEW_KEYS.filter((key) => key !== "ayarlar");
const VEHICLE_URL = "/modules/arac-kabul/index.html?embed=kasa";
const PAYROLL_URL = "/modules/avans-maas-v239/index.html?embed=kasa&v=2.3.9";

const frame = document.getElementById("moduleFrame");
const viewport = document.getElementById("moduleViewport");
const settingsView = document.getElementById("settingsView");
const surveyView = document.getElementById("surveyView");
const loading = document.getElementById("moduleLoading");
const title = document.getElementById("viewTitle");
const toast = document.getElementById("toast");
const appVersionLabel = document.getElementById("appVersionLabel");
if (appVersionLabel) appVersionLabel.textContent = `KasaFlow Migration ${KASAFLOW_APP_VERSION}`;
let activeView = "hizli-kayit";
let pendingVehicleTab = "hizliKayit";
let appStarted = false;
let currentProfile = null;
let allowedViewKeys = new Set(DEFAULT_STAFF_VIEWS);
let staffManagementRows = [];


function migrationToken() {
  try { return localStorage.getItem(MIGRATION_TOKEN_KEY) || ""; } catch { return ""; }
}
function setMigrationToken(token) {
  try {
    if (token) localStorage.setItem(MIGRATION_TOKEN_KEY, token);
    else localStorage.removeItem(MIGRATION_TOKEN_KEY);
  } catch {}
}
async function apiFetch(path, options = {}) {
  const token = migrationToken();
  const method = String(options.method || "GET").toUpperCase();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const response = await fetch(MIGRATION_API_BASE + path, {
    method,
    headers,
    body: options.body === undefined ? undefined : (typeof options.body === "string" ? options.body : JSON.stringify(options.body)),
    cache: "no-store"
  });
  const raw = await response.text();
  let payload = {};
  if (raw) { try { payload = JSON.parse(raw); } catch { payload = { message: raw }; } }
  if (response.status === 401) {
    setMigrationToken("");
    if (typeof showLogin === "function") showLogin("Oturum süresi doldu. Tekrar giriş yap.");
  }
  if (!response.ok || payload?.status === "error") throw new Error(payload?.message || `API hatası (${response.status})`);
  return payload;
}

function showKasaFlowUpdateNotice(newVersion) {
  let notice = document.getElementById("kasaflowUpdateNotice");
  if (notice) {
    const versionNode = notice.querySelector("[data-update-version]");
    if (versionNode) versionNode.textContent = String(newVersion || "");
    return;
  }

  notice = document.createElement("div");
  notice.id = "kasaflowUpdateNotice";
  notice.className = "kasaflow-update-notice";
  notice.innerHTML = `
    <div class="kasaflow-update-copy">
      <strong>⚡ Yeni sürüm hazır</strong>
      <span data-update-version>${String(newVersion || "")}</span>
    </div>
    <button type="button" id="kasaflowUpdateNowBtn">Güncelle</button>
  `;

  let updateStarted = false;
  notice.querySelector("#kasaflowUpdateNowBtn")?.addEventListener("click", async () => {
    if (updateStarted) return;
    updateStarted = true;
    notice.classList.add("is-updating");
    notice.innerHTML = `<strong>⚡ Güncelleniyor…</strong>`;

    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((reg) => reg.unregister()));
      }
      localStorage.setItem(KASAFLOW_VERSION_KEY, String(newVersion || Date.now()));
    } catch (err) {
      console.warn("KasaFlow güncelleme temizliği tamamlanamadı:", err);
    }

    const target = new URL(window.location.href);
    target.searchParams.set("v", String(newVersion || Date.now()));
    target.searchParams.set("_", String(Date.now()));
    window.location.replace(target.toString());
  }, { once: true });

  document.body.appendChild(notice);
  if (typeof showToast === "function") showToast("Yeni KasaFlow sürümü mevcut ⚡ Güncelle butonuna basabilirsin.");
}

async function checkKasaFlowVersion() {
  try {
    // Çalışan JS sürümü gerçeğin kaynağıdır. localStorage yalnızca bilgi amaçlıdır.
    // Böylece Ctrl+F5 ile yeni JS geldikten sonra eski localStorage değeri yüzünden
    // sahte bir "Güncelle" uyarısı oluşmaz.
    try { localStorage.setItem(KASAFLOW_VERSION_KEY, KASAFLOW_APP_VERSION); } catch {}

    const response = await fetch(
      `/version.json?running=${encodeURIComponent(KASAFLOW_APP_VERSION)}&_=${Date.now()}`,
      {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      }
    );
    if (!response.ok) return;

    const data = await response.json();
    const remoteVersion = String(data?.version || "").trim();
    if (!remoteVersion) return;

    const notice = document.getElementById("kasaflowUpdateNotice");
    if (remoteVersion === KASAFLOW_APP_VERSION) {
      notice?.remove();
      return;
    }

    showKasaFlowUpdateNotice(remoteVersion);
  } catch (err) {
    console.warn("KasaFlow sürüm kontrolü yapılamadı:", err);
  }
}

function initKasaFlowUpdateChecker() {
  checkKasaFlowVersion();
  // Deployment sonrası butonun dakikalarca gecikmemesi için 10 sn kontrol.
  window.setInterval(checkKasaFlowVersion, 10 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkKasaFlowVersion();
  });
  window.addEventListener("focus", checkKasaFlowVersion);
  window.addEventListener("pageshow", checkKasaFlowVersion);
  window.addEventListener("online", checkKasaFlowVersion);
}

async function cleanupLegacyKasaFlowCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.unregister()));
    }
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.filter(name => /kasaflow|garageflow-arac-kabul/i.test(name)).map(name => caches.delete(name)));
    }
  } catch (err) {
    console.warn("Eski KasaFlow cache temizliği tamamlanamadı:", err);
  }
}

function authEmailForUsername(username) {
  const slug = String(username || "").trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug || "personel"}@garage.local`;
}

function roleLabel(role) {
  return ({ admin: "Admin", depo: "Depo", kasa: "Kasa", satis: "Satış", usta: "Usta" })[role] || role || "Personel";
}

function viewKeysForProfile(profile) {
  if (profile?.role === "admin") return [...ALL_VIEW_KEYS];
  const configured = profile?.permissions?.kasaflowTabs;
  const keys = Array.isArray(configured) ? configured.filter((key) => VIEWS[key] && key !== "ayarlar") : DEFAULT_STAFF_VIEWS;
  if (Array.isArray(configured) && configured.includes("ayarlar")) keys.push("ayarlar");
  return [...new Set(keys.length ? keys : ["hizli-kayit"])];
}

function canOpenView(key) {
  return allowedViewKeys.has(key);
}

function firstAllowedView() {
  return ALL_VIEW_KEYS.find((key) => allowedViewKeys.has(key)) || "hizli-kayit";
}

function applyViewAccess(profile) {
  allowedViewKeys = new Set(viewKeysForProfile(profile));
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("hidden", !allowedViewKeys.has(button.dataset.view)));
  const isAdmin = profile?.role === "admin";
  document.getElementById("notificationButton")?.classList.toggle("hidden", !allowedViewKeys.has("avans-maas"));
  document.getElementById("staffManagementPanel")?.classList.toggle("hidden", !isAdmin);
  if (!allowedViewKeys.has("avans-maas")) document.getElementById("salaryAlert")?.classList.add("hidden");
}
async function loadGlobalProfile() {
  const payload = await apiFetch("/api/auth/me");
  const data = payload?.user;
  if (!data) throw new Error("Oturum bulunamadı");
  if (data.is_active === false) throw new Error("Bu personel hesabı pasif");
  return data;
}

function showLogin(message = "") {
  document.getElementById("globalLoginOverlay").classList.remove("hidden");
  document.getElementById("globalAppShell").classList.add("auth-locked");
  document.getElementById("globalLoginError").textContent = message;
  setTimeout(() => document.getElementById("globalLoginUsername")?.focus(), 100);
}

function enterApp(profile) {
  currentProfile = profile;
  applyViewAccess(profile);
  document.getElementById("globalLoginOverlay").classList.add("hidden");
  document.getElementById("globalAppShell").classList.remove("auth-locked");
  document.getElementById("globalUserPill").classList.remove("hidden");
  document.getElementById("globalUserName").textContent = profile.name || profile.username || "Personel";
  document.getElementById("globalUserRole").textContent = roleLabel(profile.role);
  try { window.dispatchEvent(new CustomEvent("kasaflow:check-payroll")); } catch {}
  if (!appStarted) {
    appStarted = true;
    const hashView = location.hash.replace("#", "");
    const savedView = localStorage.getItem("kasaflow_active_view");
    const wantedView = VIEWS[hashView] ? hashView : (VIEWS[savedView] ? savedView : "hizli-kayit");
    openView(canOpenView(wantedView) ? wantedView : firstAllowedView(), false);
  }
}
async function initializeAuth() {
  try {
    if (!migrationToken()) return showLogin();
    enterApp(await loadGlobalProfile());
  } catch (error) {
    setMigrationToken("");
    showLogin(error.message || "Oturum açılamadı");
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function setActiveButton(key) {
  document.querySelectorAll(".module-button").forEach((button) => button.classList.toggle("active", button.dataset.view === key));
}

function sendVehicleTab() {
  if (frame.dataset.kind !== "vehicle" || !frame.contentWindow) return;
  frame.contentWindow.postMessage({ type: "kasaflow:set-tab", tab: pendingVehicleTab }, location.origin);
}

function applyTheme(theme, { save = true, notify = true } = {}) {
  const selected = THEMES.has(theme) ? theme : "pembe-seker";
  document.documentElement.dataset.kasaTheme = selected;
  if (save) localStorage.setItem("kasaflow_theme", selected);
  document.querySelectorAll("[data-theme-choice]").forEach((card) => card.classList.toggle("active", card.dataset.themeChoice === selected));
  try { frame.contentWindow.document.documentElement.dataset.kasaTheme = selected; } catch (_) {}
  if (notify) showToast("Tema tüm KasaFlow ekranlarına uygulandı ✨");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}


function formatSurveyDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return escapeHtml(String(value));
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function customerSurveyRowAverage(row) {
  const values = [1, 2, 3, 4, 5, 6, 7, 8]
    .map((i) => Number(row?.[`q${i}`] || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (!values.length) return "0.00";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
}

async function loadCustomerSurveyStats() {
  const box = document.getElementById("customerSurveyPanel");
  if (!box) return;
  box.innerHTML = `<div class="survey-empty">Anket cevapları yükleniyor…</div>`;

  try {
    const payload = await apiFetch("/api/customer-surveys?limit=500&offset=0");
    const rows = Array.isArray(payload?.surveys) ? payload.surveys : [];
    const totalSurveyCount = Number(payload?.count ?? rows.length);
    const scoreKeys = ["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8"];
    const numericScores = (row) => scoreKeys
      .map((key) => Number(row?.[key] || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
    const avg = (values) => values.length
      ? (values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length).toFixed(2)
      : "0.00";

    const allScores = rows.flatMap(numericScores);
    const problemRows = rows.filter((row) => numericScores(row).some((value) => value <= 2));
    const contactRows = rows.filter((row) => row.contact_allowed && row.phone);
    const questionNames = [
      "Karşılama biçimi ve nezaket",
      "İhtiyaçların anlaşılması / bilgilendirme",
      "Montaj kalitesi ve işçilik",
      "Söz verilen zamanda teslim",
      "Teslimat anındaki temizlik",
      "Fiyat / Performans",
      "Tavsiye etme olasılığı",
      "Muhatap bulabilme"
    ];

    const averagesHtml = questionNames.map((name, index) => {
      const key = `q${index + 1}`;
      const values = rows
        .map((row) => Number(row?.[key] || 0))
        .filter((value) => Number.isFinite(value) && value > 0);
      return `<tr><td><span class="survey-q-code">Q${index + 1}</span>${escapeHtml(name)}</td><td><strong>${avg(values)}</strong> / 5</td></tr>`;
    }).join("");

    const rawRowsHtml = rows.map((row) => {
      const scores = numericScores(row);
      const low = scores.some((value) => value <= 2);
      const comment = String(row?.suggestion || "").trim();
      const contact = row?.contact_allowed && row?.phone
        ? `✅ ${escapeHtml(String(row.phone))}`
        : "Anonim";
      const scoreCells = scoreKeys.map((key) => `<td>${escapeHtml(String(row?.[key] ?? "-"))}</td>`).join("");
      return `<tr class="${low ? "survey-row-low" : ""}">
        <td><strong>#${escapeHtml(String(row?.id || "-"))}</strong></td>
        <td>${formatSurveyDate(row?.created_at)}</td>
        <td><strong>${customerSurveyRowAverage(row)}</strong></td>
        ${scoreCells}
        <td class="survey-table-comment" title="${escapeHtml(comment)}">${comment ? escapeHtml(comment) : "-"}</td>
        <td>${contact}</td>
      </tr>`;
    }).join("") || `<tr><td colspan="13" class="survey-empty">Henüz anket cevabı yok.</td></tr>`;

    const commentsHtml = rows
      .filter((row) => String(row?.suggestion || "").trim() || (row?.contact_allowed && row?.phone))
      .slice(0, 30)
      .map((row) => {
        const scores = numericScores(row);
        const low = scores.some((value) => value <= 2);
        const comment = String(row?.suggestion || "").trim();
        return `<article class="survey-comment ${low ? "danger" : ""}">
          <div class="survey-comment-head">
            <strong>#${escapeHtml(String(row?.id || "-"))} · ${formatSurveyDate(row?.created_at)}</strong>
            <span>Ort. ${avg(scores)} / 5 ${low ? "⚠️" : ""}</span>
          </div>
          <p>${comment ? escapeHtml(comment) : "Yorum yazılmamış."}</p>
          <small>${row?.contact_allowed && row?.phone ? `Geri dönüş izni: ${escapeHtml(String(row.phone))}` : "Anonim değerlendirme"}</small>
        </article>`;
      }).join("") || `<div class="survey-empty">Henüz yorum yok.</div>`;

    box.innerHTML = `
      <div class="survey-stats">
        <article><b>${totalSurveyCount}</b><span>Toplam Anket</span></article>
        <article><b>${avg(allScores)}</b><span>Genel Ortalama</span></article>
        <article><b>${problemRows.length}</b><span>Düşük Puanlı</span></article>
        <article><b>${contactRows.length}</b><span>Geri Dönüş İsteyen</span></article>
      </div>

      <section class="survey-card">
        <div class="survey-section-head"><div><p class="eyebrow">PUAN ANALİZİ</p><h2>Kriter Ortalamaları</h2></div></div>
        <div class="survey-table-scroll"><table class="survey-table survey-average-table"><thead><tr><th>Kriter</th><th>Ortalama</th></tr></thead><tbody>${averagesHtml}</tbody></table></div>
      </section>

      <section class="survey-card">
        <div class="survey-section-head">
          <div><p class="eyebrow">MÜŞTERİ CEVAPLARI</p><h2>Tüm Anket Kayıtları</h2><small>Son ${rows.length} kayıt gösteriliyor.</small></div>
          <button class="survey-refresh-button" type="button" onclick="loadCustomerSurveyStats()">↻ Yenile</button>
        </div>
        <div class="survey-table-scroll"><table class="survey-table survey-record-table"><thead><tr>
          <th>ID</th><th>Tarih</th><th>Ort.</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Q5</th><th>Q6</th><th>Q7</th><th>Q8</th><th>Yorum</th><th>İletişim</th>
        </tr></thead><tbody>${rawRowsHtml}</tbody></table></div>
      </section>

      <section class="survey-card">
        <div class="survey-section-head"><div><p class="eyebrow">YORUMLAR</p><h2>Son Yorumlar</h2></div></div>
        <div class="survey-comments">${commentsHtml}</div>
      </section>
    `;
  } catch (error) {
    console.error("KasaFlow survey load error:", error);
    box.innerHTML = `<div class="survey-empty survey-error">Anket cevapları alınamadı: ${escapeHtml(error?.message || error)}</div>`;
  }
}
window.loadCustomerSurveyStats = loadCustomerSurveyStats;

function usernameSlug(value) {
  return authEmailForUsername(value).split("@")[0];
}

function setStaffMessage(message = "", type = "") {
  const box = document.getElementById("staffManagementMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `staff-management-message${type ? ` ${type}` : ""}${message ? "" : " hidden"}`;
}

function staffTabs(item) {
  if (item?.role === "admin") return [...ALL_VIEW_KEYS];
  const configured = item?.permissions?.kasaflowTabs;
  if (!Array.isArray(configured)) return [...DEFAULT_STAFF_VIEWS];
  const valid = configured.filter((key) => VIEWS[key]);
  return valid.length ? valid : ["hizli-kayit"];
}

function staffRowTemplate(item = {}) {
  const authUserId = String(item.auth_user_id || "");
  const userId = String(item.id || item.user_id || "");
  const isNew = !userId;
  const role = item.role || "kasa";
  const selectedTabs = new Set(staffTabs({ ...item, role }));
  const isCurrentAdmin = String(item.username || "").toLocaleLowerCase("tr-TR") === String(currentProfile?.username || "").toLocaleLowerCase("tr-TR");
  return `
    <article class="staff-management-row" data-staff-row data-user-id="${escapeHtml(userId)}" data-auth-id="${escapeHtml(authUserId)}">
      <div class="staff-row-heading">
        <div><strong>${isNew ? "Yeni Personel" : escapeHtml(item.name || "Personel")}</strong><small>${isNew ? "Kullanıcı adı otomatik de oluşturulabilir" : `@${escapeHtml(item.username || "-")}`}</small></div>
        <span class="staff-state ${isNew ? "new" : "active"}">${isNew ? "Yeni" : "Aktif"}</span>
      </div>
      <div class="staff-fields">
        <label>Ad Soyad<input data-staff-name value="${escapeHtml(item.name || "")}" placeholder="Örn: Nurhan" /></label>
        <label>Kullanıcı adı<input data-staff-username value="${escapeHtml(item.username || "")}" placeholder="Boşsa addan oluşur" autocomplete="off" /></label>
        <label>Rol<select data-staff-role>
          ${["kasa", "satis", "depo", "usta", "admin"].map((key) => `<option value="${key}" ${role === key ? "selected" : ""}>${roleLabel(key)}</option>`).join("")}
        </select></label>
        <label>Şifre<input data-staff-password type="password" value="" placeholder="${isNew ? "Yeni giriş şifresi" : "Değişmeyecekse boş bırak"}" autocomplete="new-password" /></label>
      </div>
      <div class="staff-permission-head"><div><b>Sekme izinleri</b><small>Bu personelin KasaFlow’da görebileceği alanlar</small></div><div><button type="button" class="mini-action" data-check-all>Hepsini Aç</button><button type="button" class="mini-action" data-clear-all>Temizle</button></div></div>
      <div class="staff-permission-grid">
        ${ALL_VIEW_KEYS.map((key) => `<label class="permission-chip"><input type="checkbox" data-staff-view value="${key}" ${selectedTabs.has(key) ? "checked" : ""} ${role === "admin" ? "disabled" : ""}/><span>${escapeHtml(VIEWS[key].title)}</span></label>`).join("")}
      </div>
      <button type="button" class="deactivate-staff" data-remove-staff ${isCurrentAdmin ? "disabled title=\"Giriş yaptığın Admin hesabı pasife alınamaz\"" : ""}>${isNew ? "Satırı Kaldır" : "Personeli Pasife Al"}</button>
    </article>`;
}

function bindStaffRows() {
  document.querySelectorAll("[data-staff-row]").forEach((row) => {
    if (row.dataset.bound === "1") return;
    row.dataset.bound = "1";
    const roleSelect = row.querySelector("[data-staff-role]");
    const syncRole = () => {
      const admin = roleSelect.value === "admin";
      row.querySelectorAll("[data-staff-view]").forEach((checkbox) => { if (admin) checkbox.checked = true; checkbox.disabled = admin; });
    };
    roleSelect.addEventListener("change", syncRole);
    row.querySelector("[data-check-all]").addEventListener("click", () => row.querySelectorAll("[data-staff-view]:not(:disabled)").forEach((checkbox) => checkbox.checked = true));
    row.querySelector("[data-clear-all]").addEventListener("click", () => row.querySelectorAll("[data-staff-view]:not(:disabled)").forEach((checkbox) => checkbox.checked = false));
    row.querySelector("[data-remove-staff]")?.addEventListener("click", () => {
      if (row.dataset.authId && !confirm("Bu personel pasife alınacak; geçmiş kayıtları silinmeyecek. Devam edilsin mi?")) return;
      row.remove();
      setStaffMessage("Değişikliği tamamlamak için Personelleri Kaydet düğmesine bas.", "info");
    });
    const nameInput = row.querySelector("[data-staff-name]");
    const usernameInput = row.querySelector("[data-staff-username]");
    nameInput.addEventListener("input", () => {
      if (!row.dataset.authId && !usernameInput.dataset.manual) usernameInput.value = usernameSlug(nameInput.value);
    });
    usernameInput.addEventListener("input", () => { usernameInput.dataset.manual = usernameInput.value ? "1" : ""; });
  });
}

function renderStaffManagement() {
  const list = document.getElementById("staffManagementList");
  if (!list) return;
  list.innerHTML = staffManagementRows.length ? staffManagementRows.map(staffRowTemplate).join("") : '<p class="staff-empty">Aktif personel bulunamadı.</p>';
  bindStaffRows();
}
async function loadStaffManagement() {
  if (currentProfile?.role !== "admin") return;
  setStaffMessage("Personeller yükleniyor…", "info");
  try {
    const payload = await apiFetch("/api/users");
    staffManagementRows = (payload.users || []).filter(item => item?.is_active !== false);
    renderStaffManagement();
    setStaffMessage("");
  } catch (error) {
    setStaffMessage(`Personeller okunamadı: ${error.message || error}`, "error");
  }
}

function addStaffManagementRow() {
  const list = document.getElementById("staffManagementList");
  if (!list) return;
  list.querySelector(".staff-empty")?.remove();
  list.insertAdjacentHTML("beforeend", staffRowTemplate({ role: "kasa", permissions: { kasaflowTabs: [...DEFAULT_STAFF_VIEWS] } }));
  bindStaffRows();
  list.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
  setStaffMessage("Yeni personelin adı ve şifresini doldur; sekme izinlerini seç.", "info");
}
async function saveStaffManagement() {
  if (currentProfile?.role !== "admin") return showToast("Personel yönetimi yalnızca Admin içindir.");
  const button = document.getElementById("saveStaffManagementBtn");
  if (button?.disabled) return;
  const rows = [...document.querySelectorAll("[data-staff-row]")];
  const incoming = [];

  for (const row of rows) {
    const userId = String(row.dataset.userId || "").trim();
    const name = row.querySelector("[data-staff-name]").value.replace(/\s+/g, " ").trim();
    const username = usernameSlug(row.querySelector("[data-staff-username]").value || name);
    const role = row.querySelector("[data-staff-role]").value;
    const password = row.querySelector("[data-staff-password]").value.trim();
    const tabs = role === "admin" ? [...ALL_VIEW_KEYS] : [...row.querySelectorAll("[data-staff-view]:checked")].map((checkbox) => checkbox.value);
    if (!name) return setStaffMessage("Personel adı boş bırakılamaz.", "error");
    if (!userId && password.length < 4) return setStaffMessage(`${name} için en az 4 karakterli şifre gir.`, "error");
    if (!tabs.length) return setStaffMessage(`${name} için en az bir sekme izni seç.`, "error");
    const oldItem = staffManagementRows.find(item => String(item.id || "") === userId);
    incoming.push({
      userId, username, name, role, password,
      allowed_categories: oldItem?.allowed_categories || [],
      permissions: { ...(oldItem?.permissions || {}), kasaflowTabs: tabs }
    });
  }

  const duplicate = incoming.find((item, index, list) => list.findIndex(other => other.username === item.username) !== index);
  if (duplicate) return setStaffMessage(`@${duplicate.username} kullanıcı adı iki kez kullanılmış.`, "error");

  if (button) { button.disabled = true; button.textContent = "Kaydediliyor…"; }
  setStaffMessage("PostgreSQL personel hesapları ve sekme izinleri kaydediliyor…", "info");
  try {
    const keptIds = new Set(incoming.map(x => x.userId).filter(Boolean));
    for (const old of staffManagementRows) {
      const oldId = String(old?.id || "");
      if (oldId && !keptIds.has(oldId) && String(old.username || "").toLocaleLowerCase("tr-TR") !== String(currentProfile?.username || "").toLocaleLowerCase("tr-TR")) {
        await apiFetch(`/api/users/${encodeURIComponent(oldId)}`, { method: "PATCH", body: { is_active: false } });
      }
    }

    for (const item of incoming) {
      if (item.userId) {
        await apiFetch(`/api/users/${encodeURIComponent(item.userId)}`, {
          method: "PATCH",
          body: {
            username: item.username,
            name: item.name,
            role: item.role,
            is_active: true,
            allowed_categories: item.allowed_categories,
            permissions: item.permissions
          }
        });
        if (item.password) {
          await apiFetch(`/api/users/${encodeURIComponent(item.userId)}/password`, { method: "PATCH", body: { password: item.password } });
        }
      } else {
        await apiFetch("/api/users", {
          method: "POST",
          body: {
            username: item.username,
            name: item.name,
            role: item.role,
            password: item.password,
            is_active: true,
            allowed_categories: item.allowed_categories,
            permissions: item.permissions
          }
        });
      }
    }
    await loadStaffManagement();
    showToast("Personeller ve KasaFlow sekme izinleri PostgreSQL'e kaydedildi ✅");
  } catch (error) {
    setStaffMessage(`Kayıt başarısız: ${error.message || error}`, "error");
  } finally {
    if (button) { button.disabled = false; button.textContent = "Personelleri Kaydet"; }
  }
}

function openView(key, pushState = true) {
  if (!VIEWS[key] || !canOpenView(key)) {
    showToast("Bu sekme için yetkin bulunmuyor.");
    key = firstAllowedView();
  }
  const view = VIEWS[key] || VIEWS["hizli-kayit"];
  activeView = VIEWS[key] ? key : "hizli-kayit";
  title.textContent = view.title;
  setActiveButton(activeView);
  const isSettings = view.kind === "settings";
  const isSurvey = view.kind === "survey";
  viewport.classList.toggle("hidden", isSettings || isSurvey);
  settingsView.classList.toggle("hidden", !isSettings);
  surveyView?.classList.toggle("hidden", !isSurvey);
  document.getElementById("refreshViewButton").classList.toggle("hidden", isSettings);
  if (isSettings && currentProfile?.role === "admin") loadStaffManagement();
  if (isSurvey) loadCustomerSurveyStats();

  if (view.kind === "vehicle") {
    pendingVehicleTab = view.tab;
    if (frame.dataset.kind === "vehicle") {
      sendVehicleTab();
    } else {
      loading.classList.remove("hidden");
      frame.dataset.kind = "vehicle";
      frame.src = VEHICLE_URL;
    }
  } else if (view.kind === "payroll") {
    if (frame.dataset.kind !== "payroll") {
      loading.classList.remove("hidden");
      frame.dataset.kind = "payroll";
      frame.src = PAYROLL_URL;
    }
  }

  if (pushState) {
    history.replaceState(null, "", `#${activeView}`);
    localStorage.setItem("kasaflow_active_view", activeView);
  }
}

document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => openView(button.dataset.view)));
document.querySelectorAll("[data-open-payroll]").forEach((button) => button.addEventListener("click", () => openView("avans-maas")));
document.querySelectorAll("[data-theme-choice]").forEach((button) => button.addEventListener("click", () => applyTheme(button.dataset.themeChoice)));
document.getElementById("addStaffManagementBtn")?.addEventListener("click", addStaffManagementRow);
document.getElementById("saveStaffManagementBtn")?.addEventListener("click", saveStaffManagement);
document.getElementById("reloadStaffManagementBtn")?.addEventListener("click", loadStaffManagement);

frame.addEventListener("load", () => {
  loading.classList.add("hidden");
  applyTheme(localStorage.getItem("kasaflow_theme") || "pembe-seker", { save: false, notify: false });
  if (frame.dataset.kind === "vehicle") sendVehicleTab();
});

document.getElementById("refreshViewButton").addEventListener("click", () => {
  if (activeView === "anket") {
    loadCustomerSurveyStats();
    return;
  }
  if (!frame.src) return;
  loading.classList.remove("hidden");
  frame.contentWindow.location.reload();
});

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from([...atob(base64)].map((character) => character.charCodeAt(0)));
}

document.getElementById("notificationButton")?.addEventListener("click", () => {
  showToast("Avans & Maaş bildirim altyapısını ayrı migration turunda taşıyacağız.");
});

async function closeVisiblePayrollNotifications() {
  try {
    window.dispatchEvent(new CustomEvent("kasaflow:close-payroll-notifications"));
  } catch (_) {}

  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        if (typeof reg.getNotifications !== "function") continue;
        const notifications = await reg.getNotifications();
        notifications.forEach((notification) => {
          if (["kasaflow-salary", "kasaflow-payroll"].includes(String(notification.tag || ""))) {
            notification.close();
          }
        });
      }
    }
  } catch (error) {
    console.warn("Maaş bildirimi kapatılamadı:", error);
  }
}

window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || !event.data) return;
  if (event.data.type === "kasaflow:ready") sendVehicleTab();
  if (event.data.type === "garageflow:toast" && event.data.message) showToast(event.data.message);
  if (event.data.type === "garageflow:payroll-due") {
    const count = Number(event.data.count || 0);
    const people = Array.isArray(event.data.people)
      ? event.data.people.filter(Boolean)
      : [];
    const payrollAllowed = canOpenView("avans-maas");
    const badge = document.getElementById("salaryNavBadge");
    const alert = document.getElementById("salaryAlert");
    const alertText = document.getElementById("salaryAlertText");

    if (badge) {
      badge.textContent = String(count);
      badge.classList.toggle("hidden", !count || !payrollAllowed);
    }

    alert?.classList.toggle("hidden", !count || !payrollAllowed);
    if (alertText && count) {
      alertText.textContent = `Bu personel/personellerin maaşı var: ${people.join(", ")}. “Maaşı Yattı” denene kadar uyarı kapanmaz.`;
    }
  }
  if (event.data.type === "garageflow:payroll-payment-saved") {
    closeVisiblePayrollNotifications();
    try { window.dispatchEvent(new CustomEvent("kasaflow:check-payroll")); } catch (_) {}
  }
  if (event.data.type === "garageflow:auth-required") showLogin("Oturum süresi doldu. Tekrar giriş yap.");
});

document.getElementById("globalLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = document.getElementById("globalLoginUsername").value.trim();
  const password = document.getElementById("globalLoginPassword").value;
  const button = document.getElementById("globalLoginButton");
  const errorBox = document.getElementById("globalLoginError");
  if (!username || !password) return void (errorBox.textContent = "Kullanıcı adı ve şifre gerekli.");
  button.disabled = true;
  button.textContent = "Giriş yapılıyor…";
  errorBox.textContent = "";
  try {
    setMigrationToken("");
    const payload = await apiFetch("/api/auth/login", { method: "POST", body: { username, password } });
    if (!payload?.token) throw new Error("API token döndürmedi");
    setMigrationToken(payload.token);
    const profile = await loadGlobalProfile();
    document.getElementById("globalLoginPassword").value = "";
    enterApp(profile);
    showToast(`Hoş geldin ${profile.name || profile.username} 🌸`);
  } catch (error) {
    setMigrationToken("");
    errorBox.textContent = error.message || "Giriş yapılamadı.";
  } finally {
    button.disabled = false;
    button.textContent = "Giriş Yap";
  }
});

document.getElementById("globalLogoutButton").addEventListener("click", async () => {
  setMigrationToken("");
  frame.src = "about:blank";
  frame.dataset.kind = "";
  currentProfile = null;
  allowedViewKeys = new Set(DEFAULT_STAFF_VIEWS);
  appStarted = false;
  showLogin("Oturum kapatıldı.");
});

window.addEventListener("load", () => { cleanupLegacyKasaFlowCaches(); initKasaFlowUpdateChecker(); });



applyTheme(localStorage.getItem("kasaflow_theme") || "pembe-seker", { save: false, notify: false });
window.KasaFlow = { openView, applyTheme, showToast, canOpenView };
initializeAuth();

const API_URL = "/api/kayit";
const MIGRATION_TEST_MODE = true;
const MIGRATION_API_BASE = "https://api.scheax.com.tr/migration-test";
const MIGRATION_TOKEN_KEY = "garage_migration_test_jwt_v1";

function migrationToken() {
  try { return localStorage.getItem(MIGRATION_TOKEN_KEY) || ""; } catch { return ""; }
}
function setMigrationToken(token) {
  try { if (token) localStorage.setItem(MIGRATION_TOKEN_KEY, token); else localStorage.removeItem(MIGRATION_TOKEN_KEY); } catch {}
}
async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = migrationToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const rawBody = options.body instanceof Blob || options.body instanceof ArrayBuffer || ArrayBuffer.isView(options.body);
  if (options.body !== undefined && !headers["Content-Type"] && !rawBody) headers["Content-Type"] = "application/json";
  const response = await fetch(MIGRATION_API_BASE + path, {
    method: options.method || "GET", headers, cache: "no-store",
    body: options.body === undefined ? undefined : (rawBody || typeof options.body === "string" ? options.body : JSON.stringify(options.body))
  });
  const raw = await response.text();
  let payload = {};
  if (raw) { try { payload = JSON.parse(raw); } catch { payload = { message: raw }; } }
  if (response.status === 401) {
    setMigrationToken("");
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: "garageflow:auth-required", module: "arac-kabul" }, window.location.origin);
  }
  if (!response.ok || payload?.status === "error") throw new Error(payload?.message || `API hatası (${response.status})`);
  return payload;
}
function mediaDisplayUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith("/uploads/")) return MIGRATION_API_BASE + url;
  return url;
}
function mediaStorageUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (url.startsWith(MIGRATION_API_BASE + "/uploads/")) return url.slice(MIGRATION_API_BASE.length);
  return url;
}
const KASAFLOW_EMBED = new URLSearchParams(window.location.search).get("embed") === "kasa";
// ====================== DEPO TALEP SİSTEMİ ======================
async function createStockRequestFromRecord(record) {
  // PostgreSQL KasaFlow records endpointi depo talebini aynı transaction içinde senkronlar.
  return null;
}
async function updateStockRequestFromRecord(record) {
  // PostgreSQL KasaFlow records PATCH endpointi depo talebini aynı transaction içinde senkronlar.
  return null;
}
const MONTAJ_KONTROL_ITEMS = [
  "İş emri ile araç plakası uyumlu mu?",
  "Müşteri şikayetleri ve özel istekler not edilmiş mi?",
  "Araç içi/dışı mevcut hasar kayıtları kontrol edildi mi?",
  "Montajı yapılan aksesuarların yerleşimi simetrik ve nizami mi?",
  "Sabitleme elemanları sağlam mı?",
  "Gövde ile aksesuar uyumlu mu? (boşluk veya kasılma yok)",
  "Hareketli parçalar randımanlı çalışıyor mu ?",
  "Kablo tesisatı uygun ve izole edilmiş mi?",
  "Elektrikli aksesuarların fonksiyonları tam mı?",
  "Sigorta değerleri ve bağlantı noktaları kontrol edildi mi?",
  "Aksesuardan dolayı gösterge paneli uyumlu çalışıyor mu?",
  "Montaj sonrası temizlik yapıldı mı?",
  "Aracın hasarsız bir şekilde montajı tamamlanmış mı ? (çizik veya deformasyon yok)",
  "Koruyucu kılıflar çıkarıldı mı?",
  "Garanti belgeleri ve kullanım kılavuzları hazırlandı mı?",
  "Değişen veya çıkan eski parçalar müşteriye hazırlanmış mı?"
];

let kontrolRecord = null;
let kontrolState = {
  answers: {},
  notes: {},
  foto: ""
};

let requestQueue = Promise.resolve();

function enqueueRequest(task) {
  requestQueue = requestQueue
    .then(() => task())
    .catch((err) => {
      console.error("Queue hata:", err);
      throw err;
    });

  return requestQueue;
}

async function veriCek(dateValue = state.selectedDate) {
  const params = new URLSearchParams({
    action: "list",
    date: dateValue || new Date().toISOString().slice(0, 10),
    _t: Date.now().toString()
  });

  const res = await fetch(API_URL + "?" + params.toString(), {
    cache: "no-store"
  });

  const text = await res.text();

  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("Liste cevabı bozuk: " + text);
  }

  if (!res.ok || data.success === false) {
    throw new Error(data.message || `HTTP ${res.status}`);
  }

  return data.records || [];
}
function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function hasBase64Image(value) {
  return typeof value === "string" && value.startsWith("data:image/");
}
function assertNoBase64InPayload(payload) {
  const fields = ["Fotograf", "Imza", "UstaImza", "SonKontrolFotograf"];
  const badField = fields.find((field) => hasBase64Image(payload[field]));
  if (badField) throw new Error(`${badField} alanı hâlâ base64. VPS yükleme tamamlanmadan kayıt gönderilemez.`);
}
async function uploadDataUrlToServer(value, bucket, folder = "general") {
  if (!value) return "";
  const text = String(value);
  if (text.startsWith("http://") || text.startsWith("https://") || text.startsWith("/uploads/")) return mediaDisplayUrl(text);
  if (!isDataUrl(text)) return text;

  const type = bucket === "signatures"
    ? (folder === "technician" ? "technician-signature" : "customer-signature")
    : (folder === "final" ? "final-check" : "vehicle");

  const source = await fetch(text);
  const blob = await source.blob();
  const payload = await apiFetch(`/api/kasaflow/media/${encodeURIComponent(type)}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "image/png" },
    body: blob
  });
  if (!payload?.url) throw new Error("VPS medya URL'si alınamadı");
  return mediaDisplayUrl(payload.url);
}

  function getPaymentInputsForRecord(recordId) {
  return {
    cash: document.querySelector(`[data-payment-cash="${recordId}"]`),
    card: document.querySelector(`[data-payment-card="${recordId}"]`),
    transfer: document.querySelector(`[data-payment-transfer="${recordId}"]`)
  };
}

function getRecordPaymentValues(recordId, fallbackRecord = null) {
  const inputs = getPaymentInputsForRecord(recordId);

  return {
    cash: Number(inputs.cash?.value ?? fallbackRecord?.paymentCash ?? 0),
    card: Number(inputs.card?.value ?? fallbackRecord?.paymentCard ?? 0),
    transfer: Number(inputs.transfer?.value ?? fallbackRecord?.paymentTransfer ?? 0)
  };
}

function updatePaymentRemainingForRecord(recordId) {
  const record = state.records.find(r => String(r.id) === String(recordId));
  if (!record) return;

  const total = recordTotal(record);
  const payments = getRecordPaymentValues(recordId, record);
  const paid = payments.cash + payments.card + payments.transfer;
  const remaining = total - paid;

  const box = document.getElementById("paymentRemainingBox-" + recordId);
  if (!box) return;

  if (remaining === 0) {
    box.className = "rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400";
    box.innerHTML = "Kalan: 0₺ ✅";
  } else if (remaining > 0) {
    box.className = "rounded-lg bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-300";
    box.innerHTML = "Kalan: " + formatMoney(remaining);
  } else {
    box.className = "rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300";
    box.innerHTML = "Fazla: " + formatMoney(Math.abs(remaining));
  }
}

function clearPaymentForRecord(recordId) {
  const inputs = getPaymentInputsForRecord(recordId);
  if (inputs.cash) inputs.cash.value = "";
  if (inputs.card) inputs.card.value = "";
  if (inputs.transfer) inputs.transfer.value = "";
  updatePaymentRemainingForRecord(recordId);
}

function setFullPaymentForRecord(recordId, type) {
  const record = state.records.find(r => String(r.id) === String(recordId));
  if (!record) return;

  const total = recordTotal(record);
  const inputs = getPaymentInputsForRecord(recordId);

  if (inputs.cash) inputs.cash.value = "";
  if (inputs.card) inputs.card.value = "";
  if (inputs.transfer) inputs.transfer.value = "";

  if (type === "cash" && inputs.cash) inputs.cash.value = total;
  if (type === "card" && inputs.card) inputs.card.value = total;
  if (type === "transfer" && inputs.transfer) inputs.transfer.value = total;

  updatePaymentRemainingForRecord(recordId);
}
  function openKontrol(id) {
  const record = state.records.find(record => record.id === id);
  if (!record) return;

  const parsed = Array.isArray(record.montajKontrol) ? record.montajKontrol : [];
  const answers = {};
  const notes = {};

  parsed.forEach((item, index) => {
    answers[index] = item.answer || "";
    notes[index] = item.note || "";
  });

  kontrolRecord = record;
  kontrolState = {
    answers,
    notes,
    foto: record.sonKontrolFoto || ""
  };

  state.activeTab = "kontrol";
  state.selectedId = null;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
async function kayitEkle(payload) {
  return enqueueRequest(async () => {
    const res = await fetch(API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "add",
        ...payload
      })
    });

    const text = await res.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Sunucudan geçersiz cevap geldi: " + text);
    }

    if (!res.ok || data.success === false) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    return data;
  });
}

async function kayitGuncelle(payload) {
  return enqueueRequest(async () => {
    const res = await fetch(API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "update",
        ...payload
      })
    });

    const text = await res.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Sunucudan geçersiz cevap geldi: " + text);
    }

    if (!res.ok || data.success === false) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    return data;
  });
}

async function kayitSil(id) {
  return enqueueRequest(async () => {
    const res = await fetch(API_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "delete",
        ID: String(id || "")
      })
    });

    const text = await res.text();
    let data = {};

    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error("Silme cevabı bozuk: " + text);
    }

    if (!res.ok || data.success === false) {
      throw new Error(data.message || `HTTP ${res.status}`);
    }

    return data;
  });
}
async function deleteRecord(id) {
  if (!id) return;
  if (!confirm("Bu kaydı silmek istediğine emin misin? Bağlı depo/stok kayıtları da güvenli biçimde temizlenecek.")) return;
  try {
    state.loading = true;
    render();
    await apiKayitSil(id);
    state.records = state.records.filter(r => String(r.id) !== String(id));
    if (state.selectedId === id) state.selectedId = null;
    if (state.editId === id) { state.editId = null; state.form = emptyForm(); }
    await listeyiYenile();
    showToast("Kayıt ve bağlı depo/stok verileri silindi ✅");
  } catch (err) {
    console.error("Silme detaylı hata:", err);
    showToast("Silme hatası: " + (err.message || "Bilinmeyen hata"), true);
  } finally {
    state.loading = false;
    render();
  }
}
async function deleteFromVps(url) {
  try {
    const stored = mediaStorageUrl(url);
    if (!stored.startsWith("/uploads/kasaflow/")) return;
    await apiFetch("/api/kasaflow/media", { method: "DELETE", body: { url: stored } });
  } catch (e) {
    console.warn("VPS medya silme hatası:", e);
  }
}
function recordApiPayload(payload) {
  const fixed = { ...payload };
  if (typeof fixed.YapilacakIslem === "string") {
    try { fixed.YapilacakIslem = JSON.parse(fixed.YapilacakIslem); }
    catch { fixed.YapilacakIslem = []; }
  }
  ["Fotograf", "Imza", "UstaImza", "SonKontrolFotograf"].forEach(field => {
    if (Object.prototype.hasOwnProperty.call(fixed, field)) fixed[field] = mediaStorageUrl(fixed[field]);
  });
  return fixed;
}

function syncSheetsInBackground(action, payload) {
  fetch(API_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify({
      action,
      ...payload
    })
  })
    .then(async (res) => {
      const text = await res.text();
      let data = {};

      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        console.warn("Sheets cevabı JSON değil:", text);
        return;
      }

      if (!res.ok || data.success === false) {
        console.warn("Sheets aktarım başarısız:", action, data.message || data);
      } else {
        console.log("Sheets aktarım başarılı:", action, data);
      }
    })
    .catch((e) => {
      console.warn("Sheets arka plan aktarım hatası:", e);
    });
}
async function getNextDocumentNumber(prefix) {
  const cleanPrefix = String(prefix || "").toUpperCase();
  const payload = await apiFetch("/api/kasaflow/document-number", { method: "POST", body: { prefix: cleanPrefix } });
  return String(payload?.document_number || "");
}
async function ensureRecordDocumentNumber(record, prefix) {
  const fieldMap = { AK: "kabul_no", SP: "siparis_no", GR: "garanti_no" };
  const localMap = { AK: "acceptanceNo", SP: "orderNo", GR: "warrantyNo" };
  const field = fieldMap[prefix];
  const localField = localMap[prefix];
  if (!field || !localField) throw new Error("Geçersiz belge türü: " + prefix);
  if (record?.[localField]) return record[localField];
  const documentNo = await getNextDocumentNumber(prefix);
  const payload = await apiFetch(`/api/kasaflow/records/${encodeURIComponent(record.id)}`, { method: "PATCH", body: { [field]: documentNo } });
  const updated = mapSheetRecord(payload.record);
  state.records = state.records.map(r => String(r.id) === String(record.id) ? updated : r);
  return documentNo;
}
async function apiKayitEkle(payload) {
  const fixedPayload = recordApiPayload(payload);
  if (!fixedPayload.kabul_no) fixedPayload.kabul_no = await getNextDocumentNumber("AK");
  const response = await apiFetch("/api/kasaflow/records", { method: "POST", body: fixedPayload });
  const data = response.record;
  syncSheetsInBackground("add", { ...payload, ID: data.id, TarihSaat: data.created_at || new Date().toISOString() });
  return data;
}
async function apiKayitGuncelle(payload) {
  const { ID, ...rest } = payload;
  const fixedPayload = recordApiPayload(rest);
  delete fixedPayload.TarihSaat;
  const response = await apiFetch(`/api/kasaflow/records/${encodeURIComponent(ID)}`, { method: "PATCH", body: fixedPayload });
  syncSheetsInBackground("update", payload);
  return response.record;
}
async function apiKayitSil(id) {
  await apiFetch(`/api/kasaflow/records/${encodeURIComponent(id)}`, { method: "DELETE" });
  syncSheetsInBackground("delete", { ID: id });
}
async function listeyiYenile() {
  try {
    state.loading = true;
    render();
    const params = new URLSearchParams();
    if (state.listStartDate) params.set("start_date", state.listStartDate);
    if (state.listEndDate) params.set("end_date", state.listEndDate);
    const payload = await apiFetch("/api/kasaflow/records" + (params.toString() ? `?${params}` : ""));
    state.records = (payload.records || []).map(mapSheetRecord);
    state.totalRemoteCount = Number(payload.count || state.records.length);
  } catch (e) {
    console.error("listeyiYenile PostgreSQL API hata:", e);
    alert("Kayıtlar PostgreSQL API'den çekilemedi: " + (e.message || "Bilinmeyen hata"));
  } finally {
    state.loading = false;
    render();
  }
}
  async function refreshTodayRevenue() {
  await listeyiYenile();
}
function mapSheetRecord(row) {
  const rawOps = row.YapilacakIslem;
  const toplamUcret = Number(row.Ucret || 0);

  return {
    id: String(row.id || row.ID || ""),
    acceptanceNo: row.kabul_no || row.KabulNo || "",
    orderNo: row.siparis_no || row.SiparisNo || "",
    warrantyNo: row.garanti_no || row.GarantiNo || "",
    recordNo: row.kabul_no || row.KabulNo || row.ID || row.id || "-",
    createdAt: new Date(row.created_at || row.TarihSaat || "").toISOString(),
    

    customerName: row.MusteriAdi || "",
    phone: row.Telefon || "",
    brand: row.AracMarka || "",
    model: row.AracModel || "",
    type: row.AracTip || "",
    modelYear: row.AracYil || row.AracModelYil || row.ModelYil || "",
    plaka: row.Plaka || "",
    sasiNo: row.SasiNo || "",

    operations: (() => {
      if (Array.isArray(rawOps)) {
        return rawOps.map(op => ({
          name: op?.name || "",
          fee: Number(op?.fee || 0)
        }));
      }

      if (typeof rawOps === "string" && rawOps.trim()) {
        try {
          const parsed = JSON.parse(rawOps);
          if (Array.isArray(parsed)) {
            return parsed.map(op => ({
              name: op?.name || "",
              fee: Number(op?.fee || 0)
            }));
          }
        } catch {}

        return rawOps.split(",").map(name => ({
          name: name.trim(),
          fee: ""
        })).filter(op => op.name);
      }

      return [{ name: "", fee: toplamUcret || "" }];
    })(),

    status: row.Durum || "Beklemede",
    vehicleImage: mediaDisplayUrl(row.Fotograf || ""),
    noteText: stripDiscountFromNote(row.Notlar || row.notlar || row.NOTLAR || row.Note || row.note || row.notes || ""),
    discountAmount: parseDiscountAmount(row.Iskonto || row.iskonto || extractDiscountFromNote(row.Notlar || "")),
    technician: row.Teknisyen || "",
    vehicleDefects: row.AracKusurlari || "",
    signature: mediaDisplayUrl(row.Imza || ""),
    technicianSignature: mediaDisplayUrl(row.UstaImza || ""),

    montajKontrol: (() => {
      try {
        if (Array.isArray(row.MontajKontrolJSON)) return row.MontajKontrolJSON;
        return row.MontajKontrolJSON ? JSON.parse(row.MontajKontrolJSON) : null;
      } catch {
        return null;
      }
    })(),

    sonKontrolFoto: mediaDisplayUrl(row.SonKontrolFotograf || ""),
    kvkkOnay: row.KvkkOnay === true || String(row.KvkkOnay || "").toLowerCase() === "true",
    musteriOnay: row.MusteriOnay === true || String(row.MusteriOnay || "").toLowerCase() === "true",
    paymentCash: Number(row.odeme_nakit || row.OdemeNakit || 0),
    paymentCard: Number(row.odeme_kart || row.OdemeKart || 0),
    paymentTransfer: Number(row.odeme_havale || row.OdemeHavale || 0)
  };
}
  function formatDateTimeFix(value) {
  if (!value) return "";

  const d = new Date(value);

  if (isNaN(d.getTime())) return value;

  return new Date(d.getTime() + (3 * 60 * 60 * 1000)); // TR düzeltme
}
  const STATUS_OPTIONS = [
    "Beklemede",
    "Montaj Sürecinde",
    "Montaj Bitti",
    "Montaj İptal Oldu",
    "Sipariş Beklemede",
    "Sipariş Ürün Geldi",
    "Sipariş Müşteri Arandı",
    "Sipariş Tamamlandı",
    "Garanti Beklemede",
    "Garanti Servise Gönderildi",
    "Garanti Ürün Geldi",
    "Garanti Müşteri Arandı",
    "Garanti Teslim Edildi",
    "Garantiye Gitti"
  ];

  const PAGE_SIZE = 25;
  let searchTimer = null;
  let signatureHandlersBound = false;


  const TECH_SIGNATURE_STORE_KEY = "garage_technician_signatures_v1";

  function normalizeTechnicianName(value) {
    return String(value || "")
      .toLocaleLowerCase("tr-TR")
      .replace(/\s+/g, " ")
      .trim();
  }

  function readTechnicianSignatureStore() {
    try {
      return JSON.parse(localStorage.getItem(TECH_SIGNATURE_STORE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function writeTechnicianSignatureStore(store) {
    try {
      localStorage.setItem(TECH_SIGNATURE_STORE_KEY, JSON.stringify(store || {}));
    } catch (e) {
      console.warn("Usta imza hafızası kaydedilemedi:", e);
    }
  }

  function rememberTechnicianSignature(name, signature) {
    const key = normalizeTechnicianName(name);
    if (!key || !signature) return false;

    const store = readTechnicianSignatureStore();
    store[key] = {
      name: String(name || "").trim(),
      signature,
      savedAt: new Date().toISOString()
    };
    writeTechnicianSignatureStore(store);
    return true;
  }

  function getTechnicianSignature(name) {
    const key = normalizeTechnicianName(name);
    if (!key) return "";

    const fromRecords = (state.records || [])
      .filter(r => normalizeTechnicianName(r.technician) === key && r.technicianSignature)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];

    if (fromRecords?.technicianSignature) return fromRecords.technicianSignature;

    const store = readTechnicianSignatureStore();
    return store[key]?.signature || "";
  }

  function technicianNameOptions() {
    const names = new Set();

    (state.records || []).forEach(r => {
      if (String(r.technician || "").trim()) names.add(String(r.technician).trim());
    });

    Object.values(readTechnicianSignatureStore()).forEach(item => {
      if (String(item?.name || "").trim()) names.add(String(item.name).trim());
    });

    return [...names].sort((a, b) => a.localeCompare(b, "tr"));
  }

  function applyTechnicianSignatureToForm(force = false) {
    const name = state.form.technician || "";
    const signature = getTechnicianSignature(name);

    if (!name || !signature) return false;
    if (!force && state.form.technicianSignature) return false;

    state.form.technicianSignature = signature;
    signatureHandlersBound = false;
    render();
    return true;
  }

 function formatDateTime(value) {
  if (!value) return "-";

  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);

  return d.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

  function formatMoney(value) {
    const num = Number(value || 0);
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 2,
    }).format(num);
  }

  function safeParseJson(value, fallback = {}) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  const DISCOUNT_NOTE_RE = /\s*\[ISKONTO:([0-9.,-]+)\]\s*/i;

  function parseDiscountAmount(value) {
    const num = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
    return Number.isFinite(num) && num > 0 ? num : 0;
  }

  function extractDiscountFromNote(note) {
    const match = String(note || "").match(DISCOUNT_NOTE_RE);
    return match ? parseDiscountAmount(match[1]) : 0;
  }

  function stripPaymentLog(note){return String(note||"").replace(/\s*\[PAYMENT_LOG:[\s\S]*?\]\s*/g," ").replace(/\s+/g," ").trim();}

function stripDiscountFromNote(note) {
    return stripPaymentLog(String(note || "").replace(DISCOUNT_NOTE_RE, " " )).replace(/\s+/g, " " ).trim();
  }

  function mergeNoteWithDiscount(note, discountAmount) {
    const clean = stripDiscountFromNote(note);
    const discount = parseDiscountAmount(discountAmount);
    return [clean, discount > 0 ? `[ISKONTO:${discount}]` : ""].filter(Boolean).join(" " ).trim();
  }

  function operationsSubtotal(record) {
    return (record.operations || []).reduce((sum, op) => sum + Number(op.fee || 0), 0);
  }

  function recordDiscount(record) {
    return parseDiscountAmount(record?.discountAmount ?? record?.iskonto ?? record?.Iskonto ?? 0);
  }

  function recordTotal(record) {
    return Math.max(0, operationsSubtotal(record) - recordDiscount(record));
  }

  function recordPaidTotal(record) {
    return Number(record?.paymentCash || 0) + Number(record?.paymentCard || 0) + Number(record?.paymentTransfer || 0);
  }

  function recordRemaining(record) {
    return Math.max(0, recordTotal(record) - recordPaidTotal(record));
  }

  function isWaitingWorkflowStatus(status) {
    const text = String(status || "");
    return text.startsWith("Sipariş") || text.startsWith("Garanti");
  }

  function pendingOrderRows() {
    return (state.records || []).filter((r) => String(r.status || "").startsWith("Sipariş") && r.status !== "Sipariş Tamamlandı");
  }

  function pendingWarrantyRows() {
    return (state.records || []).filter((r) => String(r.status || "").startsWith("Garanti") && r.status !== "Garanti Teslim Edildi" && r.status !== "Garantiye Gitti");
  }

  function daysWaiting(record) {
    const d = new Date(record?.createdAt || Date.now());
    if (isNaN(d.getTime())) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)));
  }

  function waitingAgeClass(record) {
    const days = daysWaiting(record);
    if (days >= 7) return "border-red-500/40 bg-red-500/10 text-red-200";
    if (days >= 3) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  }

  function statusBadgeClass(status) {
    const text = String(status || "");
    if (text.includes("Tamamlandı") || text.includes("Teslim")) return "bg-emerald-500/15 text-emerald-200 border-emerald-400/20";
    if (text.includes("Parça") || text.includes("Kalan")) return "bg-amber-500/15 text-amber-200 border-amber-400/20";
    if (text.includes("Test")) return "bg-blue-500/15 text-blue-200 border-blue-400/20";
    if (text.includes("Arandı") || text.includes("Geldi")) return "bg-purple-500/15 text-purple-200 border-purple-400/20";
    if (text.includes("Servise")) return "bg-orange-500/15 text-orange-200 border-orange-400/20";
    return "bg-zinc-500/15 text-zinc-200 border-white/10";
  }

  function safeNote(record) {
    return stripPaymentLog(stripWarrantyCallNote(stripDiscountFromNote(record?.noteText || record?.Notlar || record?.notlar || record?.notes || "")));
  }

  function grandTotal(records) {
    return (records || []).reduce((sum, record) => sum + recordTotal(record), 0);
  }

  function normalizePlate(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/\s+/g, "")
      .trim();
  }

function dateKeyTR(value) {
  const d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);

  const get = (type) => parts.find(p => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function todayDateKeyTR() {
  return dateKeyTR(new Date());
}

function isToday(value) {
  return dateKeyTR(value) === todayDateKeyTR();
}

function activeListDateScope() {
  const today = todayDateKeyTR();
  const start = state.listStartDate || today;
  const end = state.listEndDate || start;
  return { start, end };
}

function rowsForActiveListDateScope(records = state.records) {
  const { start, end } = activeListDateScope();
  return (records || []).filter((r) => {
    const key = dateKeyTR(r.createdAt);
    if (!key) return false;
    return key >= start && key <= end;
  });
}

  function todayTotal(records) {
    return (records || [])
      .filter((r) => isToday(r.createdAt) && r.status === "Montaj Bitti")
      .reduce((sum, r) => sum + recordTotal(r), 0);
  }

  function todayCount(records) {
    return (records || []).filter((r) => isToday(r.createdAt)).length;
  }

  function plateHistory(plate, currentId = null) {
    const normalized = normalizePlate(plate);
    if (!normalized) return [];
    return (state.records || []).filter((r) => {
      if (currentId && r.id === currentId) return false;
      return normalizePlate(r.plaka) === normalized;
    });
  }

  function emptyForm() {
    return {
      customerName: "",
      phone: "",
      brand: "",
      model: "",
      type: "",
      modelYear: "",
      plaka: "",
      sasiNo: "",
      operations: [{ name: "", fee: "" }],
      status: STATUS_OPTIONS[0],
      vehicleImage: "",
      noteText: "",
      technician: "",
      vehicleDefects: "",
      signature: "",
      technicianSignature: "",
      kvkkOnay: false,
      musteriOnay: false,

      paymentCash: "",
paymentCard: "",
paymentTransfer: "",
      discountAmount: "",
    };
  }

  const state = {
    records: [],
    totalRemoteCount: 0,
    todayFinishedRevenueAll: 0,
    search: "",
    searchDraft: "",
    selectedId: null,
    tabletMode: false,
    statusFilter: "Tümü",
    showArchive: false,
    activeTab: "hizliKayit",
    loading: false,
    saving: false,
    editId: null,
    statusUpdatingId: null,
    visibleCount: PAGE_SIZE,
    selectedDate: new Date().toISOString().slice(0, 10),
    listStartDate: "",
    listEndDate: "",
    inlineOperation: { recordId: null, name: "", fee: "", saving: false },
    company: {
      name: "Garage İstanbul Oto Aksesuar",
      phone: "0 (540) 715 34 34",
      email: "garageistanbul.satis@gmail.com",
      address: "CUMHURİYET MAH. 676 SOK. NO:85 MURATPAŞA / ANTALYA"
    },
    form: emptyForm(),
    reportRows: [],
    reportRowsDate: "",
    reportLoading: false,
    expenseDescription: "",
    expenseAmount: "",
    branchPaymentNote: "",
    branchPaymentCash: "",
    branchPaymentCard: "",
    branchPaymentTransfer: "",
    branchPayments: [],
  };
  function calculateOperationsTotal(operations = []) {
    return (operations || []).reduce((sum, op) => {
      return sum + Number(op.fee || 0);
    }, 0);
  }
  function temizOperations(operations = []) {
  return (operations || [])
    .filter(op => op && String(op.name || "").trim() && String(op.fee || "").trim() !== "")
    .map(op => ({
      name: String(op.name || "").trim(),
      fee: Number(op.fee || 0)
    }));
}

function fillMissingRecordFields(form, operations = []) {
  const filled = { ...(form || {}) };

  const textDefaults = {
    customerName: "Girilmedi",
    phone: "Girilmedi",
    plaka: "YOK",
    brand: "Girilmedi",
    model: "Girilmedi",
    type: "Girilmedi",
    modelYear: "Girilmedi",
    sasiNo: "YOK"
  };

  Object.entries(textDefaults).forEach(([key, value]) => {
    if (!String(filled[key] ?? "").trim()) filled[key] = value;
  });

  filled.status = filled.status || "Beklemede";
  filled.kvkkOnay = true;
  filled.musteriOnay = true;

  const cleanedOps = (operations || []).length
    ? operations
    : temizOperations(filled.operations || []);

  const safeOps = cleanedOps.length
    ? cleanedOps.map(op => ({
        name: String(op.name || "Girilmedi").trim() || "Girilmedi",
        fee: Number(op.fee || 0)
      }))
    : [{ name: "Girilmedi", fee: 0 }];

  return { form: filled, operations: safeOps };
}
  function syncOperationsFromDom() {
  const names = [...document.querySelectorAll("[data-op-name]")];
  const fees = [...document.querySelectorAll("[data-op-fee]")];

  const discountEl = document.querySelector('[data-form="discountAmount"]');
  if (discountEl) state.form.discountAmount = discountEl.value || "";

  if (!names.length) return;

  state.form.operations = names.map((nameEl, index) => {
    const feeEl = fees[index];

    return {
      name: String(nameEl.value || "").trim(),
      fee: String(feeEl?.value || "").trim()
    };
  });
}
function buildPayloadFromForm(form, override = {}) {
  const ops = temizOperations(form.operations);
  return {
    MusteriAdi: form.customerName || "",
    Telefon: form.phone || "",
    AracMarka: form.brand || "",
    AracModel: form.model || "",
    AracTip: form.type || "",
    AracYil: form.modelYear || "",
    Plaka: form.plaka || "",
    SasiNo: form.sasiNo || "",
    YapilacakIslem: JSON.stringify(ops), // ESKİSİ: ops.map(op => op.name).join(", ")
    Ucret: Math.max(0, calculateOperationsTotal(ops) - parseDiscountAmount(form.discountAmount)),
    Notlar: mergeNoteWithDiscount(form.noteText || "", form.discountAmount),
    Durum: form.status || "Beklemede",
    Fotograf: form.vehicleImage || "",
    Teknisyen: form.technician || "",
    AracKusurlari: form.vehicleDefects || "",
    Imza: form.signature || "",
    UstaImza: form.technicianSignature || "",
    KvkkOnay: !!form.kvkkOnay,
    MusteriOnay: !!form.musteriOnay,

    odeme_nakit: Number(form.paymentCash || 0),
odeme_kart: Number(form.paymentCard || 0),
odeme_havale: Number(form.paymentTransfer || 0),
    ...override
  };
}


// ====================== OFFLINE KAYIT KUYRUĞU ======================
const OFFLINE_RECORD_QUEUE_KEY = "garage_offline_record_queue_v1";

function cloneForOffline(value) {
  try {
    return JSON.parse(JSON.stringify(value || {}));
  } catch {
    return value || {};
  }
}

function readOfflineRecordQueue() {
  try {
    const raw = localStorage.getItem(OFFLINE_RECORD_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Offline kayıt kuyruğu okunamadı:", err);
    return [];
  }
}

function writeOfflineRecordQueue(queue) {
  localStorage.setItem(OFFLINE_RECORD_QUEUE_KEY, JSON.stringify(queue || []));
}

function offlineQueueCount() {
  return readOfflineRecordQueue().length;
}

function isNetworkLikeError(err) {
  const msg = String(err?.message || err || "").toLocaleLowerCase("tr-TR");
  return !navigator.onLine || err?.name === "TypeError" || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("internet");
}

function queueOfflineRecord(formSnapshot, validOperations) {
  const item = {
    id: "offline_" + Date.now() + "_" + Math.random().toString(16).slice(2),
    queuedAt: new Date().toISOString(),
    form: cloneForOffline({ ...formSnapshot, operations: validOperations }),
    validOperations: cloneForOffline(validOperations || [])
  };

  const queue = readOfflineRecordQueue();
  queue.push(item);
  writeOfflineRecordQueue(queue);
  return item;
}

async function submitNewRecordFromSnapshot(formSnapshot, validOperations) {
  const formForUpload = {
    ...formSnapshot,
    operations: validOperations,
    technicianSignature: formSnapshot.technicianSignature || getTechnicianSignature(formSnapshot.technician) || ""
  };

  const [vehicleImageUrl, signatureUrl, technicianSignatureUrl] = await Promise.all([
    uploadDataUrlToServer(formForUpload.vehicleImage, "vehicle-photos", "first"),
    uploadDataUrlToServer(formForUpload.signature, "signatures", "customer"),
    uploadDataUrlToServer(formForUpload.technicianSignature, "signatures", "technician")
  ]);

  if (formForUpload.technician && technicianSignatureUrl) {
    rememberTechnicianSignature(formForUpload.technician, technicianSignatureUrl);
  }

  const uploadedForm = {
    ...formForUpload,
    vehicleImage: vehicleImageUrl,
    signature: signatureUrl,
    technicianSignature: technicianSignatureUrl
  };

  const payload = buildPayloadFromForm({
    ...uploadedForm,
    operations: validOperations
  });

  assertNoBase64InPayload(payload);
  console.log("GIDEN PAYLOAD:", payload);

  const result = await apiKayitEkle(payload);
  await createStockRequestFromRecord(result);
  return result;
}

async function processOfflineRecordQueue() {
  if (!navigator.onLine) return;
  if (state.processingOfflineQueue) return;

  const queue = readOfflineRecordQueue();
  if (!queue.length) return;

  state.processingOfflineQueue = true;
  if (typeof showToast === "function") {
    showToast(`${queue.length} bekleyen kayıt gönderiliyor...`);
  }

  let sentCount = 0;

  try {
    while (readOfflineRecordQueue().length && navigator.onLine) {
      const currentQueue = readOfflineRecordQueue();
      const item = currentQueue[0];

      const result = await submitNewRecordFromSnapshot(item.form, item.validOperations);
      state.records.unshift(mapSheetRecord(result));
      sentCount++;

      currentQueue.shift();
      writeOfflineRecordQueue(currentQueue);
    }

    if (sentCount > 0) {
      state.totalRemoteCount = state.records.length;
      state.activeTab = "liste";
      state.visibleCount = PAGE_SIZE;
      if (typeof showToast === "function") {
        showToast(`${sentCount} offline kayıt başarıyla gönderildi ✅`);
      }
    }
  } catch (err) {
    console.error("Offline kayıt gönderim hatası:", err);
    if (typeof showToast === "function") {
      showToast("Bekleyen kayıt gönderilemedi, internet gelince tekrar denenecek", true);
    }
  } finally {
    state.processingOfflineQueue = false;
    render();
  }
}

function showOfflineQueueBadge() {
  const count = offlineQueueCount();
  const old = document.getElementById("offlineQueueBadge");
  if (old) old.remove();
  if (!count) return;

  const box = document.createElement("div");
  box.id = "offlineQueueBadge";
  box.innerHTML = `
    <div style="position:fixed;left:12px;bottom:76px;z-index:999999;background:#92400e;color:white;border:1px solid rgba(251,191,36,.45);border-radius:16px;padding:10px 12px;font:700 13px Arial;box-shadow:0 10px 30px rgba(0,0,0,.35)">
      📡 ${count} kayıt beklemede
    </div>
  `;
  document.body.appendChild(box);
}

  function formToPayload(form, existingRecordNo = null) {
    const cleanedOperations = (form.operations || []).filter(
      op => op.name && op.name.trim() && op.fee !== ""
    );

    const meta = {
      invoiceAddress: form.invoiceAddress,
      operations: cleanedOperations,
      vehicleImage: form.vehicleImage,
      noteText: form.noteText,
      technician: form.technician,
      vehicleDefects: form.vehicleDefects,
      signature: form.signature,
      technicianSignature: form.technicianSignature,
      plaka: form.plaka,
      sasiNo: form.sasiNo,
      kvkkOnay: form.kvkkOnay,
      musteriOnay: form.musteriOnay,
    };

    return {
      record_no: existingRecordNo || `SRV-${Date.now().toString().slice(-6)}`,
      customer_name: form.customerName,
      phone: form.phone,
      address: form.invoiceAddress || "",
      device_type: cleanedOperations.map(op => op.name).join(", "),
      brand: form.brand,
      model: form.model,
      plaka: form.plaka || "",
      issue: cleanedOperations.map(op => op.name).join(", "),
      notes: JSON.stringify(meta),
      receiver: "",
      status: form.status,
      signature: form.signature || "",
      technician_signature: form.technicianSignature || "",
      total_fee: calculateOperationsTotal(cleanedOperations),
    };
  }

  function getFileExtension(filename = "") {
    const parts = String(filename).split(".");
    return parts.length > 1 ? parts.pop().toLowerCase() : "jpg";
  }
function handleVehicleImage(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      const maxWidth = 600;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.45);
      state.form.vehicleImage = compressedBase64;
      render();
    };

    img.onerror = () => {
      alert("Görsel okunamadı");
    };

    img.src = reader.result;
  };

  reader.onerror = () => {
    alert("Dosya okunamadı");
  };

  reader.readAsDataURL(file);
}
  function updateForm(key, value) {
  state.form = {
    ...state.form,
    [key]: value
  };
}

  function addOperationRow() {
    state.form.operations.push({ name: "", fee: "" });
    render();
  }

  function removeOperationRow(index) {
    state.form.operations.splice(index, 1);
    if (!state.form.operations.length) {
      state.form.operations.push({ name: "", fee: "" });
    }
    render();
  }

  function updateOperationRow(index, key, value, shouldRender = false) {
    state.form.operations[index][key] = value;

    const totalBox = document.getElementById("operationTotalBox");
    if (totalBox) {
      totalBox.textContent = `Ara Toplam: ${formatMoney(operationsSubtotal(state.form))} · İndirim: ${formatMoney(recordDiscount(state.form))} · Genel Toplam: ${formatMoney(recordTotal(state.form))}`;
    }

    if (shouldRender) {
      render();
    }
  }

  function updateCompany(key, value) {
    state.company[key] = value;
  }

  async function toggleArchive() {
    state.showArchive = !state.showArchive;
    state.visibleCount = PAGE_SIZE;
    await listeyiYenile();
  }

  function selectedRecord() {
    if (!state.selectedId) return null;
    return state.records.find((r) => r.id === state.selectedId) || null;
  }
function visibleRows() {
  const q = String(state.search || "").trim().toLowerCase();
  const activeStatuses = ["Beklemede", "Montaj Sürecinde"];

  let rows = [...(state.records || [])];

  // Sipariş/Garanti kayıtları normal Kayıtlar listesini şişirmesin; onlar Beklemede merkezinde sürekli görünür.
  if (!q && (!state.statusFilter || state.statusFilter === "Tümü")) {
    rows = rows.filter((r) => !isWaitingWorkflowStatus(r.status));
  }

  if (!state.showArchive && !q) {
    rows = rows.filter((r) => activeStatuses.includes(r.status));
  }

  if (state.statusFilter && state.statusFilter !== "Tümü") {
    rows = rows.filter((r) => r.status === state.statusFilter);
  }

  if (!q) {
    return rows.slice(0, state.visibleCount);
  }

  const normalizedQ = normalizePlate(q);

  return rows.filter((r) => {
    const plateMatch = normalizePlate(r.plaka).includes(normalizedQ);

    const textMatch = [
      r.recordNo,
      r.acceptanceNo,
      r.orderNo,
      r.warrantyNo,
      r.customerName,
      r.phone,
      r.brand,
      r.model,
      r.noteText,
      r.technician,
      r.vehicleDefects,
      r.status,
      (r.operations || []).map((op) => op.name).join(" ")
    ]
      .join(" ")
      .toLowerCase()
      .includes(q);

    return plateMatch || textMatch;
  }).slice(0, state.visibleCount);
}

function setListStartDate(value) {
  state.listStartDate = value || "";
}

function setListEndDate(value) {
  state.listEndDate = value || "";
}

async function applyDateRangeFilter() {
  // İlk tarih seçilip son tarih boş bırakılırsa artık sadece o gün hesaplanır.
  if (state.listStartDate && !state.listEndDate) {
    state.listEndDate = state.listStartDate;
  }

  state.visibleCount = PAGE_SIZE;
  await listeyiYenile();
  if (typeof showToast === "function") {
    const { start, end } = activeListDateScope();
    showToast(start === end ? `${start} günü uygulandı ✅` : `Tarih aralığı uygulandı: ${start} - ${end} ✅`);
  }
}

async function clearDateRangeFilter() {
  state.listStartDate = "";
  state.listEndDate = "";
  state.visibleCount = PAGE_SIZE;
  await listeyiYenile();
  if (typeof showToast === "function") showToast("Tarih filtresi temizlendi, bugünün kayıtları gösteriliyor ✅");
}

function listDateRangeLabel() {
  const { start, end } = activeListDateScope();
  if (start === end) return `${start} günü`;
  return `${start} - ${end}`;
}

function toggleInlineOperation(recordId) {
  const currentId = state.inlineOperation?.recordId;
  state.inlineOperation = {
    recordId: currentId === recordId ? null : recordId,
    name: "",
    fee: "",
    saving: false
  };
  render();
}

function updateInlineOperationField(key, value) {
  state.inlineOperation = {
    ...(state.inlineOperation || {}),
    [key]: value
  };
}

async function addInlineOperationToRecord(recordId) {
  const record = state.records.find((r) => String(r.id) === String(recordId));
  if (!record) return;

  const opName = String(state.inlineOperation?.name || "").trim();
  const opFee = Number(String(state.inlineOperation?.fee || "").replace(",", "."));

  if (!opName) {
    alert("İşlem adı boş olmasın knk.");
    return;
  }

  if (!Number.isFinite(opFee) || opFee < 0) {
    alert("Tutarı kontrol et knk.");
    return;
  }

  const payments = getRecordPaymentValues(record.id, record);
  const operations = temizOperations([...(record.operations || []), { name: opName, fee: opFee }]);

  try {
    state.inlineOperation = { ...(state.inlineOperation || {}), saving: true };
    render();

    const payload = buildPayloadFromForm({
      customerName: record.customerName,
      phone: record.phone,
      brand: record.brand,
      model: record.model,
      type: record.type,
      modelYear: record.modelYear,
      plaka: record.plaka,
      sasiNo: record.sasiNo,
      operations,
      status: record.status,
      noteText: record.noteText,
      discountAmount: record.discountAmount,
      technician: record.technician,
      vehicleDefects: record.vehicleDefects,
      signature: record.signature,
      technicianSignature: record.technicianSignature,
      kvkkOnay: record.kvkkOnay,
      musteriOnay: record.musteriOnay,
      paymentCash: payments.cash,
      paymentCard: payments.card,
      paymentTransfer: payments.transfer
    }, { ID: record.id });

    delete payload.Fotograf;
    delete payload.Imza;
    delete payload.UstaImza;

    assertNoBase64InPayload(payload);

    const result = await apiKayitGuncelle(payload);
    await updateStockRequestFromRecord(result);

    const updatedRecord = mapSheetRecord(result);
    state.records = state.records.map(r => String(r.id) === String(record.id) ? updatedRecord : r);
    state.inlineOperation = { recordId: null, name: "", fee: "", saving: false };

    if (typeof showToast === "function") showToast(`+ ${opName} eklendi (${formatMoney(opFee)}) ✅`);
  } catch (e) {
    console.error("İşlem ekleme hata:", e);
    alert("İşlem eklenemedi: " + (e.message || "Bilinmeyen hata"));
    state.inlineOperation = { ...(state.inlineOperation || {}), saving: false };
  } finally {
    render();
  }
}

  function stats() {
    const selectedRows = (state.records || []).filter((r) => {
      const recordDate = new Date(r.createdAt).toISOString().slice(0, 10);
      return recordDate === state.selectedDate;
    });

    return {
      total: selectedRows.length,
      pending: selectedRows.filter((r) => r.status === "Beklemede").length,
      inProgress: selectedRows.filter((r) => r.status === "Montaj Sürecinde").length,
      completed: selectedRows.filter((r) => r.status === "Montaj Bitti").length,
    };
  }

  function loadRecordToForm(id) {
    const record = state.records.find((r) => r.id === id);
    if (!record) return;

    state.form = {
      customerName: record.customerName || "",
      phone: record.phone || "",
      plaka: record.plaka || "",
      sasiNo: record.sasiNo || "",
      brand: record.brand || "",
      model: record.model || "",
      type: record.type || "",
      modelYear: record.modelYear || "",
      operations: (record.operations || []).length
        ? record.operations.map(op => ({ name: op.name || "", fee: op.fee || "" }))
        : [{ name: "", fee: "" }],
      status: record.status || STATUS_OPTIONS[0],
      vehicleImage: record.vehicleImage || "",
      noteText: stripPaymentLog(record.noteText || ""),
      technician: record.technician || "",
      vehicleDefects: record.vehicleDefects || "",
      signature: record.signature || "",
      technicianSignature: record.technicianSignature || "",
      kvkkOnay: record.kvkkOnay || false,
      musteriOnay: record.musteriOnay || false,
      paymentCash: record.paymentCash || "",
      paymentCard: record.paymentCard || "",
      paymentTransfer: record.paymentTransfer || "",
      discountAmount: record.discountAmount || "",
    };

    state.editId = id;
    state.activeTab = "kayit";
    signatureHandlersBound = false;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

async function saveRecord() {
  if (state.saving) return;

  syncOperationsFromDom();

  let form = state.form;
  let validOperations = temizOperations(form.operations);
  const prepared = fillMissingRecordFields(form, validOperations);
  form = prepared.form;
  validOperations = prepared.operations;

  console.log("KAYIT ÖNCESİ OPERATIONS:", JSON.stringify(validOperations));

  const formSnapshot = cloneForOffline({ ...form, operations: validOperations });

  if (!navigator.onLine) {
    try {
      queueOfflineRecord(formSnapshot, validOperations);
      state.form = emptyForm();
      state.editId = null;
      state.activeTab = "liste";
      signatureHandlersBound = false;
      state.visibleCount = PAGE_SIZE;
      showOfflineQueueBadge();
      alert("İnternet yok. Kayıt cihazda beklemeye alındı, internet gelince otomatik gönderilecek ✅");
      render();
    } catch (err) {
      console.error("Offline kayıt kuyruğa alınamadı:", err);
      alert("Kayıt cihazda saklanamadı: " + (err.message || "Bilinmeyen hata"));
    }
    return;
  }

  try {
    state.saving = true;
    render();

    const result = await submitNewRecordFromSnapshot(formSnapshot, validOperations);

    state.records.unshift(mapSheetRecord(result));
    state.totalRemoteCount = state.records.length;

    state.form = emptyForm();
    state.editId = null;
    state.activeTab = "liste";
    signatureHandlersBound = false;
    state.visibleCount = PAGE_SIZE;

  } catch (e) {
    console.error("saveRecord hata:", e);

    if (isNetworkLikeError(e)) {
      try {
        queueOfflineRecord(formSnapshot, validOperations);
        state.form = emptyForm();
        state.editId = null;
        state.activeTab = "liste";
        signatureHandlersBound = false;
        state.visibleCount = PAGE_SIZE;
        showOfflineQueueBadge();
        alert("Bağlantı koptu. Kayıt cihazda beklemeye alındı, internet gelince otomatik gönderilecek ✅");
      } catch (queueErr) {
        console.error("Offline kayıt kuyruğa alınamadı:", queueErr);
        alert("Kayıt eklenemedi ve cihazda saklanamadı: " + (queueErr.message || "Bilinmeyen hata"));
      }
    } else {
      alert("Kayıt eklenemedi: " + (e.message || "Bilinmeyen hata"));
    }
  } finally {
    state.saving = false;
    render();
  }
}

async function saveQuickRecord() {
  if (state.saving) return;

  syncOperationsFromDom();

  let form = {
    ...state.form,
    sasiNo: state.form.sasiNo || "",
    vehicleImage: "",
    signature: "",
    technicianSignature: "",
    vehicleDefects: "",
    noteText: state.form.noteText || "",
    technician: state.form.technician || "",
    status: state.form.status || "Beklemede",
    kvkkOnay: true,
    musteriOnay: true
  };

  let validOperations = temizOperations(form.operations);
  const prepared = fillMissingRecordFields(form, validOperations);
  form = prepared.form;
  validOperations = prepared.operations;

  const formSnapshot = cloneForOffline({ ...form, operations: validOperations });

  if (!navigator.onLine) {
    try {
      queueOfflineRecord(formSnapshot, validOperations);
      state.form = emptyForm();
      state.editId = null;
      state.activeTab = "liste";
      signatureHandlersBound = false;
      state.visibleCount = PAGE_SIZE;
      showOfflineQueueBadge();
      alert("İnternet yok. Hızlı kayıt cihazda beklemeye alındı, internet gelince otomatik gönderilecek ✅");
      render();
    } catch (err) {
      console.error("Hızlı kayıt offline kuyruğa alınamadı:", err);
      alert("Hızlı kayıt cihazda saklanamadı: " + (err.message || "Bilinmeyen hata"));
    }
    return;
  }

  try {
    state.saving = true;
    render();

    const result = await submitNewRecordFromSnapshot(formSnapshot, validOperations);

    state.records.unshift(mapSheetRecord(result));
    state.totalRemoteCount = state.records.length;

    state.form = emptyForm();
    state.editId = null;
    state.activeTab = "liste";
    signatureHandlersBound = false;
    state.visibleCount = PAGE_SIZE;

    if (typeof showToast === "function") {
      showToast("Hızlı kayıt oluşturuldu ve depo talebi düştü ✅");
    }
  } catch (e) {
    console.error("saveQuickRecord hata:", e);

    if (isNetworkLikeError(e)) {
      try {
        queueOfflineRecord(formSnapshot, validOperations);
        state.form = emptyForm();
        state.editId = null;
        state.activeTab = "liste";
        signatureHandlersBound = false;
        state.visibleCount = PAGE_SIZE;
        showOfflineQueueBadge();
        alert("Bağlantı koptu. Hızlı kayıt cihazda beklemeye alındı, internet gelince otomatik gönderilecek ✅");
      } catch (queueErr) {
        console.error("Hızlı kayıt offline kuyruğa alınamadı:", queueErr);
        alert("Hızlı kayıt eklenemedi ve cihazda saklanamadı: " + (queueErr.message || "Bilinmeyen hata"));
      }
    } else {
      alert("Hızlı kayıt eklenemedi: " + (e.message || "Bilinmeyen hata"));
    }
  } finally {
    state.saving = false;
    render();
  }
}

async function updateCurrentRecord() {
  if (state.saving) return;
  if (!state.editId) return;

  syncOperationsFromDom();

let form = state.form;
let validOperations = temizOperations(form.operations);
const prepared = fillMissingRecordFields(form, validOperations);
form = prepared.form;
validOperations = prepared.operations;

console.log("GÜNCELLEME ÖNCESİ OPERATIONS:", JSON.stringify(validOperations));

  const currentRecord = state.records.find((r) => r.id === state.editId);
  if (!currentRecord) {
    alert("Güncellenecek kayıt bulunamadı.");
    return;
  }

  try {
    state.saving = true;
    render();
const formForUpload = {
  ...form,
  technicianSignature: form.technicianSignature || getTechnicianSignature(form.technician) || ""
};

const [vehicleImageUrl, signatureUrl, technicianSignatureUrl] = await Promise.all([
  uploadDataUrlToServer(formForUpload.vehicleImage, "vehicle-photos", "first"),
  uploadDataUrlToServer(formForUpload.signature, "signatures", "customer"),
  uploadDataUrlToServer(formForUpload.technicianSignature, "signatures", "technician")
]);

if (formForUpload.technician && technicianSignatureUrl) {
  rememberTechnicianSignature(formForUpload.technician, technicianSignatureUrl);
}

const uploadedForm = {
  ...formForUpload,
  vehicleImage: vehicleImageUrl,
  signature: signatureUrl,
  technicianSignature: technicianSignatureUrl
};

    const payload = buildPayloadFromForm(
      { ...uploadedForm, operations: validOperations },
      { ID: currentRecord.id }
    );

    // Eski büyük veriyi tekrar göndermemek için:
    if (form.vehicleImage === currentRecord.vehicleImage) {
      delete payload.Fotograf;
    }

    if (form.signature === currentRecord.signature) {
      delete payload.Imza;
    }

    if (form.technicianSignature === currentRecord.technicianSignature) {
      delete payload.UstaImza;
    }

    assertNoBase64InPayload(payload);

    const result = await apiKayitGuncelle(payload);
    await updateStockRequestFromRecord(result);

    

state.records = state.records.map(r =>
  String(r.id) === String(currentRecord.id) ? mapSheetRecord(result) : r
);

state.form = emptyForm();
state.editId = null;
state.activeTab = "liste";
signatureHandlersBound = false;
state.visibleCount = PAGE_SIZE;


  } catch (e) {
    console.error("updateCurrentRecord hata:", e);
    alert("Kayıt güncellenemedi: " + (e.message || "Bilinmeyen hata"));
  } finally {
    state.saving = false;
    render();
  }
}

    function cancelEdit() {
      state.form = emptyForm();
      state.editId = null;
      signatureHandlersBound = false;
      render();
    }

async function updateRecordTechnician(id, technician) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return false;

  try {
    let autoSignature = record.technicianSignature || getTechnicianSignature(technician) || "";

    if (autoSignature && isDataUrl(autoSignature)) {
      autoSignature = await uploadDataUrlToServer(autoSignature, "signatures", "technician");
    }

    const payload = {
      ID: record.id,
      Teknisyen: technician
    };

    if (autoSignature) {
      payload.UstaImza = autoSignature;
    }

    await apiKayitGuncelle(payload);

    record.technician = technician;
    if (autoSignature) {
      record.technicianSignature = autoSignature;
      rememberTechnicianSignature(technician, autoSignature);
    }

    try {
      await updateStockRequestFromRecord({
        id: record.id,
        ID: record.id,
        Plaka: record.plaka,
        MusteriAdi: record.customerName,
        Teknisyen: technician,
        AracMarka: record.brand,
        AracModel: record.model,
        AracTip: record.type,
        AracYil: record.modelYear,
        YapilacakIslem: JSON.stringify(record.operations || []),
        Notlar: stripPaymentLog(record.noteText || "")
      });
    } catch (stockErr) {
      console.warn("Depo talebi usta bilgisi güncellenemedi:", stockErr);
    }

    render();
    return true;
  } catch (e) {
    console.error("Teknisyen güncelleme hata:", e);
    alert("Usta adı kaydedilemedi: " + (e.message || "Bilinmeyen hata"));
    return false;
  }
}
async function savePaymentHistory(record, paymentValues) {
  try {
    const cash = Number(paymentValues?.cash || 0);
    const card = Number(paymentValues?.card || 0);
    const transfer = Number(paymentValues?.transfer || 0);
    if (!cash && !card && !transfer) return null;
    return await apiFetch("/api/kasaflow/payment-history", {
      method: "POST",
      body: { record_id: record.id, cash, card, transfer, note: "Beklemede ekranından ödeme güncellendi" }
    });
  } catch (err) {
    console.warn("Ödeme geçmişi yazılamadı:", err);
    return null;
  }
}

async function saveRecordPayments(id) {
  const record = state.records.find((r) => String(r.id) === String(id));
  if (!record) return false;

  const paymentValues = getRecordPaymentValues(record.id, record);

  try {
    state.statusUpdatingId = id;
    render();

    const payload = buildPayloadFromForm({
      customerName: record.customerName,
      phone: record.phone,
      brand: record.brand,
      model: record.model,
      type: record.type,
      modelYear: record.modelYear,
      plaka: record.plaka,
      sasiNo: record.sasiNo,
      operations: record.operations,
      status: record.status,
      noteText: record.noteText,
      technician: record.technician,
      vehicleDefects: record.vehicleDefects,
      kvkkOnay: record.kvkkOnay,
      musteriOnay: record.musteriOnay,
      paymentCash: paymentValues.cash,
      paymentCard: paymentValues.card,
      paymentTransfer: paymentValues.transfer
    }, { ID: record.id });

    delete payload.Fotograf;
    delete payload.Imza;
    delete payload.UstaImza;

    assertNoBase64InPayload(payload);

    const result = await apiKayitGuncelle(payload);
    await savePaymentHistory(record, paymentValues);
    const updatedRecord = mapSheetRecord(result);
    state.records = state.records.map(r => String(r.id) === String(record.id) ? updatedRecord : r);

    if (typeof showToast === "function") showToast("Ödeme kaydedildi ✅");
    return true;
  } catch (e) {
    console.error("Ödeme kaydetme hata:", e);
    alert("Ödeme kaydedilemedi: " + (e.message || "Bilinmeyen hata"));
    return false;
  } finally {
    state.statusUpdatingId = null;
    render();
  }
}



function orderStageList() {
  return [
    { status: "Sipariş Beklemede", title: "Sipariş Bekliyor", icon: "🟣" },
    { status: "Sipariş Ürün Geldi", title: "Ürün Geldi", icon: "📦" },
    { status: "Sipariş Müşteri Arandı", title: "Müşteri Arandı", icon: "📞" }
  ];
}

function warrantyStageList() {
  return [
    { status: "Garanti Beklemede", title: "Garanti Geldi", icon: "🟠" },
    { status: "Garanti Servise Gönderildi", title: "Servise Gönderildi", icon: "🚚" },
    { status: "Garanti Ürün Geldi", title: "Ürün Geldi", icon: "📦" },
    { status: "Garanti Müşteri Arandı", title: "Müşteri Arandı", icon: "📞" }
  ];
}

function nextOrderStatus(record) {
  const status = String(record?.status || "Sipariş Beklemede");
  if (status === "Sipariş Beklemede") return "Sipariş Ürün Geldi";
  if (status === "Sipariş Ürün Geldi") return "Sipariş Müşteri Arandı";
  if (status === "Sipariş Müşteri Arandı") return "Sipariş Tamamlandı";
  return "Sipariş Tamamlandı";
}

function orderNextLabel(record) {
  const next = nextOrderStatus(record);
  if (next === "Sipariş Ürün Geldi") return "Ürün Geldi >";
  if (next === "Sipariş Müşteri Arandı") return "Müşteri Arandı >";
  return "Tamamlandı";
}

function prevOrderStatus(record) {
  const status = String(record?.status || "Sipariş Beklemede");
  if (status === "Sipariş Ürün Geldi") return "Sipariş Beklemede";
  if (status === "Sipariş Müşteri Arandı") return "Sipariş Ürün Geldi";
  if (status === "Sipariş Tamamlandı") return "Sipariş Müşteri Arandı";
  return "";
}

function orderPrevLabel(record) {
  const prev = prevOrderStatus(record);
  if (prev === "Sipariş Beklemede") return "< Siparişe Geri Al";
  if (prev === "Sipariş Ürün Geldi") return "< Ürün Geldi";
  if (prev === "Sipariş Müşteri Arandı") return "< Arandı";
  return "";
}

function nextWarrantyStatus(record) {
  const status = warrantyDisplayStatus(record?.status || "Garanti Beklemede");
  if (status === "Garanti Beklemede") return "Garanti Servise Gönderildi";
  if (status === "Garanti Servise Gönderildi") return "Garanti Ürün Geldi";
  if (status === "Garanti Ürün Geldi") return "Garanti Müşteri Arandı";
  if (status === "Garanti Müşteri Arandı") return "Garanti Teslim Edildi";
  return "Garanti Teslim Edildi";
}

function warrantyNextLabel(record) {
  const next = nextWarrantyStatus(record);
  if (next === "Garanti Servise Gönderildi") return "Servise Gönderildi >";
  if (next === "Garanti Ürün Geldi") return "Ürün Geldi >";
  if (next === "Garanti Müşteri Arandı") return "Müşteri Arandı >";
  return "Teslim Edildi";
}

function prevWarrantyStatus(record) {
  const status = warrantyDisplayStatus(record?.status || "Garanti Beklemede");
  if (status === "Garanti Servise Gönderildi") return "Garanti Beklemede";
  if (status === "Garanti Ürün Geldi") return "Garanti Servise Gönderildi";
  if (status === "Garanti Müşteri Arandı") return "Garanti Ürün Geldi";
  if (status === "Garanti Teslim Edildi") return "Garanti Müşteri Arandı";
  return "";
}

function warrantyPrevLabel(record) {
  const prev = prevWarrantyStatus(record);
  if (prev === "Garanti Beklemede") return "< Garanti Geldi";
  if (prev === "Garanti Servise Gönderildi") return "< Servise Gönderildi";
  if (prev === "Garanti Ürün Geldi") return "< Ürün Geldi";
  if (prev === "Garanti Müşteri Arandı") return "< Arandı";
  return "";
}

const WARRANTY_CALL_NOTE_RE = /\s*\[ARANDI_NOTU:([\s\S]*?)\]\s*/i;

function getWarrantyCallNote(record) {
  const match = String(record?.noteText || "").match(WARRANTY_CALL_NOTE_RE);
  return match ? String(match[1] || "").trim() : "";
}

function stripWarrantyCallNote(note) {
  return String(note || "").replace(WARRANTY_CALL_NOTE_RE, " ").replace(/\s+/g, " ").trim();
}

function mergeWarrantyCallNote(note, callNote) {
  const clean = stripWarrantyCallNote(note);
  const extra = String(callNote || "").trim();
  return [clean, extra ? `[ARANDI_NOTU:${extra}]` : ""].filter(Boolean).join(" ").trim();
}

function warrantyDisplayStatus(status) {
  const text = String(status || "Garanti Beklemede");
  // v17'de kullanılan eski detaylı aşamaları yeni sade akışta karşılığına alıyoruz.
  if (text === "Garanti Parça Bekliyor") return "Garanti Ürün Geldi";
  if (text === "Garanti Test Edilecek") return "Garanti Müşteri Arandı";
  return text;
}

function paymentPercent(record) {
  const total = recordTotal(record);
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((recordPaidTotal(record) / total) * 100)));
}

function customerWhatsappHref(record) {
  const raw = String(record?.phone || "").replace(/\D/g, "");
  if (!raw) return "#";
  const phone = raw.startsWith("90") ? raw : raw.startsWith("0") ? "9" + raw : "90" + raw;
  const message = encodeURIComponent(`Merhaba, Garage İstanbul. Siparişiniz/işleminiz hakkında bilgilendirme yapmak için yazıyoruz.`);
  return `https://wa.me/${phone}?text=${message}`;
}

function renderPaymentEditor(record, remaining) {
  const canComplete = remaining <= 0;
  return `
    <div class="mt-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-3">
      <div class="mb-2 text-xs font-bold text-zinc-300">Ödeme Güncelle</div>
      <div class="grid gap-2 md:grid-cols-3">
        <input type="number" data-payment-cash="${record.id}" value="${record.paymentCash || ""}" oninput="updatePaymentRemainingForRecord('${record.id}')" placeholder="Nakit" class="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white" />
        <input type="number" data-payment-card="${record.id}" value="${record.paymentCard || ""}" oninput="updatePaymentRemainingForRecord('${record.id}')" placeholder="Kart" class="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white" />
        <input type="number" data-payment-transfer="${record.id}" value="${record.paymentTransfer || ""}" oninput="updatePaymentRemainingForRecord('${record.id}')" placeholder="Havale" class="rounded-xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white" />
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        <button onclick="saveRecordPayments('${record.id}')" ${state.statusUpdatingId === record.id ? "disabled" : ""} class="rounded-2xl bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600 disabled:opacity-60">Ödemeyi Kaydet</button>
        <button onclick="updateOrderStatus('${record.id}', 'Sipariş Tamamlandı')" ${!canComplete || state.statusUpdatingId === record.id ? "disabled" : ""} class="rounded-2xl px-4 py-2 text-sm font-bold ${canComplete ? "bg-emerald-600 text-white hover:bg-emerald-500" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"}">${canComplete ? "Tamamlandı" : `Kalan ${formatMoney(remaining)}`}</button>
      </div>
    </div>
  `;
}

function renderOrderMiniCard(record) {
  const total = recordTotal(record);
  const paid = recordPaidTotal(record);
  const remaining = recordRemaining(record);
  const percent = paymentPercent(record);
  const next = nextOrderStatus(record);
  const prev = prevOrderStatus(record);
  const canGoNext = next !== "Sipariş Tamamlandı" || remaining <= 0;
  const note = safeNote(record);
  return `
    <div class="rounded-2xl border border-purple-400/15 bg-black/35 p-4 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-base font-black text-white">${record.customerName || "-"}</div>
          <div class="mt-1 text-xs text-zinc-300">${record.phone || "-"} · ${record.brand || ""} ${record.model || ""} · ${record.plaka || "-"}</div>
          <div class="mt-2 text-sm font-bold text-white">${(record.operations || []).map(op => op.name || "-").join(", ") || "-"}</div>
        </div>
        <span class="shrink-0 rounded-xl border px-2 py-1 text-[11px] font-bold ${waitingAgeClass(record)}">${daysWaiting(record)} gün</span>
      </div>
      ${note ? `<div class="mt-3 rounded-xl border border-purple-400/20 bg-purple-500/10 p-2 text-xs text-purple-100"><b>Not:</b> ${note}</div>` : ""}
      <div class="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div class="rounded-xl bg-zinc-950/70 p-2"><div class="text-zinc-500">Tutar</div><div class="font-black text-purple-200">${formatMoney(total)}</div></div>
        <div class="rounded-xl bg-zinc-950/70 p-2"><div class="text-zinc-500">Kapora</div><div class="font-black text-emerald-300">${formatMoney(paid)}</div></div>
        <div class="rounded-xl bg-zinc-950/70 p-2"><div class="text-zinc-500">Kalan</div><div class="font-black ${remaining > 0 ? "text-amber-300" : "text-emerald-300"}">${formatMoney(remaining)}</div></div>
      </div>
      <div class="mt-3">
        <div class="mb-1 flex justify-between text-[11px] text-zinc-400"><span>Ödeme ilerleme</span><span>%${percent}</span></div>
        <div class="h-2 overflow-hidden rounded-full bg-zinc-800"><div class="h-full rounded-full bg-emerald-500" style="width:${percent}%"></div></div>
      </div>
      <div class="mt-3 flex flex-wrap gap-2">
        ${prev ? `<button onclick="updateOrderStatus('${record.id}', '${prev}')" ${state.statusUpdatingId === record.id ? "disabled" : ""} class="rounded-2xl bg-zinc-700 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-600 disabled:opacity-60">${orderPrevLabel(record)}</button>` : ""}
        <button onclick="updateOrderStatus('${record.id}', '${next}')" ${!canGoNext || state.statusUpdatingId === record.id ? "disabled" : ""} class="rounded-2xl px-3 py-2 text-xs font-bold ${canGoNext ? "bg-purple-700 text-white hover:bg-purple-600" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"}">${canGoNext ? orderNextLabel(record) : `Kalan ${formatMoney(remaining)}`}</button>
        <button onclick="loadRecordToForm('${record.id}')" class="rounded-2xl bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600">Düzenle</button>
        <button onclick="printOrderForm('${record.id}')" class="rounded-2xl bg-purple-700 px-3 py-2 text-xs font-bold text-white hover:bg-purple-600">🖨 Sipariş Formu</button>
        <a href="tel:${String(record.phone || "").replace(/\s+/g, "")}" class="rounded-2xl bg-zinc-800 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-700">📞 Ara</a>
        <a href="${customerWhatsappHref(record)}" target="_blank" class="rounded-2xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">WhatsApp</a>
      </div>
      ${renderPaymentEditor(record, remaining)}
    </div>
  `;
}

function renderWarrantyMiniCard(record) {
  const note = safeNote(record);
  const callNote = getWarrantyCallNote(record);
  const next = nextWarrantyStatus(record);
  const prev = prevWarrantyStatus(record);
  return `
    <div class="rounded-2xl border border-orange-400/15 bg-black/35 p-4 shadow-xl">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="text-base font-black text-white">${record.customerName || "-"}</div>
          <div class="mt-1 text-xs text-zinc-300">${record.phone || "-"} · ${record.brand || ""} ${record.model || ""} · ${record.plaka || "-"}</div>
          <div class="mt-2 text-sm font-bold text-white">${(record.operations || []).map(op => op.name || "-").join(", ") || "-"}</div>
        </div>
        <span class="shrink-0 rounded-xl border px-2 py-1 text-[11px] font-bold ${waitingAgeClass(record)}">${daysWaiting(record)} gün</span>
      </div>
      <div class="mt-3 rounded-xl border border-orange-400/20 bg-orange-500/10 p-3 text-sm text-orange-100">
        <div class="font-bold text-orange-200">Açıklama / Not</div>
        <div class="mt-1 whitespace-pre-wrap">${note || "Not girilmemiş"}</div>
      </div>
      ${callNote ? `<div class="mt-3 rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100"><div class="font-bold text-emerald-200">☎ Arandı Notu</div><div class="mt-1 whitespace-pre-wrap">${callNote}</div></div>` : ""}
      <div class="mt-3 flex flex-wrap gap-2">
        ${prev ? `<button onclick="updateWarrantyStatus('${record.id}', '${prev}')" ${state.statusUpdatingId === record.id ? "disabled" : ""} class="rounded-2xl bg-zinc-700 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-600 disabled:opacity-60">${warrantyPrevLabel(record)}</button>` : ""}
        <button onclick="updateWarrantyStatus('${record.id}', '${next}')" ${state.statusUpdatingId === record.id ? "disabled" : ""} class="rounded-2xl bg-orange-700 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-60">${warrantyNextLabel(record)}</button>
        ${String(record.status || "") === "Garanti Müşteri Arandı" ? `<button onclick="editWarrantyCallNote('${record.id}')" class="rounded-2xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">Arandı Notu</button>` : ""}
        <button onclick="loadRecordToForm('${record.id}')" class="rounded-2xl bg-sky-700 px-3 py-2 text-xs font-bold text-white hover:bg-sky-600">Düzenle</button>
        <button onclick="printWarrantyForm('${record.id}')" class="rounded-2xl bg-orange-700 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">🖨 Garanti Formu</button>
        <a href="tel:${String(record.phone || "").replace(/\s+/g, "")}" class="rounded-2xl bg-zinc-800 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-700">📞 Ara</a>
        <a href="${customerWhatsappHref(record)}" target="_blank" class="rounded-2xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-600">WhatsApp</a>
      </div>
      <div class="mt-2 text-[11px] text-zinc-500">Kayıt: ${formatDateTime(record.createdAt)}</div>
    </div>
  `;
}

function renderWaitingCenter(orderRows, warrantyRows, mode = "all") {
  const orderStages = orderStageList();
  const warrantyStages = warrantyStageList();
  return `
    <div class="space-y-6">
      ${mode !== "garanti" ? `
      <div class="rounded-3xl border border-purple-400/20 bg-zinc-900/90 p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-purple-100">🟣 Sipariş Akışı</h2>
            <div class="text-xs text-zinc-400">Kartlar tek tuşla sıradaki aşamaya ilerler. Ödeme bitmeden tamamlandı aktif olmaz.</div>
          </div>
          <span class="rounded-xl bg-purple-500/15 px-3 py-1 text-xs font-bold text-purple-200">${orderRows.length} aktif sipariş</span>
        </div>
        <div class="grid gap-4 xl:grid-cols-3">
          ${orderStages.map(stage => {
            const rows = orderRows.filter(r => (r.status || "Sipariş Beklemede") === stage.status);
            return `
              <div class="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <div class="font-black text-white">${stage.icon} ${stage.title}</div>
                  <span class="rounded-xl bg-white/10 px-2 py-1 text-xs font-bold text-zinc-200">${rows.length}</span>
                </div>
                <div class="space-y-3">
                  ${rows.length ? rows.map(renderOrderMiniCard).join("") : `<div class="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">Bu aşamada kayıt yok.</div>`}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      ` : ""}

      ${mode !== "siparis" ? `
      <div class="rounded-3xl border border-orange-400/20 bg-zinc-900/90 p-5">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-lg font-bold text-orange-100">🟠 Garanti Akışı</h2>
            <div class="text-xs text-zinc-400">Garanti süreci sade akışla ilerler. Arandı aşamasında küçük not tutulur.</div>
          </div>
          <span class="rounded-xl bg-orange-500/15 px-3 py-1 text-xs font-bold text-orange-200">${warrantyRows.length} aktif garanti</span>
        </div>
        <div class="grid gap-4 xl:grid-cols-4">
          ${warrantyStages.map(stage => {
            const rows = warrantyRows.filter(r => warrantyDisplayStatus(r.status || "Garanti Beklemede") === stage.status);
            return `
              <div class="rounded-3xl border border-white/10 bg-black/20 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <div class="font-black text-white">${stage.icon} ${stage.title}</div>
                  <span class="rounded-xl bg-white/10 px-2 py-1 text-xs font-bold text-zinc-200">${rows.length}</span>
                </div>
                <div class="space-y-3">
                  ${rows.length ? rows.map(renderWarrantyMiniCard).join("") : `<div class="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">Bu aşamada kayıt yok.</div>`}
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      ` : ""}
    </div>
  `;
}

async function updateOrderStatus(id, status) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  if (status === "Sipariş Tamamlandı") {
    const ok = confirm("Sipariş tamamlanacak ve kayıt Montaj Sürecine alınacak. Montaj bittikten sonra Montaj Kontrol formu doldurulacak. Emin misin knk?");
    if (!ok) return;
    return updateRecordStatus(id, "Montaj Sürecinde");
  }

  return updateRecordStatus(id, status);
}

async function updateWarrantyStatus(id, status) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  let callNote = getWarrantyCallNote(record);
  let noteText = stripPaymentLog(record.noteText || "");

  if (status === "Garanti Teslim Edildi") {
    const ok = confirm("Garanti teslim edildi yapılacak. Bekleme listesinden düşecek. Emin misin knk?");
    if (!ok) return;
  }

  if (status === "Garanti Müşteri Arandı") {
    const entered = prompt("Arandı notu yaz knk (örn: Yarın gelecek / Cumartesi sabah gelecek):", callNote || "");
    if (entered === null) return;
    callNote = String(entered || "").trim();
    noteText = mergeWarrantyCallNote(noteText, callNote);
  }

  return updateRecordStatus(id, status, { noteTextOverride: noteText });
}

async function editWarrantyCallNote(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  const entered = prompt("Arandı notunu düzenle knk:", getWarrantyCallNote(record) || "");
  if (entered === null) return;

  const noteText = mergeWarrantyCallNote(stripPaymentLog(record.noteText || ""), String(entered || "").trim());
  return updateRecordStatus(id, record.status || "Garanti Müşteri Arandı", { noteTextOverride: noteText });
}

async function updateRecordStatus(id, status, options = {}) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  const oldStatus = record.status;

  // ÖNEMLİ: Ödeme kutularındaki elle girilen değerleri render() yapmadan ÖNCE oku.
  // Yoksa render ekranı yeniler ve henüz kaydedilmemiş ödeme değerleri 0 görünür.
  const paymentValuesBeforeRender = getRecordPaymentValues(record.id, record);

  try {
    state.statusUpdatingId = id;
    record.status = status;
    if (options.noteTextOverride !== undefined) record.noteText = options.noteTextOverride;
    render();

    let generatedDocumentFields = {};
    if (String(status).startsWith("Sipariş") && !record.orderNo) {
      const number = await getNextDocumentNumber("SP");
      generatedDocumentFields.siparis_no = number;
      record.orderNo = number;
    }
    if (String(status).startsWith("Garanti") && !record.warrantyNo) {
      const number = await getNextDocumentNumber("GR");
      generatedDocumentFields.garanti_no = number;
      record.warrantyNo = number;
    }

    const payload = buildPayloadFromForm({
      customerName: record.customerName,
      phone: record.phone,
      invoiceAddress: record.invoiceAddress,
      brand: record.brand,
      model: record.model,
      type: record.type,
      modelYear: record.modelYear,
      plaka: record.plaka,
      sasiNo: record.sasiNo,
      operations: record.operations,
      status,
      noteText: options.noteTextOverride !== undefined ? options.noteTextOverride : record.noteText,
      technician: record.technician,
      vehicleDefects: record.vehicleDefects,
      kvkkOnay: record.kvkkOnay,
      musteriOnay: record.musteriOnay,
      paymentCash: paymentValuesBeforeRender.cash,
      paymentCard: paymentValuesBeforeRender.card,
      paymentTransfer: paymentValuesBeforeRender.transfer
    }, {
      ID: record.id,
      ...generatedDocumentFields,
      ...((options.forceToday || status === "Montaj Bitti") ? { created_at: new Date().toISOString() } : {})
    });

    delete payload.Fotograf;
    delete payload.Imza;
    delete payload.UstaImza;

    if (status === "Montaj Bitti") {
      const paidTotal = Number(payload.odeme_nakit || 0) + Number(payload.odeme_kart || 0) + Number(payload.odeme_havale || 0);
      const totalAmount = recordTotal(record);

      if (totalAmount > 0 && paidTotal <= 0) {
        alert("Montaj Bitti yapmadan önce ödeme girmen lazım knk. N / K / H butonlarından birine bas veya tutarı elle yaz.");
        record.status = oldStatus;
        return;
      }

      if (totalAmount > 0 && paidTotal !== totalAmount) {
        alert("Ödeme toplamı işlem toplamıyla eşleşmiyor.\n\nİşlem toplamı: " + formatMoney(totalAmount) + "\nGirilen ödeme: " + formatMoney(paidTotal) + "\n\nTutarları düzeltmeden montaj kapatılamaz.");
        record.status = oldStatus;
        return;
      }
    }

    assertNoBase64InPayload(payload);

    const result = await apiKayitGuncelle(payload);

    if (status === "Montaj Bitti") {
      try {
        const stockPayload = await apiFetch(`/api/kasaflow/records/${encodeURIComponent(record.id)}/complete-stock`, { method: "POST" });
        console.log("Stok kesin çıkış sonucu:", stockPayload.result);
      } catch (error) {
        console.error("Stok düşme hatası:", error);
        record.status = oldStatus;
        try { await apiKayitGuncelle({ ID: record.id, Durum: oldStatus }); } catch (rollbackError) { console.error("Montaj durumu geri alınamadı:", rollbackError); }
        alert("Stok düşürülemediği için kayıt Montaj Bitti yapılmadı: " + error.message);
        render();
        return;
      }
    }
    
    const updatedRecord = mapSheetRecord(result);
    state.records = state.records.map(r =>
      String(r.id) === String(record.id) ? updatedRecord : r
    );

    if (typeof showToast === "function") {
      showToast("Durum güncellendi: " + status + " ✅");
    }

  } catch (e) {
    console.error("Durum güncelleme hata:", e);
    record.status = oldStatus;
    alert("Durum güncellenemedi: " + (e.message || "Bilinmeyen hata"));
  } finally {
    state.statusUpdatingId = null;
    render();
  }
}
    function downloadFile(filename, content, type = "application/json") {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    function exportJson() {
      downloadFile("musteri-kayitlari.json", JSON.stringify(state.records, null, 2));
    }

    function toCsv(rows) {
      const headers = [
        "Kayıt No", "Kayıt Tarihi", "Müşteri", "Telefon", "Araç Marka", "Araç Modeli",
        "Yapılacak İşlemler", "İşlem Ücretleri", "Ara Toplam", "İskonto", "Toplam Tutar", "Araçta Görülen Kusurlar", "Usta", "Durum", "Ek Notlar"
      ];

      const escapeCsv = (v) => {
        const value = String(v ?? "");
        if (value.includes(",") || value.includes("\n") || value.includes('"')) {
          return '"' + value.replace(/"/g, '""') + '"';
        }
        return value;
      };

      const lines = rows.map((r) => {
        const feeText = (r.operations || []).map((op) => `${op.name}: ${op.fee || 0}`).join(" | ");
        return [
          r.recordNo,
          formatDateTime(r.createdAt),
          r.customerName,
          r.phone,
          r.brand,
          r.model,
          (r.operations || []).map((op) => op.name).join(", "),
          feeText,
          operationsSubtotal(r),
          recordDiscount(r),
          recordTotal(r),
          r.vehicleDefects || "",
          r.technician || "",
          r.status || "",
          r.noteText || ""
        ].map(escapeCsv).join(",");
      });

      return [headers.join(","), ...lines].join("\n");
    }

    function exportCsv() {
      downloadFile("musteri-kayitlari.csv", toCsv(state.records), "text/csv;charset=utf-8;");
    }


function escapePrintHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openDocumentPrintWindow({ title, accent, documentNo, record, infoTitle, infoText, warranty = false }) {
  const popup = window.open("", "_blank", "width=820,height=980");
  if (!popup) {
    alert("Yazdırma penceresi açılamadı. Açılır pencere iznini kontrol et knk.");
    return;
  }
  const items = (record.operations || []).map(op => `<li><span>${escapePrintHtml(op.name || "-")}</span>${!warranty ? `<strong>${formatMoney(op.fee || 0)}</strong>` : ""}</li>`).join("");
  const total = recordTotal(record);
  const paid = recordPaidTotal(record);
  const remaining = Math.max(0, total - paid);
  const cleanNote = safeNote(record) || "-";
  popup.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapePrintHtml(title)} - ${escapePrintHtml(documentNo)}</title><style>
    @page{size:A5 portrait;margin:9mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#18181b;margin:0;background:#fff}.sheet{border:2px solid ${accent};border-radius:18px;padding:18px;min-height:190mm}.head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${accent};padding-bottom:12px}.brand{font-size:22px;font-weight:900}.title{font-size:16px;font-weight:900;color:${accent};text-align:right}.no{font-size:12px;margin-top:4px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}.box{border:1px solid #d4d4d8;border-radius:10px;padding:8px}.label{font-size:10px;color:#71717a;text-transform:uppercase;font-weight:700}.value{font-size:13px;font-weight:700;margin-top:3px}.section{margin-top:14px}.section h3{font-size:12px;color:${accent};margin:0 0 7px;text-transform:uppercase}ul{list-style:none;padding:0;margin:0;border:1px solid #e4e4e7;border-radius:10px;overflow:hidden}li{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-bottom:1px solid #e4e4e7;font-size:12px}li:last-child{border-bottom:0}.info{background:${accent}10;border:1px solid ${accent}55;border-radius:12px;padding:11px;font-size:11px;line-height:1.5}.totals{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.totals .box{text-align:center}.sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:28px;text-align:center;font-size:11px}.line{border-top:1px solid #27272a;padding-top:7px;margin-top:35px}.printbar{text-align:center;margin:10px}@media print{.printbar{display:none}.sheet{border-color:${accent}}}
  </style></head><body><div class="printbar"><button onclick="window.print()">Yazdır</button></div><div class="sheet">
  <div class="head"><div><div class="brand">GARAGE İSTANBUL</div><div style="font-size:11px">Oto Aksesuar & Montaj</div></div><div><div class="title">${escapePrintHtml(title)}</div><div class="no">Belge No: <b>${escapePrintHtml(documentNo)}</b></div></div></div>
  <div class="grid"><div class="box"><div class="label">Müşteri</div><div class="value">${escapePrintHtml(record.customerName || "-")}</div></div><div class="box"><div class="label">Telefon</div><div class="value">${escapePrintHtml(record.phone || "-")}</div></div><div class="box"><div class="label">Araç / Plaka</div><div class="value">${escapePrintHtml([record.brand,record.model,record.type].filter(Boolean).join(" ") || "-")} · ${escapePrintHtml(record.plaka || "-")}</div></div><div class="box"><div class="label">Tarih</div><div class="value">${escapePrintHtml(formatDateTime(record.createdAt))}</div></div></div>
  <div class="section"><h3>${warranty ? "Garantiye Bırakılan Ürün / İşlem" : "Sipariş Edilen Ürün / İşlem"}</h3><ul>${items || "<li>-</li>"}</ul></div>
  <div class="section"><h3>Açıklama / Not</h3><div class="box"><div class="value" style="white-space:pre-wrap">${escapePrintHtml(cleanNote)}</div></div></div>
  ${!warranty ? `<div class="section totals"><div class="box"><div class="label">Toplam</div><div class="value">${formatMoney(total)}</div></div><div class="box"><div class="label">Alınan / Kapora</div><div class="value">${formatMoney(paid)}</div></div><div class="box"><div class="label">Kalan</div><div class="value">${formatMoney(remaining)}</div></div></div>` : ""}
  <div class="section info"><b>${escapePrintHtml(infoTitle)}</b><br>${escapePrintHtml(infoText)}</div>
  <div class="sign"><div><div class="line">Müşteri / Teslim Eden</div></div><div><div class="line">Garage İstanbul / İşlem Sorumlusu</div></div></div>
  </div></body></html>`);
  popup.document.close();
  popup.focus();
}

async function printOrderForm(id) {
  let record = state.records.find(r => String(r.id) === String(id));
  if (!record) return;
  try {
    const documentNo = await ensureRecordDocumentNumber(record, "SP");
    record = state.records.find(r => String(r.id) === String(id)) || record;
    openDocumentPrintWindow({
      title: "SİPARİŞ FORMU", accent: "#7c3aed", documentNo, record,
      infoTitle: "Sipariş Bilgilendirmesi",
      infoText: "Siparişiniz tedarik sürecine alınmıştır. Tahmini tedarik süresi 7 iş günüdür. Ürün iş yerimize ulaştığında tarafınıza telefon ile bilgi verilecektir. Tedarikçi ve kargo süreçlerine bağlı olarak teslim süresi değişiklik gösterebilir."
    });
  } catch (e) { alert(e.message || "Sipariş formu hazırlanamadı"); }
}

async function printWarrantyForm(id) {
  let record = state.records.find(r => String(r.id) === String(id));
  if (!record) return;
  try {
    const documentNo = await ensureRecordDocumentNumber(record, "GR");
    record = state.records.find(r => String(r.id) === String(id)) || record;
    openDocumentPrintWindow({
      title: "GARANTİ SERVİS FORMU", accent: "#ea580c", documentNo, record, warranty: true,
      infoTitle: "Garanti Süreci Bilgilendirmesi",
      infoText: "Ürününüz teknik servis incelemesine gönderilecektir. Ortalama işlem süresi 20 iş günüdür. Üretici veya teknik servis yoğunluğu, parça tedariki ve kargo süreçlerine bağlı olarak bu süre değişiklik gösterebilir. Süreç tamamlandığında tarafınıza telefon ile bilgi verilecektir."
    });
  } catch (e) { alert(e.message || "Garanti formu hazırlanamadı"); }
}

   function printReceipt(id) {
  const record = state.records.find((r) => r.id === id);
  if (!record) return;

  const operationsHtml = (record.operations || []).map((op) => `
    <div class="line-row">
      <span>${op.name || "-"}</span>
      <strong>${op.fee ? formatMoney(op.fee) : "-"}</strong>
    </div>
  `).join("");

  const win = window.open("", "_blank", "width=800,height=1100");
  if (!win) {
    alert("Fiş penceresi açılamadı. Tarayıcı popup engelini kapatıp tekrar dene.");
    return;
  }

  win.document.write(`
    <html>
      <head>
  <title>Servis Fişi - ${record.recordNo}</title>

  <style>
    @page { size: A5 portrait; margin: 5mm; }

    html, body {
      margin: 0;
      padding: 0;
      background: #fff;
      color: #111;
      font-family: Arial, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    body {
      font-size: 11px;
      line-height: 1.35;
    }

    .page {
      padding: 5mm;
      box-sizing: border-box;
      width: 100%;
    }

    .box {
      border: 1px solid #cfcfcf;
      border-radius: 8px;
      padding: 7px 8px;
      margin-bottom: 5px;
      page-break-inside: avoid;
    }

    h1, h2, h3, p {
      margin: 0 0 3px 0;
    }

    h1 {
      font-size: 14px;
      line-height: 1.15;
    }

    h2 {
      font-size: 12px;
      line-height: 1.15;
    }

    h3 {
      font-size: 10.5px;
      line-height: 1.15;
    }

    .header-box {
      padding: 8px;
    }

    .header-row {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 10px;
      align-items: center;
    }

    .logo-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .logo-img {
      width: 64px;
      height: 64px;
      object-fit: contain;
    }

    .company-wrap h1 {
      font-size: 15px;
      margin-bottom: 4px;
    }

    .company-wrap p {
      font-size: 10.5px;
      margin-bottom: 2px;
    }

    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }

    .label {
      color: #666;
      font-size: 8.8px;
      text-transform: uppercase;
      margin-bottom: 1px;
    }

    .value {
      font-size: 11px;
      font-weight: 600;
      word-break: break-word;
      margin-bottom: 3px;
    }

    .line-row {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      padding: 3px 0;
      border-bottom: 1px dashed #ddd;
      font-size: 10.8px;
    }

    .vehicle-image {
      width: 100%;
      max-height: 72px;
      object-fit: cover;
      border-radius: 6px;
      border: 1px solid #ddd;
    }

    .sign-image {
      width: 100%;
      max-height: 40px;
      object-fit: contain;
      border-radius: 6px;
      border: 1px solid #ddd;
      background: #fafafa;
    }

    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 5px;
    }

    .summary {
      margin-top: 4px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 700;
    }

    .muted {
      color: #666;
    }

    .print-btn-wrap {
      padding: 8px 5mm 0 5mm;
    }

    .print-btn {
      padding: 10px 14px;
      border: none;
      border-radius: 10px;
      background: #111;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }

    @media print {
      .print-btn-wrap {
        display: none;
      }
    }
   </style>
</head>
<body>
  <div class="print-btn-wrap">
    <button class="print-btn" onclick="window.print()">Yazdır</button>
  </div>

  <div class="page">
          <div class="box header-box">
  <div class="header-row">
    <div class="logo-wrap">
      <img src="/logo.png" alt="Logo" class="logo-img" />
    </div>
    <div class="company-wrap">
      <h1>${state.company.name}</h1>
      <p>${state.company.phone} · ${state.company.email}</p>
      <p>${state.company.address}</p>
    </div>
  </div>
</div>

          <div class="box">
            <h2>Araç Kabul Fişi</h2>
            <p><strong>Kayıt No:</strong> ${record.recordNo}</p>
            <p><strong>Tarih:</strong> ${formatDateTime(record.createdAt)}</p>
            <p><strong>Durum:</strong> ${record.status}</p>
            <p><strong>Usta:</strong> ${record.technician || "-"}</p>
          </div>

          <div class="grid">
            <div class="box">
              <h3>Müşteri Bilgileri</h3>
              <div class="label">Ad Soyad</div>
              <div class="value">${record.customerName || "-"}</div>

              <div class="label">Telefon</div>
              <div class="value">${record.phone || "-"}</div>
          </div>

            <div class="box">
              <h3>Araç Bilgileri</h3>
              <div class="label">Araç Plakası</div>
              <div class="value">${record.plaka || "-"}</div>

              <div class="label">Şasi Numarası</div>
              <div class="value">${record.sasiNo || "-"}</div>

              <div class="label">Araç Marka</div>
              <div class="value">${record.brand || "-"}</div>

              <div class="label">Araç Modeli</div>
              <div class="value">${record.model || "-"}</div>
              <div class="label">Usta Adı</div>
<div class="value">${record.technician || "-"}</div>
            </div>
          </div>

          <div class="box">
            <h3>Araçta Görülen Kusurlar</h3>
            <p>${record.vehicleDefects || "-"}</p>
          </div>

          <div class="two-col">
            <div class="box">
              <h3>Yapılacak İşlemler</h3>
              ${operationsHtml || "<p>-</p>"}
              <div class="summary">
                <span>Ara Toplam</span>
                <span>${formatMoney(operationsSubtotal(record))}</span>
              </div>
              ${recordDiscount(record) > 0 ? `
                <div class="summary muted">
                  <span>İskonto</span>
                  <span>- ${formatMoney(recordDiscount(record))}</span>
                </div>
              ` : ""}
              <div class="summary">
                <span>Genel Toplam</span>
                <span>${formatMoney(recordTotal(record))}</span>
              </div>
            </div>

            <div class="box">
  <h3>Araç Fotoğrafları</h3>

  <div style="display:flex; gap:8px;">
    
    ${record.vehicleImage ? `
      <div style="flex:1;">
        <div style="font-size:10px; margin-bottom:3px;">Öncesi</div>
        <img src="${record.vehicleImage}" class="vehicle-image" />
      </div>
    ` : ""}

    ${record.sonKontrolFoto ? `
      <div style="flex:1;">
        <div style="font-size:10px; margin-bottom:3px;">Son Kontrol</div>
        <img src="${record.sonKontrolFoto}" class="vehicle-image" />
      </div>
    ` : ""}

  </div>

  <div class="two-col" style="margin-top:7px;">
                <div>
                  <h3 style="margin-bottom:5px;">Müşteri İmzası</h3>
                  ${record.signature ? `<img src="${record.signature}" class="sign-image" />` : `<p class="muted">İmza alınmadı.</p>`}
                </div>
                <div>
                  <h3 style="margin-bottom:5px;">Usta İmzası</h3>
                  ${record.technicianSignature ? `<img src="${record.technicianSignature}" class="sign-image" />` : `<p class="muted">Usta imzası yok.</p>`}
                </div>
              </div>
            </div>
          </div>

          <div class="box">
            <h3>Ek Notlar</h3>
            <p>${record.noteText || "-"}</p>
          </div>
        </div>
      </body>
    </html>
  `);

  win.document.close();
  setTimeout(() => {
    try { win.focus(); } catch (e) {}
  }, 300);
}


// ====================== GÜN SONU RAPORU ======================
function trDateParts(dateValue = state.selectedDate) {
  const base = dateValue || new Date().toISOString().slice(0, 10);
  const start = new Date(`${base}T00:00:00+03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { base, start, end };
}

function trReportDateLabel(dateValue = state.selectedDate) {
  const { start } = trDateParts(dateValue);
  return start.toLocaleDateString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long"
  });
}

function gsrFileName(ext = "xls") {
  return `${trReportDateLabel(state.selectedDate)} G.S.R.${ext}`;
}

function isSameReportDay(value, dateValue = state.selectedDate) {
  if (!value) return false;
  const { start, end } = trDateParts(dateValue);
  const d = new Date(value);
  return d >= start && d < end;
}

function reportSourceRows() {
  const rows = Array.isArray(state.reportRows) && state.reportRowsDate === state.selectedDate
    ? state.reportRows
    : (state.records || []);

  return rows
    .filter(r => {
      if (r.isExpense) {
        return (r.expenseDate && r.expenseDate === state.selectedDate) || isSameReportDay(r.createdAt, state.selectedDate);
      }

      if (r.isBranchPayment) {
        return (r.branchDate && r.branchDate === state.selectedDate) || isSameReportDay(r.createdAt, state.selectedDate);
      }

      return r.status === "Montaj Bitti" && isSameReportDay(r.createdAt, state.selectedDate);
    })
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function dailyReportTotals(rows = reportSourceRows()) {
  const totals = rows.reduce((acc, r) => {
    if (r.isExpense) {
      acc.expense += Number(r.expenseAmount || 0);
      return acc;
    }

    if (r.isBranchPayment) {
      const branchCash = Number(r.branchCash || 0);
      const branchCard = Number(r.branchCard || 0);
      const branchTransfer = Number(r.branchTransfer || 0);
      const branchGross = branchCash + branchCard + branchTransfer;

      acc.cash += branchCash;
      acc.card += branchCard;
      acc.transfer += branchTransfer;
      acc.gross += branchGross;

      acc.branchCash += branchCash;
      acc.branchCard += branchCard;
      acc.branchTransfer += branchTransfer;
      acc.branchGross += branchGross;
      return acc;
    }

    const pay = reportPaymentValues(r);
    acc.cash += pay.cash;
    acc.card += pay.card;
    acc.transfer += pay.transfer;
    acc.gross += pay.cash + pay.card + pay.transfer;
    acc.recordTotal += recordTotal(r);
    return acc;
  }, {
    cash: 0,
    card: 0,
    transfer: 0,
    gross: 0,
    recordTotal: 0,
    expense: 0,
    branchCash: 0,
    branchCard: 0,
    branchTransfer: 0,
    branchGross: 0
  });

  // Net artık gider düşmeden hesaplanır. Gider ayrı kutuda takip edilir.
  totals.net = totals.gross;
  return totals;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function excelNumber(value) {
  const n = Number(value || 0);
  return n ? n : "";
}

function reportMoneyValue(record, keys = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && value !== "") {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function reportPaymentValues(record) {
  return {
    cash: reportMoneyValue(record, ["paymentCash", "odeme_nakit", "OdemeNakit"]),
    card: reportMoneyValue(record, ["paymentCard", "odeme_kart", "OdemeKart"]),
    transfer: reportMoneyValue(record, ["paymentTransfer", "odeme_havale", "OdemeHavale"])
  };
}

function mapExpenseRow(row) {
  return {
    isExpense: true,
    id: String(row.id || ""),
    createdAt: new Date(row.created_at || "").toISOString(),
    expenseDate: row.expense_date || "",
    expenseDescription: row.description || "",
    expenseAmount: Number(row.amount || 0)
  };
}
async function fetchDailyExpenseRows(dateValue = state.selectedDate) {
  const payload = await apiFetch(`/api/kasaflow/expenses?date=${encodeURIComponent(dateValue)}`);
  return (payload.expenses || []).map(mapExpenseRow);
}
async function addDailyExpense() {
  const description = String(state.expenseDescription || "").trim();
  const amount = Number(state.expenseAmount || 0);
  if (!description) return alert("Gider açıklaması yazman lazım knk.");
  if (!amount || amount <= 0) return alert("Gider tutarı 0'dan büyük olmalı knk.");
  try {
    state.reportLoading = true; render();
    await apiFetch("/api/kasaflow/expenses", { method: "POST", body: { expense_date: state.selectedDate, description, amount } });
    state.expenseDescription = ""; state.expenseAmount = "";
    await reloadDailyReportData(state.selectedDate);
    showToast("Gider eklendi ✅");
  } catch (err) { alert("Gider eklenemedi: " + (err.message || "Bilinmeyen hata")); }
  finally { state.reportLoading = false; render(); }
}
async function deleteDailyExpense(id) {
  if (!id || !confirm("Bu gider silinsin mi knk?")) return;
  try {
    state.reportLoading = true; render();
    await apiFetch(`/api/kasaflow/expenses/${encodeURIComponent(id)}`, { method: "DELETE" });
    await reloadDailyReportData(state.selectedDate);
    showToast("Gider silindi ✅");
  } catch (err) { alert("Gider silinemedi: " + (err.message || "Bilinmeyen hata")); }
  finally { state.reportLoading = false; render(); }
}

function mapBranchPaymentRow(row) {
  return {
    isBranchPayment: true,
    id: String(row.id || ""),
    createdAt: new Date(row.created_at || "").toISOString(),
    branchDate: row.payment_date || "",
    branchNote: row.note || "",
    branchCash: Number(row.cash || 0),
    branchCard: Number(row.card || 0),
    branchTransfer: Number(row.transfer || 0)
  };
}
async function fetchDailyBranchPaymentRows(dateValue = state.selectedDate) {
  const payload = await apiFetch(`/api/kasaflow/branch-payments?date=${encodeURIComponent(dateValue)}`);
  return (payload.payments || []).map(mapBranchPaymentRow);
}
async function addDailyBranchPayment() {
  const note = String(state.branchPaymentNote || "").trim();
  const cash = Number(state.branchPaymentCash || 0), card = Number(state.branchPaymentCard || 0), transfer = Number(state.branchPaymentTransfer || 0);
  if (cash + card + transfer <= 0) return alert("Diğer şube için en az bir ödeme tutarı girmen lazım knk.");
  try {
    state.reportLoading = true; render();
    await apiFetch("/api/kasaflow/branch-payments", { method: "POST", body: { payment_date: state.selectedDate, note, cash, card, transfer } });
    state.branchPaymentNote = ""; state.branchPaymentCash = ""; state.branchPaymentCard = ""; state.branchPaymentTransfer = "";
    await reloadDailyReportData(state.selectedDate);
    showToast("Diğer şube ödemesi eklendi ✅");
  } catch (err) { alert("Diğer şube ödemesi eklenemedi: " + (err.message || "Bilinmeyen hata")); }
  finally { state.reportLoading = false; render(); }
}
async function fetchDailyBranchPayments(dateValue = state.selectedDate) {
  const payload = await apiFetch(`/api/kasaflow/branch-payments?date=${encodeURIComponent(dateValue)}`);
  return payload.payments || [];
}

async function reloadDailyReportData(dateValue = state.selectedDate) {
  const [branchPayments, reportRows] = await Promise.all([
    fetchDailyBranchPayments(dateValue),
    fetchDailyReportRows(dateValue)
  ]);

  state.branchPayments = branchPayments;
  state.reportRows = reportRows;
  state.reportRowsDate = dateValue;
}
async function deleteDailyBranchPayment(id) {
  if (!id || !confirm("Diğer şube ödemesi silinsin mi knk?")) return;
  try {
    state.reportLoading = true; render();
    await apiFetch(`/api/kasaflow/branch-payments/${encodeURIComponent(id)}`, { method: "DELETE" });
    await reloadDailyReportData(state.selectedDate);
    showToast("Diğer şube ödemesi silindi ✅");
  } catch (err) { alert("Diğer şube ödemesi silinemedi: " + (err.message || "Bilinmeyen hata")); }
  finally { state.reportLoading = false; render(); }
}
async function fetchDailyReportRows(dateValue = state.selectedDate) {
  const payload = await apiFetch(`/api/kasaflow/daily-report?date=${encodeURIComponent(dateValue)}`);
  return [
    ...(payload.records || []).map(mapSheetRecord),
    ...(payload.branch_payments || []).map(mapBranchPaymentRow),
    ...(payload.expenses || []).map(mapExpenseRow)
  ].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

async function setDailyReportDate(dateValue) {
  if (!dateValue) return;

  state.selectedDate = dateValue;
  state.visibleCount = PAGE_SIZE;
  state.reportRows = [];
  state.reportRowsDate = "";

  try {
    state.reportLoading = true;
    render();
    await listeyiYenile();
    await reloadDailyReportData(state.selectedDate);
  } catch (err) {
    console.error("Gün sonu tarih değiştirme hatası:", err);
    alert("Rapor tarihi değiştirilemedi: " + (err.message || "Bilinmeyen hata"));
  } finally {
    state.reportLoading = false;
    render();
  }
}

async function shiftDailyReportDate(dayDiff) {
  const base = state.selectedDate ? new Date(state.selectedDate + "T12:00:00") : new Date();
  base.setDate(base.getDate() + Number(dayDiff || 0));
  await setDailyReportDate(base.toISOString().slice(0, 10));
}

async function refreshDailyReportPreview() {
  try {
    state.reportLoading = true;
    render();

    await reloadDailyReportData(state.selectedDate);

    if (typeof showToast === "function") showToast("Gün sonu raporu yenilendi ✅");
  } catch (err) {
    console.error("Gün sonu raporu yenileme hatası:", err);
    alert("Gün sonu raporu alınamadı: " + (err.message || "Bilinmeyen hata"));
  } finally {
    state.reportLoading = false;
    render();
  }
}

function buildDailyReportTableHtml(rows, forPrint = false) {
  const totals = dailyReportTotals(rows);
  const dateTitle = trReportDateLabel(state.selectedDate);

  const movementRows = rows.map((r, index) => {
    if (r.isExpense) {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${formatDateTime(r.createdAt).split(" ").slice(-1)[0] || ""}</td>
          <td></td>
          <td></td>
          <td>Gider</td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num">${excelNumber(r.expenseAmount)}</td>
          <td>${escapeHtml(r.expenseDescription || "")}</td>
        </tr>
      `;
    }

    if (r.isBranchPayment) {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${formatDateTime(r.createdAt).split(" ").slice(-1)[0] || ""}</td>
          <td></td>
          <td>Diğer Şube</td>
          <td>Diğer Şube Ödemesi</td>
          <td class="num">${excelNumber(r.branchCash)}</td>
          <td class="num">${excelNumber(r.branchCard)}</td>
          <td class="num">${excelNumber(r.branchTransfer)}</td>
          <td class="num"></td>
          <td>${escapeHtml(r.branchNote || "")}</td>
        </tr>
      `;
    }

    const operations = (r.operations || [])
      .map(op => `${op.name || "-"}${op.fee ? " (" + formatMoney(op.fee) + ")" : ""}`)
      .join(" / ");
    const pay = reportPaymentValues(r);

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${formatDateTime(r.createdAt).split(" ").slice(-1)[0] || ""}</td>
        <td>${escapeHtml(r.plaka || "")}</td>
        <td>${escapeHtml(r.customerName || "")}</td>
        <td>${escapeHtml(operations || "-")}</td>
        <td class="num">${excelNumber(pay.cash)}</td>
        <td class="num">${excelNumber(pay.card)}</td>
        <td class="num">${excelNumber(pay.transfer)}</td>
        <td class="num"></td>
        <td>${escapeHtml(r.noteText || "")}</td>
      </tr>
    `;
  }).join("");

  return `
    <html>
      <head>
        <meta charset="UTF-8" />
        <style>
          body { font-family: Arial, sans-serif; color:#111; }
          h1 { margin:0 0 4px 0; font-size:20px; }
          .sub { margin:0 0 14px 0; color:#555; font-size:12px; }
          table { border-collapse: collapse; width:100%; }
          th, td { border:1px solid #ccc; padding:7px; font-size:12px; vertical-align:top; }
          th { background:#111827; color:white; }
          .num { text-align:right; mso-number-format:"#,##0.00"; }
          .summary { margin-top:16px; width:360px; margin-left:auto; }
          .summary th { text-align:left; }
          .summary td { text-align:right; font-weight:bold; }
          .net td { background:#dcfce7; font-size:14px; }
          @media print {
            @page { size: A4 portrait; margin: 8mm; }
            .no-print { display:none !important; }
          }
        </style>
      </head>
      <body>
        ${forPrint ? `<div class="no-print" style="margin-bottom:12px"><button onclick="window.print()" style="padding:10px 16px;border-radius:10px;border:1px solid #ccc;background:#111827;color:white;font-weight:bold">Yazdır</button></div>` : ""}
        <h1>${escapeHtml(state.company.name)} - Gün Sonu Raporu</h1>
        <p class="sub">${escapeHtml(dateTitle)} · G.S.R</p>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Saat</th>
              <th>Plaka</th>
              <th>Müşteri</th>
              <th>İşlem / Açıklama</th>
              <th>Nakit</th>
              <th>Kart</th>
              <th>Havale</th>
              <th>Gider</th>
              <th>Not</th>
            </tr>
          </thead>
          <tbody>
            ${movementRows || `<tr><td colspan="10" style="text-align:center;color:#777;padding:20px">Bu tarihte Montaj Bitti kaydı yok.</td></tr>`}
          </tbody>
        </table>

        <table class="summary">
          <tr><th>Toplam Nakit</th><td>${formatMoney(totals.cash)}</td></tr>
          <tr><th>Toplam Kart</th><td>${formatMoney(totals.card)}</td></tr>
          <tr><th>Toplam Havale</th><td>${formatMoney(totals.transfer)}</td></tr>
          <tr><th>Toplam Gelir</th><td>${formatMoney(totals.gross)}</td></tr>
          <tr><th>Diğer Şube Toplam</th><td>${formatMoney(totals.branchGross)}</td></tr>
          <tr><th>Toplam Gider</th><td>${formatMoney(totals.expense)}</td></tr>
          <tr class="net"><th>Gün Sonu Net</th><td>${formatMoney(totals.net)}</td></tr>
        </table>
      </body>
    </html>
  `;
}

async function exportDailyReportExcel() {
  try {
    state.reportLoading = true;
    render();
    const rows = await fetchDailyReportRows(state.selectedDate);
    state.reportRows = rows;
    state.reportRowsDate = state.selectedDate;

    const html = buildDailyReportTableHtml(rows, false);
    downloadFile(gsrFileName("xls"), html, "application/vnd.ms-excel;charset=utf-8;");
  } catch (err) {
    console.error("Excel raporu hatası:", err);
    alert("Excel raporu oluşturulamadı: " + (err.message || "Bilinmeyen hata"));
  } finally {
    state.reportLoading = false;
    render();
  }
}

async function printDailyReport() {
  try {
    state.reportLoading = true;
    render();
    const rows = await fetchDailyReportRows(state.selectedDate);
    state.reportRows = rows;
    state.reportRowsDate = state.selectedDate;

    const win = window.open("", "_blank", "width=1000,height=900");
    if (!win) {
      alert("Rapor penceresi açılamadı. Tarayıcı popup engelini kapatıp tekrar dene.");
      return;
    }

    win.document.write(buildDailyReportTableHtml(rows, true));
    win.document.close();
    setTimeout(() => { try { win.focus(); } catch (e) {} }, 300);
  } catch (err) {
    console.error("Yazdırma raporu hatası:", err);
    alert("Rapor yazdırılamadı: " + (err.message || "Bilinmeyen hata"));
  } finally {
    state.reportLoading = false;
    render();
  }
}

    
function updateBrowserTitle(selectedRecord = null) {
  const tabTitles = {
    hizliKayit: "⚡ Hızlı Kayıt",
    kayit: state.editId ? "✏️ Kayıt Düzenleniyor" : "📝 Detaylı Kayıt",
    liste: "📋 Kayıtlar",
    gunSonu: "📊 Gün Sonu Raporu",
    kontrol: "🔧 Montaj Kontrol",
    beklemede: "⏳ Beklemede",
    siparis: "🛍️ Sipariş",
    garanti: "🛡️ Garanti",
    kurulum: "✅ Sonraki Adım"
  };

  let title = tabTitles[state.activeTab] || "Araç Kabul";

  if (state.activeTab === "kontrol" && kontrolRecord?.plaka) {
    title = `🔧 Montaj Kontrol - ${kontrolRecord.plaka}`;
  }

  if (state.selectedId && selectedRecord?.plaka) {
    title = `🚗 ${selectedRecord.plaka} - Kayıt Detayı`;
  }

  document.title = `${title} | Garage İstanbul`;
}

function render() {
      const app = document.getElementById("app");
      const s = stats();
       const rows = visibleRows();
      const selected = selectedRecord();
      updateBrowserTitle(selected);
      const showModal = !!state.selectedId && !!selected;
      const cardRows = rowsForActiveListDateScope(state.records);
      const finishedCardRows = cardRows.filter((r) => r.status === "Montaj Bitti");
      const grand = grandTotal(cardRows);
      const todayGrand = grandTotal(finishedCardRows);
      const todayRecordsCount = finishedCardRows.length;
      const totalCount = state.totalRemoteCount;
      const canShowMore = state.records.length < state.totalRemoteCount;
      const selectedPlateHistory = selected ? plateHistory(selected.plaka, selected.id) : [];
      const uniqueCustomers = new Set(rows.map((r) => (r.customerName || "").trim()).filter(Boolean)).size;
      const uniquePlates = new Set(rows.map((r) => normalizePlate(r.plaka)).filter(Boolean)).size;
      const reportRows = reportSourceRows();
      const reportTotals = dailyReportTotals(reportRows);
      const rangeLabel = listDateRangeLabel();
      const orderRows = pendingOrderRows();
      const warrantyRows = pendingWarrantyRows();

      const tabs = [
        { key: "hizliKayit", label: "Hızlı Kayıt" },
        { key: "kayit", label: "Detaylı Kayıt" },
        { key: "liste", label: "Kayıtlar" },
        { key: "siparis", label: "Sipariş" },
        { key: "garanti", label: "Garanti" },
        { key: "gunSonu", label: "Gün Sonu Raporu" },
        { key: "kontrol", label: "Montaj Kontrol" },
        ...(!state.tabletMode ? [{ key: "kurulum", label: "Sonraki Adım" }] : [])
      ];

      const statCards = [
        { label: "Toplam Kayıt", value: s.total, icon: "📄" },
        { label: "Beklemede", value: s.pending, icon: "⏳" },
        { label: "Montajda", value: s.inProgress, icon: "🔧" },
        { label: "Montaj Bitti", value: s.completed, icon: "✅" },
      ];

      app.innerHTML = `
        <div class="min-h-screen bg-zinc-950 text-white">
          <div class="${state.tabletMode ? "max-w-5xl" : "max-w-7xl"} mx-auto p-2 md:p-4">
            <div class="${KASAFLOW_EMBED ? "hidden" : ""} sticky top-0 z-40 mb-4 border-b border-white/10 bg-zinc-950/95 pb-2 pt-2 backdrop-blur-xl print:hidden">
              <div class="garage-module-tabs rounded-2xl bg-zinc-900">
                ${tabs.map((tab) => `
                  <button data-tab="${tab.key}" class="rounded-2xl px-4 py-2 text-sm font-medium transition ${state.activeTab === tab.key ? "bg-white text-black" : "text-white hover:bg-white/5"}">${tab.label}</button>
                `).join("")}
              </div>
            </div>

            ${state.loading ? `
  <div class="fixed bottom-4 right-4 z-[9999] rounded-2xl border border-white/10 bg-black/80 px-4 py-3 text-sm text-white shadow-2xl backdrop-blur-xl">
    <div class="flex items-center gap-3">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-white/25 border-t-white"></div>
      <span>Veriler güncelleniyor...</span>
    </div>
  </div>
` : ""}

            ${state.activeTab === "hizliKayit" ? `
              <div class="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
                <div class="w-full rounded-3xl border border-emerald-400/20 bg-zinc-900/90 text-white shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
                  <div class="flex items-center justify-between p-6 pb-3">
                    <div>
                      <h2 class="text-xl font-bold">⚡ Hızlı Araç Kabul</h2>
                      <p class="mt-1 text-sm text-zinc-400">İstersen alanları boş bırakabilirsin; boş kalanlar kayıtta “Girilmedi/YOK” olarak açılır.</p>
                    </div>
                    <span class="rounded-xl bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-300">Minimal Mod</span>
                  </div>

                  <div class="grid gap-4 p-6 pt-0 md:grid-cols-2">
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Ad Soyad</label>
                      <input data-form="customerName" autocomplete="name" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" value="${state.form.customerName || ""}" />
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Telefon</label>
                      <input data-form="phone" inputmode="tel" autocomplete="tel" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" value="${state.form.phone || ""}" />
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Plaka</label>
                      <input data-form="plaka" placeholder="34 ABC 123" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base uppercase text-white" value="${state.form.plaka || ""}" />
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Durum</label>
                      <select data-form="status" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white">
                        ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${state.form.status === status ? "selected" : ""} ${status === "Montaj Bitti" && state.form.status !== "Montaj Bitti" ? "disabled" : ""}>${status}</option>`).join("")}
                      </select>
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Araç Marka</label>
                      <input data-form="brand" placeholder="Örn: Renault" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" value="${state.form.brand || ""}" />
                    </div>

                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Araç Model</label>
                      <input data-form="model" placeholder="Örn: Megane" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" value="${state.form.model || ""}" />
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  
  <div>
    <label class="mb-2 block text-sm font-semibold text-zinc-300">
      Araç Tipi
    </label>

    <select
      onchange="updateForm('type', this.value)"
      class="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white"
    >
      <option value="">Seçiniz</option>
      <option value="Sedan">Sedan</option>
      <option value="Hatchback">Hatchback</option>
      <option value="SUV">SUV</option>
      <option value="SW">SW</option>
      <option value="Coupe">Coupe</option>
      <option value="Pick-Up">Pick-Up</option>
      <option value="Van">Van</option>
    </select>
  </div>

  <div>
    <label class="mb-2 block text-sm font-semibold text-zinc-300">
      Model Yılı
    </label>

    <input
      type="number"
      placeholder="Örn: 2021"
      value="${state.form.modelYear || ""}"
      oninput="updateForm('modelYear', this.value)"
      class="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white"
    />
  </div>

</div>

                    <div class="space-y-2 md:col-span-2">
                      <div class="mb-2 flex items-center justify-between gap-3">
                        <label class="text-sm text-zinc-300">Yapılacak İşlemler / Tutar</label>
                        <button id="addOperationRow" type="button" class="rounded-2xl bg-zinc-800 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-700">+ İşlem Ekle</button>
                      </div>

                      <div class="space-y-3">
                        ${(state.form.operations || []).map((op, index) => `
                          <div class="grid gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 md:grid-cols-[1fr_160px_auto]">
                            <input data-op-name="${index}" placeholder="Örn: Paspas, Bagaj havuzu, Cam rüzgarlığı" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" value="${op.name || ""}" />
                            <input data-op-fee="${index}" inputmode="decimal" placeholder="Tutar" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" value="${op.fee || ""}" />
                            <button data-op-remove="${index}" type="button" class="rounded-2xl border border-white/10 px-4 py-2 text-sm text-zinc-300 hover:bg-white/5">Sil</button>
                          </div>
                        `).join("")}
                      </div>

                      <div class="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                        <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                          <label class="mb-1 block text-xs font-bold text-amber-200">Toplu İskonto</label>
                          <input
                            data-form="discountAmount"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            value="${state.form.discountAmount || ""}"
                            class="w-full rounded-xl border border-amber-400/20 bg-black/30 px-3 py-2 text-base font-bold text-white outline-none"
                          />
                        </div>
                        <div id="operationTotalBox" class="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-right text-sm font-bold text-emerald-300">
                          Ara Toplam: ${formatMoney(operationsSubtotal(state.form))}<br>İskonto: ${formatMoney(recordDiscount(state.form))}<br>Genel Toplam: ${formatMoney(recordTotal(state.form))}
                        </div>
                      </div>
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <label class="text-sm text-zinc-300">Not / Açıklama</label>
                      <textarea data-form="noteText" class="min-h-[76px] w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-3 text-base text-white" placeholder="İstersen kısa not ekle">${state.form.noteText || ""}</textarea>
                    </div>
                  </div>
                </div>

               

                  <div class="rounded-3xl border border-white/10 bg-zinc-900/90 p-6 text-white">
                    <button
                      id="saveQuickRecord"
                      ${state.saving ? "disabled" : ""}
                      class="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-bold transition ${
                        state.saving
                          ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
                          : "bg-emerald-400 text-black hover:bg-emerald-300"
                      }"
                    >
                      ${state.saving ? "Hızlı Kayıt Oluşturuluyor..." : "⚡ Hızlı Kaydı Oluştur"}
                    </button>

                    <button id="resetForm" type="button" class="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-transparent px-4 py-3 text-sm font-medium text-white hover:bg-white/5">Formu Sıfırla</button>
                  </div>
                </div>
              </div>
            ` : ""}

            ${state.activeTab === "kayit" ? `
              <div class="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
                <div class="w-full rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                  <div class="flex items-center justify-between p-6 pb-3">
                    <h2 class="text-lg font-semibold">${state.editId ? "Kayıt Düzenleme" : "Araç Kabul Formu"}</h2>
                    ${state.editId ? `<span class="rounded-xl bg-amber-500/15 px-3 py-1 text-xs text-amber-300">Düzenleme Modu</span>` : ""}
                  </div>
                  <div class="grid gap-4 p-6 pt-0 md:grid-cols-2">
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Müşteri Ad Soyadı</label>
                      <input data-form="customerName" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" value="${state.form.customerName}" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Telefon</label>
                      <input data-form="phone" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" value="${state.form.phone}" />
                    </div>
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Araç Plakası</label>
                      <input
                        data-form="plaka"
                        class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                        placeholder="34 ABC 123"
                        value="${state.form.plaka || ""}"
                      />
                    </div>
                    
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Şasi Numarası</label>
                      <input
                        data-form="sasiNo"
                        maxlength="17"
                        class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                        placeholder="VF1XXXXXXXXXXXXXX"
                        value="${state.form.sasiNo || ""}"
                      />
                    </div>
                     <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Araç Marka</label>
                      <select id="brandSelect" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white">
                        <option value="">Marka Seç</option>
                        ${Object.keys(aracVerileri)
                          .sort((a, b) => a.localeCompare(b, "tr"))
                          .map((marka) => `
                            <option value="${marka}" ${state.form.brand === marka ? "selected" : ""}>${marka}</option>
                          `).join("")}
                      </select>
                    </div>
                    
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Araç Modeli</label>
                      <select id="modelSelect" ${!state.form.brand ? "disabled" : ""} class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white ${!state.form.brand ? "opacity-60" : ""}">
                        <option value="">${state.form.brand ? "Model Seç" : "Önce Marka Seç"}</option>
                        ${state.form.brand
                          ? Object.keys(aracVerileri[state.form.brand] || {})
                              .sort((a, b) => a.localeCompare(b, "tr"))
                              .map((model) => `
                                <option value="${model}" ${state.form.model === model ? "selected" : ""}>${model}</option>
                              `).join("")
                          : ""}
                      </select>
                    </div>
                    
                    <div class="space-y-2">
                      <label class="text-sm text-zinc-300">Model Tipi</label>
                      <select id="typeSelect" ${!state.form.brand || !state.form.model ? "disabled" : ""} class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white ${!state.form.brand || !state.form.model ? "opacity-60" : ""}">
                        <option value="">${state.form.model ? "Tip Seç" : "Önce Model Seç"}</option>
                        ${(state.form.brand && state.form.model)
                          ? (aracVerileri[state.form.brand]?.[state.form.model] || []).map((tip) => `
                              <option value="${tip}" ${state.form.type === tip ? "selected" : ""}>${tip}</option>
                            `).join("")
                          : ""}
                      </select>
                    </div>
                    
                      <div class="space-y-2">
                        <label class="text-sm text-zinc-300">Model Yılı</label>
                        <input
                          id="yearInput"
                          data-form="modelYear"
                          type="text"
                          inputmode="numeric"
                          placeholder="2020"
                          maxlength="4"
                          value="${state.form.modelYear || ""}"
                          oninput="this.value=this.value.replace(/[^0-9]/g,'').slice(0,4)"
                          class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                        />
                      </div>
                    </div>
                   <div class="space-y-2 md:col-span-2">
                    <label class="text-sm text-zinc-300">Yapılacak İşlemler *</label>
                    <div class="space-y-3 rounded-2xl border border-white/10 bg-zinc-950 p-4">
                      ${(state.form.operations || []).map((op, index) => `
                        <div class="grid gap-3 md:grid-cols-[1fr_180px_70px]">
                          <input
                            type="text"
                            placeholder="İşlem adı"
                            value="${op.name || ""}"
                            data-op-name="${index}"
                            class="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white"
                          />
                  
                          <div class="flex items-center rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2">
                            <span class="mr-2 text-sm text-zinc-400">₺</span>
                            <input
                              type="number"
                              placeholder="0"
                              value="${op.fee || ""}"
                              data-op-fee="${index}"
                              class="w-full bg-transparent text-sm text-white outline-none"
                            />
                          </div>
                  
                          <button
                            type="button"
                            data-op-remove="${index}"
                            class="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300 hover:bg-red-500/20"
                          >
                            Sil
                          </button>
                        </div>
                      `).join("")}
                  
                      <div class="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <button
                          type="button"
                          id="addOperationRow"
                          class="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
                        >
                          + Satır Ekle
                        </button>
                  
                        <div id="operationTotalBox" class="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
  Ara Toplam: ${formatMoney(operationsSubtotal(state.form))}<br>İndirim: ${formatMoney(recordDiscount(state.form))}<br>Genel Toplam: ${formatMoney(recordTotal(state.form))}
</div>
                      </div>

                      <div class="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3">
                        <label class="mb-1 block text-sm font-semibold text-amber-200">Toplu İndirim</label>
                        <div class="flex items-center rounded-2xl border border-amber-400/20 bg-black/30 px-3 py-2">
                          <span class="mr-2 text-sm text-amber-200">₺</span>
                          <input
                            data-form="discountAmount"
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            value="${state.form.discountAmount || ""}"
                            class="w-full bg-transparent text-sm font-bold text-white outline-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                    <div class="space-y-2 md:col-span-2">
                      <label class="text-sm text-zinc-300">Araçta Görülen Kusurlar</label>
                      <textarea data-form="vehicleDefects" class="min-h-[110px] w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" placeholder="Örn: Sağ ön çamurlukta çizik, arka tamponda çatlak, sol far çevresinde açıklık...">${state.form.vehicleDefects || ""}</textarea>
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <div class="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-zinc-300">
                        <p><strong class="text-white">Müşteri Onayı:</strong> Aracımı yukarıda belirtilen fiziksel durumda ve belirtilen aksesuarların montajı yapılmak üzere, anlaşılan ürün ve fiyatı da kabul ederek işletmenize teslim ettim. Montaj süresince doğabilecek (işletme kusuru dışındaki) teknik riskler hakkında bilgilendirildim, yapılacak işlemlerden doğan yasal yükümlülükleri kabul ediyorum.</p>
                        <p class="mt-3"><strong class="text-white">İşletme Onayı:</strong> Araç, yukarıdaki kriterlere göre uygun olarak teslim alınmıştır.</p>
                        <p class="mt-4 text-xs font-semibold tracking-wide text-zinc-200">KİŞİSEL VERİLERİN İŞLENMESİNE İLİŞKİN AÇIK RIZA BEYAN FORMU</p>
                        <p class="mt-2 text-xs leading-5 text-zinc-400">Tarafıma sunulan Aydınlatma Metni kapsamında; ad-soyad, telefon, araç plaka ve şasi numarası gibi kişisel verilerimin, işletmeniz tarafından hizmet sunumu, kampanya bildirimleri (SMS/E-posta) ve tanıtım amacıyla Instagram gibi sosyal medya mecralarında (plaka görseli dâhil) işlenmesine, paylaşılmasına ve bu verilerin WhatsApp, iCloud, Google Drive gibi sunucuları yurt dışında bulunan sistemler aracılığıyla aktarılmasına; ayrıca güvenliğim ve hizmet kalitesi amacıyla ses kaydı alınmasına hiçbir baskı altında kalmadan özgür irademle onay veriyorum.</p>
                      </div>
                      <div class="mt-4 space-y-3 rounded-2xl border border-white/10 bg-zinc-950/60 p-4">
  <label class="consent-check-row text-sm text-zinc-300">
    <input type="checkbox" data-form="musteriOnay" class="h-5 w-5 rounded border border-white/50 bg-zinc-800 accent-white" ${state.form.musteriOnay ? "checked" : ""} />
    <span>Müşteri onay metnini okudum ve kabul ediyorum.</span>
  </label>
  
  <label class="consent-check-row text-sm text-zinc-300">
    <input type="checkbox" data-form="kvkkOnay" class="h-5 w-5 rounded border border-white/50 bg-zinc-800 accent-white" ${state.form.kvkkOnay ? "checked" : ""} />
    <span>Kişisel verilerin işlenmesine ilişkin açık rıza metnini okudum ve kabul ediyorum.</span>
  </label>
</div>
                      <div class="space-y-2 md:col-span-2">
                        <label class="text-sm text-zinc-300">Usta Adı</label>
                        <input
                          id="technicianInput"
                          data-form="technician"
                          list="technicianNameList"
                          maxlength="40"
                          placeholder="Usta adını yaz / seç"
                          value="${state.form.technician || ""}"
                          class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white"
                        />
                        <datalist id="technicianNameList">
                          ${technicianNameOptions().map(name => `<option value="${name}"></option>`).join("")}
                        </datalist>
                        <div class="text-xs text-zinc-500">Bu ustanın kayıtlı imzası varsa otomatik yüklenecek.</div>
                      </div>

                      <div class="grid gap-4 md:grid-cols-2">
                        <div>
                          <label class="mb-2 block text-sm text-zinc-300">Müşteri İmzası</label>
                          <div class="rounded-2xl border border-white/10 bg-zinc-950 p-3">
                            <canvas id="signaturePad" class="block w-full h-[180px] rounded-xl bg-black/30"></canvas>
                            <div class="mt-3 flex justify-end">
                              <button id="clearSignature" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-zinc-800 text-white hover:bg-zinc-700">Müşteri İmzasını Temizle</button>
                            </div>
                          </div>
                        </div>

                        <div>
                          <label class="mb-2 block text-sm text-zinc-300">Usta İmzası</label>
                          <div class="rounded-2xl border border-white/10 bg-zinc-950 p-3">
                            <canvas id="technicianSignaturePad" class="block w-full h-[180px] rounded-xl bg-black/30"></canvas>
                            <div class="mt-3 flex flex-wrap justify-end gap-2">
                              <button id="useSavedTechnicianSignature" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-blue-500/15 text-blue-300 hover:bg-blue-500/25">Kayıtlı İmzayı Getir</button>
                              <button id="saveTechnicianSignatureTemplate" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25">Bu İmzayı Ustaya Kaydet</button>
                              <button id="clearTechnicianSignature" type="button" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-zinc-800 text-white hover:bg-zinc-700">Usta İmzasını Temizle</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <label class="text-sm text-zinc-300">Ek Notlar</label>
                      <textarea data-form="noteText" class="min-h-[90px] w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white">${state.form.noteText || ""}</textarea>
                    </div>

                    <div class="space-y-2 md:col-span-2">
                      <label class="text-sm text-zinc-300">Durum</label>
                      <select data-form="status" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white">
                        ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${state.form.status === status ? "selected" : ""} ${status === "Montaj Bitti" && state.form.status !== "Montaj Bitti" ? "disabled" : ""}>${status}</option>`).join("")}
                      </select>
                    </div>
                  </div>
                </div>

               <div class="flex flex-col gap-4 xl:flex-row">
                  <div class="rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                    <div class="p-6 pb-3"><h2 class="text-lg font-semibold">Araç Görseli</h2></div>
                    <div class="p-6 pt-0 space-y-4">
                      <label class="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-black/20 px-4 py-5 text-sm text-zinc-300 hover:bg-white/5">
                        <span class="text-lg">📷</span>
                        <span>Fotoğraf Ekle / Kamerayı Aç</span>
                        <input id="vehicleImageInput" type="file" accept="image/*" capture="environment" class="hidden" />
                      </label>
                      ${state.form.vehicleImage ? `
                        <div class="overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-2">
                          <img src="${state.form.vehicleImage}" class="h-56 w-full rounded-xl object-cover" />
                        </div>
                        <button id="removeVehicleImage" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-zinc-800 text-white hover:bg-zinc-700">Görseli Sil</button>
                      ` : `<div class="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Henüz görsel eklenmedi.</div>`}
                    </div>
                  </div>

                  <div class="rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                    <div class="p-6 pb-3"><h2 class="text-lg font-semibold">Hızlı İşlemler</h2></div>
                    <div class="grid gap-3 p-6 pt-0 sm:grid-cols-2">
                 ${state.editId ? `
  <button
    id="saveRecord"
    ${state.saving ? "disabled" : ""}
    class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
      state.saving
        ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
        : "bg-white text-black hover:bg-zinc-200"
    }"
  >
    ${state.saving ? "Güncelleniyor..." : "Güncelle"}
  </button>
  <button id="cancelEdit" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition border border-white/10 bg-transparent text-white hover:bg-white/5">İptal</button>
` : `
  <button
    id="saveRecord"
    ${state.saving ? "disabled" : ""}
    class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
      state.saving
        ? "cursor-not-allowed bg-zinc-700 text-zinc-400"
        : "bg-white text-black hover:bg-zinc-200"
    }"
  >
    ${state.saving ? "Kayıt Oluşturuluyor..." : "💾 Kaydı Oluştur"}
  </button>
  <button id="exportCsv" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-zinc-800 text-white hover:bg-zinc-700">⬇️ CSV İndir</button>
`}
                      <button id="exportJson" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition bg-zinc-800 text-white hover:bg-zinc-700">⬇️ JSON İndir</button>
                      <button id="resetForm" class="inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition border border-white/10 bg-transparent text-white hover:bg-white/5">Formu Sıfırla</button>
                    </div>
                  </div>
                </div>
              </div>
            ` : ""}

          ${state.activeTab === "liste" ? `
  <div class="mb-4 rounded-3xl border border-white/10 bg-zinc-900/70 p-4">
    <div class="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
      <div>
        <label class="mb-1 block text-xs font-semibold text-zinc-300">İlk Tarih</label>
        <input type="date" value="${state.listStartDate || ""}" onchange="setListStartDate(this.value)" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" />
      </div>
      <div>
        <label class="mb-1 block text-xs font-semibold text-zinc-300">Son Tarih</label>
        <input type="date" value="${state.listEndDate || ""}" onchange="setListEndDate(this.value)" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" />
      </div>
      <button onclick="applyDateRangeFilter()" class="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500">Uygula</button>
      <button onclick="clearDateRangeFilter()" class="rounded-2xl border border-white/10 bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">Temizle</button>
    </div>
    <div class="mt-2 text-xs text-zinc-400">İlk tarih seçip son tarihi boş bırakırsan o tarihten bugüne kadar hesaplar.</div>
  </div>

  <div class="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
    <div class="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
      <div class="text-sm text-emerald-200">Bugün Açılan Kayıtlar Toplamı</div>
      <div class="text-2xl font-bold text-emerald-300">${formatMoney(grand)}</div>
      <div class="mt-1 text-xs text-emerald-100">${cardRows.length} kayıt · ${rangeLabel}</div>
    </div>

   <div class="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5">
  <div class="flex items-center justify-between">
    <div class="text-sm text-sky-200">Bugün Montajı Bitenlerin Toplamı</div>
    <button onclick="refreshTodayRevenue()" 
      class="rounded-xl bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-500">
      Yenile
    </button>
  </div>

  <div class="text-2xl font-bold text-sky-300">${formatMoney(todayGrand)}</div>
  <div class="mt-1 text-xs text-sky-100">Montajı biten kayıt: ${todayRecordsCount}</div>
</div>
    

    <div class="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
      <div class="text-sm text-amber-200">Tekil Müşteri</div>
      <div class="text-2xl font-bold text-amber-300">${uniqueCustomers}</div>
      <div class="mt-1 text-xs text-amber-100">${rangeLabel}</div>
    </div>

    <div class="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-5">
      <div class="text-sm text-fuchsia-200">Tekil Plaka</div>
      <div class="text-2xl font-bold text-fuchsia-300">${uniquePlates}</div>
      <div class="mt-1 text-xs text-fuchsia-100">${totalCount} kayıt bulundu</div>
    </div>
  </div>
  

              <div class="rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                <div class="p-6 pb-3">
                  <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <h2 class="text-lg font-semibold">Kayıt Listesi</h2>
                    <div class="flex w-full flex-col gap-3 md:max-w-2xl md:flex-row">
                     <input id="search" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" placeholder="Kayıt no, plaka, müşteri, telefon, araç, işlem..." value="${state.searchDraft}" />
                      <select id="statusFilter" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white">
                        <option value="Tümü" ${state.statusFilter === "Tümü" ? "selected" : ""}>Tümü</option>
                        ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${status}</option>`).join("")}
                      </select>
                      <button
  onclick="toggleArchive()"
  class="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
>
  ${state.showArchive ? "Eski Kayıtları Gizle" : "Eski Kayıtları Göster"}
</button>
                    </div>
                  </div>
                </div>

                <div class="grid gap-3 p-6 pt-0">
                  ${rows.length === 0 ? `
                    <div class="rounded-2xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-zinc-400">Henüz kayıt yok.</div>
                  ` : rows.map((record) => `
                    <div class="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">

                        <!-- SOL BİLGİ ALANI -->
                        <div class="space-y-2 flex-1 min-w-0">
                          <div class="flex flex-wrap items-center gap-2">
                            <span class="text-lg font-semibold">${record.customerName}</span>
                            <span class="inline-flex rounded-xl bg-white/10 px-3 py-1 text-xs text-white">${record.recordNo}</span>
                            <span class="inline-flex rounded-xl bg-white/10 px-3 py-1 text-xs text-white">${record.status}</span>
                            <span class="inline-flex rounded-xl bg-emerald-500/20 px-3 py-1 text-xs text-emerald-300 font-semibold">
                              🚗 ${record.plaka || "-"}
                            </span>
                          </div>

                          <div class="text-sm text-zinc-400">${record.phone} · ${record.brand} ${record.model} · ${record.plaka || "-"}</div>

                          <div class="text-sm text-white">
                            İşlemler: ${(record.operations || [])
                              .map(op => op.name || "-")
                              .filter(Boolean)
                              .join(", ")}
                          </div>

                          <div class="text-sm font-semibold text-emerald-300">
                            Ara Toplam: ${formatMoney(operationsSubtotal(record))}${recordDiscount(record) > 0 ? ` · İndirim: ${formatMoney(recordDiscount(record))}` : ""} · Toplam: ${formatMoney(recordTotal(record))}
                          </div>

                          <div class="text-sm text-zinc-500">
                            Kayıt: ${formatDateTime(record.createdAt)}
                          </div>

                          <div class="text-sm text-zinc-500">
                            Kusurlar: ${record.vehicleDefects || "-"}
                          </div>
                        </div>

                        <!-- SAĞ ALAN: ÖDEME + USTA/BUTONLAR -->
                        <div class="flex w-full flex-col gap-3 xl:w-[820px] xl:flex-row xl:items-start xl:justify-end">

                          <!-- ÖDEME BLOĞU -->
                          <div class="w-full shrink-0 rounded-xl border border-zinc-800 bg-zinc-950/60 p-2 space-y-1.5 xl:w-[300px]">
                            <div class="flex items-center justify-between gap-2">
                              <div class="text-xs font-bold text-white">Ödeme</div>

                              <div class="flex items-center gap-2">
                                <button
                                  type="button"
                                  onclick="clearPaymentForRecord('${record.id}')"
                                  class="rounded-lg border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-300 hover:bg-red-500/20"
                                >
                                  Temizle
                                </button>

                                <div
                                 id="paymentRemainingBox-${record.id}"
                                  class="rounded-lg bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400"
                                >
                                  Kalan: ${formatMoney(Math.max(recordTotal(record) - (Number(record.paymentCash || 0) + Number(record.paymentCard || 0) + Number(record.paymentTransfer || 0)), 0))}${(Number(record.paymentCash || 0) + Number(record.paymentCard || 0) + Number(record.paymentTransfer || 0)) === recordTotal(record) ? " ✅" : ""}
                                </div>
                              </div>
                            </div>

                            <div class="flex items-center gap-2">
                              <div class="w-12 text-xs text-zinc-300">Nakit</div>
                              <input
                                type="number"
                                data-payment-cash="${record.id}"
                                value="${record.paymentCash || ""}"
                                oninput="updatePaymentRemainingForRecord('${record.id}')"
                                placeholder="0"
                                class="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                              />
                              <button type="button" onclick="setFullPaymentForRecord('${record.id}', 'cash')" class="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-emerald-500">N</button>
                            </div>

                            <div class="flex items-center gap-2">
                              <div class="w-12 text-xs text-zinc-300">Kart</div>
                              <input
                                type="number"
                                data-payment-card="${record.id}"
                                value="${record.paymentCard || ""}"
                                oninput="updatePaymentRemainingForRecord('${record.id}')"
                                placeholder="0"
                                class="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                              />
                              <button type="button" onclick="setFullPaymentForRecord('${record.id}', 'card')" class="rounded-lg bg-blue-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-blue-500">K</button>
                            </div>

                            <div class="flex items-center gap-2">
                              <div class="w-12 text-xs text-zinc-300">Havale</div>
                              <input
                                type="number"
                                data-payment-transfer="${record.id}"
                                value="${record.paymentTransfer || ""}"
                                oninput="updatePaymentRemainingForRecord('${record.id}')"
                                placeholder="0"
                                class="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-white"
                              />
                              <button type="button" onclick="setFullPaymentForRecord('${record.id}', 'transfer')" class="rounded-lg bg-amber-600 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-500">H</button>
                            </div>
                          </div>

                          <!-- USTA + BUTONLAR BLOĞU -->
                         <div class="flex w-full min-w-0 flex-col gap-2 xl:w-[260px]">
                            <div>
                              <label class="mb-1 block text-xs text-zinc-400">Ustanın Adı Soyadı</label>
                              <div class="flex gap-2">
                                <input
                                  data-inline-tech="${record.id}"
                                  maxlength="40"
                                  value="${record.technician || ""}"
                                  placeholder="Usta Ad Soyad"
                                  class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-1.5 text-sm text-white"
                                />
                                <button
                                  data-save-tech="${record.id}"
                                  class="rounded-2xl bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700 whitespace-nowrap"
                                >
                                  Ekle
                                </button>
                              </div>
                            </div>

                            <div class="flex flex-wrap gap-2">
                              <button
                                data-detail="${record.id}"
                                class="rounded-2xl bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700"
                              >
                                Detay
                              </button>

                              <button
                                data-edit="${record.id}"
                                class="rounded-2xl bg-yellow-500 px-4 py-2 text-sm text-black font-semibold hover:bg-yellow-400"
                              >
                                Forma Al
                              </button>

                              <button
                                onclick="updateRecordStatus('${record.id}', 'Montaj Sürecinde')"
                                ${state.statusUpdatingId === record.id ? "disabled" : ""}
                                class="rounded-2xl px-4 py-2 text-sm transition ${
                                  record.status === "Montaj Sürecinde"
                                    ? "bg-amber-500 text-black font-semibold"
                                    : "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30"
                                } ${state.statusUpdatingId === record.id ? "opacity-60 cursor-not-allowed" : ""}"
                              >
                                ${
                                  state.statusUpdatingId === record.id && record.status === "Montaj Sürecinde"
                                    ? "Kaydediliyor..."
                                    : "İşlemde"
                                }
                              </button>

                              <button
                                onclick="updateRecordStatus('${record.id}', 'Montaj Bitti')"
                                ${state.statusUpdatingId === record.id ? "disabled" : ""}
                                class="rounded-2xl px-4 py-2 text-sm transition ${
                                  record.status === "Montaj Bitti"
                                    ? "bg-green-500 text-black font-semibold"
                                    : "bg-green-500/20 text-green-300 hover:bg-green-500/30"
                                } ${state.statusUpdatingId === record.id ? "opacity-60 cursor-not-allowed" : ""}"
                              >
                                ${
                                  state.statusUpdatingId === record.id && record.status === "Montaj Bitti"
                                    ? "Kaydediliyor..."
                                    : "Montaj Bitti"
                                }
                              </button>

                              <button
                                data-print="${record.id}"
                                onclick="printReceipt('${record.id}')"
                                class="rounded-2xl bg-zinc-700 px-4 py-2 text-sm text-white hover:bg-zinc-600"
                              >
                                Fiş
                              </button>

                              <button
                                data-delete="${record.id}"
                                class="rounded-2xl bg-red-500/15 px-4 py-2 text-sm text-red-300 hover:bg-red-500/25"
                              >
                                Sil
                              </button>

                              <button
                                onclick="toggleInlineOperation('${record.id}')"
                                class="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/20"
                              >
                                İşlem Ekle
                              </button>

                              <button
                                onclick="openKontrol('${record.id}')"
                                class="rounded-2xl border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-sm text-blue-300 hover:bg-blue-500/20"
                              >
                                Kontrol Et
                              </button>

                              <button
                                onclick="updateRecordStatus('${record.id}', 'Sipariş Beklemede')"
                                ${state.statusUpdatingId === record.id ? "disabled" : ""}
                                class="rounded-2xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-sm text-purple-200 hover:bg-purple-500/20 disabled:opacity-60"
                              >
                                Sipariş
                              </button>

                              <button
                                onclick="updateRecordStatus('${record.id}', 'Garanti Beklemede')"
                                ${state.statusUpdatingId === record.id ? "disabled" : ""}
                                class="rounded-2xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-sm text-orange-200 hover:bg-orange-500/20 disabled:opacity-60"
                              >
                                Garanti
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      ${state.inlineOperation?.recordId === record.id ? `
                        <div class="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3">
                          <div class="grid gap-2 md:grid-cols-[1fr_160px_auto_auto] md:items-end">
                            <div>
                              <label class="mb-1 block text-xs text-emerald-200">Yeni İşlem</label>
                              <input value="${state.inlineOperation.name || ""}" oninput="updateInlineOperationField('name', this.value)" placeholder="Örn: Bagaj havuzu" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" />
                            </div>
                            <div>
                              <label class="mb-1 block text-xs text-emerald-200">Tutar</label>
                              <input type="number" value="${state.inlineOperation.fee || ""}" oninput="updateInlineOperationField('fee', this.value)" placeholder="0" class="w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" />
                            </div>
                            <button onclick="addInlineOperationToRecord('${record.id}')" ${state.inlineOperation.saving ? "disabled" : ""} class="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
                              ${state.inlineOperation.saving ? "Ekleniyor..." : "Ekle"}
                            </button>
                            <button onclick="toggleInlineOperation('${record.id}')" class="rounded-2xl border border-white/10 bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">Vazgeç</button>
                          </div>
                        </div>
                      ` : ""}
                    </div>
                  `).join("")}

                  ${canShowMore ? `<button id="showMoreBtn" class="mt-2 rounded-2xl border border-white/10 bg-zinc-800 px-4 py-3 text-sm text-white hover:bg-zinc-700">Daha Fazla Göster</button>` : ""}
                </div>
              </div>
            ` : ""}


            ${state.activeTab === "siparis" ? `
              <div class="space-y-4">
                ${(() => {
                  const unpaidOrders = orderRows.filter(r => recordRemaining(r) > 0);
                  const paidOrders = orderRows.filter(r => recordRemaining(r) <= 0);
                  return `
                    <div class="grid gap-3 md:grid-cols-3">
                      <div class="rounded-3xl border border-purple-400/20 bg-purple-500/10 p-5">
                        <div class="text-sm text-purple-200">Sipariş Bekleyen</div>
                        <div class="text-3xl font-bold text-purple-200">${orderRows.length}</div>
                      </div>
                      <div class="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5">
                        <div class="text-sm text-amber-200">Ödemesi Eksik</div>
                        <div class="text-3xl font-bold text-amber-200">${unpaidOrders.length}</div>
                      </div>
                      <div class="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5">
                        <div class="text-sm text-emerald-200">Ödemesi Tamam</div>
                        <div class="text-3xl font-bold text-emerald-200">${paidOrders.length}</div>
                      </div>
                    </div>
                  `;
                })()}

                ${renderWaitingCenter(orderRows, warrantyRows, "siparis")}
              </div>
            ` : ""}

            ${state.activeTab === "garanti" ? `
              <div class="space-y-4">
                ${(() => {
                  const oldWarranty = warrantyRows.filter(r => daysWaiting(r) >= 7);
                  return `
                    <div class="grid gap-3 md:grid-cols-2">
                      <div class="rounded-3xl border border-orange-400/20 bg-orange-500/10 p-5">
                        <div class="text-sm text-orange-200">Garanti Bekleyen</div>
                        <div class="text-3xl font-bold text-orange-200">${warrantyRows.length}</div>
                      </div>
                      <div class="rounded-3xl border border-red-400/20 bg-red-500/10 p-5">
                        <div class="text-sm text-red-200">7 Günü Geçen</div>
                        <div class="text-3xl font-bold text-red-200">${oldWarranty.length}</div>
                      </div>
                    </div>
                  `;
                })()}

                ${renderWaitingCenter(orderRows, warrantyRows, "garanti")}
              </div>
            ` : ""}


            ${state.activeTab === "gunSonu" ? `
              <div class="space-y-4">
                <div class="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_280px_300px] xl:items-start">
                  <div class="min-w-0 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 text-white xl:min-h-[230px]">
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div class="min-w-0">
                        <h2 class="text-xl font-bold">📊 Gün Sonu Raporu</h2>
                        <p class="mt-1 text-sm text-emerald-100">${trReportDateLabel(state.selectedDate)} G.S.R · Montaj Bitti olan kayıtlar listelenir.</p>

                        <div class="mt-4 flex flex-wrap items-center gap-2">
                          <button id="prevDailyReportDate" class="h-11 rounded-2xl border border-white/10 bg-zinc-950/70 px-4 text-sm font-bold text-white hover:bg-zinc-800">◀ Önceki Gün</button>

                          <label id="dailyDatePickerShell" class="flex h-11 min-w-[170px] cursor-pointer items-center justify-center gap-2 rounded-2xl border border-zinc-500/50 bg-zinc-800/80 px-4 text-sm font-bold text-zinc-100 shadow-inner hover:bg-zinc-700/80">
                            <span class="text-zinc-300">📅</span>
                            <input id="selectedDateInput" type="date" value="${state.selectedDate}" class="gunsonu-date-input w-[105px] bg-transparent text-center text-sm font-bold text-white outline-none" />
                          </label>

                          <button id="nextDailyReportDate" class="h-11 rounded-2xl border border-white/10 bg-zinc-950/70 px-4 text-sm font-bold text-white hover:bg-zinc-800">Sonraki Gün ▶</button>
                        </div>
                      </div>
                      <div class="flex w-full flex-col gap-2 sm:w-[190px]">
                        <button id="refreshDailyReport" class="w-full rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800">🔄 Raporu Yenile</button>
                        <button id="exportDailyReportExcel" class="w-full rounded-2xl bg-white px-4 py-2 text-sm font-bold text-black hover:bg-zinc-200">📊 Excel İndir</button>
                        <button id="printDailyReport" class="w-full rounded-2xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white hover:bg-zinc-800">🖨️ Yazdır</button>
                      </div>
                    </div>
                  </div>

                  <div class="min-w-0 rounded-3xl border border-red-400/20 bg-zinc-950/80 p-4 text-white shadow-xl xl:w-[280px] xl:h-fit">
                      <div class="mb-3 text-sm font-bold text-red-200">💸 Gider Ekle</div>

                      <input
                        id="dailyExpenseDescription"
                        value="${escapeHtml(state.expenseDescription || "")}"
                        class="mb-3 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white"
                        placeholder="Açıklama"
                      />

                      <input
                        id="dailyExpenseAmount"
                        value="${state.expenseAmount || ""}"
                        type="number"
                        min="0"
                        step="0.01"
                        class="mb-4 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-sm text-white"
                        placeholder="Tutar"
                      />

                      <button
                        id="addDailyExpense"
                        class="w-full rounded-2xl bg-red-500 px-4 py-3 text-sm font-bold text-white hover:bg-red-400"
                      >
                        + Gider Kaydet
                      </button>
                    </div>

                    <div class="min-w-0 rounded-3xl border border-violet-400/20 bg-violet-500/10 p-4 text-white shadow-xl xl:w-[300px] xl:h-fit">
                      <div class="mb-3 text-sm font-bold text-violet-200">🏬 Diğer Şube Ödemesi</div>

                      <div class="grid grid-cols-3 gap-2">
                        <input
                          id="branchPaymentCash"
                          value="${state.branchPaymentCash || ""}"
                          type="number"
                          min="0"
                          step="0.01"
                          class="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-white"
                          placeholder="Nakit"
                        />
                        <input
                          id="branchPaymentCard"
                          value="${state.branchPaymentCard || ""}"
                          type="number"
                          min="0"
                          step="0.01"
                          class="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-white"
                          placeholder="Kart"
                        />
                        <input
                          id="branchPaymentTransfer"
                          value="${state.branchPaymentTransfer || ""}"
                          type="number"
                          min="0"
                          step="0.01"
                          class="w-full rounded-2xl border border-white/10 bg-black/50 px-3 py-3 text-sm text-white"
                          placeholder="Havale"
                        />
                      </div>

                      <button
                        id="addDailyBranchPayment"
                        class="mt-4 w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-bold text-white hover:bg-violet-400"
                      >
                        + Diğer Şube Ekle
                      </button>

                      <div class="mt-4 border-t border-violet-300/10 pt-3">
                        <div class="mb-2 text-xs font-bold text-violet-200">Bugünkü Diğer Şube Girişleri</div>
                        ${
                          (state.branchPayments || []).length
                            ? (state.branchPayments || []).map(r => `
                              <div class="mb-2 rounded-2xl border border-violet-300/10 bg-black/30 p-2">
                                <div class="flex items-start justify-between gap-2">
                                  <div class="min-w-0">
                                    <div class="truncate text-xs font-bold text-white">${escapeHtml(r.note || r.branchNote || r.description || "Diğer Şube")}</div>
                                    <div class="mt-1 text-[11px] text-zinc-400">
                                      ${Number(r.cash ?? r.branchCash ?? 0) ? "Nakit: " + formatMoney(r.cash ?? r.branchCash) + " " : ""}
                                      ${Number(r.card ?? r.branchCard ?? 0) ? "Kart: " + formatMoney(r.card ?? r.branchCard) + " " : ""}
                                      ${Number(r.transfer ?? r.branchTransfer ?? 0) ? "Havale: " + formatMoney(r.transfer ?? r.branchTransfer) : ""}
                                    </div>
                                  </div>
                                  <button
                                    data-delete-branch-payment="${r.id}"
                                    class="shrink-0 rounded-xl bg-red-500/15 px-2 py-1 text-[11px] font-bold text-red-200 hover:bg-red-500/25"
                                  >
                                    🗑 Sil
                                  </button>
                                </div>
                              </div>
                            `).join("")
                            : `<div class="rounded-2xl border border-white/10 bg-black/20 p-2 text-[11px] text-zinc-400">Henüz giriş yok.</div>`
                        }
                      </div>
                    </div>
                  </div>
                </div>

                <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
                  <div class="rounded-3xl border border-white/10 bg-zinc-900 p-5"><div class="text-xs text-zinc-400">Hareket</div><div class="text-2xl font-bold">${reportRows.length}</div></div>
                  <div class="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5"><div class="text-xs text-emerald-200">Nakit</div><div class="text-xl font-bold text-emerald-300">${formatMoney(reportTotals.cash)}</div></div>
                  <div class="rounded-3xl border border-sky-400/20 bg-sky-500/10 p-5"><div class="text-xs text-sky-200">Kart</div><div class="text-xl font-bold text-sky-300">${formatMoney(reportTotals.card)}</div></div>
                  <div class="rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5"><div class="text-xs text-amber-200">Havale</div><div class="text-xl font-bold text-amber-300">${formatMoney(reportTotals.transfer)}</div></div>
                  <div class="rounded-3xl border border-violet-400/20 bg-violet-500/10 p-5"><div class="text-xs text-violet-200">Diğer Şube</div><div class="text-xl font-bold text-violet-300">${formatMoney(reportTotals.branchGross)}</div></div>
                  <div class="rounded-3xl border border-red-400/20 bg-red-500/10 p-5"><div class="text-xs text-red-200">Gider</div><div class="text-xl font-bold text-red-300">${formatMoney(reportTotals.expense)}</div></div>
                  <div class="rounded-3xl border border-fuchsia-400/20 bg-fuchsia-500/10 p-5"><div class="text-xs text-fuchsia-200">Net</div><div class="text-xl font-bold text-fuchsia-300">${formatMoney(reportTotals.net)}</div></div>
                </div>

                <div class="rounded-3xl border border-white/10 bg-zinc-900/90 text-white overflow-hidden">
                  <div class="p-6 pb-3 flex items-center justify-between gap-3">
                    <h2 class="text-lg font-semibold">Hareket Listesi</h2>
                    <div class="text-xs text-zinc-400">Dosya adı: ${gsrFileName("xls")}</div>
                  </div>
                  <div class="overflow-x-auto p-6 pt-0">
                    <table class="w-full min-w-[980px] border-separate border-spacing-y-2 text-sm">
                      <thead class="text-left text-xs text-zinc-400">
                        <tr>
                          <th class="px-3 py-2">Saat</th>
                          <th class="px-3 py-2">Plaka</th>
                          <th class="px-3 py-2">Müşteri</th>
                          <th class="px-3 py-2">İşlem</th>
                          <th class="px-3 py-2 text-right">Nakit</th>
                          <th class="px-3 py-2 text-right">Kart</th>
                          <th class="px-3 py-2 text-right">Havale</th>
                          <th class="px-3 py-2 text-right">Gider</th>
                          <th class="px-3 py-2 text-right">İşlem</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${reportRows.length ? reportRows.map(r => {
                          if (r.isExpense) {
                            return `
                            <tr class="bg-red-950/30">
                              <td class="rounded-l-2xl px-3 py-3 text-zinc-300">${formatDateTime(r.createdAt).split(" ").slice(-1)[0] || ""}</td>
                              <td class="px-3 py-3 font-bold text-zinc-500">-</td>
                              <td class="px-3 py-3 text-zinc-500">-</td>
                              <td class="px-3 py-3 text-red-200">Gider: ${r.expenseDescription || "-"}</td>
                              <td class="px-3 py-3 text-right text-emerald-300"></td>
                              <td class="px-3 py-3 text-right text-sky-300"></td>
                              <td class="px-3 py-3 text-right text-amber-300"></td>
                              <td class="px-3 py-3 text-right font-bold text-red-300">${formatMoney(r.expenseAmount)}</td>
                              <td class="rounded-r-2xl px-3 py-3 text-right">
                                <button
                                  data-delete-expense="${r.id}"
                                  class="rounded-xl bg-red-500/20 px-3 py-1 text-xs font-bold text-red-200 hover:bg-red-500/30"
                                >🗑 Sil</button>
                              </td>
                            </tr>
                            `;
                          }

                          if (r.isBranchPayment) {
                            return `
                            <tr class="bg-violet-950/30">
                              <td class="rounded-l-2xl px-3 py-3 text-zinc-300">${formatDateTime(r.createdAt).split(" ").slice(-1)[0] || ""}</td>
                              <td class="px-3 py-3 font-bold text-violet-200">Diğer Şube</td>
                              <td class="px-3 py-3 text-violet-200">-</td>
                              <td class="px-3 py-3 text-violet-200">Diğer Şube Ödemesi ${r.branchNote ? "· " + escapeHtml(r.branchNote) : ""}</td>
                              <td class="px-3 py-3 text-right font-bold text-emerald-300">${r.branchCash ? formatMoney(r.branchCash) : ""}</td>
                              <td class="px-3 py-3 text-right font-bold text-sky-300">${r.branchCard ? formatMoney(r.branchCard) : ""}</td>
                              <td class="px-3 py-3 text-right font-bold text-amber-300">${r.branchTransfer ? formatMoney(r.branchTransfer) : ""}</td>
                              <td class="px-3 py-3 text-right text-red-300"></td>
                              <td class="rounded-r-2xl px-3 py-3 text-right">
                                <button
                                  data-delete-branch-payment="${r.id}"
                                  class="rounded-xl bg-violet-500/20 px-3 py-1 text-xs font-bold text-violet-200 hover:bg-violet-500/30"
                                >🗑 Sil</button>
                              </td>
                            </tr>
                            `;
                          }

                          const pay = reportPaymentValues(r);
                          return `
                          <tr class="bg-black/30">
                            <td class="rounded-l-2xl px-3 py-3 text-zinc-300">${formatDateTime(r.createdAt).split(" ").slice(-1)[0] || ""}</td>
                            <td class="px-3 py-3 font-bold text-emerald-300">${r.plaka || "-"}</td>
                            <td class="px-3 py-3">${r.customerName || "-"}</td>
                            <td class="px-3 py-3 text-zinc-300">${(r.operations || []).map(op => `${op.name || "-"} ${op.fee ? "(" + formatMoney(op.fee) + ")" : ""}`).join(" / ")}</td>
                            <td class="px-3 py-3 text-right text-emerald-300">${pay.cash ? formatMoney(pay.cash) : ""}</td>
                            <td class="px-3 py-3 text-right text-sky-300">${pay.card ? formatMoney(pay.card) : ""}</td>
                            <td class="px-3 py-3 text-right text-amber-300">${pay.transfer ? formatMoney(pay.transfer) : ""}</td>
                            <td class="px-3 py-3 text-right text-red-300"></td>
                            <td class="rounded-r-2xl px-3 py-3 text-right"></td>
                          </tr>
                        `}).join("") : `
                          <tr><td colspan="9" class="rounded-2xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-zinc-400">Bu tarihte Montaj Bitti kaydı yok. Raporu Yenile butonuna da basabilirsin.</td></tr>
                        `}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ` : ""}

            ${state.activeTab === "kurulum" && !state.tabletMode ? `
              <div class="grid gap-4 lg:grid-cols-3">
                <div class="lg:col-span-2 rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                  <div class="p-6 pb-3"><h2 class="text-lg font-semibold">Bu sürümde hazır olanlar</h2></div>
                  <div class="grid gap-3 p-6 pt-0 text-sm text-zinc-300">
                    <div class="rounded-2xl border border-white/10 bg-black/20 p-4">• Pro Canlı Arama</div>
                    <div class="rounded-2xl border border-white/10 bg-black/20 p-4">• Kaydı güncelle modu</div>
                    <div class="rounded-2xl border border-white/10 bg-black/20 p-4">• Scroll bozmayan işlem seçimi</div>
                    <div class="rounded-2xl border border-white/10 bg-black/20 p-4">• Liste kademeli yükleme</div>
                    <div class="rounded-2xl border border-white/10 bg-black/20 p-4">• PWA hazırlığı</div>
                  </div>
                </div>
                <div class="rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                  <div class="p-6 pb-3"><h2 class="text-lg font-semibold">Sonraki adımlar</h2></div>
                  <div class="space-y-3 p-6 pt-0 text-sm text-zinc-300">
                    <div>🔐 Kullanıcı girişi</div>
                    <div>📩 Müşteri bilgilendirme</div>
                    <div>🧾 Teklif / tahsilat alanı</div>
                    <div>📦 İş emri raporları</div>
                  </div>
                </div>
              </div>
            ` : ""}
          </div>

          ${showModal ? `
            <div id="modalOverlay" class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
              <div class="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-white/10 bg-zinc-950 text-white shadow-2xl">
                <div class="flex justify-end p-3"><button id="closeModal" class="rounded-2xl border border-white/10 bg-transparent px-4 py-2 text-sm text-white hover:bg-white/5">✕</button></div>
                <div class="px-6 pb-6 space-y-4">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 class="text-lg font-semibold">${selected.customerName || "-"} · ${selected.recordNo || "-"}</h2>
                      <div class="mt-1 text-sm text-zinc-400">${selected.phone || "-"} · ${selected.brand || "-"} ${selected.model || ""}</div>
                    </div>
                    <div class="w-full md:w-72">
                      <label class="mb-2 block text-sm text-zinc-300">Durum</label>
                      <select id="detailStatusSelect" class="w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white">
                        ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${selected.status === status ? "selected" : ""} ${status === "Montaj Bitti" && selected.status !== "Montaj Bitti" ? "disabled" : ""}>${status}</option>`).join("")}
                      </select>
                    </div>
                  </div>

                  <div class="grid gap-4 md:grid-cols-2">
                    <div>
                      <h3 class="mb-2 font-semibold">Müşteri Bilgileri</h3>
                      <div class="space-y-2 text-sm text-zinc-300">
                        <div><span class="text-zinc-500">Telefon:</span> ${selected.phone || "-"}</div>
                        <div><span class="text-zinc-500">Fatura Adresi:</span> ${selected.invoiceAddress || "-"}</div>
                        <div><span class="text-zinc-500">Usta:</span> ${selected.technician || "-"}</div>
                      </div>
                    </div>
                    <div>
  <h3 class="mb-2 font-semibold">Plaka Geçmişi</h3>
  <div class="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300 space-y-2">
    ${selectedPlateHistory.length
      ? selectedPlateHistory
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .map((item) => `
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-2 last:border-0 last:pb-0">
              <div>
                <div class="font-medium text-white">${item.recordNo}</div>
                <div class="text-xs text-zinc-400">${formatDateTime(item.createdAt)}</div>
              </div>
              <div class="text-right">
                <div class="text-xs text-zinc-400">${item.brand || "-"} ${item.model || ""}</div>
                <div class="text-sm font-semibold text-emerald-300">${formatMoney(recordTotal(item))}</div>
              </div>
            </div>
          `).join("")
      : `<div class="text-zinc-500">Bu plakaya ait başka kayıt yok.</div>`}
  </div>
</div>
                    <div>
  <h3 class="mb-2 font-semibold">Araç Bilgileri</h3>
  <div class="space-y-2 text-sm text-zinc-300">
    <div><span class="text-zinc-500">Plaka:</span> ${selected.plaka || "-"}</div>
    <div><span class="text-zinc-500">Şasi No:</span> ${selected.sasiNo || "-"}</div>
    <div><span class="text-zinc-500">Araç Marka:</span> ${selected.brand || "-"}</div>
    <div><span class="text-zinc-500">Araç Modeli:</span> ${selected.model || "-"}</div>
  </div>
</div>
                  </div>

                  <div>
                    <h3 class="mb-2 font-semibold">Araçta Görülen Kusurlar</h3>
                    <div class="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">${selected.vehicleDefects || "-"}</div>
                  </div>

                  <div class="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div>
                      <h3 class="mb-2 font-semibold">Yapılacak İşlemler</h3>
                      <div class="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300 space-y-2">
                        ${(selected.operations || []).length ? selected.operations.map((op) => `<div class="flex items-center justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0"><span>${op.name}</span><strong>${op.fee ? formatMoney(op.fee) : "-"}</strong></div>`).join("") : `<div>-</div>`}
                        <div class="mt-3 border-t border-white/10 pt-3 text-sm font-semibold text-emerald-300">Toplam: ${formatMoney(recordTotal(selected))}</div>
                      </div>
                    </div>
                    <div>
                      <h3 class="mb-2 font-semibold">Araç Görseli</h3>
                      ${selected.vehicleImage ? `<img src="${selected.vehicleImage}" class="h-56 w-full rounded-2xl border border-white/10 object-cover" />` : `<div class="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">Görsel yok</div>`}
                      <div class="mt-4">
                        <h3 class="mb-2 font-semibold">İmza</h3>
                        <div class="grid gap-3 md:grid-cols-2">
                          <div>
                            <div class="mb-1 text-xs text-zinc-400">Müşteri İmzası</div>
                            ${selected.signature ? `<img src="${selected.signature}" class="h-32 w-full rounded-2xl border border-white/10 object-contain bg-black/20" />` : `<div class="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">Müşteri imzası yok</div>`}
                          </div>
                          <div>
                            <div class="mb-1 text-xs text-zinc-400">Usta İmzası</div>
                            ${selected.technicianSignature ? `<img src="${selected.technicianSignature}" class="h-32 w-full rounded-2xl border border-white/10 object-contain bg-black/20" />` : `<div class="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-zinc-500">Usta imzası yok</div>`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 class="mb-2 font-semibold">Ek Notlar</h3>
                    <div class="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm text-zinc-300">${selected.noteText || "-"}</div>
                  </div>
                </div>
              </div>
            </div>
          ` : ""}
        </div>

            ${state.activeTab === "kontrol" ? `
              <div class="rounded-3xl border border-white/10 bg-zinc-900/90 text-white">
                <div class="flex flex-col gap-3 border-b border-white/10 p-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 class="text-xl font-bold">Montaj Kontrol Formu</h2>
                    <p class="mt-1 text-sm text-zinc-400">
                      ${kontrolRecord ? `${kontrolRecord.customerName || "-"} · ${kontrolRecord.plaka || "-"} · ${kontrolRecord.brand || ""} ${kontrolRecord.model || ""}` : "Kayıtlar sayfasından bir kayıt seçip Kontrol Et butonuna bas."}
                    </p>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button onclick="state.activeTab='liste'; render();" class="rounded-2xl border border-white/10 bg-zinc-800 px-4 py-2 text-sm text-white hover:bg-zinc-700">Kayıtlara Dön</button>
                    ${kontrolRecord ? `<button onclick="saveKontrol()" class="rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-black hover:bg-emerald-400">Kontrolü Kaydet</button>` : ""}
                  </div>
                </div>

                ${!kontrolRecord ? `
                  <div class="p-6">
                    <div class="rounded-2xl border border-dashed border-white/10 bg-black/20 p-10 text-center text-zinc-400">
                      Henüz kontrol yapılacak kayıt seçilmedi.
                    </div>
                  </div>
                ` : `
                  <div class="grid gap-4 p-6 lg:grid-cols-[1fr_320px]">
                    <div class="space-y-3">
                      ${MONTAJ_KONTROL_ITEMS.map((question, index) => `
                        <div class="rounded-2xl border border-white/10 bg-black/25 p-4">
                          <div class="mb-3 font-semibold text-white">${index + 1}. ${question}</div>
                          <div class="mb-3 grid grid-cols-2 gap-2">
                            <button onclick="setKontrol(${index}, 'Evet')" class="montaj-control-choice rounded-2xl px-4 py-2 text-sm font-semibold transition ${kontrolState.answers[index] === "Evet" ? "bg-green-500 text-black" : "bg-zinc-800 text-white hover:bg-zinc-700"}">Evet</button>
                            <button onclick="setKontrol(${index}, 'Hayır')" class="montaj-control-choice rounded-2xl px-4 py-2 text-sm font-semibold transition ${kontrolState.answers[index] === "Hayır" ? "bg-red-500 text-white" : "bg-zinc-800 text-white hover:bg-zinc-700"}">Hayır</button>
                          </div>
                          <textarea data-kontrol-note="${index}" class="min-h-[72px] w-full rounded-2xl border border-white/10 bg-zinc-950 px-3 py-2 text-sm text-white" placeholder="Açıklama / not">${kontrolState.notes[index] || ""}</textarea>
                        </div>
                      `).join("")}
                    </div>

                    <div class="space-y-4">
                      <div class="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <h3 class="mb-3 font-semibold">Son Kontrol Fotoğrafı</h3>
                        <label class="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-white/15 bg-zinc-950 px-4 py-5 text-sm text-zinc-300 hover:bg-white/5">
                          <span class="text-lg">📷</span>
                          <span>Fotoğraf Çek / Seç</span>
                          <input type="file" accept="image/*" capture="environment" class="hidden" onchange="handleKontrolFoto(this.files[0])" />
                        </label>
                        ${kontrolState.foto ? `<img src="${kontrolState.foto}" class="mt-4 max-h-[360px] w-full rounded-2xl border border-white/10 object-cover" />` : `<div class="mt-4 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">Son kontrol fotoğrafı yok.</div>`}
                      </div>

                      <div class="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm text-zinc-300">
                        <div><b class="text-white">Kayıt No:</b> ${kontrolRecord.recordNo || "-"}</div>
                        <div><b class="text-white">Usta:</b> ${kontrolRecord.technician || "-"}</div>
                        <div><b class="text-white">Öncesi:</b> ${kontrolRecord.vehicleImage ? "Var" : "Yok"}</div>
                        <div><b class="text-white">Müşteri İmzası:</b> ${kontrolRecord.signature ? "Var" : "Yok"}</div>
                        <div><b class="text-white">Usta İmzası:</b> ${kontrolRecord.technicianSignature ? "Var" : "Yok"}</div>
                      </div>

                      <button
  id="kontrolSaveBtn"
  onclick="saveKontrol()"
  class="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
>
  Kontrolü Kaydet ve Montaj Bitti Yap
</button>
</div>
                  </div>
                `}
              </div>
            ` : ""}
        </div>
      `;
document.querySelectorAll('input[type="checkbox"][data-form]').forEach((el) => {
  el.onchange = (e) => {
    updateForm(el.getAttribute("data-form"), e.target.checked);
  };
});      
document.querySelectorAll('[data-kontrol-note]').forEach((el) => {
  el.oninput = (e) => {
    kontrolState.notes[el.getAttribute('data-kontrol-note')] = e.target.value || '';
  };
});

      document.getElementById("toggleTablet")?.addEventListener("click", () => {
        state.tabletMode = !state.tabletMode;
        render();
      });

      document.querySelectorAll("[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.activeTab = btn.dataset.tab;
          render();
        });
      });

      document.querySelectorAll("[data-form]").forEach((el) => {
        const syncFormField = (e) => {
          updateForm(el.dataset.form, e.target.value);
          if (el.dataset.form === "discountAmount") {
            const totalBox = document.getElementById("operationTotalBox");
            if (totalBox) {
              totalBox.innerHTML = `Ara Toplam: ${formatMoney(operationsSubtotal(state.form))}<br>İndirim: ${formatMoney(recordDiscount(state.form))}<br>Genel Toplam: ${formatMoney(recordTotal(state.form))}`;
            }
            updatePaymentRemaining();
          }
        };
        el.addEventListener("input", syncFormField);
        el.addEventListener("change", syncFormField);
      });

      const technicianInput = document.getElementById("technicianInput");
      if (technicianInput) {
        const applyFromInput = () => {
          state.form.technician = technicianInput.value || "";
          applyTechnicianSignatureToForm(false);
        };
        technicianInput.addEventListener("change", applyFromInput);
        technicianInput.addEventListener("blur", applyFromInput);
      }

      document.getElementById("useSavedTechnicianSignature")?.addEventListener("click", () => {
        if (!String(state.form.technician || "").trim()) {
          alert("Önce usta adı yaz / seç.");
          return;
        }
        if (!applyTechnicianSignatureToForm(true)) {
          alert("Bu usta için kayıtlı imza bulunamadı.");
        }
      });

      document.getElementById("saveTechnicianSignatureTemplate")?.addEventListener("click", () => {
        if (!String(state.form.technician || "").trim()) {
          alert("Önce usta adı yaz / seç.");
          return;
        }
        if (!state.form.technicianSignature) {
          alert("Önce usta imzasını çiz.");
          return;
        }
        rememberTechnicianSignature(state.form.technician, state.form.technicianSignature);
        alert("Usta imzası hafızaya alındı ✅");
      });
document.getElementById("brandSelect")?.addEventListener("change", (e) => {
  state.form.brand = e.target.value;
  state.form.model = "";
  state.form.type = "";
  render();
});

document.getElementById("modelSelect")?.addEventListener("change", (e) => {
  state.form.model = e.target.value;
  state.form.type = "";
  render();
});

document.getElementById("typeSelect")?.addEventListener("change", (e) => {
  state.form.type = e.target.value;
});
      document.querySelectorAll("[data-company]").forEach((el) => {
        el.addEventListener("input", (e) => updateCompany(el.dataset.company, e.target.value));
      });

  // işlem adı
document.querySelectorAll("[data-op-name]").forEach((el) => {
  el.addEventListener("input", (e) => {
    updateOperationRow(
      Number(el.getAttribute("data-op-name")),
      "name",
      e.target.value,
      false
    );
  });

  el.addEventListener("blur", (e) => {
    updateOperationRow(
      Number(el.getAttribute("data-op-name")),
      "name",
      e.target.value,
      false
    );
  });
});

// ücret
document.querySelectorAll("[data-op-fee]").forEach((el) => {
  el.addEventListener("input", (e) => {
    updateOperationRow(
      Number(el.getAttribute("data-op-fee")),
      "fee",
      e.target.value,
      false
    );
  });

  el.addEventListener("blur", (e) => {
    updateOperationRow(
      Number(el.getAttribute("data-op-fee")),
      "fee",
      e.target.value,
      true
    );
  });
});
document.querySelectorAll("[data-op-remove]").forEach((el) => {
  el.onclick = () => {
    removeOperationRow(Number(el.getAttribute("data-op-remove")));
  };
});

const addOpBtn = document.getElementById("addOperationRow");
if (addOpBtn) {
  addOpBtn.onclick = () => addOperationRow();
}
      document.getElementById("vehicleImageInput")?.addEventListener("change", (e) => handleVehicleImage(e.target.files?.[0]));
      document.getElementById("removeVehicleImage")?.addEventListener("click", () => {
        state.form.vehicleImage = "";
        render();
      });

      document.getElementById("saveRecord")?.addEventListener("click", async () => {
  if (state.saving) return;

  if (state.editId) {
    await updateCurrentRecord();
  } else {
    await saveRecord();
  }
});
      document.getElementById("saveQuickRecord")?.addEventListener("click", async () => {
        await saveQuickRecord();
      });
      document.getElementById("updateRecord")?.addEventListener("click", updateCurrentRecord);
      document.getElementById("cancelEdit")?.addEventListener("click", cancelEdit);
      document.getElementById("exportCsv")?.addEventListener("click", exportCsv);
      document.getElementById("exportJson")?.addEventListener("click", exportJson);
      document.getElementById("refreshDailyReport")?.addEventListener("click", refreshDailyReportPreview);
      document.getElementById("exportDailyReportExcel")?.addEventListener("click", exportDailyReportExcel);
      document.getElementById("printDailyReport")?.addEventListener("click", printDailyReport);
      document.getElementById("dailyExpenseDescription")?.addEventListener("input", (e) => {
        state.expenseDescription = e.target.value;
      });
      document.getElementById("dailyExpenseAmount")?.addEventListener("input", (e) => {
        state.expenseAmount = e.target.value;
      });
      document.getElementById("addDailyExpense")?.addEventListener("click", addDailyExpense);
      document.getElementById("branchPaymentNote")?.addEventListener("input", (e) => {
        state.branchPaymentNote = e.target.value;
      });
      document.getElementById("branchPaymentCash")?.addEventListener("input", (e) => {
        state.branchPaymentCash = e.target.value;
      });
      document.getElementById("branchPaymentCard")?.addEventListener("input", (e) => {
        state.branchPaymentCard = e.target.value;
      });
      document.getElementById("branchPaymentTransfer")?.addEventListener("input", (e) => {
        state.branchPaymentTransfer = e.target.value;
      });
      document.getElementById("addDailyBranchPayment")?.addEventListener("click", addDailyBranchPayment);
      document.querySelectorAll("[data-delete-expense]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await deleteDailyExpense(btn.dataset.deleteExpense);
        });
      });
      document.querySelectorAll("[data-delete-branch-payment]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          await deleteDailyBranchPayment(btn.dataset.deleteBranchPayment);
        });
      });
      document.getElementById("resetForm")?.addEventListener("click", () => {
        state.form = emptyForm();
        state.editId = null;
        signatureHandlersBound = false;
        render();
      });

const searchEl = document.getElementById("search");

function applySearchFilterAndKeepFocus(cursorPos = null) {
  const nextSearch = String(state.searchDraft || "").trim();
  if (state.search === nextSearch) return;

  state.search = nextSearch;
  state.visibleCount = PAGE_SIZE;
  render();

  setTimeout(() => {
    const freshSearchEl = document.getElementById("search");
    if (!freshSearchEl) return;
    freshSearchEl.focus({ preventScroll: true });
    const pos = cursorPos ?? freshSearchEl.value.length;
    try { freshSearchEl.setSelectionRange(pos, pos); } catch {}
  }, 0);
}

if (searchEl) {
  searchEl.addEventListener("input", (e) => {
    state.searchDraft = e.target.value;
    const cursorPos = e.target.selectionStart;

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      applySearchFilterAndKeepFocus(cursorPos);
    }, 800);
  });

  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      clearTimeout(searchTimer);
      applySearchFilterAndKeepFocus(e.target.selectionStart);
    }
  });
}

      document.getElementById("statusFilter")?.addEventListener("change", (e) => {
  state.statusFilter = e.target.value;
  state.visibleCount = PAGE_SIZE;
  render();
});
      document.getElementById("dailyDatePickerShell")?.addEventListener("click", (e) => {
        const input = document.getElementById("selectedDateInput");
        if (!input) return;
        if (e.target !== input && typeof input.showPicker === "function") input.showPicker();
      });
      document.getElementById("selectedDateInput")?.addEventListener("change", async (e) => {
        await setDailyReportDate(e.target.value);
      });
      document.getElementById("prevDailyReportDate")?.addEventListener("click", async () => {
        await shiftDailyReportDate(-1);
      });
      document.getElementById("nextDailyReportDate")?.addEventListener("click", async () => {
        await shiftDailyReportDate(1);
      });

      document.getElementById("showMoreBtn")?.addEventListener("click", () => {
  state.visibleCount += PAGE_SIZE;
  render();
});

      document.querySelectorAll("[data-detail]").forEach((btn) => {
        btn.addEventListener("click", () => {
          state.selectedId = btn.dataset.detail || null;
          render();
        });
      });

      document.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => loadRecordToForm(btn.dataset.edit));
      });

      document.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => deleteRecord(btn.dataset.delete));
      });

      document.querySelectorAll("[data-print]").forEach((btn) => {
        if (!btn.getAttribute("onclick")) {
          btn.addEventListener("click", () => printReceipt(btn.dataset.print));
        }
      });

      document.querySelectorAll("[data-inline-status]").forEach((el) => {
        el.addEventListener("change", async (e) => {
          await updateRecordStatus(el.dataset.inlineStatus, e.target.value);
        });
      });

     document.querySelectorAll("[data-inline-tech]").forEach((el) => {
  let lastSavedValue = (el.value || "").trim();

  const save = async () => {
    const newValue = (el.value || "").trim();

    if (newValue === lastSavedValue) return;

    try {
      await updateRecordTechnician(el.dataset.inlineTech, newValue);
      lastSavedValue = newValue;
    } catch (e) {
      console.error("inline tech save hata:", e);
    }
  };

  el.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await save();
      el.blur();
    }
  });

  el.addEventListener("change", save);
  el.addEventListener("blur", save);
});
      document.querySelectorAll("[data-save-tech]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.dataset.saveTech;
    const input = document.querySelector(`[data-inline-tech="${id}"]`);
    if (!input) return;

    const technician = input.value.trim();
    if (!technician) {
      alert("Lütfen usta adı gir.");
      return;
    }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "Kaydediliyor...";

    const ok = await updateRecordTechnician(id, technician);

    btn.disabled = false;
    btn.textContent = ok ? "Kaydedildi" : oldText;

    if (ok) {
      setTimeout(() => {
        btn.textContent = "Ekle";
      }, 1200);
    } else {
      alert("Usta adı kaydedilemedi.");
      btn.textContent = oldText;
    }
  });
});

      document.getElementById("detailStatusSelect")?.addEventListener("change", async (e) => {
        const selectedCurrent = selectedRecord();
        if (selectedCurrent) await updateRecordStatus(selectedCurrent.id, e.target.value);
      });

      document.getElementById("closeModal")?.addEventListener("click", () => {
        state.selectedId = null;
        render();
      });

      document.getElementById("modalOverlay")?.addEventListener("click", (e) => {
        if (e.target.id === "modalOverlay") {
          state.selectedId = null;
          render();
        }
      });
     
      setupSignaturePad();
    }
function setKontrol(i, val) {
  kontrolState.answers[i] = val;
  render();
}

function handleKontrolFoto(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    const img = new Image();

    img.onload = () => {
      const maxWidth = 700;
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // kaliteyi düşük tuttuk ki Sheets hücre sınırına takılmasın
      kontrolState.foto = canvas.toDataURL("image/jpeg", 0.35);

      render();
    };

    img.src = reader.result;
  };

  reader.readAsDataURL(file);
}
  function showToast(message, type = "success") {
  const old = document.getElementById("appToast");
  if (old) old.remove();

  const div = document.createElement("div");
  div.id = "appToast";
  div.textContent = message;
  div.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 99999;
    padding: 12px 16px;
    border-radius: 16px;
    color: ${type === "error" ? "#fecaca" : "#bbf7d0"};
    background: ${type === "error" ? "rgba(127,29,29,.95)" : "rgba(20,83,45,.95)"};
    border: 1px solid ${type === "error" ? "rgba(248,113,113,.35)" : "rgba(74,222,128,.35)"};
    box-shadow: 0 12px 30px rgba(0,0,0,.35);
    font-size: 14px;
    font-weight: 700;
  `;

  document.body.appendChild(div);

  setTimeout(() => {
    div.remove();
  }, 2500);
}

async function saveKontrol() {
  if (!kontrolRecord) return;

  const btns = document.querySelectorAll("#kontrolSaveBtn, button[onclick='saveKontrol()']");
  btns.forEach(btn => {
    btn.disabled = true;
    btn.textContent = "Kaydediliyor...";
  });

  document.querySelectorAll("[data-kontrol-note]").forEach((el) => {
    kontrolState.notes[el.getAttribute("data-kontrol-note")] = el.value || "";
  });

  const checklist = MONTAJ_KONTROL_ITEMS.map((label, index) => ({
    label,
    answer: kontrolState.answers[index] || "",
    note: kontrolState.notes[index] || ""
  }));

  const boslar = checklist.filter(item => !item.answer).length;
  if (boslar > 0) {
    alert(`${boslar} adet kontrol sorusu boş. Montajı bitirmek için bütün soruları cevapla.`);
    btns.forEach(btn => {
      btn.disabled = false;
      btn.textContent = "Kontrolü Kaydet ve Montaj Bitti Yap";
    });
    return;
  }

  const aciklamasizSorunlar = checklist.filter(item => item.answer === "Hayır" && !String(item.note || "").trim());
  if (aciklamasizSorunlar.length > 0) {
    alert(`${aciklamasizSorunlar.length} adet “Hayır” cevabında açıklama yok. Sorunu not alanına yaz.`);
    btns.forEach(btn => {
      btn.disabled = false;
      btn.textContent = "Kontrolü Kaydet ve Montaj Bitti Yap";
    });
    return;
  }

  try {
    state.statusUpdatingId = kontrolRecord.id;
    render();

    const kontrolPayload = {
      ID: kontrolRecord.id,
      MontajKontrolJSON: checklist,
      SonKontrolFotograf: await uploadDataUrlToServer(kontrolState.foto, "vehicle-photos", "final"),
      MontajKontrolTarih: new Date().toISOString(),
      Durum: kontrolRecord.status || "Montaj Sürecinde"
    };

    assertNoBase64InPayload(kontrolPayload);

    const result = await apiKayitGuncelle(kontrolPayload);
    const updatedRecord = mapSheetRecord(result);

    state.records = state.records.map(r =>
      String(r.id) === String(kontrolRecord.id) ? updatedRecord : r
    );

    kontrolRecord = updatedRecord;
    await updateRecordStatus(updatedRecord.id, "Montaj Bitti");

    const completedRecord = state.records.find(r => String(r.id) === String(updatedRecord.id));
    if (!completedRecord || completedRecord.status !== "Montaj Bitti") {
      btns.forEach(btn => {
        btn.disabled = false;
        btn.textContent = "Kontrolü Kaydet ve Montaj Bitti Yap";
      });
      showToast("Kontrol kaydedildi; ödeme veya stok işlemi tamamlanmadan montaj kapatılmadı.", "error");
      return;
    }

    kontrolRecord = null;
    kontrolState = { answers: {}, notes: {}, foto: "" };
    state.activeTab = "liste";
    state.selectedId = null;

    render();
    showToast("Montaj kontrol kaydedildi ✅");

    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);

  } catch(e) {
    console.error("Kontrol kaydedilemedi:", e);
    showToast("Kontrol kaydedilemedi: " + (e.message || "Bilinmeyen hata"), "error");

    btns.forEach(btn => {
      btn.disabled = false;
      btn.textContent = "Kontrolü Kaydet ve Montaj Bitti Yap";
    });
  } finally {
    state.statusUpdatingId = null;
    render();
  }
}
    function setupSignatureCanvas(config) {
      if (state.activeTab !== "kayit") return;

      const canvas = document.getElementById(config.canvasId);
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      let drawing = false;

      function resizeCanvas(keepSignature = true) {
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const rect = canvas.getBoundingClientRect();
        const oldSignature = keepSignature ? (state.form[config.formKey] || "") : "";

        canvas.width = Math.max(1, Math.floor(rect.width * ratio));
        canvas.height = Math.max(1, Math.floor(180 * ratio));

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(ratio, ratio);

        repaint(oldSignature);
      }
function paymentTotal() {
  return (
    Number(state.form.paymentCash || 0) +
    Number(state.form.paymentCard || 0) +
    Number(state.form.paymentTransfer || 0)
  );
}

function currentFormTotal() {
  return recordTotal(state.form);
}

function updatePaymentRemaining() {
  const total = currentFormTotal();
  const paid = paymentTotal();
  const remaining = total - paid;

  const box = document.getElementById("paymentRemainingBox");

  if (!box) return;

  if (remaining === 0) {
    box.className =
      "rounded-xl bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-400";

    box.innerHTML = `Kalan: ${formatMoney(remaining)} ✅`;
  } else if (remaining > 0) {
    box.className =
      "rounded-xl bg-amber-500/20 px-3 py-2 text-xs font-bold text-amber-300";

    box.innerHTML = `Eksik: ${formatMoney(remaining)}`;
  } else {
    box.className =
      "rounded-xl bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300";

    box.innerHTML = `Fazla: ${formatMoney(Math.abs(remaining))}`;
  }
}

function setFullPayment(type) {
  const total = currentFormTotal();

  state.form.paymentCash = "";
  state.form.paymentCard = "";
  state.form.paymentTransfer = "";

  if (type === "cash") {
    state.form.paymentCash = total;
  }

  if (type === "card") {
    state.form.paymentCard = total;
  }

  if (type === "transfer") {
    state.form.paymentTransfer = total;
  }

  render();

  setTimeout(() => {
    updatePaymentRemaining();
  }, 50);
}
      function repaint(signatureData = state.form[config.formKey]) {
        const rect = canvas.getBoundingClientRect();
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.fillStyle = "#09090b";
        ctx.fillRect(0, 0, rect.width, rect.height);

        if (signatureData) {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
          };
          img.src = signatureData;
        }
      }

      const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const point = e.touches ? e.touches[0] : e;
        return {
          x: point.clientX - rect.left,
          y: point.clientY - rect.top
        };
      };

      const startDraw = (e) => {
        if (e.cancelable) e.preventDefault();
        drawing = true;
        const { x, y } = getPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#ffffff";
      };

      const moveDraw = (e) => {
        if (!drawing) return;
        if (e.cancelable) e.preventDefault();
        const { x, y } = getPos(e);
        ctx.lineTo(x, y);
        ctx.stroke();
      };

      const endDraw = () => {
        if (!drawing) return;
        drawing = false;
        state.form[config.formKey] = canvas.toDataURL("image/png");
      };

      resizeCanvas(true);

      if (!canvas.dataset.bound) {
        canvas.onmousedown = startDraw;
        canvas.onmousemove = moveDraw;
        canvas.onmouseup = endDraw;
        canvas.onmouseleave = endDraw;

        canvas.ontouchstart = startDraw;
        canvas.ontouchmove = moveDraw;
        canvas.ontouchend = endDraw;

        canvas.dataset.bound = "1";

        document.getElementById(config.clearButtonId)?.addEventListener("click", () => {
          state.form[config.formKey] = "";
          repaint("");
        });

        window.addEventListener("resize", () => {
          resizeCanvas(true);
        });

        window.addEventListener("orientationchange", () => {
          setTimeout(() => resizeCanvas(true), 250);
        });
      }
    }

    function setupSignaturePad() {
      setupSignatureCanvas({
        canvasId: "signaturePad",
        clearButtonId: "clearSignature",
        formKey: "signature"
      });

      setupSignatureCanvas({
        canvasId: "technicianSignaturePad",
        clearButtonId: "clearTechnicianSignature",
        formKey: "technicianSignature"
      });

      signatureHandlersBound = true;
    }
    // Migration test: service worker kayıt etmiyoruz; zombi cache riskini kapatıyoruz.
    const aracVerileri = {
  "Alfa Romeo": {
    "145/146": ["Hatchback"],
    "147": ["Hatchback"],
    "156": ["Sedan", "Stationwagon"],
    "159": ["Sedan", "Stationwagon"],
    "166": ["Sedan"],
    "Brera / Spider": ["Coupe", "Cabrio"],
    "Giulia": ["Sedan"],
    "Giulietta": ["Hatchback"],
    "GT": ["Coupe"],
    "Junior": ["Crossover"],
    "MiTo": ["Hatchback"],
    "Stelvio": ["SUV"],
    "Tonale": ["SUV"]
  },
  "Audi": {
    "100 / A6": ["Sedan", "Stationwagon"],
    "80/90": ["Sedan", "Stationwagon", "Coupe"],
    "A1": ["Hatchback"],
    "A1 Sportback": ["Hatchback"],
    "A3": ["Hatchback"],
    "A3 Sedan": ["Sedan"],
    "A3 Sportback": ["Hatchback"],
    "A4": ["Sedan", "Stationwagon", "Cabrio"],
    "A5": ["Coupe", "Cabrio", "Hatchback"],
    "A6": ["Sedan", "Stationwagon"],
    "A7 Sportback": ["Hatchback"],
    "A8": ["Sedan"],
    "e-tron / Q8 e-tron": ["SUV"],
    "e-tron GT": ["Elektrikli"],
    "e-tron Sportback / Q8 Sportback e-tron": ["SUV", "Coupe"],
    "Q2": ["SUV"],
    "Q3": ["SUV", "Coupe"],
    "Q4 e-tron": ["SUV"],
    "Q4 Sportback e-tron": ["SUV", "Coupe"],
    "Q5": ["SUV", "Coupe"],
    "Q6 e-tron": ["SUV"],
    "Q6 Sportback e-tron": ["SUV", "Coupe"],
    "Q7": ["SUV"],
    "Q8": ["SUV", "Coupe"],
    "SQ2": ["SUV"],
    "SQ5": ["SUV", "Coupe"],
    "TT": ["Coupe", "Roadster"],
    "TTS / TT RS": ["Coupe", "Roadster"]
  },
  "BMW": {
    "1 Serisi": ["Hatchback"],
    "2 Active Tourer": ["MPV"],
    "2 Gran Coupe": ["Sedan"],
    "2 Serisi Coupe/Cabrio": ["Coupe", "Cabrio"],
    "3 Serisi": ["Sedan", "Stationwagon"],
    "4 Serisi": ["Coupe", "Cabrio", "Hatchback"],
    "5 Serisi": ["Sedan", "Stationwagon"],
    "6 Serisi GT": ["Hatchback"],
    "7 Serisi": ["Sedan"],
    "i3": ["Hatchback"],
    "i4": ["Elektrikli Sedan"],
    "i5": ["Elektrikli Sedan", "Elektrikli Stationwagon"],
    "i7": ["Elektrikli Sedan"],
    "iX": ["Elektrikli SUV"],
    "iX1": ["Elektrikli SUV"],
    "iX2": ["Elektrikli SUV", "Elektrikli Coupe"],
    "iX3": ["Elektrikli SUV"],
    "X1": ["SUV"],
    "X2": ["SUV", "Coupe"],
    "X3": ["SUV"],
    "X4": ["SUV", "Coupe"],
    "X5": ["SUV"],
    "X6": ["SUV", "Coupe"],
    "X7": ["SUV"],
    "Z4": ["Roadster"]
  },
  "BYD": {
    "Atto 3": ["Elektrikli SUV"],
    "Dolphin": ["Elektrikli Hatchback"],
    "Han": ["Elektrikli Sedan"],
    "Seal": ["Elektrikli Sedan"],
    "Seal U": ["SUV"],
    "Seal U DM-i": ["SUV"],
    "Tang": ["Elektrikli SUV"]
  },
  "Chery": {
    "Omoda 5": ["SUV"],
    "Tiggo 7 Pro": ["SUV"],
    "Tiggo 8 Pro": ["SUV"]
  },
  "Chevrolet": {
    "Aveo": ["Sedan", "Hatchback"],
    "Camaro": ["Coupe", "Cabrio"],
    "Captiva": ["SUV"],
    "Corvette": ["Coupe", "Cabrio"],
    "Cruze": ["Sedan", "Hatchback", "Stationwagon"],
    "Epica": ["Sedan"],
    "Kalos": ["Sedan", "Hatchback"],
    "Lacetti": ["Sedan", "Hatchback", "Stationwagon"],
    "Malibu": ["Sedan"],
    "Orlando": ["MPV"],
    "Spark": ["Hatchback"],
    "Trax": ["SUV"]
  },
  "Citroen": {
    "AMI": ["Elektrikli Hatchback"],
    "Berlingo": ["Panelvan", "MPV"],
    "C-Elysee": ["Sedan"],
    "C1": ["Hatchback"],
    "C2": ["Hatchback"],
    "C3": ["Hatchback", "SUV"],
    "C3 Aircross": ["SUV"],
    "C4": ["Hatchback", "SUV"],
    "C4 Cactus": ["Crossover"],
    "C4 X": ["Sedan"],
    "C5": ["Sedan", "Stationwagon"],
    "C5 Aircross": ["SUV"],
    "C5 X": ["Stationwagon", "Crossover"],
    "C8": ["MPV"],
    "Jumpy / Spacetourer": ["Panelvan", "MPV"]
  },
  "Cupra": {
    "Ateca": ["SUV"],
    "Born": ["Elektrikli Hatchback"],
    "Formentor": ["SUV", "Coupe"],
    "Leon": ["Hatchback", "Stationwagon"],
    "Tavascan": ["Elektrikli SUV", "Elektrikli Coupe"],
    "Terramar": ["SUV"]
  },
  "Dacia": {
    "Bigster": ["SUV"],
    "Dokker": ["Panelvan", "MPV"],
    "Duster": ["SUV"],
    "Jogger": ["Stationwagon", "MPV"],
    "Lodgy": ["MPV"],
    "Logan": ["Sedan", "Stationwagon"],
    "Sandero": ["Hatchback"],
    "Sandero Stepway": ["Hatchback"]
  },
  "DFSK": {
    "E5": ["SUV"],
    "F5": ["SUV", "Coupe"],
    "Glory 580": ["SUV"],
    "Seres 3": ["Elektrikli SUV"]
  },
  "Fiat": {
    "124 Spider": ["Roadster"],
    "500": ["Hatchback", "Elektrikli Hatchback"],
    "500L": ["MPV"],
    "500X": ["SUV"],
    "Albea": ["Sedan"],
    "Brava / Bravo": ["Hatchback"],
    "Coupe": ["Coupe"],
    "Doblo": ["Panelvan", "MPV"],
    "Ducato": ["Panelvan", "Minibüs"],
    "Egea": ["Sedan", "Hatchback", "Stationwagon", "Crossover"],
    "Fiorino / Qubo": ["Panelvan", "MPV"],
    "Freemont": ["SUV"],
    "Grande Punto / Punto Evo / Punto": ["Hatchback"],
    "Linea": ["Sedan"],
    "Marea": ["Sedan", "Stationwagon"],
    "Multipla": ["MPV"],
    "Palio / Siena / Albea": ["Hatchback", "Sedan"],
    "Panda": ["Hatchback"],
    "Scudo / Ulysse": ["Panelvan", "MPV"],
    "Stilo": ["Hatchback", "Sedan", "Stationwagon"],
    "Tempra / Tipo": ["Sedan", "Hatchback", "Stationwagon"],
    "Tipo": ["Hatchback", "Sedan", "Stationwagon"]
  },
  "Ford": {
    "B-Max": ["MPV"],
    "C-Max / Grand C-Max": ["MPV"],
    "Courier": ["Panelvan", "MPV"],
    "EcoSport": ["SUV"],
    "Edge": ["SUV"],
    "Explorer EV": ["Elektrikli SUV"],
    "Fiesta": ["Hatchback"],
    "Focus": ["Hatchback", "Sedan", "Stationwagon"],
    "Fusion": ["Hatchback"],
    "Galaxy": ["MPV"],
    "Ka / Ka+": ["Hatchback", "Sedan"],
    "Kuga": ["SUV"],
    "Mondeo": ["Sedan", "Hatchback", "Stationwagon"],
    "Mustang": ["Coupe", "Cabrio"],
    "Mustang Mach-E": ["Elektrikli SUV"],
    "Puma": ["SUV"],
    "Ranger": ["Pickup"],
    "S-Max": ["MPV"],
    "Tourneo Connect / Grand Tourneo Connect": ["MPV"],
    "Tourneo Courier": ["MPV"],
    "Tourneo Custom": ["Minibüs"],
    "Transit / Transit Custom": ["Panelvan", "Minibüs"],
    "Transit Connect": ["Panelvan", "MPV"]
  },
  "Honda": {
    "Accord": ["Sedan", "Coupe"],
    "City": ["Sedan"],
    "Civic": ["Sedan", "Hatchback"],
    "CR-V": ["SUV"],
    "CR-Z": ["Coupe", "Hatchback"],
    "e:Ny1": ["Elektrikli SUV"],
    "HR-V": ["SUV"],
    "Insight": ["Sedan"],
    "Jazz": ["Hatchback", "MPV"],
    "Prelude": ["Coupe"],
    "S2000": ["Roadster"]
  },
  "Hyundai": {
    "Accent / Accent Admire": ["Sedan", "Hatchback"],
    "Accent Blue": ["Sedan"],
    "Accent Era": ["Sedan"],
    "Atos": ["Hatchback"],
    "Bayon": ["Crossover"],
    "Coupe": ["Coupe"],
    "Elantra": ["Sedan"],
    "Getz": ["Hatchback"],
    "i10": ["Hatchback"],
    "i20": ["Hatchback"],
    "i20 Active": ["Crossover"],
    "i30": ["Hatchback", "Stationwagon", "Fastback"],
    "Ioniq": ["Hatchback"],
    "Ioniq 5": ["Elektrikli Crossover"],
    "Ioniq 6": ["Elektrikli Sedan"],
    "ix20": ["MPV"],
    "ix35": ["SUV"],
    "Kona": ["SUV", "Elektrikli SUV"],
    "Matrix": ["MPV"],
    "Santa Fe": ["SUV"],
    "Sonata": ["Sedan"],
    "Staria": ["Minibüs"],
    "Terracan": ["SUV"],
    "Tucson": ["SUV"],
    "Veloster": ["Coupe", "Hatchback"]
  },
      "Jaeco": {
        "Jaecoo J7": ["SUV"]
      },
  "Jaguar": {
    "E-Pace": ["SUV"],
    "F-Pace": ["SUV"],
    "F-Type": ["Coupe", "Cabrio"],
    "I-Pace": ["Elektrikli SUV"],
    "S-Type": ["Sedan"],
    "XE": ["Sedan"],
    "XF": ["Sedan", "Stationwagon"],
    "XJ": ["Sedan"],
    "XK": ["Coupe", "Cabrio"]
  },
  "Jeep": {
    "Avenger": ["SUV", "Elektrikli SUV"],
    "Cherokee": ["SUV"],
    "Compass": ["SUV"],
    "Gladiator": ["Pickup"],
    "Grand Cherokee": ["SUV"],
    "Patriot": ["SUV"],
    "Renegade": ["SUV"],
    "Wrangler": ["SUV"]
  },
  "Kia": {
    "Bongo": ["Pickup"],
    "Carens": ["MPV"],
    "Carnival": ["Minibüs"],
    "Ceed": ["Hatchback", "Stationwagon"],
    "Cerato": ["Sedan", "Hatchback"],
    "EV3": ["Elektrikli SUV"],
    "EV6": ["Elektrikli Crossover"],
    "Niro": ["SUV", "Elektrikli SUV"],
    "Optima": ["Sedan", "Stationwagon"],
    "Picanto": ["Hatchback"],
    "Proceed": ["Hatchback", "Stationwagon"],
    "Rio": ["Sedan", "Hatchback"],
    "Sorento": ["SUV"],
    "Soul": ["SUV", "Elektrikli SUV"],
    "Sportage": ["SUV"],
    "Stinger": ["Sedan", "Hatchback"],
    "Venga": ["MPV"],
    "XCeed": ["Crossover"]
  },
  "Land Rover": {
    "Defender": ["SUV"],
    "Discovery": ["SUV"],
    "Discovery Sport": ["SUV"],
    "Freelander": ["SUV"],
    "Range Rover": ["SUV"],
    "Range Rover Evoque": ["SUV", "Cabrio"],
    "Range Rover Sport": ["SUV"],
    "Range Rover Velar": ["SUV"]
  },
  "Lexus": {
    "CT": ["Hatchback"],
    "ES": ["Sedan"],
    "GS": ["Sedan"],
    "IS": ["Sedan"],
    "LBX": ["SUV"],
    "LC": ["Coupe", "Cabrio"],
    "LS": ["Sedan"],
    "NX": ["SUV"],
    "RC": ["Coupe"],
    "RX": ["SUV"],
    "RZ": ["Elektrikli SUV"],
    "UX": ["SUV", "Elektrikli SUV"]
  },
  "Mazda": {
    "2": ["Hatchback", "Sedan"],
    "3": ["Hatchback", "Sedan"],
    "5": ["MPV"],
    "6": ["Sedan", "Stationwagon"],
    "BT-50": ["Pickup"],
    "CX-3": ["SUV"],
    "CX-30": ["SUV"],
    "CX-5": ["SUV"],
    "CX-60": ["SUV"],
    "CX-80": ["SUV"],
    "MX-30": ["Elektrikli SUV"],
    "MX-5": ["Roadster", "Coupe"]
  },
  "Mercedes-Benz": {
    "A-Serisi (W168)": ["Hatchback", "MPV"],
    "A-Serisi (W169)": ["Hatchback", "MPV"],
    "A-Serisi (W176)": ["Hatchback"],
    "A-Serisi Hatchback (W177)": ["Hatchback"],
    "A-Serisi Sedan (V177)": ["Sedan"],
    "B-Serisi (T245/W245)": ["MPV"],
    "B-Serisi (W246)": ["MPV"],
    "B-Serisi (W247)": ["MPV"],
    "Citan (W415)": ["Panelvan", "MPV"],
    "Citan (W420)": ["Panelvan", "MPV"],
    "CLA (C117)": ["Coupe", "Sedan"],
    "CLA Coupe (C118)": ["Coupe", "Sedan"],
    "CLA Shooting Brake (X117)": ["Stationwagon"],
    "CLA Shooting Brake (X118)": ["Stationwagon"],
    "CLS (C218)": ["Coupe", "Sedan"],
    "CLS (C219)": ["Coupe", "Sedan"],
    "CLS (C257)": ["Coupe", "Sedan"],
    "C-Serisi Cabriolet (A205)": ["Cabrio"],
    "C-Serisi Coupe (C204)": ["Coupe"],
    "C-Serisi Coupe (C205)": ["Coupe"],
    "C-Serisi Sedan (W202)": ["Sedan"],
    "C-Serisi Sedan (W203)": ["Sedan"],
    "C-Serisi Sedan (W204)": ["Sedan"],
    "C-Serisi Sedan (W205)": ["Sedan"],
    "C-Serisi Sedan (W206)": ["Sedan"],
    "C-Serisi SportCoupe (CL203)": ["Coupe", "Hatchback"],
    "C-Serisi Station (S203)": ["Stationwagon"],
    "C-Serisi Station (S204)": ["Stationwagon"],
    "C-Serisi Station (S205)": ["Stationwagon"],
    "C-Serisi Station (S206)": ["Stationwagon"],
    "EQA (H243)": ["Elektrikli SUV"],
    "EQB (X243)": ["Elektrikli SUV"],
    "EQC (N293)": ["Elektrikli SUV"],
    "EQE (V295)": ["Elektrikli Sedan"],
    "EQE SUV (X294)": ["Elektrikli SUV"],
    "EQS (V297)": ["Elektrikli Sedan"],
    "EQS SUV (X296)": ["Elektrikli SUV"],
    "E-Serisi Cabriolet (A207)": ["Cabrio"],
    "E-Serisi Cabriolet (A238)": ["Cabrio"],
    "E-Serisi Coupe (C207)": ["Coupe"],
    "E-Serisi Coupe (C238)": ["Coupe"],
    "E-Serisi Sedan (W123)": ["Sedan"],
    "E-Serisi Sedan (W124)": ["Sedan"],
    "E-Serisi Sedan (W210)": ["Sedan"],
    "E-Serisi Sedan (W211)": ["Sedan"],
    "E-Serisi Sedan (W212)": ["Sedan"],
    "E-Serisi Sedan (W213)": ["Sedan"],
    "E-Serisi Sedan (W214)": ["Sedan"],
    "E-Serisi Station (S123)": ["Stationwagon"],
    "E-Serisi Station (S124)": ["Stationwagon"],
    "E-Serisi Station (S210)": ["Stationwagon"],
    "E-Serisi Station (S211)": ["Stationwagon"],
    "E-Serisi Station (S212)": ["Stationwagon"],
    "E-Serisi Station (S213)": ["Stationwagon"],
    "E-Serisi Station (S214)": ["Stationwagon"],
    "G-Serisi / G-Wagon (W460/W461/W463)": ["SUV"],
    "GLA (H247/X156)": ["SUV"],
    "GLB (X247)": ["SUV"],
    "GLC Coupe (C253/C254)": ["SUV", "Coupe"],
    "GLC SUV (X253/X254)": ["SUV"],
    "GLE Coupe (C167)": ["SUV", "Coupe"],
    "GLE SUV (V167/W166)": ["SUV"],
    "GLK (X204)": ["SUV"],
    "GLS (X166/X167)": ["SUV"],
    "M-Serisi / ML (W163/W164/W166)": ["SUV"],
    "SL (R107/R129/R230/R231/R232)": ["Roadster"],
    "SLC / SLK (R170/R171/R172)": ["Roadster"],
    "S-Serisi Coupe/Cabriolet (A217/C217)": ["Cabrio", "Coupe"],
    "S-Serisi Sedan (W116/W126/W140/W220/W221/W222/W223)": ["Sedan"],
    "T-Serisi (W420)": ["MPV"],
    "V-Serisi / Vito / Marco Polo (W447/W448/W638/W639)": ["Panelvan", "MPV", "Minibüs"],
    "X-Serisi (W470)": ["Pickup"]
  },
  "MG": {
    "Cyberster": ["Roadster"],
    "HS": ["SUV"],
    "Marvel R": ["Elektrikli SUV"],
    "MG4": ["Elektrikli Hatchback"],
    "MG7": ["Sedan"],
    "ZS": ["SUV", "Elektrikli SUV"]
  },
  "Mini": {
    "Clubman": ["Stationwagon"],
    "Convertible": ["Cabrio"],
    "Countryman": ["SUV"],
    "Coupe/Roadster": ["Coupe", "Roadster"],
    "Hatch": ["Hatchback"],
    "Paceman": ["SUV", "Coupe"]
  },
  "Mitsubishi": {
    "ASX": ["SUV"],
    "Attrage / Space Star Sedan": ["Sedan"],
    "Carisma": ["Sedan", "Hatchback"],
    "Colt": ["Hatchback", "Cabrio"],
    "Eclipse Cross": ["SUV"],
    "Galant": ["Sedan"],
    "Grandis": ["MPV"],
    "L200": ["Pickup"],
    "Lancer": ["Sedan", "Hatchback", "Stationwagon"],
    "Outlander": ["SUV"],
    "Pajero": ["SUV"],
    "Space Star": ["Hatchback"]
  },
  "Nissan": {
    "350Z / 370Z": ["Coupe", "Roadster"],
    "Almera": ["Sedan", "Hatchback"],
    "Cabstar": ["Pickup"],
    "GT-R": ["Coupe"],
    "Juke": ["SUV", "Coupe"],
    "Leaf": ["Elektrikli Hatchback"],
    "Micra": ["Hatchback"],
    "Navara": ["Pickup"],
    "Note": ["Hatchback", "MPV"],
    "Pathfinder": ["SUV"],
    "Patrol": ["SUV"],
    "Primera": ["Sedan", "Hatchback", "Stationwagon"],
    "Pulsar": ["Hatchback"],
    "Qashqai": ["SUV"],
    "Townstar": ["Panelvan", "MPV"],
    "X-Trail": ["SUV"]
  },
  "Opel": {
    "Adam": ["Hatchback"],
    "Agila": ["Hatchback", "MPV"],
    "Astra": ["Hatchback", "Sedan", "Stationwagon", "Coupe", "Cabrio"],
    "Calibra": ["Coupe"],
    "Combo": ["Panelvan", "MPV"],
    "Corsa": ["Hatchback", "Sedan"],
    "Crossland": ["SUV"],
    "Frontera": ["SUV"],
    "Grandland": ["SUV"],
    "Insignia": ["Sedan", "Stationwagon", "Hatchback"],
    "Manta": ["Coupe"],
    "Meriva": ["MPV"],
    "Mokka": ["SUV", "Elektrikli SUV"],
    "Omega": ["Sedan", "Stationwagon"],
    "Signum": ["Hatchback"],
    "Tigra / Tigra TwinTop": ["Coupe", "Cabrio"],
    "Vectra": ["Sedan", "Hatchback", "Stationwagon"],
    "Vivaro / Zafira Life": ["Panelvan", "Minibüs"],
    "Zafira": ["MPV"]
  },
  "Peugeot": {
    "106": ["Hatchback"],
    "107/108": ["Hatchback"],
    "205": ["Hatchback", "Cabrio"],
    "206": ["Hatchback", "Sedan", "Stationwagon", "Cabrio"],
    "207": ["Hatchback", "Stationwagon", "Cabrio"],
    "208": ["Hatchback", "Elektrikli Hatchback"],
    "3008": ["SUV"],
    "301": ["Sedan"],
    "306": ["Hatchback", "Sedan", "Cabrio", "Stationwagon"],
    "307": ["Hatchback", "Sedan", "Stationwagon", "Cabrio"],
    "308": ["Hatchback", "Stationwagon"],
    "406": ["Sedan", "Stationwagon", "Coupe"],
    "407": ["Sedan", "Stationwagon", "Coupe"],
    "408": ["SUV", "Coupe"],
    "5008": ["SUV", "MPV"],
    "508": ["Sedan", "Stationwagon"],
    "2008": ["SUV"],
    "206+": ["Hatchback"],
    "208 GTi": ["Hatchback"],
    "3008 Hybrid4": ["SUV"],
    "306 Cabriolet": ["Cabrio"],
    "Boxer": ["Panelvan", "Minibüs"],
    "Expert / Traveller": ["Panelvan", "Minibüs"],
    "Partner / Rifter": ["Panelvan", "MPV"],
    "RCZ": ["Coupe"]
  },
  "Porsche": {
    "718 Boxster": ["Roadster"],
    "718 Cayman": ["Coupe"],
    "911": ["Coupe", "Cabrio"],
    "Cayenne": ["SUV", "Coupe"],
    "Macan": ["SUV", "Elektrikli SUV"],
    "Panamera": ["Sedan", "Stationwagon"],
    "Taycan": ["Elektrikli Sedan", "Elektrikli Stationwagon"]
  },
  "Renault": {
    "Captur": ["SUV"],
    "Clio": ["Hatchback"],
    "Clio Grandtour": ["Stationwagon"],
    "Espace": ["MPV", "SUV"],
    "Express": ["Panelvan", "MPV"],
    "Fluence": ["Sedan"],
    "Kadjar": ["SUV"],
    "Kangoo": ["Panelvan", "MPV"],
    "Koleos": ["SUV"],
    "Laguna": ["Sedan", "Hatchback", "Stationwagon", "Coupe"],
    "Latitude": ["Sedan"],
    "Megane": ["Hatchback", "Sedan", "Stationwagon", "Coupe", "Cabrio"],
    "Modus / Grand Modus": ["MPV"],
    "Rafale": ["SUV", "Coupe"],
    "R19 / Europa": ["Sedan", "Hatchback", "Cabrio"],
    "R21": ["Sedan", "Stationwagon", "Hatchback"],
    "R25 / Safrane / Vel Satis": ["Sedan", "Hatchback"],
    "Scenic / Grand Scenic": ["MPV"],
    "Symbol / Thalia": ["Sedan"],
    "Talisman": ["Sedan", "Stationwagon"],
    "Twingo": ["Hatchback"],
    "Twizy": ["Elektrikli Hatchback"],
    "Wind": ["Roadster"],
    "Zoe": ["Elektrikli Hatchback"],
    "Austral": ["SUV"],
    "Arkana": ["SUV", "Coupe"],
    "Megane E-Tech": ["Elektrikli Hatchback"],
    "Duster": ["SUV"]
  },
  "Seat": {
    "Alhambra": ["MPV"],
    "Arona": ["SUV"],
    "Ateca": ["SUV"],
    "Cordoba": ["Sedan", "Stationwagon"],
    "Exeo": ["Sedan", "Stationwagon"],
    "Ibiza": ["Hatchback", "Stationwagon"],
    "Leon": ["Hatchback", "Stationwagon"],
    "Mii": ["Hatchback"],
    "Toledo": ["Sedan", "Hatchback"],
    "Tarraco": ["SUV"]
  },
  "Skoda": {
    "Citigo": ["Hatchback"],
    "Enyaq": ["Elektrikli SUV", "Elektrikli Coupe"],
    "Fabia": ["Hatchback", "Stationwagon"],
    "Favorit / Felicia": ["Hatchback", "Stationwagon", "Pickup"],
    "Kamiq": ["SUV"],
    "Karoq": ["SUV"],
    "Kodiaq": ["SUV"],
    "Octavia": ["Sedan", "Stationwagon", "Hatchback"],
    "Rapid / Spaceback": ["Sedan", "Hatchback"],
    "Roomster": ["MPV"],
    "Scala": ["Hatchback"],
    "Superb": ["Sedan", "Stationwagon"],
    "Yeti": ["SUV"]
  },
  "Ssangyong": {
    "Actyon": ["Suv"],
    "Actyon Sport": ["Pick Up"],
    "Korando": ["Suv"],
    "Korando Sport": ["Pick Up"],
    "Kyron": ["Suv"],
    "Musso Ev": ["Pick Up"],
    "Musso Grand": ["Pick Up"],
    "Tivoli": ["Suv"],
    "Torres": ["Suv"],
    "Torres Elektrikli": ["Suv"],
  },
  
  "Subaru": {
    "BRZ": ["Coupe"],
    "Forester": ["SUV"],
    "Impreza": ["Sedan", "Hatchback", "Stationwagon"],
    "Legacy": ["Sedan", "Stationwagon"],
    "Levorg": ["Stationwagon"],
    "Outback": ["Stationwagon", "SUV"],
    "Solterra": ["Elektrikli SUV"],
    "Tribeca / B9 Tribeca": ["SUV"],
    "WRX / STI": ["Sedan", "Hatchback"]
  },
  "Suzuki": {
    "Across": ["SUV"],
    "Alto": ["Hatchback"],
    "Baleno": ["Hatchback"],
    "Grand Vitara": ["SUV"],
    "Ignis": ["Hatchback", "SUV"],
    "Jimny": ["SUV"],
    "Kizashi": ["Sedan"],
    "S-Cross": ["SUV"],
    "Splash": ["Hatchback", "MPV"],
    "Swift": ["Hatchback"],
    "SX4 / SX4 S-Cross": ["Sedan", "Hatchback", "SUV"],
    "Vitara": ["SUV"],
    "Wagon R+": ["Hatchback", "MPV"]
  },
  "Tesla": {
    "Model 3": ["Elektrikli Sedan"],
    "Model S": ["Elektrikli Sedan"],
    "Model X": ["Elektrikli SUV"],
    "Model Y": ["Elektrikli SUV"]
  },
  "Togg": {
    "T10F": ["Elektrikli Sedan"],
    "T10X": ["Elektrikli SUV"]
  },
  "Toyota": {
    "Auris": ["Hatchback", "Stationwagon"],
    "Avensis": ["Sedan", "Stationwagon"],
    "Aygo": ["Hatchback"],
    "bZ4X": ["Elektrikli SUV"],
    "C-HR": ["SUV"],
    "Camry": ["Sedan"],
    "Celica": ["Coupe"],
    "Corolla": ["Sedan", "Hatchback", "Stationwagon"],
    "Corolla Cross": ["SUV"],
    "GT86": ["Coupe"],
    "Hilux": ["Pickup"],
    "Land Cruiser": ["SUV"],
    "Prius": ["Hatchback", "Sedan"],
    "Proace / Proace City": ["Panelvan", "MPV"],
    "RAV4": ["SUV"],
    "Urban Cruiser": ["SUV"],
    "Verso": ["MPV"],
    "Yaris": ["Hatchback"],
    "Yaris Cross": ["SUV"]
  },
  "Volkswagen": {
    "Amarok": ["Pickup"],
    "Arteon": ["Sedan", "Stationwagon"],
    "Beetle / New Beetle": ["Hatchback", "Cabrio"],
    "Bora": ["Sedan", "Stationwagon"],
    "Caddy": ["Panelvan", "MPV"],
    "CC": ["Sedan", "Coupe"],
    "Crafter": ["Panelvan", "Minibüs"],
    "Golf": ["Hatchback", "Stationwagon", "Cabrio"],
    "ID.3": ["Elektrikli Hatchback"],
    "ID.4": ["Elektrikli SUV"],
    "ID.5": ["Elektrikli SUV", "Elektrikli Coupe"],
    "Jetta": ["Sedan"],
    "Passat": ["Sedan", "Stationwagon"],
    "Polo": ["Hatchback"],
    "Scirocco": ["Coupe"],
    "Sharan": ["MPV"],
    "T-Cross": ["SUV"],
    "Tiguan": ["SUV"],
    "Touareg": ["SUV"],
    "Touran": ["MPV"],
    "Transporter / Caravelle / Multivan": ["Panelvan", "Minibüs"],
    "up!": ["Hatchback"],
    "Vento": ["Sedan"]
  },
  "Volvo": {
    "C30": ["Hatchback"],
    "C40 Recharge": ["Elektrikli SUV", "Elektrikli Coupe"],
    "C70": ["Coupe", "Cabrio"],
    "S40": ["Sedan"],
    "S60": ["Sedan"],
    "S80": ["Sedan"],
    "S90": ["Sedan"],
    "V40": ["Hatchback"],
    "V50": ["Stationwagon"],
    "V60": ["Stationwagon"],
    "V90": ["Stationwagon"],
    "XC40": ["SUV", "Elektrikli SUV"],
    "XC60": ["SUV"],
    "XC90": ["SUV"],
    "EX30": ["Elektrikli SUV"],
    "EX40": ["Elektrikli SUV"],
    "EC40": ["Elektrikli SUV", "Elektrikli Coupe"]
  }
};

    window.addEventListener("message", (event) => {
      if (event.origin !== window.location.origin || event.data?.type !== "kasaflow:set-tab") return;
      const allowedTabs = new Set(["hizliKayit", "kayit", "liste", "gunSonu", "siparis", "garanti", "kontrol"]);
      const nextTab = String(event.data.tab || "");
      if (!allowedTabs.has(nextTab)) return;
      state.activeTab = nextTab;
      state.selectedId = null;
      render();
    });

    (async function init() {
      if (!migrationToken()) {
        if (window.parent && window.parent !== window) window.parent.postMessage({ type: "garageflow:auth-required", module: "arac-kabul" }, window.location.origin);
        else window.location.replace("/#hizli-kayit");
        return;
      }
      try {
        await apiFetch("/api/auth/me");
        state.searchDraft = state.search;
        await listeyiYenile();
        await reloadDailyReportData(state.selectedDate);
        if (KASAFLOW_EMBED && window.parent && window.parent !== window) window.parent.postMessage({ type: "kasaflow:ready", module: "arac-kabul" }, window.location.origin);
      } catch (err) {
        console.error("KasaFlow modül oturumu açılamadı:", err);
        if (window.parent && window.parent !== window) window.parent.postMessage({ type: "garageflow:auth-required", module: "arac-kabul" }, window.location.origin);
      }
    })();

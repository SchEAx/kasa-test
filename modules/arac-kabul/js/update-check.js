const APP_VERSION_KEY = "garage_app_version";

async function checkForUpdate() {
  try {
    const res = await fetch("./version.json?ts=" + Date.now(), {
      cache: "no-store"
    });

    const data = await res.json();
    const latestVersion = data.version;
    const currentVersion = localStorage.getItem(APP_VERSION_KEY);

    if (!currentVersion) {
      localStorage.setItem(APP_VERSION_KEY, latestVersion);
      return;
    }

    if (currentVersion !== latestVersion) {
      showUpdateButton(latestVersion);
    }
  } catch (err) {
    console.log("Güncelleme kontrol hatası:", err);
  }
}

function showUpdateButton(latestVersion) {
  if (document.getElementById("updateBox")) return;

  const box = document.createElement("div");
  box.id = "updateBox";
  box.innerHTML = `
    <div style="
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 12px;
      z-index: 999999;
      background: #111827;
      color: white;
      padding: 14px;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35);
      font-family: Arial, sans-serif;
      display: flex;
      gap: 10px;
      align-items: center;
      justify-content: space-between;
    ">
      <div style="font-size:14px;">
        Yeni güncelleme var.
      </div>
      <button onclick="applyUpdate('${latestVersion}')" style="
        background: #22c55e;
        color: white;
        border: 0;
        border-radius: 12px;
        padding: 10px 14px;
        font-weight: bold;
      ">
        Güncelle
      </button>
    </div>
  `;

  document.body.appendChild(box);
}

async function applyUpdate(latestVersion) {
  try {
    localStorage.setItem(APP_VERSION_KEY, latestVersion);

    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }

    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(reg => reg.update()));
    }

    location.reload(true);
  } catch (err) {
    console.log("Güncelleme uygulanamadı:", err);
    location.reload();
  }
}

window.addEventListener("load", checkForUpdate);
window.addEventListener("load", () => {
  showOfflineQueueBadge();
  setTimeout(processOfflineRecordQueue, 1500);
});
window.addEventListener("online", () => {
  showOfflineQueueBadge();
  processOfflineRecordQueue();
});
window.addEventListener("offline", () => {
  showOfflineQueueBadge();
  if (typeof showToast === "function") {
    showToast("İnternet bağlantısı yok. Yeni kayıtlar cihazda bekletilecek.", true);
  }
});

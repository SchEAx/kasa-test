const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwaItn84REjMJIX3KI6mjg6aGwj90FOUbTwefTCbTCFFVrBlHqmU5MwyTcWebGZuG4O/exec";

async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    let data = "";

    req.on("data", chunk => {
      data += chunk;
    });

    req.on("end", () => {
      resolve(data || "");
    });

    req.on("error", err => {
      reject(err);
    });
  });
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const url = new URL(APPS_SCRIPT_URL);
      const query = req.query || {};

      Object.keys(query).forEach((key) => {
        const value = query[key];
        if (Array.isArray(value)) {
          value.forEach(v => url.searchParams.append(key, v));
        } else if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      });

      const gsRes = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store"
      });

      const text = await gsRes.text();

      res.status(gsRes.status || 200);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(text);
    }

    if (req.method === "POST") {
      const rawBody = await readRawBody(req);

      const gsRes = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: rawBody || "{}"
      });

      const text = await gsRes.text();

      res.status(gsRes.status || 200);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return res.send(text);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Sunucu hatası"
    });
  }
}

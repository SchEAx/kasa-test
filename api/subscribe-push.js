import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  try {
    const subscription = req.body;

    if (!subscription?.endpoint) {
      return res.status(400).json({ ok: false });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({
        endpoint: subscription.endpoint,
        subscription
      }, {
        onConflict: "endpoint"
      });

    if (error) throw error;

    return res.json({ ok: true });

  } catch (err) {
    return res.status(500).json({ ok: false, message: err.message });
  }
}

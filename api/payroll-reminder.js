export default async function handler(req, res) {
  return res.status(410).json({
    ok: false,
    migrated: true,
    message: "Eski Supabase payroll cron v2.3.5 ile devre dışı bırakıldı. Maaş verileri artık Garage İstanbul PostgreSQL/JWT API üzerinden çalışıyor."
  });
}

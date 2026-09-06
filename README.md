# KasaFlow V1.1.1

Garage İstanbul kasa kullanımı için ayrı hazırlanan web uygulaması.

## Bölümler

- Hızlı Kayıt
- Kayıtlar
- Gün Sonu
- Sipariş
- Garanti
- Avans & Maaş
- Ayarlar / tema seçimi

## Personel ve modüler sekme izinleri

Admin hesabı, **Ayarlar > Personel ve Sekme Yetkileri** alanından yeni kullanıcı oluşturabilir. Ad, kullanıcı adı, rol ve ilk giriş şifresi aynı ekrandan kaydedilir; yeni hesap hem Supabase Auth'a hem `app_users` tablosuna birlikte yazılır.

Her personele Hızlı Kayıt, Kayıtlar, Gün Sonu, Sipariş, Garanti, Avans & Maaş ve Ayarlar izinleri ayrı ayrı verilebilir. Admin her zaman bütün sekmeleri görür. Eski personellerde henüz KasaFlow izni yoksa Ayarlar dışındaki mevcut çalışma sekmeleri açık kabul edilir; böylece güncelleme sonrasında kimse kilitlenmez.

Mevcut personelin şifresi değiştirilmeyecekse şifre alanı boş bırakılır. Personeli pasife almak geçmiş kayıtlarını silmez.

V1.1.1 düzeltmesi, aynı isimle daha önce oluşturulmuş pasif veya Auth bağlantısı eksik bir profil bulunduğunda yeni bir `app_users` satırı açmaz. Eski profili bularak Auth hesabıyla yeniden eşleştirir ve etkinleştirir; `app_users_name_key` çakışması böylece önlenir.

Sipariş ve Garanti, eski **Beklemede** ekranından ayrılmıştır. Mevcut aşamalar korunur: ürün geldi, müşteri arandı, önceki/sonraki durum, teslim ve tamamlandı işlemleri aynı kayıtlar üzerinde çalışır.

## Veri bağlantıları

Supabase proje adresleri ve public/anon anahtarları uygulamaya aktarılmıştır; tekrar kodlara eklemeniz gerekmez.

- Araç kabul ve personel oturumu: mevcut Ana Stok / Araç Kabul Supabase projesi
- Avans & Maaş: mevcut Avans & Maaş Supabase projesi

KasaFlow, araç kabul RLS kuralları nedeniyle mevcut personel kullanıcı adı ve şifresiyle giriş ister. Kasa personelinin hesabı Ana Stok Supabase projesindeki `app_users` tablosunda aktif olmalıdır. Personel listesi ve yeni hesap kaydı, RLS engeline takılmaması için yalnızca doğrulanmış Admin oturumuyla çalışan `/api/staff-admin` servisi üzerinden yapılır.

## Bir kez çalıştırılacak SQL dosyaları

1. Ana Stok / Araç Kabul Supabase SQL Editor: `GARAGEFLOW_ARAC_KABUL_RLS.sql`
2. Avans & Maaş Supabase SQL Editor: `GARAGEFLOW_MAAS_KURULUM.sql`

Bu SQL dosyaları tabloyu silmez; eksik alan/policy kurulumunu tamamlar.

## Yayınlama

Proje kökünü ayrı bir Vercel projesine yükleyin. Personel oluşturma ve zamanlanmış arka plan maaş bildirimi için aşağıdaki environment variable değerleri gerekir:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYROLL_SUPABASE_URL`
- `PAYROLL_SUPABASE_SERVICE_ROLE_KEY`
- `VAPID_SUBJECT`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- İsteğe bağlı: `CRON_SECRET`

`SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY`, Ana Stok / Araç Kabul Supabase projesine ait olmalıdır. Service role anahtarı yalnızca Vercel ortam değişkeninde tutulur; tarayıcı koduna yazılmaz.

Tarayıcı açıkken 09:00–10:00 kontrolü environment variable olmadan da çalışır. Arka plan push bildirimi için bu değerler gereklidir.

## Temalar

Pembe Şeker, Sakız Pop, Lavanta Rüyası, Tropik Bahçe, Mandalina ve Gece Pembesi. Seçim cihazda saklanır ve bütün modüllere uygulanır.

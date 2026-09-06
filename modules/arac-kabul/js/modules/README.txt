Garage İstanbul v20 modüler yapı

Bu sürümde index.html içindeki büyük JavaScript ayrıldı:
- /js/app.js: mevcut uygulama mantığı
- /js/update-check.js: sürüm/güncelleme kontrolü

Sonraki güvenli adımda app.js içindeki fonksiyonlar aşağıdaki modüllere taşınacak:
- siparis.js
- garanti.js
- odeme.js
- bekleme.js
- rapor.js

Bu v20 paketi mevcut çalışan davranışı bozmadan dosya yapısını ayırmak için hazırlandı.

# AFTER/FORM Sanatçı Portalı

Trakya Üniversitesi Bilgisayar Mühendisliği bitirme projesi: **Kriptografik Özet (Hash) Fonksiyonlarının İncelenmesi**.

Kurgusal müzik şirketi AFTER/FORM için sanatçı portalı (hesap, demo yükleme, değerlendirme durumu, yönetim paneli) ve özet fonksiyonlarının iç yapısını tarayıcıda gösteren Hash Lab (SHA-256 adım adım, çığ etkisi, PBKDF2 maliyeti, MD5/SHA-1/SHA-2/SHA3-256 karşılaştırması). Bu aşamada yalnızca frontend vardır; backend yerine API sözleşmesini uygulayan bir geliştirme sunucusu (`dev-mock/`) çalışır.

Mimari, sözleşme ve kurallar: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Makinece okunur sözleşme: [`docs/openapi.yaml`](docs/openapi.yaml).

## Gereksinimler

- Node.js 22 veya üzeri (LTS)
- Güncel bir tarayıcı (Chrome, Edge, Firefox, Safari); Web Crypto ve yerel `<dialog>` kullanılır

## Komutlar

```powershell
npm install
npm run mock                     # http://localhost:3000 (web/ ve /api aynı origin)
npm test                         # birim, entegrasyon ve sözleşme uyum testleri
npm run check                    # JSDoc tip denetimi (tsc, checkJs)
npm run openapi                  # docs/openapi.yaml dosyasını dev-mock/openapi.mjs'den yeniden yazar
node dev-mock/make-fixtures.mjs  # yükleme denemesi için örnek MP3 dosyaları -> dev-mock/.data/fixtures/
```

`npm run dev`, `npm run mock` ile aynıdır. Port doluysa: `$env:PORT=3001; npm run mock`.

## Klasörler

| Klasör | İçerik |
|--------|--------|
| `web/` | Yayına giden her şey: HTML, CSS, ES modülleri. Derleme adımı ve çalışma zamanı bağımlılığı yok. |
| `dev-mock/` | Sözleşmeyi uygulayan geliştirme sunucusu; ayrıntılar [`dev-mock/README.md`](dev-mock/README.md). Yayına girmez. |
| `tests/` | `unit/`, `integration/` (mock sunucuya gerçek HTTP; sözleşme uyumu dahil). `e2e/` tarayıcı testleri için ayrılmıştır. |
| `docs/` | Mimari ve `openapi.yaml`. |

Deneme hesapları ve parolaları `dev-mock/seed.json` dosyasındadır: iki sanatçı ve bir yönetici. Veriyi baştan almak için sunucu açıkken `POST /dev/reset` çağrılır ya da sunucu kapalıyken `dev-mock/.data/` silinir.

## API sözleşmesi

- Sözleşmenin metni ARCHITECTURE §7'dir; `docs/openapi.yaml` onun OpenAPI 3.1 karşılığıdır. YAML elle düzenlenmez: kaynağı `dev-mock/openapi.mjs`, sınırlar ve listeler (`STATUSES`, `GENRES`, `FIELD_LIMITS`, `UPLOAD_RULES` …) doğrudan `web/js/core/config.js`'ten gelir.
- `tests/integration/contract.test.js` belgedeki her uç noktanın mock'ta, mock'taki her uç noktanın belgede olduğunu; mock'un her yanıtının belgedeki bir durum koduyla ve şemaya uyan bir gövdeyle geldiğini; belgedeki her yanıtın da üretilebildiğini denetler.
- Sözleşme değişecekse sıra: §7, `dev-mock/openapi.mjs` + `npm run openapi`, mock, frontend. Testler bu dördünün birbirinden ayrılmasını yakalar.

## Gerçek backend'e geçiş

Hedef ASP.NET Core 10, Identity, EF Core ve MySQL. Ayrıntılı eşleme ARCHITECTURE §13'tedir; frontend'de değişmesi gereken bir şey yoktur, çünkü hiçbir kod mock'a özel değildir ve API aynı origin'de `/api` altındadır.

1. **Statik dosyalar.** `web/` içeriği `wwwroot`'a kopyalanır; `UseDefaultFiles` ve `UseStaticFiles`. Bilinmeyen sayfa yolu `404.html` ile 404 döner, bilinmeyen `/api` yolu `{ "code": "not_found" }` ile 404.
2. **Uç noktalar.** `docs/openapi.yaml`'daki yollar, durum kodları ve şemalar birebir uygulanır. Hata gövdesi yalnızca `code`, gerekirse `fields` ve `retryAfterSeconds` taşır; frontend serbest metin göstermez, yalnızca `code`'u çevirir.
3. **Parola ve oturum.** Identity `PasswordHasher` (V3, PBKDF2-HMAC-SHA512) ile `PasswordHasherOptions.IterationCount = 220_000`. Uygulama çerezi `HttpOnly`, `SameSite=Lax`, HTTPS'te `Secure`. Parola sıfırlanınca açık oturumların hemen kapanması için `SecurityStampValidatorOptions.ValidationInterval = TimeSpan.Zero`.
4. **Kilit ve istek sınırı.** `Lockout.MaxFailedAccessAttempts = 5`, `DefaultLockoutTimeSpan = 15 dk`; 5. başarısız deneme 429 döner. Identity kayıtlı olmayan e-posta için sayaç tutmaz; aynı davranış için e-posta bazlı ayrı bir sayaç gerekir. `AddRateLimiter` ile girişte IP başına dakikada 10, parola sıfırlama isteğinde IP başına 15 dakikada 5 istek. Hepsi `Retry-After` başlığı ve `retryAfterSeconds` ile döner.
5. **CSRF.** `AddAntiforgery(o => o.HeaderName = "X-CSRF-TOKEN")`; `GET /api/csrf` `IAntiforgery.GetAndStoreTokens` ile `{ "token": "…" }` döner. Belirteç kimliğe bağlı olduğu için giriş ve çıkışta geçersizleşir; frontend bunu bekler ve yeni belirteç alır.
6. **Yükleme ve ses.** Yalnızca MP3, en fazla 100.000.000 bayt (`FormOptions.MultipartBodyLengthLimit`, Kestrel `MaxRequestBodySize`). Biçim uzantıdan ve dosya imzasından (ID3v2 ya da MPEG Layer III çerçeve başlığı) belirlenir; kayıtta tür `audio/mpeg`. SHA-256 akış okunurken `IncrementalHash` ile hesaplanır. Dosyalar `wwwroot` dışında (Docker volume) saklanır; ses uç noktası sahiplik denetimiyle `enableRangeProcessing: true` kullanır ve `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` gönderir. Başkasının kaydı her zaman 404'tür.
7. **Güvenlik başlıkları.** CSP ve diğer başlıklar `dev-mock/security.mjs` içindeki değerlerle aynı tutulur; yayında `Strict-Transport-Security` eklenir. `/api` yanıtları `Cache-Control: no-store`.
8. **Ayrılanlar.** `dev-mock/`, `/dev/*` yardımcıları, seed hesapları ve üretilen ses dosyaları yalnızca geliştirme içindir. Backend geldiğinde `npm test` frontend'in birim testleri ve mock'a karşı sözleşme testleri olarak kalır; backend'in kendi testleri `docs/openapi.yaml`'ı referans alır.

## Lisanslar

Yazı tipleri (Archivo, IBM Plex Mono) kendi sunucumuzdan verilir ve SIL Open Font License 1.1 ile dağıtılır; lisans metinleri `web/assets/fonts/*/OFL.txt` dosyalarındadır.

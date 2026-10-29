# AFTER/FORM Sanatçı Portalı — Mimari

Trakya Üniversitesi, Bilgisayar Mühendisliği bitirme projesi: **Kriptografik Özet (Hash) Fonksiyonlarının İncelenmesi** (özet fonksiyonunun iç yapısı).
Sürüm 1 · 28 Ekim 2026 · Durum: backend yok, önce frontend.

---

## 1. Amaç ve sınırlar

AFTER/FORM kurgusal bir müzik şirketidir. Portal iki iş yapar:

1. **Sanatçı portalı.** Sanatçılar hesap açar, giriş yapar, demo yükler ve değerlendirme durumunu izler. Yönetici durumları günceller. Parola saklama (PBKDF2-HMAC-SHA512, tuz, iterasyon) ve dosya bütünlüğü (SHA-256) bu portalda gerçek bir uygulama bağlamında çalışır.
2. **Hash Lab.** Özet fonksiyonlarının iç yapısını (dolgu, mesaj çizelgesi, sıkıştırma turları), çığ etkisini ve parola özetleme maliyetini tarayıcıda gösteren deney ekranları. Tamamen istemci tarafıdır.

Bu aşamada yalnızca frontend yazılır. Backend (ASP.NET Core, Identity, EF Core, MySQL, Docker) sonradan gelir; bu doküman onun uyacağı sözleşmeyi tanımlar (§7). Geliştirme sırasında sözleşmeyi uygulayan bir Node mock sunucusu (`dev-mock/`) backend yerine geçer.

Kapsam dışı: yeni kriptografik algoritma tasarlamak, e-posta gönderimi ve doğrulaması, ödeme, mobil uygulama.

---

## 2. Sistem mimarisi

```
Tarayıcı  (web/: HTML + CSS + ES modülleri, derleme adımı yok)
   │  aynı origin · JSON / multipart · HttpOnly oturum çerezi · X-CSRF-TOKEN başlığı
   ▼
/api ─ bugün:  dev-mock (Node)
     └ sonra:  ASP.NET Core (Identity, EF Core)
                  ├─ MySQL: kullanıcılar, parola kayıtları, demo kayıtları, SHA-256 özetleri
                  └─ özel dosya deposu (wwwroot dışında)
```

Güven sınırı tarayıcı ile `/api` arasındadır. Tarayıcıdaki her şey (rol bilgisi, gizlenen düğmeler, form doğrulaması) kullanıcı deneyimi içindir. Yetki, sahiplik ve doğrulama kararlarını sunucu verir; frontend aynı kuralları yalnızca önceden göstermek için tekrarlar.

Hash Lab sunucuyla konuşmaz. Web Crypto yalnızca güvenli bağlamda (HTTPS veya `localhost`) çalışır; yayın ortamı HTTPS olmalıdır.

---

## 3. Kararlar ve gerekçeler

| # | Karar | Gerekçe | Elenen seçenek |
|---|-------|---------|----------------|
| 1 | Saf HTML/CSS/ES modülleri, derleme adımı yok | Proje önerisi formu bu yığını söylüyor; çıktı doğrudan `wwwroot`'a kopyalanır; bir akışı baştan sona izlemek kolay | React/Vite: ayrı origin, CORS ve çerez ayarı, formdan sapma |
| 2 | Çok sayfalı yapı: her sayfa bir HTML + bir giriş modülü | Router gerekmez; derin bağlantı ve geri tuşu hazır; hata ayıklaması basit | Hash-router SPA: daha fazla kod, kazanç az |
| 3 | Aynı origin | HttpOnly çerez ve CSRF ek ayar istemez; CORS yok | Ayrı origin + CORS |
| 4 | Önce sözleşme (§7), mock sözleşmeyi uygular | Mock varsayımı ile gerçek şemanın ayrışması en pahalı hata sınıfıdır; sözleşme tek kaynaktır | Frontend içinde sahte veri |
| 5 | Mock bir Node sunucusudur; frontend'de mock'a özel dal yoktur | Çerez, CSRF, Range ve 429 gerçekten davranır; backend gelince yalnızca sunucu değişir | `fetch` sahteleme, Service Worker |
| 6 | Hata kodları makine okur, metin yalnızca frontend'de | Dil değişince mesaj değişir; sunucu metni ekrana sızmaz | Sunucu mesajını göstermek |
| 7 | Başkasının kaydı 404 döner | Kaydın var olup olmadığını sızdırmaz | 403 |
| 8 | Başarısız giriş mesajı hesabı değil denemeyi anlatır | "Hesap kilitlendi" demek hesabın varlığını sızdırır; mesaj sebebi söyler: çok fazla başarısız deneme | Hesap odaklı kilit mesajı |
| 9 | Üçüncü taraf yok (CDN, font, analitik) | Sıkı CSP; tedarik zinciri yüzeyi sıfır | — |
| 10 | JSDoc + `checkJs` | Derleme adımı olmadan tip denetimi | TypeScript derlemesi |
| 11 | i18n sözlükleri ES modülü | Fetch ve yanıp sönme yok; anahtar eşitliği test edilir | JSON dosyası |
| 12 | Hash Lab istemci tarafında | Backend'e bağımlı değil; konunun kendisi (iç yapı) | Sunucuda hesaplama |

---

## 4. Klasör yapısı

```
afterform-portal/
├─ web/                              # yayına giden her şey; sonra ASP.NET wwwroot'a kopyalanır
│  ├─ index.html                     # tanıtım
│  ├─ login.html  register.html  forgot-password.html  reset-password.html
│  ├─ security.html                  # "Arka planda ne oluyor?" (4 kart)
│  ├─ 404.html
│  ├─ portal/   demos.html  demo.html  upload.html
│  ├─ admin/    index.html
│  ├─ lab/      index.html  sha256.html  avalanche.html  pbkdf2.html  compare.html
│  ├─ css/      tokens.css  base.css  components.css  pages/<sayfa>.css
│  ├─ assets/   fonts/  photos/  icons.svg  icons-LICENSE.txt  favicon.svg
│  └─ js/
│     ├─ core/        config.js  api.js  csrf.js  session.js  errors.js  guard.js
│     │               i18n.js  dom.js  format.js  validators.js  types.js  file-hash.js  theme.js
│     ├─ services/    auth.js  demos.js  admin.js
│     ├─ components/  header.js  footer.js  toast.js  dialog.js  form.js  status-badge.js  status-control.js
│     │               digest.js  fingerprint.js  file-drop.js  verify-file.js  countdown.js  pager.js  info-card.js
│     │               in-view.js  iteration-bars.js  signal.js  studio.js
│     ├─ pages/       home.js  login.js  register.js  forgot-password.js  reset-password.js
│     │               security.js  not-found.js  portal-demos.js  portal-demo.js  portal-upload.js
│     │               admin.js  lab-index.js  lab-sha256.js  lab-avalanche.js  lab-pbkdf2.js  lab-compare.js
│     ├─ theme-boot.js  # <head> içinde, ilk boyamadan önce: kayıtlı temayı uygular
│     ├─ lab/         hex.js  bits.js  sha256.js  sha1.js  md5.js  sha3.js  pbkdf2.js  algorithms.js
│     └─ i18n/        tr.js  en.js
├─ dev-mock/         server.mjs  routes/  store.mjs  seed.json  make-fixtures.mjs  openapi.mjs  README.md
├─ tests/            unit/  integration/  e2e/
├─ docs/             ARCHITECTURE.md  openapi.yaml
├─ package.json  tsconfig.json  playwright.config.js  .editorconfig  .gitattributes  .gitignore  README.md
```

- `web/` dışındaki hiçbir şey yayına girmez.
- Sayfa girişi adlandırması: `portal/demos.html` → `pages/portal-demos.js`, `index.html` → `pages/home.js`; diğerleri dosya adıyla aynı.
- Tüm yollar köke göre mutlaktır (`/css/tokens.css`, `/js/pages/login.js`). Betikler `<script type="module">` ile yüklenir; tek istisna, temayı ilk boyamadan önce uygulamak için eşzamanlı yüklenen küçük `/js/theme-boot.js` dosyasıdır. Satır içi betik yoktur.
- CSS dosyaları `<link>` ile yüklenir (`@import` yok): `tokens.css`, `base.css`, `components.css`, ilgili `pages/<sayfa>.css`.
- Tek yapılandırma kaynağı `core/config.js`: `API_BASE`, `PASSWORD_RULES`, `UPLOAD_RULES`, `FIELD_LIMITS`, `STATUSES`, `GENRES`, `PBKDF2_PROJECT_ITERATIONS` (220000), `VERIFY_MAX_BYTES`.

---

## 5. Katmanlar ve örnek akış

```
pages/*  →  services/*  →  core/api.js  →  fetch  →  /api
   ↘ components/*, core/dom.js, core/i18n.js   (DOM'a yazan her şey)
lab/*    saf fonksiyonlar, DOM bilmez; pages/lab-*.js onları çizer
```

- `pages/*` doğrudan `fetch` çağırmaz. `services/*` DOM'a dokunmaz. `core/*` hiçbir sayfayı tanımaz.
- `lab/*` saf fonksiyondur (girdi → çıktı); bu yüzden Node'da test edilir.
- Global store yoktur. Oturum bilgisi `core/session.js` içinde sayfa ömrü boyunca önbelleklenir; geri kalan durum sayfa modülünün yerel değişkenleridir.
- Tipler `core/types.js` içinde JSDoc `@typedef` olarak tutulur; her modül `// @ts-check` ile başlar.

### Örnek akış: giriş, baştan sona

1. `login.html` yüklenir → `pages/login.js` → `bootPage({ access: 'guest' })` (`core/guard.js`): dili uygular, üst/alt bilgiyi çizer, `session.get()` ile `GET /api/me` çağırır. 401 ise sayfada kalır; 200 ise rolüne göre portala veya panele yönlendirir.
2. Form gönderilir → `components/form.js` istemci doğrulamasını çalıştırır (boş alan, e-posta biçimi). Hata varsa hata özeti gösterilir, ilk geçersiz alana odaklanılır, istek gitmez.
3. `services/auth.js` → `login({ email, password })` → `api.post('/api/auth/login', body)`.
4. `core/api.js`: CSRF belirteci yoksa `GET /api/csrf` ile alır (yalnızca bellekte tutar), `X-CSRF-TOKEN` başlığını ekler, `fetch(url, { credentials: 'same-origin' })` çağırır.
5. Sunucu CSRF'yi, istek sınırını ve kilidi kontrol eder; parolayı doğrular (gelen parola kayıtlı tuz ve parametrelerle yeniden özetlenip karşılaştırılır, parola geri çözülmez); HttpOnly çerezi yazar; `200 { user }` döner.
6. `api.js` başarısızlıkta `ApiError { status, code, fields, retryAfterSeconds }` fırlatır. `csrf.invalid` gelirse belirteci yenileyip isteği bir kez tekrarlar.
7. Başarı: `session.set(user)`, CSRF belirteci sıfırlanır (kimlik değişti), `next` (§8'deki güvenli yönlendirme kuralıyla) veya rol sayfasına yönlendirme. Başarısızlık: `auth.invalid_credentials` → genel mesaj; `auth.too_many_attempts` → "çok fazla başarısız deneme" mesajı + geri sayım, düğme geri sayım bitene dek pasif; ağ hatası → `errors.network`.
8. Çıkış: `POST /api/auth/logout` → sunucu çerezi siler → `session.clear()` + `csrf.reset()` → `login.html`.

---

## 6. Sayfalar

Erişim düzeyleri: `public` (herkes), `guest` (giriş yapmışsa yönlendirilir), `artist`, `admin`. Oturumsuz kullanıcı `artist`/`admin` sayfasında `login.html?next=<yol>` adresine gider; rolü yetmeyen kullanıcı "yetkin yok" ekranını görür.

| Sayfa | Dosya | Erişim | API | Notlar |
|-------|-------|--------|-----|--------|
| Tanıtım | `index.html` | public | — | slogan, sanatçılar için bölüm, Lab/Güvenlik tanıtımı, giriş çağrısı |
| Giriş | `login.html` | guest | `POST /api/auth/login` | kilit geri sayımı; "Parolan nasıl korunuyor?" kartı |
| Kayıt | `register.html` | guest | `POST /api/auth/register` | parola kuralları, göster/gizle; başarıda girişe yönlendirme |
| Parola unuttum | `forgot-password.html` | guest | `POST /api/auth/forgot-password` | yanıt her zaman aynı |
| Parola sıfırla | `reset-password.html` | guest | `POST /api/auth/reset-password` | belirteç URL'den okunur ve adres çubuğundan silinir |
| Gönderilerim | `portal/demos.html` | artist | `GET /api/demos` | durum filtresi, sıralama, sayfalama |
| Demo yükle | `portal/upload.html` | artist | `POST /api/demos` | parça adı, tür, not, dosya; ilerleme çubuğu, iptal; tarayıcının hesapladığı özet sunucununkiyle karşılaştırılır |
| Demo detay | `portal/demo.html?id=` | artist (sahibi) / admin | `GET /api/demos/{id}` (yönetici: `GET /api/admin/demos/{id}`), `…/audio`, yönetici için `PATCH …/status` | durum rozeti + not, SHA-256 özeti (gruplu, kopyala), parmak izi, oynatıcı, "Dosyayı doğrula" (yerel dosyanın SHA-256’sı tarayıcıda); yönetici görünümünde sanatçı adı ve durum kontrolü |
| Yönetim paneli | `admin/index.html` | admin | `GET /api/admin/demos`, `PATCH …/status` | filtre, arama, durum değiştirme (onay iletişim kutusu) |
| Güvenlik | `security.html` | public | — | Ek A'daki 4 kart + Lab bağlantıları |
| Hash Lab | `lab/*` | public | — | §10 |
| 404 | `404.html` | public | — | |

Her liste ve veri sayfasında dört durum zorunludur: **yükleniyor** (iskelet), **boş**, **hata** (tekrar dene düğmesiyle), **dolu**.

---

## 7. API sözleşmesi

Backend bu sözleşmeye uyar; mock da aynısını uygular. Sözleşme değişirse bu bölüm, mock ve `docs/openapi.yaml` birlikte güncellenir. `docs/openapi.yaml` elle düzenlenmez: kaynağı `dev-mock/openapi.mjs`, yeniden yazan komut `npm run openapi`.

**Genel kurallar**

- Taban yol `/api`. JSON UTF-8, alan adları camelCase, tarih ISO-8601 UTC (`2026-10-28T13:18:00Z`). Kimlikler frontend için opak dizgedir.
- `POST`/`PATCH`/`DELETE` isteklerinde `X-CSRF-TOKEN` başlığı zorunludur.
- Oturum: `HttpOnly`, `SameSite=Lax` çerez (HTTPS'te `Secure`). Frontend çerezi hiçbir zaman okumaz; oturum durumunu `GET /api/me` ile öğrenir.
- Hata gövdesi: `{ "code": "...", "fields"?: { "email": ["required"] }, "retryAfterSeconds"?: 900 }`. Serbest metin mesajı yoktur.
- `fields` değerleri yalnızca şu kodlardır: `required`, `too_short`, `too_long`, `invalid_format`, `invalid_value`.
- Sayfalama: `?page=1&pageSize=20` → `{ items, total, page, pageSize }`. `page` ≥ 1, `pageSize` 1–100 (varsayılan 20); aralık dışı değer → 400 `validation.failed`.
- Sıralama: `sort` ∈ `newest` (varsayılan; `createdAt` azalan), `oldest` (`createdAt` artan), `updated` (`updatedAt` azalan), `title` (A→Z). Geçersiz değer → 400 `validation.failed`.
- Bilinmeyen `/api` yolu → 404 `not_found`.
- `/api/*` yanıtları `Cache-Control: no-store`.

**Uç noktalar**

| Yöntem | Yol | İstek | Başarı | Hatalar |
|--------|-----|-------|--------|---------|
| GET | `/api/csrf` | — | 200 `{ token }` (+ antiforgery çerezi) | — |
| GET | `/api/me` | — | 200 `User` | 401 `auth.unauthenticated` |
| POST | `/api/auth/register` | `{ displayName, email, password }` | 201 `{}` | 400 `validation.failed`, 409 `auth.email_taken`¹ |
| POST | `/api/auth/login` | `{ email, password }` | 200 `{ user }` | 400 `validation.failed` (alan boş), 401 `auth.invalid_credentials`, 429 `auth.too_many_attempts` |
| POST | `/api/auth/logout` | — | 204 | — |
| POST | `/api/auth/forgot-password` | `{ email }` | 202 (her zaman) | 429 `rate.limited` |
| POST | `/api/auth/reset-password` | `{ email, token, newPassword }` | 204 | 400 `auth.reset_token_invalid`, 400 `validation.failed` |
| GET | `/api/demos` | `status?, sort?, page?, pageSize?` | 200 `Page<Demo>` | 401 |
| POST | `/api/demos` | multipart: `title, genre, note?, file` | 201 `Demo` | 400 `validation.failed`, 413 `upload.too_large`, 415 `upload.unsupported_type` |
| GET | `/api/demos/{id}` | — | 200 `Demo` | 401, 404 `demo.not_found` |
| GET | `/api/demos/{id}/audio` | `Range` başlığı | 200/206 ses akışı | 401, 404 `demo.not_found` |
| GET | `/api/admin/demos` | `status?, q?, sort?, page?, pageSize?` | 200 `Page<AdminDemo>` | 401, 403 `auth.forbidden` |
| GET | `/api/admin/demos/{id}` | — | 200 `AdminDemo` | 401, 403 `auth.forbidden`, 404 `demo.not_found` |
| PATCH | `/api/admin/demos/{id}/status` | `{ status, statusNote? }`² | 200 `AdminDemo` | 400, 403, 404 |

¹ E-posta numaralandırma riski nedeniyle backend ya 409 döner ya da her zaman 201 döner; frontend ikisini de destekler.
² `statusNote` gönderilmezse veya boşsa `null` olur; önceki not yeni duruma taşınmaz.

**Tipler** (`core/types.js` içinde JSDoc olarak yazılır)

```js
/** @typedef {'pending'|'in_review'|'accepted'|'rejected'} Status */
/** @typedef {'electronic'|'hiphop'|'pop'|'rock'|'ambient'|'jazz'|'experimental'|'other'} Genre */
/** @typedef {{ id: string, email: string, displayName: string, role: 'artist'|'admin' }} User */
/** @typedef {{
 *   id: string, title: string, genre: Genre, note: string,
 *   status: Status, statusNote: string|null,
 *   createdAt: string, updatedAt: string,
 *   file: { originalName: string, sizeBytes: number, contentType: string, sha256: string }
 * }} Demo */
/** @typedef {Demo & { artist: { id: string, displayName: string } }} AdminDemo */
/** @template T @typedef {{ items: T[], total: number, page: number, pageSize: number }} Page */
```

`sha256` 64 karakterlik küçük harf hex'tir.

**Hata kodları ve arayüz davranışı**

| Kod | HTTP | Anlam | Arayüz |
|-----|------|-------|--------|
| `validation.failed` | 400 | alan hataları `fields` içinde | alanın altında göster, ilk hataya odaklan |
| `csrf.invalid` | 400 | belirteç yok veya eski | `api.js` belirteci yeniler, isteği bir kez tekrarlar |
| `auth.unauthenticated` | 401 | oturum yok veya bitti | giriş sayfasına yönlendir (`next` ile) |
| `auth.invalid_credentials` | 401 | e-posta veya parola hatalı (hangisi olduğu söylenmez) | genel mesaj |
| `auth.too_many_attempts` | 429 | çok fazla başarısız deneme (kilit ve IP sınırı aynı kodu kullanır) | mesaj + geri sayım (`retryAfterSeconds`) |
| `auth.forbidden` | 403 | rol yetersiz | "yetkin yok" ekranı |
| `auth.email_taken` | 409 | e-posta kullanımda | kayıt formunda alan hatası |
| `auth.reset_token_invalid` | 400 | bağlantı geçersiz veya süresi dolmuş | "yeni bağlantı iste" mesajı + `forgot-password` bağlantısı |
| `demo.not_found` | 404 | kayıt yok **veya başkasına ait** | 404 görünümü |
| `upload.too_large` | 413 | dosya çok büyük | dosya alanı hatası |
| `upload.unsupported_type` | 415 | dosya türü desteklenmiyor | dosya alanı hatası |
| `rate.limited` | 429 | genel istek sınırı | bildirim + `Retry-After` |
| `not_found` | 404 | bilinmeyen `/api` yolu | genel hata |
| `server.error` | 5xx | sunucu hatası | genel hata + tekrar dene |
| `network.error` | — | istemci: ağ yok veya zaman aşımı | çevrimdışı mesajı |

**Kimlik doğrulama davranış kuralları**

- Başarısız girişte e-postanın mı parolanın mı yanlış olduğu söylenmez.
- Aynı e-posta için 5 başarısız denemeden sonra 15 dakika bekleme uygulanır. Sayaç e-posta bazında tutulur ve e-posta kayıtlı olmasa da aynı davranır. Ayrıca giriş uç noktasında IP başına dakikada 10 istek sınırı vardır. İkisi de `429 auth.too_many_attempts` + `Retry-After` başlığı + `retryAfterSeconds` döner. Sınıra ulaşan 5. başarısız deneme de 429 ile yanıtlanır (1–4. denemeler 401; Identity'nin `AccessFailedAsync` davranışı); bekleme süresince doğru parola da 429 alır.
- Kilit mesajı sebebi anlatır, hesabı değil: TR "Çok fazla başarısız giriş denemesi. {dakika} dakika sonra tekrar dene." / EN "Too many failed sign-in attempts. Try again in {minutes} minutes." (`dakika = ceil(retryAfterSeconds / 60)`). "Hesap" ve "kilit" sözcükleri geçmez; kalan deneme hakkı gösterilmez.
- Parola sıfırlama yanıtı e-postanın kayıtlı olup olmadığına bakmaksızın aynıdır: "Bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi."
- Oturum açıldığında ve kapandığında CSRF belirteci geçersizleşir; frontend `csrf.reset()` çağırır.
- Başka sanatçının kaydı için 404 döner. Ses uç noktası sahibine ve yöneticiye açıktır.

**Ses ve yükleme**

- Oynatıcı `<audio controls preload="none" src="/api/demos/{id}/audio">` kullanır. Aynı origin çerezi gider, `Range` ile ileri sarma çalışır. Ses yanıtı `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff` taşır.
- Yükleme `XMLHttpRequest` ile yapılır (`fetch` yükleme ilerlemesi vermez): `FormData`, `X-CSRF-TOKEN`, `upload.onprogress`, `abort()` ile iptal. Bu kod `core/api.js` içindeki `upload()` fonksiyonundadır.
- Kabul edilen biçim yalnızca MP3'tür, boyut en fazla 100 MB (100.000.000 bayt; `UPLOAD_RULES`). Sunucu biçimi dosya adının uzantısından (`.mp3`) ve dosyanın ilk baytlarından (ID3v2 etiketi veya MPEG Layer III çerçeve başlığı) belirler; istemcinin bildirdiği tür belirleyici değildir. Kabul edilen dosya `contentType: "audio/mpeg"` ile saklanır.
- Sınır üstü dosya okunurken kesilir: 413 `upload.too_large`. Alan hataları (400) biçimden önce denetlenir; alanlar geçerliyken MP3 olmayan dosya 415 `upload.unsupported_type` alır ve saklanmaz.
- SHA-256 özeti sunucuda dosya okunurken hesaplanır ve `Demo.file.sha256` olarak döner.

**Form sınırları** (`FIELD_LIMITS`, `PASSWORD_RULES`; tek yer `config.js`)

| Alan | Kural |
|------|-------|
| `displayName` | 2–60 karakter |
| `email` | geçerli biçim, en fazla 254 karakter |
| `password` | 12–128 karakter, bileşim zorunluluğu yok |
| `title` | 1–120 karakter |
| `genre` | `GENRES` listesinden biri |
| `note` | en fazla 1000 karakter |
| `statusNote` | en fazla 500 karakter |
| `file` | `UPLOAD_RULES`: yalnızca MP3 (`.mp3`; tarayıcının bildirdiği tür `audio/mpeg`, `audio/mp3` veya boş), en fazla 100 MB. İstemci erken uyarır, karar sunucunundur |

---

## 8. Frontend güvenlik kuralları (zorunlu)

1. **DOM.** Dinamik veri yalnızca `textContent` veya `dom.js` içindeki `h()` ile eklenir. `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval`, `new Function`, satır içi `on*` öznitelikleri ve satır içi `<script>` yasaktır. Bunları `tests/unit/no-unsafe-dom.test.js` kaynak taramasıyla yakalar.
2. **CSP.** Sunucu şu başlıkları gönderir; mock da aynısını uygular:
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
   Referrer-Policy: no-referrer
   X-Content-Type-Options: nosniff
   ```
   `style-src` satır içi stile izin vermez: işaretlemede `style="..."` kullanılmaz. Dinamik stil yalnızca CSSOM (`el.style.setProperty`) veya SVG öznitelikleriyle yapılır.
3. **Depolama.** Oturum çerezi dışında kimlik bilgisi tutulmaz. `localStorage` yalnızca `lang` (dil) ve `theme` (`light` / `dark`; yoksa sistem teması) içindir; ikisi de hassas veri değildir. Parola ve belirteçler asla storage'a, URL'ye veya `console.*` çıktısına yazılmaz.
4. **Parola istemcide özetlenmez.** İstemci tarafı özet parolanın yerine geçen yeni bir sırra dönüşür ve sunucudaki PBKDF2'nin anlamını bozar. Koruma TLS ile sağlanır; özetleme yalnızca sunucuda yapılır.
5. **CSRF.** Durum değiştiren her istek `core/api.js` üzerinden gider. Sayfa kodu doğrudan `fetch`/XHR çağırmaz.
6. **Güvenli yönlendirme.** `next` parametresi yalnızca `/` ile başlayan, `//`, `\` veya kontrol karakteri içermeyen göreli yollar için kabul edilir; aynı kural değerin bir kez çözülmüş (`decodeURIComponent`) hâline de uygulanır. Aksi halde varsayılan sayfa kullanılır.
7. **Sıfırlama belirteci.** `reset-password.html` belirteci okuyunca `history.replaceState` ile adres çubuğundan siler ve bellekte tutar. Sayfada `<meta name="referrer" content="no-referrer">` bulunur.
8. **Hata metni.** Sunucudan gelen serbest metin ekrana basılmaz; yalnızca `code` → i18n anahtarı.
9. **Çift gönderim.** İstek sürerken düğme pasif ve `aria-busy` olur; yükleme iptal edilebilir.
10. **Formlar.** `autocomplete` değerleri doğru verilir (`username`, `email`, `current-password`, `new-password`); yapıştırmaya izin verilir; parola alanında göster/gizle vardır.
11. **Dosya adı.** Ekranda yalnızca metin olarak gösterilir, yol bileşenleri atılır.
12. **Üçüncü taraf yok.** CDN, harici font, analitik, harici betik eklenmez. Dış bağlantılar `rel="noopener noreferrer"` taşır.
13. **Günlük.** Üretim kodunda `console.log` yoktur; `warn`/`error` yük içermez.

---

## 9. i18n (TR / EN)

- Dil seçimi: kayıtlı seçim (`localStorage.lang`) → tarayıcı dili `en` ile başlıyorsa EN → aksi halde TR. Üst çubukta dil değiştirici bulunur; değişim sayfayı yenilemeden metinleri günceller, `<html lang>` ve `document.title` de güncellenir.
- Sözlükler `js/i18n/tr.js` ve `en.js` (`export default {...}`); aktif dil `import()` ile yüklenir. Anahtar alanları: `common`, `nav`, `home`, `auth`, `demos`, `upload`, `admin`, `security`, `lab`, `status`, `genre`, `errors`.
- HTML'de `data-i18n="anahtar"` (metin) ve `data-i18n-attr="aria-label:anahtar;placeholder:anahtar"` (öznitelik). Kodda `t('anahtar', { ad: değer })`; `{ad}` biçiminde yer tutucular, çoğul için `Intl.PluralRules`.
- Tarih, sayı ve boyut biçimi `Intl.DateTimeFormat` / `Intl.NumberFormat` ile aktif dile göre yapılır.
- Teknik terimler (SHA-256, PBKDF2, HMAC) çevrilmez; TR'de "tuz (salt)" yazılır.
- Hata kodu → `errors.<kod>` anahtarı. Eksik anahtar geliştirmede `console.warn` basar ve anahtarın kendisini gösterir.
- Test: TR ve EN anahtar kümeleri eşit olmalı, hiçbir değer boş olmamalı, HTML'deki her `data-i18n` anahtarı sözlükte bulunmalı.

---

## 10. Hash Lab

Lab saf fonksiyonlar (`js/lab/*`) ve ince bir DOM katmanından (`pages/lab-*.js`) oluşur. Gerçek özetler Web Crypto ile hesaplanır; kendi uygulamalarımız yalnızca iç yapıyı göstermek içindir ve her zaman Web Crypto (veya testte Node `crypto`) ile çapraz doğrulanır. Ekranlarda "eğitim amaçlıdır; üretimde platformun kriptografi kütüphanesi kullanılır" notu bulunur.

**Rapor gereksinimi → Lab ekranı**

| Gereksinim | Karşılığı |
|------------|-----------|
| Çalışma mantığı / iç yapı | `sha256.html`: dolgu, mesaj çizelgesi, sıkıştırma turları |
| Tek yönlülük | `lab/index.html` kavram kartı; `sha256.html`'de ara özetin tur çıktısına geri eklenmesi (feed-forward) ayrı adım olarak gösterilir: tur dönüşümü tek başına tersine çevrilebilir, geri ekleme bunu engeller |
| Çakışma dayanıklılığı | `lab/index.html` kavram kartı (n bitlik özet için doğum günü sınırı ≈ 2^(n/2) işlem); `compare.html` durum sütunu |
| Çığ etkisi | `avalanche.html` |
| Farklı fonksiyonların karşılaştırılması | `compare.html` |
| Tuz ve iterasyon maliyeti | `pbkdf2.html`, `security.html` |

Kavram kartları en fazla üç cümledir; kaynaklar FIPS 180-4 ve RFC 8018'dir; kaynakla doğrulanamayan iddia yazılmaz.

**Ekranlar**

1. **`sha256.html` — adım adım SHA-256** *(çekirdek)*. Girdi (varsayılan `abc`) → (1) mesaj baytları, (2) dolgu: `0x80`, sıfırlar, 64 bitlik mesaj uzunluğu, (3) 512 bitlik bloklar, (4) mesaj çizelgesi `W[0..63]`, (5) 64 tur: `a–h` değerleri, `Ch`, `Maj`, `Σ0`, `Σ1`, `T1`, `T2`, `K[t]`, `W[t]`, (6) ara özetin eklenmesi, (7) son özet ve Web Crypto ile eşleşme rozeti. Tur kaydırıcısı, önceki/sonraki düğmeleri, klavye (←/→, Home/End); çok bloklu mesajlarda blok seçici. `prefers-reduced-motion` altında otomatik oynatma kapalıdır.
2. **`avalanche.html` — çığ etkisi** *(çekirdek)*. İki girdi: ikincisi birincinin tek bit değiştirilmiş hâli (bit seçilebilir). Algoritma seçimi (SHA-1/256/384/512 Web Crypto ile). 256 bitlik özet için 16×16 bit ızgarası, iki özetin XOR farkı, değişen bit sayısı ve yüzdesi (≈ %50 beklenir), iki parmak izi yan yana.
3. **`pbkdf2.html` — parola özetleme maliyeti.** Parola, tuz (16 rastgele bayt, "yenile" düğmesi), iterasyon (1.000 → 1.000.000, logaritmik kaydırıcı; 220.000 "projedeki ayar" diye işaretli), çıktı hex'i ve ölçülen süre (`performance.now()`). "Aynı parola, farklı tuz" karşılaştırması. İterasyon–süre için küçük SVG çubuk grafiği. Süre cihaza bağlıdır notu. Hesaplama `crypto.subtle.deriveBits` ile (PBKDF2, SHA-512); arayüz donmaz, yükleniyor durumu gösterilir.
4. **`compare.html` — karşılaştırma.** Aynı girdinin tüm algoritmalardaki özeti + yapı tablosu + Merkle–Damgård ve sünger yapılarının yan yana açıklaması. SHA-1/256/384/512 Web Crypto ile hesaplanır; MD5 ve SHA3-256 *(ekstra)* tarayıcıda bulunmadığından Lab uygulamasıyla hesaplanır. Her özetin altında kaynağı yazar; Web Crypto’su olan algoritmalarda Lab uygulaması (SHA-1, SHA-256) çapraz doğrulama olarak çalışır.
5. **`lab/index.html`.** Kavram kartları ve deneylere bağlantılar.

**Algoritma tablosu** (`lab/algorithms.js`)

| Algoritma | Özet | Blok | Yapı | Tur | Durum |
|-----------|------|------|------|-----|-------|
| MD5 | 128 bit | 512 bit | Merkle–Damgård | 64 adım | kırık, çakışma üretilebiliyor |
| SHA-1 | 160 bit | 512 bit | Merkle–Damgård | 80 adım | pratik çakışma gösterildi, kullanılmaz |
| SHA-256 | 256 bit | 512 bit | Merkle–Damgård | 64 tur | güvenli |
| SHA-384 | 384 bit | 1024 bit | Merkle–Damgård | 80 tur | güvenli |
| SHA-512 | 512 bit | 1024 bit | Merkle–Damgård | 80 tur | güvenli |
| SHA3-256 | 256 bit | sünger: rate 1088, capacity 512 | Sünger (Keccak-f[1600]) | 24 tur | güvenli |

**SHA-256 tanımı** (uygulama bunu izler; FIPS 180-4 §4–6)

- Başlangıç değerleri `H0` ilk 8 asalın karekök kesirli kısımlarından, `K[0..63]` sabitleri ilk 64 asalın küp kök kesirli kısımlarından üretilir (ilk 32 bit). Sabitler koda elle yazılmaz, asallardan üretilir ve testle doğrulanır; "neden bu sayılar" sorusu Lab'da kısa bir notla açıklanır (sabitler keyfi değildir, gizli bir kapı yoktur).
- `Ch(x,y,z) = (x∧y) ⊕ (¬x∧z)` · `Maj(x,y,z) = (x∧y) ⊕ (x∧z) ⊕ (y∧z)`
- `Σ0(x) = ROTR²(x) ⊕ ROTR¹³(x) ⊕ ROTR²²(x)` · `Σ1(x) = ROTR⁶(x) ⊕ ROTR¹¹(x) ⊕ ROTR²⁵(x)`
- `σ0(x) = ROTR⁷(x) ⊕ ROTR¹⁸(x) ⊕ SHR³(x)` · `σ1(x) = ROTR¹⁷(x) ⊕ ROTR¹⁹(x) ⊕ SHR¹⁰(x)`
- `W[t] = M[t]` (0 ≤ t ≤ 15); `W[t] = σ1(W[t−2]) + W[t−7] + σ0(W[t−15]) + W[t−16]` (16 ≤ t ≤ 63), toplamlar mod 2³²
- Her tur: `T1 = h + Σ1(e) + Ch(e,f,g) + K[t] + W[t]`, `T2 = Σ0(a) + Maj(a,b,c)`; `h=g, g=f, f=e, e=d+T1, d=c, c=b, b=a, a=T1+T2`
- Blok sonu: `H[i] = H[i] + (a..h)[i]` (mod 2³²). Mesaj uzunluğu 55 bayta kadar tek blok, 56 ve üzeri iki veya daha fazla blok gerektirir.

`sha256Trace(bytes)` çıktısı: dolgu bilgisi (mesaj bit uzunluğu, sıfır baytı sayısı, toplam bayt), her blok için `words` (16), `schedule` (64) ve 64 turun her biri için `{ t, before: [a..h], after: [a..h], T1, T2, K, W, Ch, Maj, S0, S1 }`, blok sonu `H`, nihai `digest`.

**Doğrulama kaynakları** (testlerde kullanılır)

| Girdi | Algoritma | Beklenen özet |
|-------|-----------|---------------|
| `""` (boş) | SHA-256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `abc` | SHA-256 | `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad` |
| `abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq` (iki blok) | SHA-256 | `248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1` |
| `""` | MD5 | `d41d8cd98f00b204e9800998ecf8427e` |
| `abc` | SHA-1 | `a9993e364706816aba3e25717850c26c9cd0d89d` |
| `""` | SHA3-256 | `a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a` |
| `abc` | SHA3-256 | `3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532` |

Bunlara ek olarak Node `crypto` (`sha256`, `sha1`, `md5`, `sha3-256`, `pbkdf2Sync` ile SHA-512) referans alınır: dolgu sınırı uzunlukları (0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128 bayt) ve 500 rastgele girdi (uzunluk ≤ 300 bayt).

*(Ekstra)* SHA3-256: Keccak-f[1600] (5×5 şerit, 64 bit, 24 tur; θ, ρ, π, χ, ι adımları), rate 1088, capacity 512, alan eki `0x06` ve `pad10*1` dolgusu. Merkle–Damgård ile sünger yapısı `compare.html`'de yan yana açıklanır.

---

## 11. Arayüz ve tasarım yönü

**Marka (kurgusal).** AFTER/FORM bağımsız bir müzik şirketidir. Logo yazı işaretidir: `AFTER/FORM`, eğik çizgi vurgu renginde. Eğik çizgi arayüzün yapı motifidir: yazı işaretinde, ayırıcılarda ve uygulama ekranlarının bölüm etiketlerinde (`01 / Gönderilerim`). Vitrin sayfaları (tanıtım, Güvenlik, Lab girişi) numaralı bölüm etiketi kullanmaz; sayfada en fazla birkaç sade etiket bulunur. Ton sakin, teknik, abartısız. Slogan (yer tutucu): TR "Biçimden sonra gelen ses." / EN "Sound that comes after form." Favicon: koyu zeminde vurgu renginde eğik çizgi (`favicon.svg`).

**Tema.** Açık ve koyu. Bir seçim yapılana kadar sistem tercihi geçerlidir (`prefers-color-scheme`). Üst çubuktaki iki düğmeli Açık / Koyu seçicide basılı düğme kullanılan temadır; tıklanan tema `localStorage.theme` içinde tutulur ve o andan sonra sistem değişse de korunur. Seçim, ilk boyamadan önce `<head>` içindeki `/js/theme-boot.js` tarafından `<html data-theme>` olarak uygulanır, böylece öteki tema bir an bile görünmez. Renkler tek bir belirteç kümesidir: her belirteç `light-dark(açık, koyu)` ile yazılır ve kullanılan renk şeması (`color-scheme`) hangisinin geçerli olduğunu seçer. Tek vurgu rengi.

```css
:root {
  color-scheme: dark light;                    /* [data-theme] ile tek şemaya sabitlenir */
  --bg: light-dark(#f3f3f1, #0c0c0d);          --surface-1: light-dark(#fbfbfa, #141416);
  --surface-2: light-dark(#eaeae7, #1c1c1f);
  --text: light-dark(#141416, #ece9e2);        --text-muted: light-dark(#55555b, #9a978f);
  --line: light-dark(#dcdcd8, #2a2a2e);        /* dekoratif ayırıcı */
  --line-strong: light-dark(#7c7c83, #70707a); /* girdi ve düğme sınırı: tüm yüzeylerde ≥ 3:1 */
  --accent: #ff4b1f;  --accent-hover: #ff6a40;  --accent-ink: #0c0c0d;  /* dolgular */
  --accent-text: light-dark(#b3300b, #ff4b1f); /* turuncu metin ve bağlantılar */
  --focus: light-dark(#b3300b, #ff4b1f);
  --ok: light-dark(#136f3f, #5fd38d);   --warn: light-dark(#875700, #f2b84b);
  --info: light-dark(#2457b8, #6ea8ff); --danger: light-dark(#b52a2a, #ff6b6b);
  --radius: 2px;
}
```

Ölçülen kontrast oranları (WCAG): koyu temada metin/arka plan 16,1:1, soluk metin en az 5,8:1, vurgu/arka plan ve koyu yazı/vurgu 5,9:1, `--line-strong` en az 3,4:1, durum renkleri en az 6,1:1. Açık temada metin en az 15,3:1, soluk metin en az 6,1:1, `--accent-text` ve durum renkleri en az 5,1:1, `--line-strong` en az 3,4:1. Turuncu dolgu açık zeminde 3,0:1 verir: metin dışı öğe (düğme yüzeyi, çubuk) için yeterlidir, metin için değil; bu yüzden turuncu metin `--accent-text` kullanır. Yazı işaretindeki eğik çizgi logodur ve iki temada da marka turuncusudur.

**Yazı tipi.** Tek grotesk ailesi (öneri: Archivo, değişken) + tek mono (öneri: IBM Plex Mono). Mono; özetler, boyutlar, tarihler, iterasyon sayıları ve yönetim tablosu hücreleri içindir. `woff2` dosyaları kendi sunucumuzdan verilir, `font-display: swap`, en fazla 3 dosya ön yüklenir, lisans dosyaları yanında durur. Ölçek `clamp()` ile akışkan; gövde 16–18 px, satır yüksekliği 1,5, satır uzunluğu en fazla 68ch.

**Yerleşim.** 12 sütun; kenar boşluğu mobilde 16 px, masaüstünde 48 px. Yapı ince çizgilerle (`--line`) kurulur, köşe yarıçapı 2 px. Gölge yalnızca sayfanın üstünde yüzen öğelerdedir (iletişim kutusu, bildirim). Vitrin sayfaları asimetrik yerleşim (bölünmüş hero, bento) kullanır; aynı yerleşim ailesi bir sayfada iki kez tekrarlanmaz. Mobil öncelikli; kırılma noktaları 480 / 768 / 1100 px; tablolar dar ekranda yığılmış satırlara dönüşür.

**İmza öğe: özet parmak izi.** SHA-256 özetinin 32 baytı 32 dikey çubuk olarak çizilir (SVG, çubuk yüksekliği = bayt değeri / 255). Dekoratiftir (`aria-hidden="true"`); gerçek bilgi hex metnidir. Demo kartlarında, detay sayfasında ve çığ etkisi ekranında (iki özet yan yana) kullanılır. Aynı dosya hep aynı deseni verir; tek bit fark bambaşka bir desen üretir.

**Hareket.** Sakin ve amaçlı: her animasyonun bir görevi vardır (dikkati doğru yere çekmek, bir sırayı anlatmak, kullanıcıya geri bildirim vermek, bir durum değişimini göstermek). Kütüphane yoktur; CSS geçişleri, `@starting-style`, kaydırmaya bağlı CSS animasyonları (`animation-timeline: view()`) ve Web Animations API kullanılır, yalnızca `transform` (`scale` ve `translate` dahil) ile `opacity` hareket eder. Tek istisna, hero fotoğrafının açılışta bir kez `clip-path` ile açılmasıdır.

- Eğriler: giren ve kullanıcıya cevap veren her şey için `--ease-out` (`cubic-bezier(0.23, 1, 0.32, 1)`), ekranda yer değiştiren şey için `--ease-in-out` (`cubic-bezier(0.77, 0, 0.175, 1)`). `ease-in` kullanılmaz.
- Süreler: arayüz geçişleri 300 ms'nin altında (basış 160 ms, çıkış 140 ms; çıkış girişten hızlıdır); vitrin girişleri ve kaydırmayla belirmeler en fazla 700 ms.
- Düğmeler basılınca `scale(0.97)` ile küçülür; hover efektleri yalnızca `(hover: hover) and (pointer: fine)` olan cihazlarda çalışır.
- İletişim kutusu merkezinden `scale(0.96)` ve saydamlıkla açılır, daha hızlı kapanır; bildirim aşağıdan yükselir. Tema değişimi View Transitions ile kısa bir geçişle olur.
- Vitrinde: açılışta kademeli giriş, kaydırmayla beliren bölümler; hero'da sahne fotoğrafının markanın eğik çizgisi biçiminde ince bir kesitten tüm çerçeveye açılması ve yakın bir kadrajdan yerine oturması, ince işaretçili cihazlarda işaretçiye karşı hafifçe eğilmesi, sayfa kaydırıldıkça çerçevesinden biraz yavaş kayması; fotoğrafın kenarındaki kartta ses dalgasının başlığın SHA-256 parmak izine dönüşmesi (dil değişince yeni cümlenin izine geçer); bentoda bir kez oynayan gerçek bileşen önizlemeleri; gerçek değerlerin bir kez sayarak gelmesi; kapanış bandında pikap kolunun görünüme girince plağa bir kez inmesi ve plağın sayfa kaydırıldıkça dönmesi (sayfa durunca o da durur). Sürekli tekrarlayan döngü yoktur.
- Sık görülen yerler hareketsiz kalır: listeler, formlar, klavyeyle tetiklenen işlemler.
- `prefers-reduced-motion: reduce` altında hareketin tamamı kapanır; sayfa son hâliyle durağan gösterilir. Kaydırma zaman çizelgesini desteklemeyen tarayıcı içeriği doğrudan gösterir.

**Bileşenler** (`components/`): düğme (birincil/ikincil/hayalet/tehlike, yükleniyor hâli), girdi/seçim/metin alanı (etiket, ipucu, hata), dosya bırakma alanı, ilerleme çubuğu, durum rozeti, özet gösterimi (8'erli gruplanmış hex + kopyala), parmak izi, bildirim (`role="status"`), iletişim kutusu (yerel `<dialog>`), sayfalayıcı, boş durum, iskelet, açılır bilgi kartı (`<details>`), dil ve tema değiştirici, geri sayım, görünüme girince bir kez oynatma (`in-view.js`), iterasyon çubukları, hero sinyali, kapanış bandındaki pikap çizimi (`studio.js`). İkonlar Phosphor Icons setinin "regular" ağırlığından (MIT) bir kez kopyalanmış `assets/icons.svg` sprite'ıdır; lisansı `assets/icons-LICENSE.txt`. Elle çizilmiş ikon yoktur. Pikap ikon değil, temel şekillerden (daire, yol, degrade) kurulan dekoratif bir SVG'dir (`aria-hidden="true"`): renklerini tema belirteçlerinden alır, hareketleri CSS'tedir; plak etiketi marka turuncusudur. Hero'daki sahne fotoğrafı da dekoratiftir (`alt=""`). Unsplash'ten alınmış tek bir konser fotoğrafının telefon (4:5) ve geniş ekran (9:4) için kırpılmış AVIF sürümleri (yedeği WebP) `assets/photos/` klasöründen verilir; kaynağı ve lisansı `assets/photos/LICENSE.txt`. Alt bilgi, sloganı, iki bağlantı grubunu (Keşfet; ziyaretçiye göre Portal) ve sayfa genişliğinde dekoratif bir yazı işaretini taşır.

**Durum rozetleri.** Renk + ikon + metin birlikte: Beklemede (kehribar), İnceleniyor (mavi), Kabul edildi (yeşil), Reddedildi (kırmızı). Renk tek başına anlam taşımaz.

**Erişilebilirlik (WCAG 2.1 AA).**

- Atlama bağlantısı, doğru landmark'lar, sayfa başına bir `h1`.
- `:focus-visible` halkası: 2 px vurgu rengi, 2 px boşluk.
- Hata özeti + `aria-invalid` + `aria-describedby`; hata sonrası ilk geçersiz alana odak.
- Zaman içinde değişen içerik (bildirim, yükleme ilerlemesi, geri sayım) için canlı bölge.
- İletişim kutusu yerel `<dialog>` ile açılır; kapanınca odak tetikleyiciye döner.
- Tur kaydırıcısı klavyeyle kullanılır (←/→, Home/End).
- Dokunma hedefleri en az 44 px; girdi ve düğme sınırları en az 3:1.
- Ses oynatıcı yerel kontrollerle gelir.

---

## 12. Test stratejisi

**Birim** (`node --test`, bağımlılıksız): doğrulayıcılar; i18n eşitliği; `api.js` (sahte fetch ile hata eşleme, `csrf.invalid` için tek yeniden deneme, 401 yönlendirmesi); güvenli yönlendirme fonksiyonu; `no-unsafe-dom` kaynak taraması; Lab özetleri (vektörler, sınır uzunlukları, rastgele girdiler); `lab/bits.js`.

**Entegrasyon** (mock sunucuya gerçek HTTP):

- 5 başarısız girişten sonra 429 + `Retry-After`; e-posta kayıtlı olmasa da aynı davranış.
- IP başına dakikada 10 giriş isteği sınırı.
- CSRF başlığı olmadan `POST` → 400 `csrf.invalid`.
- Oturumsuz erişim → 401.
- Sanatçı A, sanatçı B'nin demosunu açamaz (404) ve sesine erişemez (404).
- Ses isteği `Range` ile 206 döner.
- Yüklenen dosyanın `sha256` değeri `crypto.createHash('sha256')` sonucuyla aynıdır.
- MP3 olmayan dosya (uzantı veya dosya imzası tutmuyorsa) 415 alır ve saklanmaz; sınır üstü dosya 413 alır.
- Sanatçı hesabı yönetici uç noktalarında 403 alır; yönetici tek demoyu sanatçısıyla birlikte alır, olmayan kimlik 404.
- Mock deposunda parola düz metin değildir: PBKDF2-HMAC-SHA512, 220.000 iterasyon, kullanıcı başına farklı tuz.

**Uçtan uca** (Playwright, `tests/e2e/`, `npm run e2e`): giriş → yükleme → özet görünür → dosya doğrulama → çıkış; kilit geri sayımı; dil değişimi kalıcı; yönetici durumu değiştirir ve sanatçı yeni durumu görür, sanatçı yönetim paneline giremez; klavyeyle tur gezinme; karşılaştırmada altı özet. Her test seed'den başlar; sayfa hatası, konsol hatası veya CSP ihlali testi düşürür.

**Sözleşme uyumu** (`tests/integration/contract.test.js`): `docs/openapi.yaml` ile mock birbirinin aynasıdır; belgedeki her uç nokta mock'ta, mock'taki her uç nokta belgede bulunur, mock'un verdiği her yanıt belgede listelenmiş bir durum koduyla ve şemaya uyan bir gövdeyle gelir, belgedeki her yanıt da testlerde en az bir kez üretilir. Dosyanın `dev-mock/openapi.mjs` ile güncel olduğu da denetlenir.

---

## 13. Backend'e devir (sonraki aşama)

Bu bölüm bilgi içindir, mevcut işin parçası değildir. Sözleşmenin ASP.NET Core karşılıkları:

| Sözleşme | ASP.NET Core karşılığı |
|----------|------------------------|
| Parola saklama | Identity `PasswordHasher` (V3 biçimi; PBKDF2-HMAC-SHA512, 220.000 iterasyon) |
| Kilitleme | `Lockout.MaxFailedAccessAttempts = 5`, `DefaultLockoutTimeSpan = 15 dk`; var olmayan e-posta için de aynı davranış |
| İstek sınırı | `AddRateLimiter`: giriş uç noktasında IP başına dakikada 10 |
| Oturum | Identity uygulama çerezi: `HttpOnly`, `SameSite=Lax`, HTTPS'te `Secure` |
| CSRF | `IAntiforgery`; `GET /api/csrf` belirteç üretir; başlık adı `X-CSRF-TOKEN` (`AntiforgeryOptions.HeaderName`) |
| Sahiplik | Kaynak sorgusunda `OwnerId == currentUser`; yoksa 404 |
| Dosya özeti | Yükleme akışı okunurken `IncrementalHash.CreateHash(HashAlgorithmName.SHA256)` |
| Özel depo | `wwwroot` dışında dizin veya Docker volume; ses uç noktası yetki kontrolü + Range |
| Statik dosyalar | `web/` → `wwwroot`; `UseDefaultFiles` + `UseStaticFiles` |
| Başlıklar | §8'deki CSP ve diğerleri middleware ile; yayında `Strict-Transport-Security` |
| Docker | İki konteyner: uygulama ve MySQL; yükleme dizini volume |
| Veri erişimi | EF Core + migration; MySQL |

---

## Ek A. Hazır metinler (Türkçe metinler değiştirilmez; EN çeviri anlam korunarak yazılır)

`security.html` kartları. Aynı kartlar ilgili ekranlarda açılır bilgi kartı olarak da kullanılır: SHA-256 → demo detayında özet alanının yanında; PBKDF2, tuz ve iterasyon → kayıt ve giriş sayfasındaki "Parolan nasıl korunuyor?" kartında.

**SHA-256**
Yüklenen ses dosyasının özetini hesaplayıp saklıyoruz. Bu değer, sonraki bütünlük karşılaştırmalarında kullanılabilir.

**PBKDF2-HMAC-SHA512**
Parolaları saklamak ve girişte doğrulamak için kullanıyoruz. SHA-512 burada HMAC ve PBKDF2 yapısının içinde kullanılıyor.

**Tuzlama (salt)**
Her yeni parola özetleme işleminde rastgele tuz üretiyoruz. Aynı parola için farklı kayıtlar oluşmasını sağlıyor.

**İterasyon maliyeti**
PBKDF2'yi 220.000 iterasyonla yapılandırarak parola tahminlerinin hesaplama maliyetini artırıyoruz.

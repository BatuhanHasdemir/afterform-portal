# dev-mock

ARCHITECTURE §7 sözleşmesini uygulayan geliştirme sunucusu. Gerçek backend gelene kadar `/api` uç noktalarını ve `web/` klasörünü aynı origin'den sunar. Frontend bu sunucuya özel hiçbir şey bilmez; backend gelince yalnızca sunucu değişir.

```powershell
npm run mock                    # http://localhost:3000
node dev-mock/make-fixtures.mjs # yükleme denemesi için örnek MP3 dosyaları -> dev-mock/.data/fixtures/
```

## Veri

- Durum `dev-mock/.data/db.json` dosyasında tutulur, yüklenen dosyalar `dev-mock/.data/uploads/` altındadır. Klasör git dışıdır.
- Klasör yoksa ilk açılışta `seed.json` yüklenir. Seed demolarının sesleri o anda üretilen kısa sinüs tonlu MP3 dosyalarıdır (kodlayıcı gerekmez, `make-fixtures.mjs`); repoda ikili dosya yoktur.
- Baştan başlamak için sunucuyu durdurup `dev-mock/.data/` klasörünü sil ya da `POST /dev/reset` çağır.
- Oturumlar bellekte tutulur; sunucu yeniden başlayınca herkes yeniden giriş yapar.

## Hesaplar

`seed.json` içindeki üç hesap (parolalar sahtedir ve yalnızca bu dosyadadır):

| E-posta | Rol | Demo |
|---------|-----|------|
| `artist@afterform.test` | artist | 3 (beklemede, inceleniyor, kabul edildi) |
| `artist2@afterform.test` | artist | 1 (reddedildi) |
| `admin@afterform.test` | admin | — |

## Davranış ve parametreler

Tüm sayılar `settings.mjs` içindedir.

| Konu | Değer |
|------|-------|
| Parola saklama | PBKDF2-HMAC-SHA512, 220.000 iterasyon, kullanıcı başına 16 bayt rastgele tuz, 32 bayt çıktı |
| Giriş kilidi | Aynı e-posta için 5. başarısız denemede 15 dk; e-posta kayıtlı olmasa da aynı |
| Giriş istek sınırı | IP başına dakikada 10 |
| Parola sıfırlama isteği | IP başına 15 dakikada 5 (`429 rate.limited`) |
| Sıfırlama belirteci | 60 dk geçerli, tek kullanımlık, yalnızca SHA-256 özeti saklanır; parola sıfırlanınca kullanıcının oturumları kapanır |
| Oturum | 8 saat kayan süre; çerez `HttpOnly`, `SameSite=Lax` (HTTPS'te `Secure`) |
| CSRF | `GET /api/csrf` belirteci + `HttpOnly` çerez; belirteç kimliğe bağlıdır, giriş ve çıkışta geçersizleşir |
| Yükleme | Akış sırasında SHA-256. Yalnızca MP3: uzantı `.mp3` ve dosya başında ID3v2 etiketi ya da MPEG Layer III çerçeve başlığı (bildirilen tür dikkate alınmaz), değilse `415 upload.unsupported_type`. 100 MB (100.000.000 bayt) üstü `413 upload.too_large`. Kayıtta tür `audio/mpeg` |
| Ses | `Range` desteği (206); `audio/*` dışındaki türler `application/octet-stream` olarak sunulur |

## Sözleşme belgesi

`openapi.mjs`, ARCHITECTURE §7'nin OpenAPI 3.1 karşılığını tutar ve `npm run openapi` ile `docs/openapi.yaml` dosyasını yazar. Bir uç nokta eklenir ya da değişirse aynı değişiklik burada da yapılır; `tests/integration/contract.test.js` mock ile belge ayrışırsa başarısız olur.

## Geliştirme yardımcıları

Sözleşmenin parçası değildir; gerçek backend'de karşılıkları yoktur.

| Yöntem | Yol | İş |
|--------|-----|----|
| POST | `/dev/reset` | Veriyi seed'e döndürür; oturumları, kilitleri ve sayaçları sıfırlar |
| GET | `/dev/outbox` | Gönderilmiş sayılan parola sıfırlama bağlantıları |

## PowerShell ile deneme

```powershell
$base = 'http://localhost:3000'
$s = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$csrf = (Invoke-RestMethod "$base/api/csrf" -WebSession $s).token
$body = @{ email = 'artist@afterform.test'; password = '<seed.json içindeki parola>' } | ConvertTo-Json
Invoke-RestMethod "$base/api/auth/login" -Method Post -WebSession $s -ContentType 'application/json' -Headers @{ 'X-CSRF-TOKEN' = $csrf } -Body $body
Invoke-RestMethod "$base/api/me" -WebSession $s
$csrf = (Invoke-RestMethod "$base/api/csrf" -WebSession $s).token
Invoke-RestMethod "$base/api/auth/logout" -Method Post -WebSession $s -Headers @{ 'X-CSRF-TOKEN' = $csrf }
```

Giriş ve çıkış belirteci geçersiz kıldığı için çıkıştan önce yeni belirteç alınır.

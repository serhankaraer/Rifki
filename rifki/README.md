# Rıfkı

Node.js üzerinde çalışan, web tabanlı 4 kişilik Rıfkı (20 elli). En fazla 4 insan oyuncu farklı cihazlardan bağlanır; boş koltuklar bilgisayar oyuncularıyla dolar (en fazla 3 bot). Düz JavaScript, derleme adımı yok.

## Kurulum ve çalıştırma (Node 20+)

```
npm install                    # tek harici bağımlılık: ws
npm test                       # 4 paketin testleri
npm start -w @rifki/server     # http://localhost:3001
```

Aynı ağdaki cihazlar `http://<bilgisayar-ip>:3001` adresinden bağlanır. Oda kodu ya da `http://.../#ODAKODU` bağlantısıyla odaya katılınır.

Ortam değişkenleri: `PORT` (3001), `CLIENT_DIR`, `RIFKI_CONFIG` (JSON, örn. `{"thinkDelayScale":0.05,"handPauseMs":500,"takeoverMs":5000}`; geliştirme/test için bot hızlandırma).

## Yapı

| Paket | Görevi |
|---|---|
| `packages/engine` | Saf, deterministik kural motoru (durum makinesi, seed'li RNG, puanlama) |
| `packages/ai` | Bot oyuncular: 9 özellik (1–100, normal dağılım), hafıza/çıkarım, Monte Carlo karar |
| `packages/server` | Oda/koltuk yönetimi, WebSocket (`ws`), bot zamanlaması, kopma/bot devri, statik dosya sunumu |
| `packages/client` | Web istemcisi (ES modülleri); `public/` sunucu tarafından sunulur |

## Kurallar ve davranışlar

- 20 el; her oyuncu 2 koz + 3 ceza sözleşmesi seçer; her ceza türü tam 2 kez oynanır; ilk 4 el ceza eli; ilk seçici karo 7'yi elinde tutan oyuncu, sonra saat yönünde.
- Rıfkı elinde renk yoksa: kupa papazı varsa o, yoksa herhangi bir kupa, o da yoksa serbest.
- Kupa almaz ve Rıfkı: kupa ile açmak, bir oyuncu rengi olmadığı için kupa atmak zorunda kaldıktan sonra serbest olur; ondan önce yalnızca elinde sadece kupa kalan kupa ile açabilir.
- Rıfkı seçilince, seçici dışında bir oyuncunun kupa serisi yalnızca [A], [K] ya da [A, K] ise kartlar yeniden dağıtılır; sözleşme hakkı harcanmaz, seçici yeniden seçer.
- Koz sözleşmesi: koz atılmışsa sonraki oyuncu (koz oynamak zorundaysa) kozu yükseltmek zorundadır; büyük kozu yoksa elindeki herhangi bir kozu oynar. Rengi olmayan koz oynamak zorundadır.
- Koz ile açma: koz kırılmışsa serbest. "Kırılma" = bir oyuncunun açılan rengi olmadığı için kozla kesmesi (koz açmak ya da koza koz atmak kırmaz). Kırılmamışsa yalnızca elinde kozun A, K ve Q'sunun üçü birden varsa (ya da yalnız koz kaldıysa) koz ile açılabilir.
- Ceza elleri erken biter: Kız almaz'da 4 kız, Erkek almaz'da 8 papaz/vale, Kupa almaz'da 13 kupa, Rıfkı'da kupa papazı alınınca. El almaz ve Son iki erken bitmez.
- Alınan ceza kartları alanın önünde açık durur; botlar bunları her zaman bilinen kart sayar.
- Oyun sonunda puanı sıfırın üstünde olanlar kazanır (🏆), diğerleri kaybeder (😞).
- Bot düşünme süresi, sırası geldiğinde toplam 1–3 sn (düşünme hızı özelliğine göre).
- Bağlantı kopunca 30 sn beklenir, sonra bot devralır; insan sonraki elin başında koltuğunu geri alır. Hiç insan kalmazsa botlar oyunu hızla bitirir, oda 5 dk sonra silinir.
- Sunucu otoriterdir; her oyuncuya yalnızca kendi görebildiği durum (`viewFor`) gönderilir.
- Çok dil: `packages/client/public/locales/` altına yeni dil dosyası + `i18n.js` içine kayıt.

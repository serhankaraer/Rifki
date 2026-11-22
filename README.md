# Rıfkı

Node.js üzerinde çalışan, web tabanlı 4 kişilik Rıfkı (20 elli). En fazla 4 insan oyuncu farklı cihazlardan bağlanır; boş koltuklar bilgisayar oyuncularıyla dolar (en fazla 3 bot). Düz JavaScript, derleme adımı yok.

## Kurulum ve çalıştırma (Node 20+)

```
npm install                    # tek harici bağımlılık: ws
npm test                       # 4 paketin testleri
npm start -w @rifki/server     # http://localhost:3001
```

Aynı ağdaki cihazlar `http://<bilgisayar-ip>:3001` adresinden bağlanır. Oda kodu ya da `http://.../#ODAKODU` bağlantısıyla odaya katılınır.

Ortam değişkenleri: `PORT` (3001), `CLIENT_DIR`, `RIFKI_CONFIG` (JSON, örn. `{"thinkDelayScale":0.05,"handPauseMs":500,"takeoverMs":5000,"turnMs":14000}`; geliştirme/test için bot hızlandırma).

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
- Rıfkı seçilince, seçici dışında bir oyuncunun kupa serisi yalnızca [A], [K] ya da [A, K] ise kartlar yeniden dağıtılır; sözleşme hakkı harcanmaz, seçici yeniden seçer. Oyun bozulurken koşulu sağlayan **tüm** oyuncuların bütün kartları 10 sn boyunca herkese açılır (bildirim + animasyon); bu sürede bot seçim yapmaz, insanın 30 sn'si açılış bittikten sonra başlar.
- **King**: koz söyleyen oyuncu koz seçerken ayrıca King söyleyebilir (`CHOOSE_CONTRACT` mesajında `king: true`; yalnız koz sözleşmesinde). 11 ve üstü el alırsa oyun hemen biter: yalnız seçici çıkar, diğerleri batar. 3 el kaybedip 11'e ulaşamayacak duruma düşerse oyun biter: seçici batar, diğerleri çıkar. Sıralama ve puan önemsizdir; King eli puanlanmaz. Botlar King demez.
- Üst çubuğun altındaki şerit: Koz'da "Koz kırılmadı/kırıldı", Kupa almaz ve Rıfkı'da "Kupa kırılmadı/kırıldı", King'de alınan el sayısı. Yer her zaman ayrılıdır (kayma olmaz).
- Koz sözleşmesi: koz atılmışsa sonraki oyuncu (koz oynamak zorundaysa) kozu yükseltmek zorundadır; büyük kozu yoksa elindeki herhangi bir kozu oynar. Rengi olmayan koz oynamak zorundadır.
- Koz ile açma: koz kırılmışsa serbest. "Kırılma" = bir oyuncunun açılan rengi olmadığı için kozla kesmesi (koz açmak ya da koza koz atmak kırmaz). Kırılmamışsa yalnızca elinde kozun A, K ve Q'sunun üçü birden varsa (ya da yalnız koz kaldıysa) koz ile açılabilir.
- Koz imtiyazı: A, K ve Q'nun üçü de elindeyse koz kırılmadan koz açılabilir; ancak yalnız bu üç kartla ve arka arkaya üç turda A, K, Q'nun hepsini açmak zorunda (sırası serbest).
- Ceza oyunlarında (Kız, Erkek, Kupa, Rıfkı) rengi olmayan oyuncu elindeki ceza kartını atmak zorundadır; ceza oyunlarında hiçbir yerde büyütme zorunluluğu yoktur. Büyütme (kozu yükseltme) yalnızca koz oynarken geçerlidir.
- El almaz'da herkesin aldığı el sayısı oyun sürerken masada görünür.
- Ceza elleri erken biter: Kız almaz'da 4 kız, Erkek almaz'da 8 papaz/vale, Kupa almaz'da 13 kupa, Rıfkı'da kupa papazı alınınca. El almaz ve Son iki erken bitmez.
- Alınan ceza kartları alanın önünde açık durur; botlar bunları her zaman bilinen kart sayar.
- Oyun sonunda puanı sıfırın üstünde olanlar kazanır (🏆), diğerleri kaybeder (😞).
- Bot düşünme süresi, sırası geldiğinde toplam 1–3 sn (düşünme hızı özelliğine göre). Yasal tek kartı olan bot tam 1 sn'de oynar (`singleCardMs`).
- İnsan oyuncunun hamle süresi 30 sn (`turnMs`): dolunca yerine bot oynar (kart ya da sözleşme seçimi) ve `TIMEOUT_PLAY` olayı yayınlanır. Son 10 sn oyuncunun adının yanında azalan çubuk ve kalan saniye görünür (`TURN_TIMER {seat, ms}` mesajı). Yerine oynayan botun karakteri, o an puanı en yüksek olan botun özellikleridir (eşitlikte rastgele; botsuz odada tüm özellikler 50).
- Bot adına tıklayınca karakter özellikleri açılır. Son biten tur, oyunculardan bağımsız olarak masanın sağ alt köşesinde (1×4; sağdaki oyuncu kutusunun altında, alttaki oyuncu kutusunun sağında) her zaman görünür.
- Puan cetveli: kalan tüm cezayı yese bile puanı > 0 kalan oyuncunun sütunu açık yeşil (🏆 kesin çıkar), kalan tüm kozu alsa bile puanı ≤ 0 olan oyuncunun sütunu açık kırmızı (😞 kesin batar); altta açıklama çıkar. Oynanmakta olan el de "kalan" sayılır (`certainStatus`, `sheet.js`).
- Bağlantı kopunca 30 sn beklenir, sonra bot devralır; insan sonraki elin başında koltuğunu geri alır. Hiç insan kalmazsa botlar oyunu hızla bitirir, oda 5 dk sonra silinir.
- Sunucu otoriterdir; her oyuncuya yalnızca kendi görebildiği durum (`viewFor`) gönderilir.
- Çok dil: `packages/client/public/locales/` altına yeni dil dosyası + `i18n.js` içine kayıt.

## Bot özellikleri ve ölçüm

Lobide görünen özellikler 1–100'dür; oyun davranışında **alt sınır** uygulanır: görünen 1, davranışta 30 gibi çalışır (100 her zaman 100; düşünme hızı hariç). Sabit: `TRAIT_FLOOR` (`packages/ai/src/traits.js`).

| Özellik | Ne yapar | Ölçülen etki (1 → 100, diğerleri 50) |
|---|---|---|
| İleri hesap (`lookahead`) | Kaç olası dağıtımı simüle eder | çok büyük (≈ +500) |
| Tutarlılık (`consistency`) | Düşükse bazen en iyi hamle yerine 2./3. hamleyi seçer | çok büyük (≈ +500) |
| Takip (`tracking`) | Oynanan kartları fark etme olasılığı; kaçırılan kartlar hayali kart olarak hafızada kalır | büyük (≈ +130) |
| El değerlendirme (`handEval`) | Sözleşme seçiminde daha kesin tahmin + kalan koz/ceza haklarının fırsat maliyetini (planlama) hesaba katma (`contract-plan.js`); düşükse tahmin gürültülü | orta (≈ +100) |
| Çıkarım (`inference`) | Renk bitirmeyi fark etme, kural çıkarımları (koz yükseltme zorunluluğu, kupa/koz ile açış, A-K-Q serisi), ilan edenin sözleşmesinden elini tahmin etme; zayıfsa yanlış çıkarımlar (rakibi olmayan bir renkten bitmiş sanma) | küçük (≈ +50) |
| Risk (`risk`) | Oynak (yüksek sapmalı) seçenekleri tercih etme; kartlarda ve sözleşme seçiminde | tarz: kartların %19'u farklı; risk 100 ortalamada ≈ −75 puan kaybettirir |
| Saldırganlık (`aggression`) | Puanda öndeki rakibe ceza yedirmek için kendi puanından feragat | tarz: lider varken kartların ≈ %22'si farklı; maliyeti küçük |
| Skor farkındalığı (`scoreAwareness`) | Oyunun amacı sıfırın üstünde bitirmek: geç oyunda rahat öndeyken güvene alır, umutsuz gerideyken risk alır | tarz, ince: yalnız belirgin önde/geride iken kartların ≈ %7'si farklı; güce etkisi yok |

Not: rakiplerin gerçek elini bilen hileli bir bot normal bottan iyi değildir; bu botlarda "daha çok bilgi" doğrudan puana dönüşmez, asıl fark yanlış/eksik bilginin zararından gelir (takip ve çıkarım bu yüzden bu şekilde modellenmiştir).

### Ölçüm araçları (`packages/ai/tools`)

- `node tools/experiments.js <deney> [tohum_sayısı] [çıktı.json]` (`WORKERS` işçi sayısı): başsız arenada test edilen bot, üç "hepsi 50" bota karşı tüm koltuklarda ve aynı tohumlarla oynar. Oyun sıfır toplamlı olduğundan test edilenin ortalama puanı doğrudan avantajıdır (kontrol ≈ 0). Deneyler: `baseline`, `ablation`, `ablation2`, `final`, `floor`, `oracle`, `infer`, `skill2`, `style`, `tune`, `tune2`, `tune3`.
- `style` ve `tune*` deneyleri tarz göstergelerini de basar (kendi ilan ettiği ellerde oynaklık, lideri yedirme farkı, kazanma oranı vb.).
- `node tools/divergence.mjs`: aynı konumda iki özellik değeri farklı kart seçiyor mu (tarzın davranışa yansıması).
- `node tools/gen-contract-table.js` → `src/contract-table.json` (sözleşme planlaması için rastgele ellerin değer tablosu), `node tools/gen-declarer-prior.js` → `src/declarer-prior.json` (ilan edenin elinin bileşimi). Oyun kuralları ya da bot politikası değişirse yeniden üretin.

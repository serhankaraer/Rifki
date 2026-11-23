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
- Üst çubuk tek satırdır: El no | sözleşme rozeti | durum çipleri (Koz'da "Koz kırılmadı/kırıldı", Kupa almaz ve Rıfkı'da "Kupa kırılmadı/kırıldı", King'de alınan el sayısı) | sıra bilgisi | Puan cetveli | Çık. Dar ekranda (≤640 px) kısa biçim kullanılır: "17/20", "Koz ♠ 👑 3/11", 📊, ✕.
- Son 4 elde (17–20; `isLastHands`) her oyuncunun güncel puanı adının yanında görünür (yeşil +, kırmızı −). Kesin olmayan oyuncular için oynanan elin eşiği de yazılır: ceza elinde bu elin cezasının tamamını yese bile kesin batmıyorsa not yoktur, batıyorsa "En az 3 kız yerse batar" / "En az 6 erkek yerse batar" (birim puanı: Rıfkı 320, Kız 100, Erkek 60, Kupa 30, Son iki 180, El almaz 50; kalan koz ellerinin en iyi durumu hesaba katılır); koz elinde "Çıkmak için bu elde en az N koz almalı" (kalan tüm cezaların en kötü durumu hesaba katılır). Hesap `sheet.js` içindeki `seatHandNotes`. Eşik notu varsa genel durum satırı gösterilmez.
- Masada oyuncu kutuları puan cetveliyle aynı mantıkla boyanır: kesin çıkan 🏆 + açık yeşil, kesin batan 😞 + açık kırmızı (King bitince de). Kesin olmayan oyuncular için (bu açıklamalar yalnız son 4 elde gösterilir): tüm koz elleri bittiyse "Çıkmak için kalan cezalarda en çok N puan yiyebilir" (N = puan − 10; 0 ise "hiç puan yememeli"); tüm cezalar bittiyse "Çıkmak için kalan kozlarda en az N puan (K el) almalı". Hesap `client/public/sheet.js` içindeki `seatOutlook`.
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

## Dokunmatik ekran
- Basılı tutunca tarayıcının bağlam menüsü ve metin seçimi engellenir (`contextmenu`/`selectstart` iptal, CSS `user-select:none`, `touch-action:manipulation`); yazı alanları ve oda kodu hariç.
- Masa üst çubuğundaki ⛶ düğmesi tam ekrana geçer/çıkar (Fullscreen API): tarayıcının sekme ve adres çubukları gizlenir, masa büyür. Tarayıcı desteklemiyorsa düğme görünmez.

## Çıkmaya / batmaya yakınlık (son 4 el)
Son 4 elde (17–20), sonucu henüz kesin olmayan her oyuncunun kutusunda "↗ Çıkmaya (çok) yakın" ya da "↘ Batmaya (çok) yakın" göstergesi çıkar; her elde kalan ceza ve koz haklarına göre yeniden hesaplanır (`seatTrend`, `sheet.js`). Tahmin: kalan koz puanı (hak × 650) ile kalan ceza puanı oyuncular arasında eşit paylaşılırsa son puan = puan + (kalanKoz×650 − kalanCeza) / 4; oran = tahmin / ((kalanKoz×650 + kalanCeza) / 4). Oran > 0,5 çok yakın çıkmaya, > 0 yakın çıkmaya, > −0,5 yakın batmaya, daha düşükse çok yakın batmaya. Göstergenin üzerine gelince (title) tahmini son puan görülür. Bu bir tahmindir; kesin çıkma/batma 🏆/😞 ile ayrıca gösterilir.

## Kural denetimi
- Motor her `PLAY_CARD` komutunu `legalCards` ile doğrular (`ILLEGAL_CARD`); botlar yalnız `view.legalCards` içinden seçer, bu yüzden hiçbir karakter özelliği (takip, çıkarım, tutarlılık, risk…) kural dışı kart oynatamaz. `ai/test` içindeki "botlar kurallara uyar" testi, uç özellik değerleriyle oynayan botları bağımsız bir denetçiyle (renge uyma + rengi yoksa Kız/Erkek/Kupa cezası atma) kontrol eder.
- Masada ilk atılan (turu açan) kart kesikli mavi çerçeve ve "açtı" etiketiyle işaretlenir; böylece "bu bot renge uymadı mı?" sorusu kolay kontrol edilir.

## Oyun kaydı (log)
- Motor, biten her elin (ve King ile kesilen elin) tam dökümünü tutar: ilk dağıtım (dört elin kartları), Rıfkı yeniden dağıtımları, her turun açanı, oynanış sırasıyla kartları ve alanı, el sonucu. Başkalarının elleri sızmasın diye `view.gameLog` yalnızca oyun bittiğinde (`GAME_OVER`) görünümde yer alır.
- Oyun bitince (ve King bitişinde) "Oyun kaydı" düğmesi kayıt ekranını açar (`client/public/gamelog.js`, `screens.js: logScreen`): üstte el seçici (el no + seçicinin ilk harfleri), altında ızgara — sütun oyuncular (seçicinin sütunu sarı, "seçici" yazar), satır turlar; hücrede atılan kart, turu alan sarı, turu açan mavi nokta, küçük sayı oynanış sırası, ceza kartı çerçeveli. Rengi olmayan oyuncu `rengi yok`, rengi olduğu halde uymayan `⚠ rengi vardı` ile işaretlenir. **Yazdır** tüm elleri (el başına bir ızgara) basar; **Kopyala** ve **İndir (.txt)** aynı ayrıntıyı düz metin olarak verir (`formatGameLog`).
- Kayıt oyun biter bitmez bu cihazın `localStorage`'ına da yazılır; odadan çıkınca ana ekrandaki "Son oyunun kaydı" düğmesiyle açılır.

## Son 4 elde 7 sınıf
`seatTrend` (sheet.js) her oyuncuyu şöyle sınıflar: kesin çıkar, çıkmaya çok yakın, çıkmaya yakın, ortada (oran |0,15| içinde), batmaya yakın, batmaya çok yakın, kesin batar. Son elde (20) eşik notları kesindir: koz elinde `en az N koz almalı`, ceza elinde `en az N … yerse batar`.

## Bot gücü etiketi
`botStrength` (`ai/src/traits.js`): özelliklerden tek bir güç puanı hesaplanır — ölçülen etkilerle ağırlıklı (ileri hesap 500, tutarlılık 500, takip 130, el değerlendirme 100, çıkarım 50; 50 üstü risk en çok −75). Saldırganlık, skor farkındalığı ve düşünme hızı güce etki etmez. Puan, normal dağılımlı üretilen botların %10/%20/%40/%20/%10'unu verecek sabit eşiklerle (`STRENGTH_THRESHOLDS`) 5 etikete çevrilir: çok zayıf, zayıf, orta, güçlü, çok güçlü. Sunucu `seats[].strength` (1–5) olarak gönderir; lobide bot satırında ("Özellikler" düğmesiyle özellik çubukları açılır) ve oyun içinde bot ismine dokununca açılan kutuda görünür. Ağırlıklar ya da bot politikası değişirse eşikleri yeniden hesaplayın (ai testi dağılımı doğrular).

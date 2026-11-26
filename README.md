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

## Bot arketipleri ve özellikleri
Botlar yalnızca `docs/bot-arketipleri.md` içindeki **21 arketipten** biri olarak üretilir (`packages/ai/src/archetypes.js`; dokümandan `node tools/gen-archetypes.mjs` ile üretilir — doküman değişirse yeniden çalıştırın). Her arketipin 8 özelliği `min–max` aralıklarıyla tanımlıdır; bot üretilirken her özellik kendi aralığında rastgele (tamsayı) çekilir, böylece aynı arketipten gelen botlar birbirinin aynısı olmaz. **Ortalama sınırı**: çekilen 8 özelliğin düz ortalaması arketipin "Hedef Ort." aralığının dışına çıkarsa (ham çekimlerde en çok %3), kimliği belirleyen dar aralıklı (≤ ±7) özellikler korunup yan özellikler orantılı ölçeklenir. **Alt sınır yoktur**: özellik değeri davranışa olduğu gibi yansır (eskiden 1 → 30 gibi çalışırdı). Düşünme hızı bir özellik değildir: her bota gizli, rastgele bir hız atanır (1–3 sn gecikme) ve oyun gücüne etkisi yoktur.

| Özellik (`anahtar`) | Ne yapar | Ölçülen etki (1 → 100, diğerleri 50; puan/oyun; iki ölçüm aralığı, her biri ± ≈100) |
|---|---|---|
| Tutarlılık (`consistency`) | Düşükse bazen en iyi hamle yerine 2./3. hamleyi seçer; hata olasılığı 1 iken en çok %12 (`TUNING.errorMax`; eskiden %30 idi ve etkisi diğerlerinin 2–9 katıydı) | ≈ +230 (ayardan önce +490) |
| İleri hesap (`lookahead`) | Kaç olası dağıtımı simüle eder | ≈ +320…+430 (en büyük etki) |
| Ceza kaçınma (`penaltyAvoid`) | **Yeni.** Ceza ellerinde kart seçerken kendi ceza puanının ağırlığı: 1 → ×0,5 (umursamaz), 100 → ×1,5 (duvar gibi). Koz ellerinde etkisizdir | ≈ +40…+180 |
| El değerlendirme (`handEval`) | Sözleşme seçiminde daha kesin tahmin + kalan koz/ceza haklarının fırsat maliyeti (`contract-plan.js`) | ≈ +120…+180 |
| Kart hafızası & çıkarım (`memory`) | Eski "takip" ve "çıkarım" tek özellikte birleşti: oynanan kartları fark etme, renk bitirmeyi ve kuralları çıkarma, ilan edenin elini tahmin etme; zayıfsa yanlış çıkarımlar | ≈ +130…+270 |
| Koz iştahı (`kozAppetite`) | **Yeni.** Sözleşme seçiminde KOZ seçeneklerine −100…+100 puan eğilim (`TUNING.kozBias`): yüksekse koz haklarını erken kullanır (koz eli ortalaması ≈ 14,6 → 10,2). Risk iştahının yarısını da besler | tarz; yüksekken ≈ −30…−110 |
| Baskı & provokasyon (`aggression`) | Puanda öndeki rakibe ceza yedirmek için kendi puanından feragat; risk iştahının diğer yarısı | tarz; yüksekken ≈ −110…−160 |
| Skor farkındalığı (`scoreAwareness`) | Geç oyunda rahat öndeyken güvene alır, umutsuz gerideyken risk alır | tarz, ince; ≈ −55…+25 |

Risk iştahı (oynak seçenekleri tercih) ayrı bir özellik değildir: `(koz iştahı + baskı) / 2` olarak türetilir (`effectiveTraits`).

### Özelliklerin seviyeye etkisi (ayarlanabilir parametre)
Dokümandaki "Genel Seviye" 8 özelliğin düz ortalamasıdır, oysa özelliklerin oyun gücüne etkisi eşit değildir. Bu yüzden her özelliğin **etkisi 0–100** bir parametredir (`TRAIT_IMPACT_DEFAULTS`, `packages/ai/src/traits.js`); arketipin ve botun **genel puanı** özellik değerlerinin bu ağırlıklarla ağırlıklı ortalamasıdır, **seviye** (1–20 çok zayıf, 21–40 zayıf, 41–60 orta, 61–80 güçlü, 81–100 çok güçlü) ondan çıkar. Hepsi 100 yapılırsa dokümandaki düz ortalama hesabı elde edilir. Varsayılanlar ölçümlere en iyi uyan ağırlıklardır (üç aday denendi): tutarlılık 100, ileri hesap 75, ceza kaçınma 35, kart hafızası 30, el değerlendirme 28; koz iştahı, baskı ve skor farkındalığı 0 (yüksekken puan kaybettirdikleri / etkisiz oldukları için etiketi yükseltmesinler). Sunucuda değiştirmek için `RIFKI_TRAIT_IMPACT='{"lookahead":60,"kozAppetite":20}'` (verilmeyenler varsayılan; geçersizse sunucu başlamaz). **Etki ayarı yalnızca etiketi ve toplu seçimdeki arketip havuzunu değiştirir, botun oyun davranışını değiştirmez.** Arketip seviyesi, aralık orta noktalarının ağırlıklı puanından hesaplanır; aynı arketipten çıkan her bot bu seviyeyi taşır.

**Denge durumu (dürüst not):** özelliklerin oyun etkisi hâlâ tam eşit değildir, ama ilk sürümdeki uçurumlar kapatıldı. 1 → 100 farkı (puan/oyun, diğer her şey 50; her ölçüm 12 tohum × 4 = 48 oyun/koşul, tek bir etkinin hatası ≈ ±100):

| Özellik | İlk sürüm | Ayardan sonra (ölçüm 1) | Aynı ayar, tekrar (ölçüm 2) |
|---|---|---|---|
| İleri hesap | +433 | +322 | +376* |
| Tutarlılık | +226 (hata sınırı %12, önceden %30'da +490) | +234 | +400* |
| El değerlendirme | +120 | +203 | +230 |
| Kart hafızası | +269 | +88 | +125 |
| Skor farkındalığı | +24 | +84 | +15 |
| Ceza kaçınma | +40 | +22 | −53 |
| Koz iştahı | −31 | −80 | −124 |
| Baskı | −162 | −82 | −231 |

\*ikinci ölçümde ileri hesap ve tutarlılık için denediğim sıkılaştırma (simülasyon aralığı, hata sınırı %9) etkiyi düşürmedi, ölçüm gürültüsü ayar farkından büyük çıktı; bu yüzden ilk ayara dönüldü. Yapılan ayarlar: tutarlılık hata sınırı %30 → %12; ileri hesap simülasyon aralığı 6–76 → 8–46; kart hafızası taban gücü yükseltildi (gözleme 0,4 → 0,6, çıkarıma 0,15 → 0,4; yanlış okuma %12 → %6, ilan edenin elini sezme 0,9 → 0,5); baskı katsayısı 2,0 → 1,0.

Kalan sorunlar: (1) İleri Hesap ve Tutarlılık hâlâ en güçlü iki özellik (≈ +300…+400); (2) Koz İştahı ve Baskı yüksekken puan kaybettirir, çünkü ikisi de risk iştahını besler ve baskı kendi puanından feragat anlamına gelir; yani "yüksek = güçlü" varsayımı bu iki özellik için geçerli değildir (tarz özellikleridir); (3) etkileri ±100 içinde sıkıştırmak için özellik başına birkaç yüz oyun gerekir, tek ölçümle ince ayar yapılamıyor. Bu yüzden etiket (Çok zayıf…Çok güçlü) hesabında "Özellik etkisi" parametresi kullanılır (aşağıda); gerçek etki dengesi için onu ve `TUNING` katsayılarını ayarlayabilirsiniz.

**Doğrulama (`experiments.js archetypes 6`, 21 arketip × 48 oyun, "hepsi 50" botlara karşı, üç ölçüm):** hesaplanan genel puan sırası ile ölçülen güç sırası arasındaki Spearman korelasyonu 0,82–0,91 (son ölçüm 0,87); dokümandaki düz ortalama ile 0,56–0,75. Son ölçümde seviyelere göre ortalama avantaj: çok zayıf −262, zayıf −203, orta −10, güçlü +29, çok güçlü +264. Belirgin sapmalar: Koz İştahı ve Baskısı yüksek arketipler (*Gözü Kara Acemi*, *Delidolu Kozcu*) ve *Saf İçgüdü Ustası* beklenenden zayıf.

### Bot seçimi (lobi)
- **Tek tek:** "Bot ekle" tüm 21 arketipten rastgele bir bot ekler; oyunu başlatınca boş koltuklar da böyle doldurulur.
- **Toplu:** oda sahibi "Toplu bot seçimi"nde üç ardışık seviyelik bir aralık seçer — *Çok zayıf–Orta*, *Zayıf–Güçlü*, *Orta–Çok güçlü* (`FILL_BOTS { band: 1|2|3 }`) — ve boş koltuklar o aralıktaki arketiplerle (eşit olasılıkla) dolar.
- Aynı odada mümkün olduğunca aynı arketip tekrar etmez. Lobide bot satırında arketip adı ve seviye görünür; "Özellikler" kimlik özetini, genel puanı ve özellik çubuklarını (`[ÇZ] [Z] [O] [G] [ÇG]` etiketleriyle) açar. Oyunda bot ismine dokununca aynı bilgi kutuda çıkar.

**Ölçüm notu:** rakiplerin gerçek elini bilen hileli bir bot normal bottan iyi değildir; bu botlarda "daha çok bilgi" doğrudan puana dönüşmez, asıl fark yanlış/eksik bilginin zararından gelir (takip ve çıkarım bu yüzden bu şekilde modellenmiştir).

### Ölçüm araçları (`packages/ai/tools`)

- `node tools/experiments.js <deney> [tohum_sayısı] [çıktı.json]` (`WORKERS` işçi sayısı): başsız arenada test edilen bot, üç "hepsi 50" bota karşı tüm koltuklarda ve aynı tohumlarla oynar. Oyun sıfır toplamlı olduğundan test edilenin ortalama puanı doğrudan avantajıdır (kontrol ≈ 0). Deneyler: `baseline`, `traits` (8 özelliğin etkisi + tarz göstergeleri), `kozbias`, `ceza`, `archetypes` (21 arketip, orta nokta değerleriyle), `oracle`. Ölçüm gürültülüdür (4 koltuk × tohum; 48 oyunda ortalamanın hatası ≈ ±60): etkileri karşılaştırırken tohum sayısını artırın.
- `detail` deneyleri tarz göstergelerini de basar (kendi ilan ettiği ellerde oynaklık, lideri yedirme farkı, kazanma oranı vb.).
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
- **Bot bilgileri:** ekranda ızgaranın üstünde, metin kaydının başında ve JSON'da her botun arketibi, seviyesi, genel puanı (ağırlıklı), düz ortalaması ve 8 özelliği (`[ÇZ]…[ÇG]` etiketleriyle) yer alır. Oyunculuğu bot devralan insan koltuğu için devralan botun bilgisi de eklenir.
- **Makine okunur veri:** .txt kaydının sonunda `=== MAKİNE OKUNUR VERİ (JSON; silmeyin) ===` ve `=== SON ===` arasında tek satır JSON bulunur: oyun tohumu (`seed`; oyun bitince `view.gameSeed` ile açılır, oyun sürerken istemciye gönderilmez), oyuncular (bot kimliği, arketip, özellikler) ve tüm eller (dağıtımlar, Rıfkı yeniden dağıtımları, sözleşmeler, tur tur oynanış). Dosyanın bu satırını silmeyin/düzenlemeyin.
- **Kayıttan yeniden oynatma:** `node packages/ai/tools/replay-log.mjs kayit.txt [--sims 1] [--explain EL:TUR:KOLTUK]`. Araç (1) tohumdan üretilen dağıtımların kayıttakiyle aynı olduğunu doğrular, (2) kayıttaki her hamleyi motora uygulayıp kural dışı/bozuk hamle olup olmadığına bakar, (3) her bot kararını sunucudaki akışla (karar + düşünme gecikmesi çekimi, aynı tohum ve aynı bot kodu) yeniden verip kayıttakiyle karşılaştırır; hepsi aynıysa kayıt bot koduyla tutarlıdır. `--explain` o karardaki aday sıralamasını (puanlarıyla) ve botun görüşünü (eli, yasal kartlar) basar (`TUR` 0 = sözleşme seçimi). Sunucunun `simsScale` değeri (varsayılan 1) farklıysa `--sims` verin. Bot devri ve süre aşımı hamleleri bu akışı bozar; ilk sapmada araç durur ve raporlar.

## Son 4 elde 7 sınıf
`seatTrend` (sheet.js) her oyuncuyu şöyle sınıflar: kesin çıkar, çıkmaya çok yakın, çıkmaya yakın, ortada (oran |0,15| içinde), batmaya yakın, batmaya çok yakın, kesin batar. Son elde (20) eşik notları kesindir: koz elinde `en az N koz almalı`, ceza elinde `en az N … yerse batar`.


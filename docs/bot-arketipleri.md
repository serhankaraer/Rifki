# King Oyunu Bot Karakter Özellikleri ve Dinamik Arketip Kütüphanesi

Bu doküman, King oyunu yapay zekâ (bot) tasarımı için belirlenen **8 temel karakter özelliğini**, **5 kademeli ölçeği** ve aynı arketipten üretilen botların kendi içinde gerçekçi varyasyonlar göstermesini sağlayan **aralıklı (min–max) dinamik arketip şablonlarını** içerir.

---

## 1. Özellik Seviye Skalası ve Etiketleme Sistemi (5 Kategori)

Her bir özellik `1` ile `100` arasında bir değer alır ve aşağıdaki **5 kategoriye** ayrılır:

| Kategori | Puan Aralığı | Kısa Etiket | Oyun İçi Yansıması |
| :--- | :---: | :---: | :--- |
| **Çok Zayıf** | `1 – 20` | `[ÇZ]` | Ağır kör nokta; o alanda sık ve belirgin hatalar yapar. |
| **Zayıf** | `21 – 40` | `[Z]` | Yüzeysel yaklaşım; baskı altında veya karmaşık ellerde aksar. |
| **Orta** | `41 – 60` | `[O]` | Standart, kabul edilebilir ve dengeli oyun seviyesi. |
| **Güçlü** | `61 – 80` | `[G]` | Yüksek isabet, disiplinli planlama ve etkili taktiksel kararlar. |
| **Çok Güçlü** | `81 – 100` | `[ÇG]` | Usta seviyesi uzmanlık; masada fark yaratan baskın yetenek. |

---

## 2. Dinamik Bot Üretim Mantığı (Varyasyon Kuralları)

Aynı arketipten gelen iki botun (örneğin iki farklı *“Delidolu Kozcu”* botunun) birebir aynı kararları vermemesi için her özellik **sabit bir sayı yerine bir aralık (`Min – Max`)** olarak tanımlanır:

1. **Çekirdek Kimlik Koruması:** Arketipin imzası olan güçlü özellikler (`[G]`/`[ÇG]`) ile kör noktaları (`[ÇZ]`/`[Z]`) kendi kategori sınırları içinde dar bir aralıkta (`±4` ile `±7` puan) rastgele üretilir. Böylece botun karakteri bozulmaz.
2. **İkincil Özellik Esnekliği:** Arketipin kimliğini doğrudan tanımlamayan yan özellikler daha geniş bir aralıkta (`±8` ile `±12` puan) değişebilir. Bu sayede aynı arketipin biraz daha agresif, biraz daha dikkatli veya biraz daha skor odaklı alt varyantları ortaya çıkar.
3. **Ortalama Sınırı (Budget Cap):** Tüm özellikler rastgele çekildikten sonra botun genel ortalaması, arketipin **Hedef Genel Ortalama** aralığının dışına çıkarsa, yan özellikler orantılı şekilde ölçeklenerek botun genel zorluk kademesi korunur.

---

## 3. Dinamik Bot Arketipleri (Ağırlıklı Orta – Güçlü – Çok Güçlü)

---

### A. ÇOK ZAYIF & ZAYIF ARKETİPLER (Başlangıç / Öğretici Seviye)

#### 1. Acemi Çaylak
* **Genel Seviye:** **Çok Zayıf** *(Hedef Ort: `12 – 20`)*
* **Kimlik Özeti:** Tüm mekanikleri yeni öğrenen, rastgeleliğe yakın oynayan başlangıç botu.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `12 – 24` `[Çok Zayıf / Zayıf]`
  * **Koz İştahı:** `14 – 28` `[Çok Zayıf / Zayıf]`
  * **Ceza Kaçınma:** `10 – 22` `[Çok Zayıf / Zayıf]`
  * **Kart Hafızası & Çıkarım:** `8 – 18` `[Çok Zayıf]`
  * **İleri Hesap:** `6 – 16` `[Çok Zayıf]`
  * **Baskı & Provokasyon:** `8 – 20` `[Çok Zayıf]`
  * **Skor Farkındalığı:** `10 – 20` `[Çok Zayıf]`
  * **Tutarlılık:** `15 – 30` `[Çok Zayıf / Zayıf]`

#### 2. Gözü Kara Acemi
* **Genel Seviye:** **Zayıf** *(Hedef Ort: `28 – 38`)*
* **Kimlik Özeti:** İhaleye atlamayı ve baskı yapmayı çok seven ama el okuması ile kart takibi çok zayıf olduğu için sık batan agresif çaylak.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `16 – 28` `[Çok Zayıf / Zayıf]`
  * **Koz İştahı:** `72 – 86` `[Güçlü / Çok Güçlü]`
  * **Ceza Kaçınma:** `10 – 20` `[Çok Zayıf]`
  * **Kart Hafızası & Çıkarım:** `12 – 24` `[Çok Zayıf / Zayıf]`
  * **İleri Hesap:** `10 – 20` `[Çok Zayıf]`
  * **Baskı & Provokasyon:** `62 – 76` `[Güçlü]`
  * **Skor Farkındalığı:** `14 – 26` `[Çok Zayıf / Zayıf]`
  * **Tutarlılık:** `18 – 32` `[Çok Zayıf / Zayıf]`

#### 3. Aşırı Ürkek Korumacı
* **Genel Seviye:** **Zayıf** *(Hedef Ort: `30 – 40`)*
* **Kimlik Özeti:** Ceza yemekten ölesiye korkan, elindeki iyi kâğıtları bile panikle erken atan ve hiç koz almayan pasif bot.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `26 – 40` `[Zayıf]`
  * **Koz İştahı:** `8 – 18` `[Çok Zayıf]`
  * **Ceza Kaçınma:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `24 – 38` `[Zayıf]`
  * **İleri Hesap:** `16 – 28` `[Çok Zayıf / Zayıf]`
  * **Baskı & Provokasyon:** `8 – 18` `[Çok Zayıf]`
  * **Skor Farkındalığı:** `24 – 40` `[Zayıf]`
  * **Tutarlılık:** `48 – 64` `[Orta / Güçlü]`

---

### B. ORTA SEVİYE ARKETİPLER (Ortalama: 41 – 60)

#### 4. Hafızası Güçlü Ama Korkak
* **Genel Seviye:** **Orta** *(Hedef Ort: `47 – 56`)*
* **Kimlik Özeti:** Masada dönen neredeyse her kâğıdı sayar ama risk almaktan çekindiği için kazandığı bilgiyi saldırıya dönüştüremez.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `50 – 66` `[Orta / Güçlü]`
  * **Koz İştahı:** `16 – 28` `[Çok Zayıf / Zayıf]`
  * **Ceza Kaçınma:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **İleri Hesap:** `40 – 56` `[Zayıf / Orta]`
  * **Baskı & Provokasyon:** `12 – 24` `[Çok Zayıf / Zayıf]`
  * **Skor Farkındalığı:** `28 – 44` `[Zayıf / Orta]`
  * **Tutarlılık:** `54 – 70` `[Orta / Güçlü]`

#### 5. Delidolu Kozcu
* **Genel Seviye:** **Orta** *(Hedef Ort: `48 – 57`)*
* **Kimlik Özeti:** Koz turlarında masayı ateşe verir, rakipleri sıkıştırır ama ceza turlarında sabırsız davranıp gereksiz puan yer.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `56 – 72` `[Orta / Güçlü]`
  * **Koz İştahı:** `86 – 96` `[Çok Güçlü]`
  * **Ceza Kaçınma:** `14 – 26` `[Çok Zayıf / Zayıf]`
  * **Kart Hafızası & Çıkarım:** `38 – 54` `[Zayıf / Orta]`
  * **İleri Hesap:** `26 – 42` `[Zayıf / Orta]`
  * **Baskı & Provokasyon:** `80 – 92` `[Güçlü / Çok Güçlü]`
  * **Skor Farkındalığı:** `34 – 50` `[Zayıf / Orta]`
  * **Tutarlılık:** `24 – 40` `[Zayıf]`

#### 6. Son El Büyücüsü
* **Genel Seviye:** **Orta** *(Hedef Ort: `49 – 58`)*
* **Kimlik Özeti:** Oyunun son 3–4 elini çok iyi kurgular ancak skor tablosunu hiç takip etmez ve açılış ellerinde dikkatsizdir.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `38 – 52` `[Zayıf / Orta]`
  * **Koz İştahı:** `38 – 54` `[Zayıf / Orta]`
  * **Ceza Kaçınma:** `46 – 62` `[Orta / Güçlü]`
  * **Kart Hafızası & Çıkarım:** `60 – 74` `[Orta / Güçlü]`
  * **İleri Hesap:** `82 – 94` `[Çok Güçlü]`
  * **Baskı & Provokasyon:** `40 – 56` `[Zayıf / Orta]`
  * **Skor Farkındalığı:** `10 – 22` `[Çok Zayıf / Zayıf]`
  * **Tutarlılık:** `52 – 68` `[Orta / Güçlü]`

#### 7. Puan Avcısı Kumarbaz
* **Genel Seviye:** **Orta** *(Hedef Ort: `48 – 57`)*
* **Kimlik Özeti:** Sürekli skor tablosuna bakar; gerideyse çılgınca risk alır, öndeyse aşırı kapanır. Oyun stili çok dalgalıdır.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `44 – 60` `[Orta]`
  * **Koz İştahı:** `56 – 72` `[Orta / Güçlü]`
  * **Ceza Kaçınma:** `36 – 52` `[Zayıf / Orta]`
  * **Kart Hafızası & Çıkarım:** `34 – 50` `[Zayıf / Orta]`
  * **İleri Hesap:** `30 – 46` `[Zayıf / Orta]`
  * **Baskı & Provokasyon:** `60 – 76` `[Orta / Güçlü]`
  * **Skor Farkındalığı:** `84 – 96` `[Çok Güçlü]`
  * **Tutarlılık:** `12 – 24` `[Çok Zayıf / Zayıf]`

#### 8. Klasik Kulüp Oyuncusu
* **Genel Seviye:** **Orta** *(Hedef Ort: `50 – 59`)*
* **Kimlik Özeti:** Aşırı uçları olmayan, masadaki sürprizli botlara karşı denge unsuru oluşturan standart oyuncu.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `48 – 64` `[Orta / Güçlü]`
  * **Koz İştahı:** `44 – 60` `[Orta]`
  * **Ceza Kaçınma:** `50 – 66` `[Orta / Güçlü]`
  * **Kart Hafızası & Çıkarım:** `46 – 62` `[Orta / Güçlü]`
  * **İleri Hesap:** `42 – 58` `[Orta]`
  * **Baskı & Provokasyon:** `38 – 54` `[Zayıf / Orta]`
  * **Skor Farkındalığı:** `44 – 60` `[Orta]`
  * **Tutarlılık:** `56 – 72` `[Orta / Güçlü]`

#### 9. Kör Noktalı Taktikçi
* **Genel Seviye:** **Orta** *(Hedef Ort: `49 – 58`)*
* **Kimlik Özeti:** Rakiplere kâğıt yutturmada ve el değerlendirmede çok iyidir ama çıkan kâğıtları unuttuğu için bazen boş yere yakalanır.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `68 – 82` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `54 – 70` `[Orta / Güçlü]`
  * **Ceza Kaçınma:** `44 – 60` `[Orta]`
  * **Kart Hafızası & Çıkarım:** `12 – 24` `[Çok Zayıf / Zayıf]`
  * **İleri Hesap:** `40 – 56` `[Zayıf / Orta]`
  * **Baskı & Provokasyon:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Skor Farkındalığı:** `36 – 52` `[Zayıf / Orta]`
  * **Tutarlılık:** `34 – 50` `[Zayıf / Orta]`

---

### C. GÜÇLÜ SEVİYE ARKETİPLER (Ortalama: 61 – 80)

#### 10. Soğukkanlı Kart Sayıcı
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `65 – 74`)*
* **Kimlik Özeti:** Dönen kâğıtları ve renk bitişlerini neredeyse kusursuz takip eder; ancak rakipleri psikolojik olarak zorlama veya tempo dayatma yönü zayıftır.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `70 – 84` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `46 – 62` `[Orta / Güçlü]`
  * **Ceza Kaçınma:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `88 – 98` `[Çok Güçlü]`
  * **İleri Hesap:** `68 – 82` `[Güçlü / Çok Güçlü]`
  * **Baskı & Provokasyon:** `18 – 30` `[Çok Zayıf / Zayıf]`
  * **Skor Farkındalığı:** `54 – 70` `[Orta / Güçlü]`
  * **Tutarlılık:** `78 – 90` `[Güçlü / Çok Güçlü]`

#### 11. Acımasız Masa Zorbası
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `66 – 75`)*
* **Kimlik Özeti:** Koz iştahı ve baskı gücü zirvededir; rakiplere sürekli ceza kâğıdı yutturmaya çalışır ama kendi savunmasını zaman zaman ihmal eder.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `68 – 82` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `88 – 98` `[Çok Güçlü]`
  * **Ceza Kaçınma:** `24 – 38` `[Zayıf]`
  * **Kart Hafızası & Çıkarım:** `66 – 80` `[Güçlü]`
  * **İleri Hesap:** `60 – 76` `[Orta / Güçlü]`
  * **Baskı & Provokasyon:** `90 – 99` `[Çok Güçlü]`
  * **Skor Farkındalığı:** `56 – 72` `[Orta / Güçlü]`
  * **Tutarlılık:** `48 – 64` `[Orta / Güçlü]`

#### 12. Kaotik Dâhi
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `64 – 73`)*
* **Kimlik Özeti:** El okuma, kart sayma ve ileri hesabı üst düzeydedir; ancak tutarlılığı çok düşük olduğu için bir elde usta işi oynayıp sonraki elde tamamen ters köşe bir hamle yapar.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `58 – 74` `[Orta / Güçlü]`
  * **Ceza Kaçınma:** `54 – 70` `[Orta / Güçlü]`
  * **Kart Hafızası & Çıkarım:** `80 – 92` `[Güçlü / Çok Güçlü]`
  * **İleri Hesap:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **Baskı & Provokasyon:** `66 – 82` `[Güçlü / Çok Güçlü]`
  * **Skor Farkındalığı:** `60 – 76` `[Orta / Güçlü]`
  * **Tutarlılık:** `14 – 26` `[Çok Zayıf / Zayıf]`

#### 13. Pasif Kale
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `63 – 72`)*
* **Kimlik Özeti:** Ceza turlarında geçilmesi imkânsız bir duvar gibidir; fakat koz alma konusunda çok çekingen kaldığı için ihale turlarında fırsat teper.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `68 – 82` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `14 – 26` `[Çok Zayıf / Zayıf]`
  * **Ceza Kaçınma:** `90 – 99` `[Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **İleri Hesap:** `72 – 86` `[Güçlü / Çok Güçlü]`
  * **Baskı & Provokasyon:** `26 – 40` `[Zayıf]`
  * **Skor Farkındalığı:** `58 – 74` `[Orta / Güçlü]`
  * **Tutarlılık:** `80 – 92` `[Güçlü / Çok Güçlü]`

#### 14. Puan Mühendisi
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `67 – 76`)*
* **Kimlik Özeti:** Skor tablosundaki her detayı hesaplar, el değerlendirmesi ve oyun sonu kurgusu çok güçlüdür; ancak rakiplere aktif baskı kurmaktan çok kendi puan optimizasyonuna odaklanır.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `80 – 92` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `50 – 66` `[Orta / Güçlü]`
  * **Ceza Kaçınma:** `70 – 84` `[Güçlü / Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `66 – 80` `[Güçlü]`
  * **İleri Hesap:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Baskı & Provokasyon:** `28 – 42` `[Zayıf / Orta]`
  * **Skor Farkındalığı:** `90 – 99` `[Çok Güçlü]`
  * **Tutarlılık:** `52 – 68` `[Orta / Güçlü]`

#### 15. Saf İçgüdü Ustası
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `63 – 72`)*
* **Kimlik Özeti:** Kart sayma alışkanlığı zayıf olmasına rağmen el okuma, baskı ve oyun sonu sezgisi olağanüstü yüksek olan doğal yetenek profili.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `82 – 94` `[Çok Güçlü]`
  * **Koz İştahı:** `70 – 84` `[Güçlü / Çok Güçlü]`
  * **Ceza Kaçınma:** `56 – 72` `[Orta / Güçlü]`
  * **Kart Hafızası & Çıkarım:** `20 – 34` `[Çok Zayıf / Zayıf]`
  * **İleri Hesap:** `70 – 84` `[Güçlü / Çok Güçlü]`
  * **Baskı & Provokasyon:** `80 – 92` `[Güçlü / Çok Güçlü]`
  * **Skor Farkındalığı:** `54 – 70` `[Orta / Güçlü]`
  * **Tutarlılık:** `44 – 60` `[Orta]`

#### 16. Kör Skorlu Teknisyen
* **Genel Seviye:** **Güçlü** *(Hedef Ort: `66 – 75`)*
* **Kimlik Özeti:** Her eli sanki turnuvanın ilk eliymiş gibi kusursuz teknikle oynar; ancak genel skorda önde veya geride olmasına göre vites değiştirmeyi hiç bilmez.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Koz İştahı:** `60 – 76` `[Orta / Güçlü]`
  * **Ceza Kaçınma:** `72 – 86` `[Güçlü / Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **İleri Hesap:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Baskı & Provokasyon:** `56 – 72` `[Orta / Güçlü]`
  * **Skor Farkındalığı:** `10 – 22` `[Çok Zayıf / Zayıf]`
  * **Tutarlılık:** `80 – 92` `[Güçlü / Çok Güçlü]`

---

### D. ÇOK GÜÇLÜ SEVİYE ARKETİPLER (Ortalama: 81 – 100)

#### 17. Buz Gibi Cerrah
* **Genel Seviye:** **Çok Güçlü** *(Hedef Ort: `83 – 90`)*
* **Kimlik Özeti:** Kart sayma, ileri hesap ve ceza kaçınmada kusursuzdur; tek zayıf sayılabilecek yanı gereksiz provokasyona girmemesidir.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `88 – 98` `[Çok Güçlü]`
  * **Koz İştahı:** `68 – 82` `[Güçlü / Çok Güçlü]`
  * **Ceza Kaçınma:** `90 – 99` `[Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `92 – 100` `[Çok Güçlü]`
  * **İleri Hesap:** `90 – 99` `[Çok Güçlü]`
  * **Baskı & Provokasyon:** `40 – 56` `[Zayıf / Orta]`
  * **Skor Farkındalığı:** `82 – 94` `[Çok Güçlü]`
  * **Tutarlılık:** `88 – 98` `[Çok Güçlü]`

#### 18. İmparator Kozcu
* **Genel Seviye:** **Çok Güçlü** *(Hedef Ort: `82 – 89`)*
* **Kimlik Özeti:** Masadaki kontrolü eline almak için doğmuş elit oyuncu; yüksek koz iştahı ve baskısıyla rakipleri boğar, ancak ceza kaçınmada zaman zaman hesaplı riskler alır.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `86 – 96` `[Çok Güçlü]`
  * **Koz İştahı:** `92 – 100` `[Çok Güçlü]`
  * **Ceza Kaçınma:** `48 – 64` `[Orta / Güçlü]`
  * **Kart Hafızası & Çıkarım:** `86 – 96` `[Çok Güçlü]`
  * **İleri Hesap:** `82 – 94` `[Çok Güçlü]`
  * **Baskı & Provokasyon:** `90 – 99` `[Çok Güçlü]`
  * **Skor Farkındalığı:** `80 – 92` `[Güçlü / Çok Güçlü]`
  * **Tutarlılık:** `66 – 82` `[Güçlü / Çok Güçlü]`

#### 19. Bukalemun Büyük Usta
* **Genel Seviye:** **Çok Güçlü** *(Hedef Ort: `82 – 89`)*
* **Kimlik Özeti:** Her türlü teknik becerisi elit düzeydedir; fakat rakiplerin kendisini okumasını engellemek için bilerek düşük/orta tutarlılıkla (sürpriz hamlelerle) oynar.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `88 – 98` `[Çok Güçlü]`
  * **Koz İştahı:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **Ceza Kaçınma:** `82 – 94` `[Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `90 – 99` `[Çok Güçlü]`
  * **İleri Hesap:** `88 – 98` `[Çok Güçlü]`
  * **Baskı & Provokasyon:** `84 – 96` `[Çok Güçlü]`
  * **Skor Farkındalığı:** `86 – 96` `[Çok Güçlü]`
  * **Tutarlılık:** `34 – 50` `[Zayıf / Orta]`

#### 20. Gölge Avcısı
* **Genel Seviye:** **Çok Güçlü** *(Hedef Ort: `81 – 88`)*
* **Kimlik Özeti:** İhaleye çok sık atlamaz ama ceza turlarında rakiplerin elindeki tüm tehlikeli kâğıtları adeta röntgen gibi görüp birbirlerine yutturur.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `84 – 94` `[Çok Güçlü]`
  * **Koz İştahı:** `44 – 60` `[Orta]`
  * **Ceza Kaçınma:** `88 – 98` `[Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `90 – 99` `[Çok Güçlü]`
  * **İleri Hesap:** `88 – 98` `[Çok Güçlü]`
  * **Baskı & Provokasyon:** `78 – 90` `[Güçlü / Çok Güçlü]`
  * **Skor Farkındalığı:** `76 – 88` `[Güçlü / Çok Güçlü]`
  * **Tutarlılık:** `76 – 88` `[Güçlü / Çok Güçlü]`

#### 21. Kusursuz Makine
* **Genel Seviye:** **Çok Güçlü** *(Hedef Ort: `89 – 96`)*
* **Kimlik Özeti:** Oyunun zirve zorluk seviyesini temsil eden, hiçbir kör noktası bulunmayan referans şampiyon botu.
* **Özellik Aralıkları:**
  * **El Değerlendirme:** `90 – 99` `[Çok Güçlü]`
  * **Koz İştahı:** `82 – 94` `[Çok Güçlü]`
  * **Ceza Kaçınma:** `88 – 98` `[Çok Güçlü]`
  * **Kart Hafızası & Çıkarım:** `92 – 100` `[Çok Güçlü]`
  * **İleri Hesap:** `90 – 99` `[Çok Güçlü]`
  * **Baskı & Provokasyon:** `82 – 94` `[Çok Güçlü]`
  * **Skor Farkındalığı:** `88 – 98` `[Çok Güçlü]`
  * **Tutarlılık:** `90 – 99` `[Çok Güçlü]`

---

## 4. Örnek Örnekleme (Instantiation) Gösterimi

Aynı **“Delidolu Kozcu”** arketipinden üretilen iki farklı botun (`Bot_A` ve `Bot_B`) nasıl ayrıştığına dair örnek:

| Özellik | Şablon Aralığı | Bot_A (Koz Odaklı Varyant) | Bot_B (Baskı Odaklı Varyant) |
| :--- | :---: | :---: | :---: |
| **El Değerlendirme** | `56 – 72` | `70` `[Güçlü]` | `58` `[Orta]` |
| **Koz İştahı** | `86 – 96` | `95` `[Çok Güçlü]` | `87` `[Çok Güçlü]` |
| **Ceza Kaçınma** | `14 – 26` | `16` `[Çok Zayıf]` | `25` `[Zayıf]` |
| **Kart Hafızası & Çıkarım** | `38 – 54` | `51` `[Orta]` | `40` `[Zayıf]` |
| **İleri Hesap** | `26 – 42` | `28` `[Zayıf]` | `41` `[Orta]` |
| **Baskı & Provokasyon** | `80 – 92` | `82` `[Çok Güçlü]` | `91` `[Çok Güçlü]` |
| **Skor Farkındalığı** | `34 – 50` | `36` `[Zayıf]` | `49` `[Orta]` |
| **Tutarlılık** | `24 – 40` | `38` `[Zayıf]` | `27` `[Zayıf]` |
| **Genel Ortalama** | `48 – 57` | **`52.0` (Orta)** | **`52.2` (Orta)** |
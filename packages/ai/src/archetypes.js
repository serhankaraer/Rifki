// OTOMATİK ÜRETİLDİ: docs/bot-arketipleri.md -> node tools/gen-archetypes.mjs (elle düzenlemeyin)
// 21 bot arketipi. ranges: özellik başına [min, max]; target: dokümandaki hedef genel ortalama (düz ortalama) aralığı;
// docLevel: dokümandaki genel seviye (bilgi amaçlı; oyundaki seviye özellik etki parametresinden hesaplanır: traits.js).
export const ARCHETYPES = [
  {
    no: 1, id: 'acemi-caylak', name: "Acemi Çaylak", docLevel: "Çok Zayıf", target: [12, 20],
    summary: "Tüm mekanikleri yeni öğrenen, rastgeleliğe yakın oynayan başlangıç botu.",
    ranges: { handEval: [12, 24], kozAppetite: [14, 28], penaltyAvoid: [10, 22], memory: [8, 18], lookahead: [6, 16], aggression: [8, 20], scoreAwareness: [10, 20], consistency: [15, 30] },
  },
  {
    no: 2, id: 'gozu-kara-acemi', name: "Gözü Kara Acemi", docLevel: "Zayıf", target: [28, 38],
    summary: "İhaleye atlamayı ve baskı yapmayı çok seven ama el okuması ile kart takibi çok zayıf olduğu için sık batan agresif çaylak.",
    ranges: { handEval: [16, 28], kozAppetite: [72, 86], penaltyAvoid: [10, 20], memory: [12, 24], lookahead: [10, 20], aggression: [62, 76], scoreAwareness: [14, 26], consistency: [18, 32] },
  },
  {
    no: 3, id: 'asiri-urkek-korumaci', name: "Aşırı Ürkek Korumacı", docLevel: "Zayıf", target: [30, 40],
    summary: "Ceza yemekten ölesiye korkan, elindeki iyi kâğıtları bile panikle erken atan ve hiç koz almayan pasif bot.",
    ranges: { handEval: [26, 40], kozAppetite: [8, 18], penaltyAvoid: [78, 90], memory: [24, 38], lookahead: [16, 28], aggression: [8, 18], scoreAwareness: [24, 40], consistency: [48, 64] },
  },
  {
    no: 4, id: 'hafizasi-guclu-ama-korkak', name: "Hafızası Güçlü Ama Korkak", docLevel: "Orta", target: [47, 56],
    summary: "Masada dönen neredeyse her kâğıdı sayar ama risk almaktan çekindiği için kazandığı bilgiyi saldırıya dönüştüremez.",
    ranges: { handEval: [50, 66], kozAppetite: [16, 28], penaltyAvoid: [76, 88], memory: [78, 90], lookahead: [40, 56], aggression: [12, 24], scoreAwareness: [28, 44], consistency: [54, 70] },
  },
  {
    no: 5, id: 'delidolu-kozcu', name: "Delidolu Kozcu", docLevel: "Orta", target: [48, 57],
    summary: "Koz turlarında masayı ateşe verir, rakipleri sıkıştırır ama ceza turlarında sabırsız davranıp gereksiz puan yer.",
    ranges: { handEval: [56, 72], kozAppetite: [86, 96], penaltyAvoid: [14, 26], memory: [38, 54], lookahead: [26, 42], aggression: [80, 92], scoreAwareness: [34, 50], consistency: [24, 40] },
  },
  {
    no: 6, id: 'son-el-buyucusu', name: "Son El Büyücüsü", docLevel: "Orta", target: [49, 58],
    summary: "Oyunun son 3–4 elini çok iyi kurgular ancak skor tablosunu hiç takip etmez ve açılış ellerinde dikkatsizdir.",
    ranges: { handEval: [38, 52], kozAppetite: [38, 54], penaltyAvoid: [46, 62], memory: [60, 74], lookahead: [82, 94], aggression: [40, 56], scoreAwareness: [10, 22], consistency: [52, 68] },
  },
  {
    no: 7, id: 'puan-avcisi-kumarbaz', name: "Puan Avcısı Kumarbaz", docLevel: "Orta", target: [48, 57],
    summary: "Sürekli skor tablosuna bakar; gerideyse çılgınca risk alır, öndeyse aşırı kapanır. Oyun stili çok dalgalıdır.",
    ranges: { handEval: [44, 60], kozAppetite: [56, 72], penaltyAvoid: [36, 52], memory: [34, 50], lookahead: [30, 46], aggression: [60, 76], scoreAwareness: [84, 96], consistency: [12, 24] },
  },
  {
    no: 8, id: 'klasik-kulup-oyuncusu', name: "Klasik Kulüp Oyuncusu", docLevel: "Orta", target: [50, 59],
    summary: "Aşırı uçları olmayan, masadaki sürprizli botlara karşı denge unsuru oluşturan standart oyuncu.",
    ranges: { handEval: [48, 64], kozAppetite: [44, 60], penaltyAvoid: [50, 66], memory: [46, 62], lookahead: [42, 58], aggression: [38, 54], scoreAwareness: [44, 60], consistency: [56, 72] },
  },
  {
    no: 9, id: 'kor-noktali-taktikci', name: "Kör Noktalı Taktikçi", docLevel: "Orta", target: [49, 58],
    summary: "Rakiplere kâğıt yutturmada ve el değerlendirmede çok iyidir ama çıkan kâğıtları unuttuğu için bazen boş yere yakalanır.",
    ranges: { handEval: [68, 82], kozAppetite: [54, 70], penaltyAvoid: [44, 60], memory: [12, 24], lookahead: [40, 56], aggression: [76, 88], scoreAwareness: [36, 52], consistency: [34, 50] },
  },
  {
    no: 10, id: 'sogukkanli-kart-sayici', name: "Soğukkanlı Kart Sayıcı", docLevel: "Güçlü", target: [65, 74],
    summary: "Dönen kâğıtları ve renk bitişlerini neredeyse kusursuz takip eder; ancak rakipleri psikolojik olarak zorlama veya tempo dayatma yönü zayıftır.",
    ranges: { handEval: [70, 84], kozAppetite: [46, 62], penaltyAvoid: [76, 88], memory: [88, 98], lookahead: [68, 82], aggression: [18, 30], scoreAwareness: [54, 70], consistency: [78, 90] },
  },
  {
    no: 11, id: 'acimasiz-masa-zorbasi', name: "Acımasız Masa Zorbası", docLevel: "Güçlü", target: [66, 75],
    summary: "Koz iştahı ve baskı gücü zirvededir; rakiplere sürekli ceza kâğıdı yutturmaya çalışır ama kendi savunmasını zaman zaman ihmal eder.",
    ranges: { handEval: [68, 82], kozAppetite: [88, 98], penaltyAvoid: [24, 38], memory: [66, 80], lookahead: [60, 76], aggression: [90, 99], scoreAwareness: [56, 72], consistency: [48, 64] },
  },
  {
    no: 12, id: 'kaotik-dahi', name: "Kaotik Dâhi", docLevel: "Güçlü", target: [64, 73],
    summary: "El okuma, kart sayma ve ileri hesabı üst düzeydedir; ancak tutarlılığı çok düşük olduğu için bir elde usta işi oynayıp sonraki elde tamamen ters köşe bir hamle yapar.",
    ranges: { handEval: [78, 90], kozAppetite: [58, 74], penaltyAvoid: [54, 70], memory: [80, 92], lookahead: [78, 90], aggression: [66, 82], scoreAwareness: [60, 76], consistency: [14, 26] },
  },
  {
    no: 13, id: 'pasif-kale', name: "Pasif Kale", docLevel: "Güçlü", target: [63, 72],
    summary: "Ceza turlarında geçilmesi imkânsız bir duvar gibidir; fakat koz alma konusunda çok çekingen kaldığı için ihale turlarında fırsat teper.",
    ranges: { handEval: [68, 82], kozAppetite: [14, 26], penaltyAvoid: [90, 99], memory: [76, 88], lookahead: [72, 86], aggression: [26, 40], scoreAwareness: [58, 74], consistency: [80, 92] },
  },
  {
    no: 14, id: 'puan-muhendisi', name: "Puan Mühendisi", docLevel: "Güçlü", target: [67, 76],
    summary: "Skor tablosundaki her detayı hesaplar, el değerlendirmesi ve oyun sonu kurgusu çok güçlüdür; ancak rakiplere aktif baskı kurmaktan çok kendi puan optimizasyonuna odaklanır.",
    ranges: { handEval: [80, 92], kozAppetite: [50, 66], penaltyAvoid: [70, 84], memory: [66, 80], lookahead: [76, 88], aggression: [28, 42], scoreAwareness: [90, 99], consistency: [52, 68] },
  },
  {
    no: 15, id: 'saf-icgudu-ustasi', name: "Saf İçgüdü Ustası", docLevel: "Güçlü", target: [63, 72],
    summary: "Kart sayma alışkanlığı zayıf olmasına rağmen el okuma, baskı ve oyun sonu sezgisi olağanüstü yüksek olan doğal yetenek profili.",
    ranges: { handEval: [82, 94], kozAppetite: [70, 84], penaltyAvoid: [56, 72], memory: [20, 34], lookahead: [70, 84], aggression: [80, 92], scoreAwareness: [54, 70], consistency: [44, 60] },
  },
  {
    no: 16, id: 'kor-skorlu-teknisyen', name: "Kör Skorlu Teknisyen", docLevel: "Güçlü", target: [66, 75],
    summary: "Her eli sanki turnuvanın ilk eliymiş gibi kusursuz teknikle oynar; ancak genel skorda önde veya geride olmasına göre vites değiştirmeyi hiç bilmez.",
    ranges: { handEval: [76, 88], kozAppetite: [60, 76], penaltyAvoid: [72, 86], memory: [78, 90], lookahead: [76, 88], aggression: [56, 72], scoreAwareness: [10, 22], consistency: [80, 92] },
  },
  {
    no: 17, id: 'buz-gibi-cerrah', name: "Buz Gibi Cerrah", docLevel: "Çok Güçlü", target: [83, 90],
    summary: "Kart sayma, ileri hesap ve ceza kaçınmada kusursuzdur; tek zayıf sayılabilecek yanı gereksiz provokasyona girmemesidir.",
    ranges: { handEval: [88, 98], kozAppetite: [68, 82], penaltyAvoid: [90, 99], memory: [92, 100], lookahead: [90, 99], aggression: [40, 56], scoreAwareness: [82, 94], consistency: [88, 98] },
  },
  {
    no: 18, id: 'imparator-kozcu', name: "İmparator Kozcu", docLevel: "Çok Güçlü", target: [82, 89],
    summary: "Masadaki kontrolü eline almak için doğmuş elit oyuncu; yüksek koz iştahı ve baskısıyla rakipleri boğar, ancak ceza kaçınmada zaman zaman hesaplı riskler alır.",
    ranges: { handEval: [86, 96], kozAppetite: [92, 100], penaltyAvoid: [48, 64], memory: [86, 96], lookahead: [82, 94], aggression: [90, 99], scoreAwareness: [80, 92], consistency: [66, 82] },
  },
  {
    no: 19, id: 'bukalemun-buyuk-usta', name: "Bukalemun Büyük Usta", docLevel: "Çok Güçlü", target: [82, 89],
    summary: "Her türlü teknik becerisi elit düzeydedir; fakat rakiplerin kendisini okumasını engellemek için bilerek düşük/orta tutarlılıkla (sürpriz hamlelerle) oynar.",
    ranges: { handEval: [88, 98], kozAppetite: [78, 90], penaltyAvoid: [82, 94], memory: [90, 99], lookahead: [88, 98], aggression: [84, 96], scoreAwareness: [86, 96], consistency: [34, 50] },
  },
  {
    no: 20, id: 'golge-avcisi', name: "Gölge Avcısı", docLevel: "Çok Güçlü", target: [81, 88],
    summary: "İhaleye çok sık atlamaz ama ceza turlarında rakiplerin elindeki tüm tehlikeli kâğıtları adeta röntgen gibi görüp birbirlerine yutturur.",
    ranges: { handEval: [84, 94], kozAppetite: [44, 60], penaltyAvoid: [88, 98], memory: [90, 99], lookahead: [88, 98], aggression: [78, 90], scoreAwareness: [76, 88], consistency: [76, 88] },
  },
  {
    no: 21, id: 'kusursuz-makine', name: "Kusursuz Makine", docLevel: "Çok Güçlü", target: [89, 96],
    summary: "Oyunun zirve zorluk seviyesini temsil eden, hiçbir kör noktası bulunmayan referans şampiyon botu.",
    ranges: { handEval: [90, 99], kozAppetite: [82, 94], penaltyAvoid: [88, 98], memory: [92, 100], lookahead: [90, 99], aggression: [82, 94], scoreAwareness: [88, 98], consistency: [90, 99] },
  },
];

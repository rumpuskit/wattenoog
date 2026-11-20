// Wattenoog'un olay ayarları (olay-plan.js okur; Mercanada ve Driftwood'un kendi dosyası var).
// Ada saati Berlin saati. Öğle videosu 13:30 (üretim 12:30): sabah olayı en geç 12:20'de biter. Akşam videosu 20:00
// (üretim 19:00): öğleden sonra olayı en geç 18:50'de biter (deniz olayları pencereleriyle gün ışığında başlar ve biter).
// Türler Kuzey Denizi adasına uyanlar: geyik, köpekbalığı ve balina yok; fok = Seehunde (Seehundbank), yunus = Schweinswale.
/** Adanın adı (olay-plan.js tema düzeni: üç ada birlikte planlanır, TEMA_SURUMLERI sira). */
export const ADA = "wattenoog";
export const ADA_TURLERI = ["firtina", "sis", "yangin", "kaza", "fok"];
/** Başlangıç pencereleri [en erken, en geç] (yerel dakika, Berlin). Sabah olayları SABAH_SON'dan (12:20) önce biter. */
export const PENCERE = {
  firtina: [510, 610], sis: [400, 450], yangin: [540, 650], kaza: [540, 660], zeplin: [560, 650],
  fok: [540, 660], yunus: [540, 670], hortum: [560, 680], dalga: [530, 650], kar: [500, 600],
  balon: [480, 620], ucurtma: [600, 670], kus: [540, 660], film: [560, 660], yaris: [560, 670], marti: [570, 700],
  vapur: [540, 690], balik: [540, 670], tekne_yarisi: [540, 680], dugun: [580, 680], gemi: [560, 640],
};
/** Sabah olayının en geç bitişi (yerel dk): öğle üretimi 12:30'da başlar; 12:20. */
export const SABAH_SON = 740;
/** Özel günler (olay yok): Heiligabend, 1. Weihnachtstag, Silvester (ada bayram/özel videosu). */
export function ozelGun(day) {
  const d = new Date(day * 86400000), m = d.getUTCMonth() + 1, g = d.getUTCDate();
  return m === 12 && (g === 24 || g === 25 || g === 31);
}
/** Öğleden sonra olayı: akşam videosu (20:00, üretim 19:00) anlatır. Sis yok; tür sabahkinden farklı. Başlangıç
 *  pencereleri gün ışığında (kışın gün batımı ~16:10); son: en geç bitiş 18:50 (elektrik kesintisi gün batımından sonra,
 *  ~27 Ekim–Şubat ortası sığar). Avrupa yaz saati ada saatinin kendisi: yazSon aynı. */
export const IKINCI = {
  turler: ["firtina", "yangin", "kaza", "fok", "yunus"],
  pencere: {
    firtina: [790, 880], yangin: [800, 900], kaza: [800, 920], zeplin: [800, 900], fok: [810, 930], yunus: [810, 930],
    hortum: [820, 930], dalga: [810, 920], kar: [790, 870], balon: [800, 900], ucurtma: [800, 905], kus: [810, 930],
    film: [810, 920], yaris: [810, 930], marti: [820, 960], vapur: [800, 940], balik: [800, 930], tekne_yarisi: [800, 930],
    dugun: [820, 930], elektrik: [940, 970],
  },
  varsayilan: [800, 920],
  son: 1130,
  yazSon: 1130,
};
/** Gün batımı (yerel dakika, Berlin; enlem 53,75° K, boylam 7,5° D; sky.js ile aynı yaklaşım): elektrik kesintisi
 *  yalnız lambalar yandıktan sonra (olay-plan.js elektrikPenceresi). Saat farkı gününe göre (AB yaz saati). */
export function gunBatimi(day) {
  const rad = Math.PI / 180, LAT = 53.75 * rad, LON = 7.5, h = -0.833 * rad;
  const y = new Date(day * 86400000).getUTCFullYear();
  const sonPazar = (ay) => { const d = Date.UTC(y, ay + 1, 0) / 86400000; return d - new Date(d * 86400000).getUTCDay(); };
  const TZ = day >= sonPazar(2) && day < sonPazar(9) ? 2 : 1;
  const el = (m) => {
    const n = day + 2440587.5 + (m / 60 - TZ) / 24 - 2451545.0;
    const L = (280.46 + 0.9856474 * n) % 360, g = (357.528 + 0.9856003 * n) * rad;
    const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), dec = Math.asin(Math.sin(eps) * Math.sin(lam));
    const ha = ((18.697374558 + 24.06570982441908 * n) % 24) * 15 * rad + LON * rad - ra;
    return Math.asin(Math.sin(LAT) * Math.sin(dec) + Math.cos(LAT) * Math.cos(dec) * Math.cos(ha));
  };
  let prev = el(720);
  for (let m = 722; m <= 1440; m += 2) { const e = el(m); if (prev >= h && e < h) return m; prev = e; }
  return 1440;
}
/** Olay modüllerinin dili ve adları. Wattenoog-Zeppelin 150. sakinde açılır; o zamana dek inen zeplin adanın üstünden
 *  geçen yabancı bir reklam zeplinidir. */
export const DIL = "de";
// Almanca alanlar: ad (yalın), Ad (artikelsiz), auf (bulunma: "auf dem Sportplatz"), ziel (yönelme: "auf den Sportplatz").
// İniş alanı türü (olay-zeplin.js inisYeri, olay-balon.js): saha, park (Kurpark), tarla (Polder), cimen (yedekSaha).
export const ZEPLIN = {
  kendi: { ad: "der Wattenoog-Zeppelin", Ad: "Der Wattenoog-Zeppelin", bei: "beim Wattenoog-Zeppelin" },
  ziyaretci: { ad: "ein Werbezeppelin", Ad: "Ein Werbezeppelin", der: "der Werbezeppelin", bei: "bei einem Werbezeppelin" },
  saha: { ad: "der Sportplatz", Ad: "Sportplatz", auf: "auf dem Sportplatz", ziel: "auf den Sportplatz" },
  yedekSaha: { ad: "eine Wiese am Ortsrand", Ad: "Wiese am Ortsrand", auf: "auf einer Wiese am Ortsrand", ziel: "auf eine Wiese am Ortsrand" },
  park: { ad: "der Kurpark", Ad: "Kurpark", auf: "im Kurpark", ziel: "in den Kurpark" },
  tarla: { ad: "die Felder am Polder", Ad: "Polder", auf: "auf den Feldern am Polder", ziel: "auf die Felder am Polder" },
};
/** Tür listesi sürümleri (olay-plan.js): yeni türler yalnız sürümün gününden itibaren takvime girer; önceki günler değişmez.
 *  22 Kasım'dan itibaren HANGİ gün hangi türün çıkacağını olay-plan.js tema düzeni seçer (üç ada birlikte). */
export const TUR_SURUMLERI = [
  { gun: "2026-11-22", komsu: true,
    sabah: ["firtina", "sis", "yangin", "kaza", "fok", "yunus", "zeplin", "dugun", "hortum", "gemi", "balon", "ucurtma", "kus", "film", "yaris", "marti", "dalga", "kar", "vapur", "balik", "tekne_yarisi"],
    ikinci: ["firtina", "yangin", "kaza", "fok", "yunus", "zeplin", "dugun", "hortum", "balon", "ucurtma", "kus", "film", "yaris", "marti", "dalga", "kar", "vapur", "balik", "tekne_yarisi", "elektrik"] },
];
/** Adaya özgü olay adları (olay-plan.js OLAYLAR: [tr, görünen ad (de)]). */
export const ADLAR = {
  firtina: ["Fırtına", "Sturm"], sis: ["Sis", "Seenebel"], yangin: ["Yangın", "Feuer"], kaza: ["Kaza", "Unfall"],
  fok: ["Seehundlar", "Seehunde auf der Sandbank"], yunus: ["Muturlar", "Schweinswale"], zeplin: ["Zeplin acil inişi", "Zeppelin-Notlandung"],
  dugun: ["Düğün konvoyu", "Hochzeitskorso"], hortum: ["Su hortumu", "Wasserhose"], gemi: ["Dev gemi", "Containerriese"],
  balon: ["Balonlar", "Heißluftballons"], ucurtma: ["Uçurtma şenliği", "Drachenfest"], kus: ["Göçmen kazlar", "Ringelgänse"],
  film: ["Film çekimi", "Krimi-Dreh"], yaris: ["Ada maratonu", "Volkslauf"], marti: ["Martı Fischbrötchen kaptı", "Möwe klaut Fischbrötchen"],
  dalga: ["Fırtına kabarması", "Sturmflut"], kar: ["Kar", "Schnee"], vapur: ["Feribot arızası", "Fähre mit Maschinenschaden"],
  balik: ["Dev av", "Riesenfang"], tekne_yarisi: ["Kutter yarışı", "Kutterregatta"], elektrik: ["Elektrik kesintisi", "Stromausfall"],
};
/** Kuş olayı (olay-kus.js kaz): Ringelgans sürüsü batıdan Watt üstünden gelir, bataklığın üstünde döner (gelis), küçük
 *  gruplar halinde iner (inis), Salzwiese'de otlar (otlama), birlikte doğuya uçar (gidis). */
export const KUS = { tur: "kaz", evre: [[0.2, "gelis"], [0.36, "inis"], [0.82, "otlama"], [1, "gidis"]] };
/** Drachenfest (olay-ucurtma.js): setin önündeki çayırda değil, Marktplatz'ın kuzeyindeki Kurpark'ta değil: kumsalda. */
export const UCURTMA = { yer: "plaj", ad: "der Hauptstrand" };
/** Seehunde: bir grup liman foku (benekli, küçük) Seehundbank'ta ve kıyıda. */
export const FOK = { tur: "liman", sayi: 7 };
/** Yunus olayının hayvanı (deniz.js): "schweinswal" = Kuzey Denizi muturu (1,6 m, koyu gri, küt baş, alçak üçgen yüzgeç;
 *  sıçramaz, nefes alırken sırtı yuvarlanarak görünür; sürü 3–6). Yoksa şişe burunlu yunus. */
export const YUNUS = { tur: "schweinswal" };
/** Wasserhose: kıyıdan uzaklık (m) ve bulut tabanı yüksekliği (m). */
export const HORTUM = { uzak: 520, H: 320 };

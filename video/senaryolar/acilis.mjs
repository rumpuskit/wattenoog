// 1. video (açılış, sesli, Almanca): denizden bomboş adaya alçalış ("Auf dieser Insel wohnt niemand.") → setteki
// koyunlar ("Nur Schafe.") → alacakaranlıkta fener (8. sakin; yorumla başka meslek istemediyse, sim.js jobOf) → ilk adres (sim'den: slot 0) →
// büyüme montajı (gelişim tablosundan: Fischbude, Bäckerei, Kirche, Kurhaus; kesmeler kelimelere oturur) → `gelisim=3000`
// ile dolu ada ("So wird sie.") → soru + kapanış kalıbı (feribot, "@du" etiketli sakin, boş ada).
// Çekim süreleri seslendirmenin cümle/kelime zamanlarından hesaplanır (cikti/01-acilis/ses.json; yoksa önce
// `node seslendir.mjs senaryolar/acilis.mjs`: anlatıcı sesi seçilmeden çalışmaz, bkz. seslendir.mjs ANLATICI_SESI).
// Metin değişirse çekim-cümle eşlemesi (kesimler) elden geçirilir.
// Noktalar elle yazılmaz: sitenin kendi yerleşiminden (layout.js World, aynı düzeyde) hesaplanır; ada değişse de kadraj
// doğru yeri gösterir. 20 Kasım ölçümü: Marktplatz (0, 0), Fischbude (−10, 622; kapı limana), Inselbäckerei (−30, 44,5),
// Inselkirche (−84, −5; kapı meydana), Kurhaus (42, −1470; kapı denize), feribot (108, 704), Leuchtturm (−3250, −560;
// kumul 12,5 m), ilk ev Möwenweg 1 (−792, 46), koyunlar setin önünde (x −1300…−600).
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sim from "../../web/src/sim.js";
import { num } from "../../web/src/fmt.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(readFileSync(resolve(HERE, "../../data/catalog.json"), "utf8"));
sim.setCatalog(catalog);
const { World } = await import("../../web/src/world/layout.js");
/** n sakinli adanın yerleşimi (sitedeki ?nufus=n ile aynı). */
const dunya = (n) => { sim.setTown(n); return new World(n); };

// --- gerçek olgular (sim ve katalogdan) ---
const ilkAdres = sim.streetAddress(0); // "Möwenweg 1": ilk takip eden (ilk katılan) buraya taşınır
const ilkMahalle = sim.mahalleName(sim.addressParts(0).mahalle);
const fenerNo = (catalog.meslekler.find((m) => m.id === "fener_bekcisi")?.kadro?.sira ?? 7) + 1;
const esik = (key) => catalog.gelisim.find((s) => s.acar.includes(key));
const MONTAJ = [["kahvehane", "kahvehane:0"], ["firin", "firin:0"], ["cami", "cami:0"], ["lunapark", "lunapark:0"]].map(([k, key]) => ({ kind: k, ...esik(key) }));
const EINS = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf"];
const sesSayi = (d) => EINS[d] ?? String(d); // adres numarası küçük (ilk ev 1)
const adresSes = ilkAdres.replace(/Whg\./g, "Wohnung").replace(/\d+/g, (d) => sesSayi(Number(d)));

const AD = "01-acilis";
const SESLENDIRME = [
  { ses: "Auf dieser Insel wohnt niemand." },                                                          // 0
  { ses: "Nur Schafe." },                                                                              // 1
  { ses: "Der Leuchtturm wartet schon." },                                                             // 2
  { ses: `Nummer ${EINS[fenerNo] ?? fenerNo} bekommt ihn.`, yazi: `Nummer ${fenerNo} bekommt ihn.` }, // 3
  { ses: "Außer, du wünschst dir was anderes." },                                                                    // 4
  // Eski hesap (1.059 takipçi): ilk ev ilk TAKİP edene değil ilk TAŞINANA (yeni takipçi ya da "einziehen" yazan eski takipçi).
  { ses: `Wer als Erstes einzieht, bekommt ${adresSes}.`, yazi: `Wer als Erstes einzieht,\nbekommt ${ilkAdres}.` }, // 5
  { ses: "Mit jedem neuen Menschen kommt etwas dazu.", yazi: "Mit jedem neuen Menschen\nkommt etwas dazu." }, // 6
  { ses: "Eine Fischbude. Eine Bäckerei. Eine Kirche. Ein Kurhaus.", yazi: "Eine Fischbude. Eine Bäckerei.\nEine Kirche. Ein Kurhaus." }, // 7
  { ses: "So wird sie." },                                                                             // 8
  { ses: "Wer macht den Anfang?" },                                                                    // 9
  { ses: "Folg uns, dann ziehst du auf die Insel.", yazi: "Folg uns, dann ziehst du\nauf die Insel." }, // 10
  { ses: "Such dir deinen Beruf aus." },                                                               // 11
  { ses: "Schreib: Beruf, Fischerei.", yazi: "Schreib:\nBeruf: Fischerei" },                           // 12
];
const ARALAR = { 1: 0.35, 4: 0.35, 9: 0.2 }; // vuruş öncesi sessizlik ("Nur Schafe.", "Außer, …")

const sesYolu = resolve(HERE, "../cikti", AD, "ses.json");
const ses = existsSync(sesYolu) ? JSON.parse(readFileSync(sesYolu, "utf8")) : null;
const kay = (k) => Object.entries(ARALAR).reduce((a, [j, d]) => a + (Number(j) <= k ? d : 0), 0);
const bas = (k) => (ses ? ses.cumleler[k].bas + kay(k) : k * 2.2);
const son = (k) => (ses ? ses.cumleler[k].son + kay(k) : k * 2.2 + 1.8);
/** k. cümlenin i. kelimesinin başlangıcı (montaj kesmeleri için). */
const kelime = (k, i) => (ses ? ses.cumleler[k].kelimeler[i][1] + kay(k) : bas(k) + i * 0.4);

// --- kadrajlar (yerleşimden) ---
const W0 = dunya(0);
const gy = (W, x, z) => Math.max(0, W.groundY(x, z));
/** Bina kapısının önünden binaya bakan iki anahtar kare (hafif itme): D yatay uzaklık, H yükseklik, bak hedef yüksekliği. */
function binaKamera(W, kind, D, H, bak) {
  const w = W.workplaces?.[kind]?.[0];
  if (!w?.building) throw new Error(`açılış: ${kind} bu düzeyde yok`);
  const b = w.building, [dx, dz] = w.door, L = Math.hypot(dx - b.x, dz - b.z) || 1, ux = (dx - b.x) / L, uz = (dz - b.z) / L;
  const hy = gy(W, b.x, b.z) + bak;
  const k = (d, h) => [b.x + ux * (L + d), gy(W, b.x + ux * (L + d), b.z + uz * (L + d)) + h, b.z + uz * (L + d)];
  return (s) => [[0, ...k(D, H), b.x, hy, b.z], [s, ...k(D * 0.9, H * 0.93), b.x, hy, b.z]];
}
// Fener: kara tarafından (doğu), deniz arkada; alacakaranlıkta ışın yanar.
const F = W0.fener, fy = gy(W0, F.x, F.z);
const fenerUzak = (s) => [[0, F.x + 92, fy + 30, F.z + 30, F.x, fy + 13, F.z], [s, F.x + 84, fy + 27, F.z + 22, F.x, fy + 13, F.z]];
const fenerYakin = (s) => [[0, F.x + 14, fy + 20, F.z + 8, F.x, fy + 21, F.z], [s, F.x + 13, fy + 21, F.z + 10, F.x, fy + 21.5, F.z]];
// Koyunlar: köye en yakın setin önündeki (Watt tarafı) sürü; kamera kara tarafından, arkada Watt.
const S0 = W0.features.filter((f) => f.type === "schafe" && f.x > -1300 && f.x < -500).sort((a, b) => b.x - a.x)[0]
  ?? W0.features.find((f) => f.type === "schafe");
const sy = gy(W0, S0.x, S0.z);
const koyun = (s) => [[0, S0.x - 5, sy + 2.4, S0.z - 11, S0.x, sy + 0.6, S0.z], [s, S0.x - 3, sy + 2.1, S0.z - 9, S0.x, sy + 0.6, S0.z]];
// İlk ev (ilk sakin gelince dikilir: önizleme nufus=1), kapı tarafından.
const W1 = dunya(1), ev = W1.homeOf(0), [edx, edz] = ev.door, eL = Math.hypot(edx - ev.bx, edz - ev.bz) || 1;
const eux = (edx - ev.bx) / eL, euz = (edz - ev.bz) / eL, ey = gy(W1, ev.bx, ev.bz);
const ilkEv = (s) => [[0, ev.bx + eux * 24 + euz * 6, ey + 7, ev.bz + euz * 24 - eux * 6, ev.bx, ey + 3, ev.bz], [s, ev.bx + eux * 20 + euz * 4, ey + 6, ev.bz + euz * 20 - eux * 4, ev.bx, ey + 3, ev.bz]];
// Feribot (iskelenin doğu yanında), deniz seviyesinden.
const V = W0.features.find((f) => f.type === "vapur");
const feribot = (s) => [[0, V.x + 45, 6, V.z + 40, V.x - 3, 4, V.z - 6], [s, V.x + 39, 5.5, V.z + 28, V.x - 3, 4, V.z - 6]];
const montajKamera = {
  kahvehane: binaKamera(dunya(MONTAJ[0].nufus), "kahvehane", 20, 7, 2.5),
  firin: binaKamera(dunya(MONTAJ[1].nufus), "firin", 22, 8, 4),
  cami: binaKamera(dunya(MONTAJ[2].nufus), "cami", 30, 9, 10),
  lunapark: binaKamera(dunya(MONTAJ[3].nufus), "lunapark", 58, 16, 8),
};

const GECIS = 0.35;
const pill = (metin, alt, sure) => [{ metin, ...(alt ? { alt } : {}), bas: -1, son: sure + 1, yer: "ust" }];
const montaj = (n, yer) => pill(`${num(n)} Einwohner`, yer, 9);
// Çekim listesi: [başlangıç zamanı, çekim]. Süre bir sonrakinin başlangıcından hesaplanır (geçiş payıyla).
const kesimler = [
  // 0: denizden (Watt'ın üstünden, güneyden) bomboş adaya alçalış (kanca). Önde liman ve feribot, arkada köy ve kumullar.
  [0, { adres: "saat=10:40&hiz=6&nufus=0", kamera: (s) => [[0, 320, 240, 1750, 0, 0, -220], [s, 170, 120, 1180, 0, 0, -160]],
    yazilar: (s) => pill("Einwohner: 0", null, s) }],
  // 1: setin önünde otlayan koyunlar, alçaktan (vuruş).
  [bas(1) - 0.15, { adres: "saat=11:40&hiz=2&nufus=0", kamera: koyun }],
  // 2: fener, alacakaranlık, uzaktan (ışın yanıyor); 3: fener odası yakından; 4: aynı yakın, ışın dönerken (vuruş).
  [bas(2) - 0.15, { adres: "saat=17:20&hiz=4&nufus=0", kamera: fenerUzak }],
  [bas(3) - 0.15, { adres: "saat=17:22&hiz=4&nufus=0", kamera: fenerYakin }],
  [bas(4) - 0.15, { adres: "saat=17:23&hiz=4&nufus=0", kamera: (s) => fenerYakin(s).map(([t, x, y, z, ...r]) => [t, x - 6, y - 4, z + 6, ...r]) }],
  // 5: ilk adres, ilk sakin gelince dikilen Friesenhaus (önizleme: nufus=1).
  [bas(5) - 0.15, { adres: "saat=10:20&hiz=4&nufus=1", kamera: ilkEv, yazilar: (s) => pill(ilkAdres, ilkMahalle, s) }],
  // 6: montaj başı, 5 sakin: Marktplatz'ın Klönbänke ve ıhlamurları.
  [bas(6) - 0.15, { adres: "saat=10:40&hiz=4&nufus=5", isinma: 40, kamera: (s) => [[0, 46, 24, 58, 0, 2, 0], [s, 36, 20, 50, 0, 2, 0]],
    yazilar: () => montaj(5, "Marktplatz") }],
  // 7: kelimelere oturan kesmeler: Fischbude, Bäckerei, Kirche, Kurhaus (gelişim eşiklerinde, kendi düzeylerinde).
  ...MONTAJ.map((m, i) => [kelime(7, i * 2) - 0.1, { adres: `saat=${["11:20", "11:40", "12:10", "15:50"][i]}&hiz=4&nufus=${m.nufus}`, isinma: 40,
    kamera: montajKamera[m.kind], yazilar: () => montaj(m.nufus, m.ad) }]),
  // 8: "So wird sie.": 3.000 sakinli ada (gelisim=3000), ikindi güneşi, güneydoğudan yüksek uçuş.
  [bas(8) - 0.15, { adres: "saat=14:50&hiz=4&gelisim=3000&nufus=3000", isinma: 90, kamera: (s) => [[0, 520, 260, 1120, 0, 0, -320], [s, 430, 215, 960, 0, 0, -320]],
    yazilar: () => montaj(3000, null) }],
  // 9: soru: boş Marktplatz, sabah, alçaktan.
  [bas(9) - 0.15, { adres: "saat=08:50&hiz=2&nufus=0", kamera: (s) => [[0, 34, 6, 38, 0, 2, 0], [s, 28, 5.5, 32, 0, 2, 0]] }],
  // 10: "Folg uns, …": yanaşmış feribot (dakika 0–7 mod 20 iskelede: 08:24).
  [bas(10) - 0.15, { adres: "saat=08:24&hiz=4&nufus=0", kamera: feribot }],
  // 11: dolu adada Strandstraße'de yürüyen bir sakin yakından, adının yerinde "@du".
  [bas(11) - 0.15, { adres: "saat=15:40&hiz=2&gelisim=3000&nufus=3000", isinma: 90,
    takip: { yakin: true, yalniz: true, x: 0, z: -160, ad: "du", uzaklik: 5.2, aci: 0.8, yukseklik: 1.7, bak: 0.75,
      secim: { sac: [2, 4, 7], ust: ["#b8423c", "#d9a441", "#3e8a86", "#d98ca0", "#8fb6d9"], sakal: false, gozluk: false,
        sacRenk: ["#3b2a20", "#5e4128", "#8c5a32"] } } }],
  // 12: kapanış: bomboş ada yüksekten, çağrı.
  [bas(12) - 0.15, { adres: "saat=10:40&hiz=6&nufus=0", kamera: (s) => [[0, 380, 320, 1350, 0, 0, -260], [s, 450, 400, 1500, 0, 0, -280]],
    yazilar: (s) => [{ metin: "Zieh als Erstes ein.", alt: "Folg uns auf TikTok<br><small>@wattenoog</small>", bas: 0.2, son: s, yer: "ust" }] }],
];
const bitis = son(SESLENDIRME.length - 1) + 1.4;
const cekimler = kesimler.map(([t0, c], i) => {
  const t1 = i < kesimler.length - 1 ? kesimler[i + 1][0] : bitis;
  const sure = +(t1 - Math.max(0, t0) + (i < kesimler.length - 1 ? GECIS : 0)).toFixed(3);
  const { kamera, yazilar, ...rest } = c;
  return { sure, ...rest, ...(kamera ? { kamera: kamera(sure) } : {}), ...(yazilar ? { yazilar: yazilar(sure) } : {}) };
});

export default {
  ad: AD,
  seslendirme: SESLENDIRME,
  aralar: ARALAR,
  muzik: "cikti/muzik/ada-1.mp3",
  fps: 30,
  w: 1080,
  h: 1920,
  gecis: GECIS,
  // Açıklama: adres (URL) yok, tam 5 hashtag (havuzdan; ilk günlük videolar etiket.mjs ile bunlardan kaçınır).
  aciklama: `Auf dieser Insel wohnt noch niemand. Nur Schafe 🐑
Folg uns, dann ziehst du ein: dein Haus, dein Beruf, dein Tag. Live auf der Insel.
Du folgst schon länger? Schreib „einziehen“ in die Kommentare.
Wer zieht als Erstes ein? 👇 Such dir deinen Beruf aus: Schreib „Beruf: Fischerei“ (oder einen anderen).

#nordsee #inselleben #simulation #leuchtturm #moin`,
  cekimler,
};

// Açıklama kuralları (17 Kasım 2026, kullanıcı: "açıklamalarda url paylaşımı yapmayalım ve açıklamalarda 5 hashtag her
// zaman farklı olsun mutlaka"):
//   - açıklamada adres yok (http, www, alan adı içeren satır düşer);
//   - tam 5 hashtag (hashtag.json: 20'lik Almanca havuz; Wattenoog, DEVIR §10);
//   - önceki iki videonun hiçbir hashtag'i tekrar edilmez (aynı günün öbür videosu + ondan önceki);
//   - aynı beşli daha önce hiç kullanılmamış olur.
// Geçmiş: cikti/gunluk/<tarih>-<yuva>/ACIKLAMA.txt (yalnız ogle/aksam; deneme "sabah" sayılmaz). Seçim tarih+yuva ile
// belirlenir (önizleme ve son üretim aynı beşliyi verir).
// CLI: node etiket.mjs <tarih> <yuva> [açıklama dosyası]: dosya verilirse kurala uydurup yerinde yazar, değişikliği basar.
//      node etiket.mjs --benzetim [N]: N ardışık video (günde ogle + aksam) için seçimi benzetir, kural ihlallerini sayar.
// Almanca: küçük harf "de" kuralıyla ve NFC (ö/ü/ß tek kod noktası; Türkçe I→ı dönüşümü hiçbir yerde yok, DEVIR §4.2).
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const HAVUZ = JSON.parse(readFileSync(resolve(HERE, "hashtag.json"), "utf8"));
const YUVA_SIRA = { ogle: 0, aksam: 1 };
const ADRES = /https?:\/\/|www\.|\b[\w-]+\.(?:com|net|org|app|io|co|de|eu|at|ch|info|tr|me|gg|live|site|link|shop)\b/i;
// Sakin adları (@pubg_mobile72.com gibi) adres sayılmaz.
const adresli = (s) => ADRES.test(s.replace(/@[\w.]+/g, ""));
const ETIKET = /(^|\s)#[\p{L}\p{N}_]+/gu;

const kucuk = (e) => e.normalize("NFC").toLocaleLowerCase("de");
export const etiketleri = (metin) => [...String(metin).normalize("NFC").matchAll(ETIKET)].map((m) => kucuk(m[0].trim()));

/** Önceki videoların hashtag listeleri, en yeni önce. */
export function gecmis(tarih, yuva, klasor = resolve(HERE, "cikti/gunluk")) {
  const anahtar = (t, y) => `${t}-${YUVA_SIRA[y]}`;
  const simdi = anahtar(tarih, yuva in YUVA_SIRA ? yuva : "aksam");
  // Açılış videosu (senaryolar/acilis.mjs → cikti/01-acilis/ACIKLAMA.txt) geçmişin en eskisi: ilk günlük videolar onun
  // hashtag'lerinden de kaçınır.
  const acilis = resolve(klasor, "../01-acilis/ACIKLAMA.txt");
  const ilk = existsSync(acilis) ? [etiketleri(readFileSync(acilis, "utf8"))] : [];
  if (!existsSync(klasor)) return ilk;
  return readdirSync(klasor)
    .map((ad) => /^(\d{4}-\d{2}-\d{2})-(ogle|aksam)$/.exec(ad))
    .filter((m) => m && anahtar(m[1], m[2]) < simdi && existsSync(resolve(klasor, m[0], "ACIKLAMA.txt")))
    .sort((a, b) => (anahtar(a[1], a[2]) < anahtar(b[1], b[2]) ? 1 : -1))
    .map((m) => etiketleri(readFileSync(resolve(klasor, m[0], "ACIKLAMA.txt"), "utf8")))
    .concat(ilk);
}

/** Kurala uyan 5 hashtag (deterministik: tarih + yuva tohumu). */
export function sec(tarih, yuva, onceki = gecmis(tarih, yuva)) {
  const yasak = new Set([...(onceki[0] ?? []), ...(onceki[1] ?? [])]);
  const son = (e) => { const i = onceki.findIndex((l) => l.includes(e)); return i < 0 ? 1e9 : i; }; // büyük: uzun süredir yok
  const aday = HAVUZ.filter((e) => !yasak.has(kucuk(e)));
  if (aday.length < 5) throw new Error(`hashtag havuzu yetmiyor (${aday.length} aday)`);
  let t = [...`${tarih}-${yuva}`].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);
  const rnd = () => ((t = (Math.imul(t ^ (t >>> 15), 2246822507) + 0x9e3779b9) >>> 0) / 4294967296);
  // En uzun süredir kullanılmayan 8 aday, tohumla karıştırılıp ilk 5; beşli daha önce kullanıldıysa sonraki karışım.
  const enEski = aday.map((e, i) => [e, son(e), i]).sort((a, b) => b[1] - a[1] || a[2] - b[2]).slice(0, Math.min(aday.length, 8)).map((x) => x[0]);
  const gorulen = new Set(onceki.map((l) => [...l].sort().join(" ")));
  for (let deneme = 0; deneme < 50; deneme++) {
    const k = [...enEski].map((e) => [e, rnd()]).sort((a, b) => a[1] - b[1]).slice(0, 5).map((x) => x[0]);
    if (!gorulen.has(k.map(kucuk).sort().join(" "))) return k;
  }
  return aday.slice(0, 5);
}

/** Açıklamayı kurala uydurur: adresli satırlar düşer, hashtag'ler çıkarılır, sonda tek satır 5 hashtag. */
export function duzelt(metin, tarih, yuva, onceki) {
  const satirlar = String(metin).normalize("NFC").replace(/\r/g, "").split("\n").filter((s) => !adresli(s)).map((s) => s.replace(ETIKET, "$1").replace(/[ \t]+$/, ""));
  while (satirlar.length && !satirlar.at(-1).trim()) satirlar.pop();
  return [...satirlar, "", sec(tarih, yuva, onceki).join(" ")].join("\n");
}

/** Kural ihlalleri (boşsa uygun). */
export function denetle(metin, tarih, yuva, onceki = gecmis(tarih, yuva)) {
  const h = [], e = etiketleri(metin);
  if (String(metin).split("\n").some(adresli)) h.push("açıklamada adres var");
  if (e.length !== 5 || new Set(e).size !== 5) h.push(`${e.length} hashtag (5 olmalı)`);
  const yasak = new Set([...(onceki[0] ?? []), ...(onceki[1] ?? [])]), tekrar = e.filter((x) => yasak.has(x));
  if (tekrar.length) h.push(`önceki iki videoda kullanılan hashtag: ${tekrar.join(" ")}`);
  if (onceki.some((l) => l.length && [...l].sort().join(" ") === [...e].sort().join(" "))) h.push("bu beşli daha önce kullanıldı");
  return h;
}

/** Benzetim: n video (2026-11-21'den, günde ogle + aksam) art arda seçilir; her biri öncekilere göre denetlenir. */
export function benzetim(n = 240) {
  const gecmisL = [], ihlal = [];
  for (let i = 0; i < n; i++) {
    const tarih = new Date(Date.UTC(2026, 10, 21) + Math.floor(i / 2) * 86400000).toISOString().slice(0, 10), yuva = i % 2 ? "aksam" : "ogle";
    const onceki = [...gecmisL].reverse();
    const e = sec(tarih, yuva, onceki);
    const metin = `Auf dieser Insel wohnt noch niemand 🏝️\n\n${e.join(" ")}`;
    const h = denetle(metin, tarih, yuva, onceki);
    if (h.length) ihlal.push(`${tarih} ${yuva}: ${h.join("; ")}`);
    if (e.some((x) => !HAVUZ.includes(x))) ihlal.push(`${tarih} ${yuva}: havuz dışı etiket`);
    gecmisL.push(e.map(kucuk));
  }
  return { n, ihlal, havuz: HAVUZ.length, farkliBesli: new Set(gecmisL.map((l) => [...l].sort().join(" "))).size };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--benzetim") {
    const r = benzetim(Number(process.argv[3] ?? 240));
    console.log(`benzetim: ${r.n} video, havuz ${r.havuz}, farklı beşli ${r.farkliBesli}, ihlal ${r.ihlal.length}`);
    for (const x of r.ihlal.slice(0, 20)) console.log("  " + x);
    process.exit(r.ihlal.length ? 1 : 0);
  }
  const [tarih, yuva, dosya] = process.argv.slice(2);
  if (!tarih || !yuva) { console.error("kullanım: node etiket.mjs <tarih> <yuva> [ACIKLAMA.txt]"); process.exit(1); }
  const onceki = gecmis(tarih, yuva, process.env.ETIKET_GECMIS);
  if (!dosya) { console.log(sec(tarih, yuva, onceki).join(" ")); process.exit(0); }
  const eski = readFileSync(dosya, "utf8").replace(/\s+$/, "");
  const hata = denetle(eski, tarih, yuva, onceki);
  if (!hata.length) { console.log("uygun"); process.exit(0); }
  writeFileSync(dosya, duzelt(eski, tarih, yuva, onceki) + "\n");
  console.log(`düzeltildi: ${hata.join("; ")}`);
}

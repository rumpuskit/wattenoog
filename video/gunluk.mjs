// Günlük video: sitenin herkese açık sakin listesinden ve simülasyondan günün hikâyesini seçer, anlatım
// standardına (video/cikti/ANLATIM-STANDARDI.md) uygun seslendirme ve çekim planını kurar; istenirse sesi ve
// videoyu üretir, açıklamayı panoya kopyalar ve bildirim gönderir.
//
//   node gunluk.mjs [--yuva ogle|aksam|sabah] [--uret] [--onizleme] [--bildir] [--zorla] [--ac] [--taslaksiz] [--hikaye h.json]
//
// --hikaye: günün hikâyesi elle (gerçek olaylardan, sitede doğrulanmış): {"tur", "kanca", "govde": [{ses, yazi?,
// vurus?}], "soru": {ses, yazi?}, "cekim": ["fener", {"sakin": "ad"}, ...], "etiketler": [...], ("saat" artık yok sayılır: ada saati üretim anı),
// "imza2": {ses, yazi?} (kilit sayacının ikinci cümlesi: sıradaki yer yerine başka bir hedef, ör. zeplin),
// "ilk": imza çekimi (varsayılan "ucus"), "onsoz"/"onsozCekim", "soruCekim", "tasinCekim": "Folg uns, dann ziehst du
// auf die Insel" karesi (varsayılan "iskele"), "acilis": videonun İLK cümlesinin çekimi (varsayılan "bayrak": Rathaus'un
// önündeki direkte dalgalanan ada bayrağı, kart yok; direk Rathaus'la (100. sakin) gelir, o zamana dek kaydet.mjs
// feneri alttan çeker ve UYARI yazar; null = açılış çekimi yok), "einziehen": true|false (kapanışta eski takipçilere
// "Du folgst schon länger? Schreib: einziehen." cümlesi; verilmezse her üç videoda bir, tarih + yuvadan)}. "ilk" bir dizi de olabilir (imza cümleleri
// sırayla bu çekimlere bölünür, bilgi kartı yalnız ilkinde). İmza ve kapanış yine standarttan gelir. --ac: üretim bitince klasörü Finder'da açar.
// Çekim tanımı (cekim/ilk/onsozCekim/soruCekim/tasinCekim öğeleri): "iskele" (kütüphane adı: bayrak, ucus, iskele,
//   iskele2 [Fähranleger, feribot], meydan, meydan2 [Marktplatz, Marktbrunnen], kilise [Inselkirche, 50. sakin], fener,
//   fener2 [Leuchtturm Westkopf], ilkev, siradaki, watt [alçak suda Watt, limanın batısı], strand [Hauptstrand,
//   Strandkörbe 60. sakinde], muehle [Windmühle], wasserturm, zeplin, zeplin2) | {"sakin": "ad", "yon"?: 1|-1 (kameranın dönüş yönü; varsayılan sırayla)} |
//   kadraj ayarı {"yer": "iskele", "aci": rad (hedef çevresinde döndür), "uzak": çarpan, "yuk": yükseklik çarpanı,
//   "varyant": n (kütüphanedeki n. açı)} | ham yörünge {"yorunge": {"hedef": "iskele"|"meydan"|"fener"|"kilise"|
//   "ilkev"|"siradaki"|"bayrak"|"watt"|"strand"|"muehle"|"wasserturm"|[x, z], "r", "h", "a0", "a1", "bak"},
//   "vapur": true (iskelede feribot dakikası)}. Ayarlı/ham
//   çekim otomatik döndürülmez (ilk parça verilen kadraj, sonraki parçalar ondan yarım ölçüde sapar). | kilitli yerin
//   taslağı {"taslak": "firin:0", "r"?, "h"?, "a0"?, "a1"?, "bak"?} (sıradaki OLMAYAN açılmamış yerin binaları yarı
//   saydam taslak + çitle; metin "gibt es noch nicht / kommt bei N Einwohnern" demeli); ham yörüngeye de "taslak" eklenebilir.
// Çekim nesnesinde ayrıca "saat": "HH:MM[:SS]" | olay saati (aşağıda) ve "hiz" (benzetim hızı, varsayılan 4); cümlede
//   "ara": sn (öncesine sessizlik). --tarih YYYY-AA-GG (deneme) sitenin tarihini değiştirir.
// Hareket dili (16 Kasım 2026, Mercanada'dan; ayrıntı video/cikti/VIDEO-URETIM-REHBERI.md §5.4): her çekime otomatik bir
//   kamera hareketi atanır; art arda iki çekim aynı aileden olmaz, ~25 sn'lik video ≥4 farklı hareket kullanır. Çekim
//   nesnesinde isteğe bağlı: "hareket": yorunge | itme | vinc | yanKay | alcak | tele | el | whip | vertigo | drone |
//   takip | yanTakip (zorlar; bölünen çekimde yalnız ilk parça; drone ve vertigo YALNIZ böyle), "yon": ±1, "sarsinti":
//   0–1, "fov": derece (varsayılan 40; tele 16), "gecis": kesme | solma | kaydir | flas | yakinlas (bu çekime GİRİŞ).
//   Yalnız {"yer": ".."} verilirse kadraj elle sayılmaz (hareket serbest); aci/uzak/yuk/varyant, ham yörünge ve taslak
//   kadrajını korur (yalnız yorunge, el, whip ya da küçük yanKay).
// Olay çekimleri (günün olayı, web/src/world/olay-plan.js + olay-ayar.js; olay sistemi üç adada ortak, Wattenoog'un
//   türleri Aşama 5b'de; bu dosya yalnız planı okur):
//   "olay" (geniş), "olay-yakin" (sokak düzeyi, el kamerası), "olay-kalabalik" (seyirciler), "olay-tele" (uzaktan dar
//   açı), "olay-hava" (fırtına: iskele başından deniz ve gök; sis: denizden limana), "olay-arac:<ad>" (araç yolu ve
//   itfaiye açılınca). Saat verilmezse olaya uygun an (OLAY_ANI). "saat": "olay+12" (başından dk, kesirli/eksi) |
//   "olay:<evre>" (evre ortası) | "olay:<evre>+N". Fırtınada çekime bir şimşek, balinada bir sıçrama kendiliğinden
//   oturtulur (kaydet.mjs anAni; "an": false kapatır). Bugün olay yoksa olay çekimleri Marktplatz/uçuşa düşer (UYARI).
//   Deneme: --olay sis --olaysaat 06:00 (olayı zorlar, sayfaya da geçer), --ad test-x (ayrı çıktı klasörü).
//   Efektler (efekt.mjs): "efekt": ad | {ad, sure, ses dB, bas sn} | dizi | false; siren, vapur, sisduduk, siren-arac,
//   carpisma, gok, yagmur, korna, su, kalabalik. Fırtınada yağmur ve şimşekte gök gürültüsü, siste sis düdüğü kendiliğinden.
// --cekim-dene N: önizleme ölçeğinde yalnız N. çekimi çizer (sesi önbellekten), cekimN-kareler.jpg (baş/orta/son) yazar;
//   kadrajı tek tek düzeltmek için. Durum yazılmaz.
//
// Yuva (Berlin saati; ada saati de Berlin, çeviri yok): öğle (13:30; 09:00 taşınmasından sonra, sabah olayı), akşam
// (20:00; 15:00 taşınmasından sonra, öğleden sonra olayı), sabah (yalnız deneme: takvim dışı). Wattenoog baştan günde iki
// video (DEVIR §9.1); gerekmeyen yuva sessizce atlanır (--zorla ile yine üretilir). Uydurma olay yok: her cümle
// simülasyondan ya da listeden gelir ve sitede doğrulanır. Kullanıcı adları seste okunmaz; ekranda ve açıklamada @ ile.
// Dil Almanca (du); bireyler için er/sie ve cinsiyetli meslek unvanı YOK (DEVIR §4.2): iş alanı (sim.jobTitle → "alan")
// ya da kişinin yorumda seçtiği biçim (overrides.form); zamir yerine "diese Person", "Nummer acht", yapı değişikliği.
// Çıktı: cikti/gunluk/<tarih>-<yuva>/ (senaryo.json, ses, video, ACIKLAMA.txt); durum: cikti/gunluk/durum.json.
// TikTok bağlıysa (tiktok.mjs) video ayrıca hesabın gelen kutusuna taslak olarak gönderilir.
// Seslendirme için ELEVENLABS_API_KEY gerekir (gunluk.sh verir).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as sim from "../web/src/sim.js";
import { VERI_URL, TIKTOK, ZEPLIN_REKLAM } from "../web/src/config.js";
import { num, clockText } from "../web/src/fmt.js";
import { tideLevel, nextTides } from "../web/src/world/gelgit.js";
import { sunPosition } from "../web/src/world/sky.js";
import { ferryOut, nextArrival, vapurGecikmesi, vapurOlayGecikme } from "../web/src/world/ferry.js";
import { seslendir } from "./seslendir.mjs";
import { efekt, EFEKT_SES, EFEKTLER } from "./efekt.mjs";
import { olayGunu, olayEvre } from "../web/src/world/olay-plan.js";
import { yukle } from "./tiktok.mjs";
import * as ETIKET from "./etiket.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
process.chdir(HERE);
const catalog = JSON.parse(readFileSync(resolve(HERE, "../data/catalog.json"), "utf8"));
sim.setCatalog(catalog);

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const yuva = opt("--yuva", "ogle");
// Paylaşma saati (Berlin; ada saati de Berlin: kullanıcıyla aynı saat dilimi).
const SAAT = { sabah: "deneme (takvim dışı)", ogle: "13:30", aksam: "20:00" };
// Takipçi sayısına göre günde kaç video: Wattenoog baştan iki (DEVIR §9.1; Driftwood'da "tek video yetmiyor" dersi).
// ElevenLabs kotası yetmezse kullanıcı kararıyla [[0, ["aksam"]], [100, ["ogle", "aksam"]]] yapılır.
const SIKLIK = [[0, ["ogle", "aksam"]]];

// --- yardımcılar (Almanca) ---
const EINS = ["null", "eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf", "zwölf",
  "dreizehn", "vierzehn", "fünfzehn", "sechzehn", "siebzehn", "achtzehn", "neunzehn"];
const ZEHNER = ["", "", "zwanzig", "dreißig", "vierzig", "fünfzig", "sechzig", "siebzig", "achtzig", "neunzig"];
/** 0–99 bitişik: 21 → "einundzwanzig"; ende: tek başına 1 "eins", bileşikte (hundert/tausend önü) "ein". */
const unter100 = (n, ende) => (n < 20 ? (n === 1 && !ende ? "ein" : EINS[n]) : (n % 10 ? (n % 10 === 1 ? "ein" : EINS[n % 10]) + "und" : "") + ZEHNER[Math.floor(n / 10)]);
const unter1000 = (n, ende) => {
  const h = Math.floor(n / 100), r = n % 100;
  return (h ? (h === 1 ? "hundert" : EINS[h] + "hundert") : "") + (r ? unter100(r, ende) : "");
};
/** Sayının Almanca okunuşu (seslendirme için, tek sözcük; 0–999.999, üstü "Millionen"): 1250 → "tausendzweihundertfünfzig",
 *  21 → "einundzwanzig", 101 → "hunderteins". Tek başına 1 "eins": cümle içinde "ein Mensch / eine Person" kalıpla yazılır. */
export function say(n) {
  n = Math.round(n);
  if (n === 0) return "null";
  if (n < 0) return "minus " + say(-n);
  if (n >= 1e6) {
    const m = Math.floor(n / 1e6), r = n % 1e6;
    return (m === 1 ? "eine Million" : `${unter1000(m, true)} Millionen`) + (r ? " " + say(r) : "");
  }
  const t = Math.floor(n / 1000), r = n % 1000;
  return (t ? (t === 1 ? "tausend" : unter1000(t, false) + "tausend") : "") + (r ? unter1000(r, true) : "");
}
const fmt = (n) => num(n); // altyazıda rakam: "1.234" (fmt.js, de-DE)
/** Saatin okunuşu: 14:12 → "vierzehn Uhr zwölf", 9:00 → "neun Uhr", 1:05 → "ein Uhr fünf". */
const uhrSes = (m) => { const h = Math.floor(m / 60) % 24, d = Math.floor(m % 60); return `${h === 1 ? "ein" : say(h)} Uhr${d ? " " + say(d) : ""}`; };
const uhrYazi = (m) => `${clockText(m)} Uhr`;
/** Adresin okunuşu: "Möwenweg 14, Whg. 2" → "Möwenweg vierzehn, Wohnung zwei". */
const adresSes = (t) => t.replace(/Whg\./g, "Wohnung").replace(/\d+/g, (d) => say(Number(d)));
/** "Menschen" sayısı: 1 → "ein Mensch" (cümlede tekil fiil ayrıca). */
const menschen = (n, yazi = false) => (n === 1 ? "ein Mensch" : `${yazi ? fmt(n) : say(n)} Menschen`);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Yer adlarının tanımlığı (Almanca: cins baş isimden; bağlaçlı, sıfatlı ve "zaten var olan" adlar elle). Kasus: 0 nominativ,
// 1 akkusativ ("Für den Kutterhafen fehlen …"), 2 dativ. Driftwood'daki "the X" yardımcısının karşılığı.
const ART = { m: ["der", "den", "dem"], f: ["die", "die", "der"], n: ["das", "das", "dem"], pl: ["die", "die", "den"] };
const CINS = [
  [/(ei|ung|ion|schule|klinik|praxis|wache|werft|bude|stube|diele|kirche|apotheke|bahn|wehr|mühle|promenade|kolonie|bar|pension|muschel|plattform|insel)$/i, "f"],
  [/(haus|café|cafe|gericht|atelier|büro|hotel|pflaster|land|amt|office)$/i, "n"],
  [/(plätze|felder|körbe|bänke|äcker|straßen)$/i, "pl"],
];
const YER_DE = {
  "Klönbänke und Linden am Marktplatz": { cins: "pl", dat: "den Klönbänken und Linden am Marktplatz" },
  "Strandkörbe und Rettungsturm": { cins: "pl", f: ["die Strandkörbe und der Rettungsturm", "die Strandkörbe und den Rettungsturm", "den Strandkörben und dem Rettungsturm"] },
  "Freiwillige Feuerwehr": { cins: "f", f: ["die Freiwillige Feuerwehr", "die Freiwillige Feuerwehr", "der Freiwilligen Feuerwehr"] },
  "Freiwillige Feuerwehr Wattenoog": { cins: "f", f: ["die Freiwillige Feuerwehr Wattenoog", "die Freiwillige Feuerwehr Wattenoog", "der Freiwilligen Feuerwehr Wattenoog"] },
  "Seehundstation und Nationalpark-Haus": { cins: "pl", f: ["die Seehundstation und das Nationalpark-Haus", "die Seehundstation und das Nationalpark-Haus", "der Seehundstation und dem Nationalpark-Haus"] },
  "Rathaus und die erste Bürgermeisterwahl": { cins: "pl", f: ["das Rathaus und die erste Bürgermeisterwahl", "das Rathaus und die erste Bürgermeisterwahl", "dem Rathaus und der ersten Bürgermeisterwahl"], acildi: "Das Rathaus hat heute eröffnet." },
  "Strandpromenade und Musikmuschel": { cins: "pl", f: ["die Strandpromenade und die Musikmuschel", "die Strandpromenade und die Musikmuschel", "der Strandpromenade und der Musikmuschel"] },
  "Asphaltierte Straßen, Parkplätze und Inselbus": { cins: "pl", f: ["die asphaltierten Straßen, Parkplätze und der Inselbus", "die asphaltierten Straßen, Parkplätze und den Inselbus", "den asphaltierten Straßen, Parkplätzen und dem Inselbus"] },
  "Polder: Gulfhof und Kartoffeläcker": { cins: "m", f: ["der Gulfhof mit den Kartoffeläckern", "den Gulfhof mit den Kartoffeläckern", "dem Gulfhof mit den Kartoffeläckern"] },
  "Hofladen und Rapsfelder": { cins: "pl", f: ["der Hofladen und die Rapsfelder", "den Hofladen und die Rapsfelder", "dem Hofladen und den Rapsfeldern"] },
  "Bauhof und Müllabfuhr": { cins: "pl", f: ["der Bauhof und die Müllabfuhr", "den Bauhof und die Müllabfuhr", "dem Bauhof und der Müllabfuhr"] },
  "Bauhof und Inselbus": { cins: "pl", f: ["der Bauhof und der Inselbus", "den Bauhof und den Inselbus", "dem Bauhof und dem Inselbus"] },
  // Baştan var olanlar (Driftwood "bandstand" dersi: boş adada zaten duran şeyi gelişim adımı diye adlandırma):
  // yel değirmeni ve su kulesi baştan duruyor; eşikte değirmen döner ve kafesi açılır, kulenin seyir yeri açılır.
  "Windmühle": { cins: "n", f: ["das Mühlencafé in der Windmühle", "das Mühlencafé in der Windmühle", "dem Mühlencafé in der Windmühle"], acildi: "Die Windmühle dreht sich seit heute." },
  "Wasserturm mit Aussichtsplattform": { cins: "f", f: ["die Aussichtsplattform am Wasserturm", "die Aussichtsplattform am Wasserturm", "der Aussichtsplattform am Wasserturm"], acildi: "Der Wasserturm hat seit heute eine Aussichtsplattform." },
};
function cinsi(ad) {
  if (YER_DE[ad]) return YER_DE[ad].cins;
  const bas = ad.split(/[\s:]/)[0].split("-").at(-1);
  return CINS.find(([re]) => re.test(bas))?.[1] ?? "m";
}
/** Tanımlıklı yer adı: yerAd("Kutterhafen", 1) → "den Kutterhafen". */
function yerAd(ad, kasus = 0) {
  const o = YER_DE[ad];
  if (o?.f) return o.f[kasus];
  if (kasus === 2 && o?.dat) return o.dat;
  return `${ART[cinsi(ad)][kasus]} ${ad}`;
}
/** Gelişim adımı açıldığında söylenen cümle: iş yeriyse "hat heute eröffnet", değilse "ist seit heute da". */
function acildiCumlesi(s) {
  if (YER_DE[s.ad]?.acildi) return YER_DE[s.ad].acildi;
  const pl = cinsi(s.ad) === "pl", isyeri = s.acar.some((k) => catalog.isyerleri[k.split(":")[0]]);
  return `${buyuk(yerAd(s.ad, 0))} ${isyeri ? (pl ? "haben heute eröffnet" : "hat heute eröffnet") : pl ? "sind seit heute da" : "ist seit heute da"}.`;
}
/** Evcil hayvanın belirsiz tanımlıklı adı ("ein Hund", "eine Katze"). */
const evcilAd = (p) => `${cinsi(p) === "f" || /(e|katze)$/i.test(p) ? "eine" : "ein"} ${p}`;
/** Uzun altyazıyı ortaya en yakın boşluktan iki satıra böler (elle "\n" verilmişse dokunmaz). */
function kir(t, en = 30) {
  if (!t || t.includes("\n") || t.length <= en) return t;
  const orta = t.length / 2;
  let best = -1;
  for (let i = 0; i < t.length; i++) if (t[i] === " " && (best < 0 || Math.abs(i - orta) < Math.abs(best - orta))) best = i;
  return best < 0 ? t : t.slice(0, best) + "\n" + t.slice(best + 1);
}

/** Cümle: ses (okunan) ve yazi (altyazı; yoksa aynısı). vurus: öncesine 0,35 sn sessizlik. Büyük harfle başlar. */
const buyuk = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);
const c = (ses, yazi = null, vurus = false) => ({ ses: buyuk(ses), ...(yazi ? { yazi: buyuk(yazi) } : {}), ...(vurus ? { vurus } : {}) });

// --- veri --- (--veri dosya.json: deneme için sitedeki biçimde bir liste; --durum: ayrı durum dosyası)
let data;
if (opt("--veri")) data = JSON.parse(readFileSync(opt("--veri"), "utf8"));
else {
  const res = await fetch(VERI_URL, { headers: { "cache-control": "no-cache" } });
  if (!res.ok) throw new Error(`sakin listesi alınamadı: HTTP ${res.status}`);
  data = await res.json();
}
const residents = data.sakinler.map(([handle, seed, slot, arrived_day, overrides]) => ({
  handle, seed, slot, arrived_day, ...(overrides ? { overrides } : {}),
}));
const N = residents.length;
const takipci = data.takipci ?? 0;
const now = Date.now() / 1000;
const today = sim.dayOf(now);
const tarih = new Date(today * 86400000).toISOString().slice(0, 10); // ada günü (Berlin)

const yuvalar = SIKLIK.filter(([n]) => takipci >= n).at(-1)[1];
if (!yuvalar.includes(yuva) && !args.includes("--zorla")) {
  console.log(`${yuva}: bugün gerekmiyor (takipçi ${takipci}; yuvalar: ${yuvalar.join(", ")})`);
  process.exit(0);
}

const durumYolu = resolve(opt("--durum", "cikti/gunluk/durum.json"));
const durum = { zirve: 0, istekler: {}, konular: [], sakinler: [], ...(existsSync(durumYolu) ? JSON.parse(readFileSync(durumYolu, "utf8")) : {}) };
// --bekle: o yuvanın dayandığı taşınma (Berlin 09:00 / 15:00) henüz işlenmediyse çık.
const TASINMA = { sabah: 9, ogle: 9, aksam: 15 };
if (args.includes("--bekle") && TASINMA[yuva] != null && (data.son_aktarim ?? 0) < sim.unixOf(today, TASINMA[yuva] * 60) && N > 0) {
  console.log(`${yuva}: ${TASINMA[yuva]}:00 taşınması henüz işlenmedi, sonra yeniden denenecek`);
  process.exit(0);
}
if (args.includes("--uret") && !args.includes("--onizleme") && !args.includes("--zorla") && durum.son?.tarih === tarih && durum.son?.yuva === yuva) {
  console.log(`${tarih} ${yuva}: zaten üretildi (${durum.son.video})`);
  process.exit(0);
}
const level = Math.max(data.zirve ?? 0, residents.reduce((m, r) => Math.max(m, r.slot + 1), 0));
sim.setTown(level);
// Günün olayı (16 Kasım; web/src/world/olay-plan.js, site aynı planı hesaplar; ada günü Berlin). --olay/--olaysaat yalnız
// deneme: olayı zorlar ve çekim adreslerine aynı parametreleri ekler (sayfa da zorlanır).
// Ortam değişkeni (18 Kasım: kullanıcının istediği yeniden üretimde olay türü uret.sh'den zorlanır; gözetimsiz Claude'un
// her komuta bayrak eklemesine bağlı kalınmaz). Bayrak verilirse bayrak geçerli.
const olayZorla = opt("--olay", process.env.GUNLUK_OLAY || undefined), olaySaatZorla = opt("--olaysaat", process.env.GUNLUK_OLAYSAAT || undefined);
const olayGun = opt("--tarih") ? Date.parse(opt("--tarih") + "T00:00:00Z") / 86400000 : today;
// Günde iki olay (17 Kasım akşamı): 13:30 videosu (yuva ogle) sabahki olayı, 20:00 videosu (yuva aksam) öğleden sonrakini anlatır.
const olayYuva = yuva === "aksam" ? 1 : 0;
const olay = olayGunu(olayGun, sim.isOpen, { zorla: olayZorla, saat: olaySaatZorla ? dakika(olaySaatZorla) : undefined, yuva: olayYuva });
// Vapur arızası (olay "vapur"): o gün iki yuvadan birinde varsa arızalı sefer 20 dk gecikir (ferry.js); iskele çekimleri
// vapurun gerçekten yanaştığı ana göre (site aynı gecikmeyi kurar).
vapurGecikmesi(vapurOlayGecikme([olay, olayGunu(olayGun, sim.isOpen, { yuva: 1 - olayYuva })].find((p) => p?.tur === "vapur") ?? null));
const olayAdres = olayZorla ? `&olay=${olayZorla}${olaySaatZorla ? "&olaysaat=" + olaySaatZorla : ""}${olayYuva ? "&olayyuva=1" : ""}` : "";
if (olay) console.log(`günün olayı: ${olay.de ?? olay.en} (${olay.tur}) ${saatYaz(olay.bas)}–${saatYaz(olay.son)}${olayZorla ? " [zorlandı]" : ""}`);
const stages = catalog.gelisim;
const next = stages.find((s) => s.nufus > level);
// Kaç kişi daha: eşik gelişim düzeyine göre (sitedeki kartla aynı, ui.js): ayrılanların sırası yeniden verilmez.
const need = next ? Math.max(1, next.nufus - level) : 0;

// --- hikâye seçimi ---
const named = (r) => r.handle != null; // adını gizleyenler adlarıyla anılmaz
const yeniler = residents.filter((r) => r.arrived_day === today).sort((a, b) => a.slot - b.slot);
// Bugün açılanlar: dünkü düzeyden (bugünden önce gelenler) bugünkü düzeye geçerken açılan adımlar.
const dunku = residents.filter((r) => r.arrived_day < today).reduce((m, r) => Math.max(m, r.slot + 1), 0);
const acilan = stages.filter((s) => s.nufus > dunku && s.nufus <= level);
const istekDegisen = residents.filter((r) => named(r) && r.overrides && JSON.stringify(r.overrides) !== JSON.stringify(durum.istekler?.[r.handle] ?? null));
// Ada saati (seçimde gelgit ve gün ışığı için; aşağıda çekimlerin saati de bu): --saat yalnız kullanıcı açıkça isterse.
const adaDakika = opt("--saat") ? dakika(opt("--saat")) : sim.minuteOf(now);
const adaUnix = sim.unixOf(today, adaDakika);
const suSeviye = tideLevel(adaUnix), gelgitler = nextTides(adaUnix, 4);
const sonrakiAlcak = gelgitler.find((g) => !g.high), sonrakiYuksek = gelgitler.find((g) => g.high);
const gunDk = (u) => sim.minuteOf(u), bugunMu = (u) => sim.dayOf(u) === today;
console.log(`gelgit: su ${suSeviye.toFixed(2).replace(".", ",")} m (${suSeviye < -0.35 ? "Watt kuru" : "Watt su altında"}) · Niedrigwasser ${sonrakiAlcak ? uhrYazi(gunDk(sonrakiAlcak.t)) + (bugunMu(sonrakiAlcak.t) ? "" : " (yarın)") : "-"} · Hochwasser ${sonrakiYuksek ? uhrYazi(gunDk(sonrakiYuksek.t)) + (bugunMu(sonrakiYuksek.t) ? "" : " (yarın)") : "-"}`);
const karanlik = sunPosition(today, adaDakika).el < (-4 * Math.PI) / 180;

/** Sakinin iş alanı (cinsiyetsiz): seçilmiş biçim varsa unvan, yoksa alan ("Krabbenfischerei"); ses + altyazı.
 *  Alan ile kademe sitedeki kartla aynı (sim.title: "Krabbenfischerei (Ausbildung)"); seste parantez yerine virgül. */
function feld(r, j = sim.dreamJob(r)) {
  const form = String(r.overrides?.form ?? "");
  if (j.id === sim.job(r).id) {
    const t = sim.title(r, today), m = /^(.*) \((.*)\)$/.exec(t);
    return m ? { ses: `${m[1]}, ${m[2] === "Ausbildung" ? "in Ausbildung" : m[2]}`, yazi: t, form: !!form } : { ses: t, yazi: t, form: !!form };
  }
  const t = sim.jobTitle(j, sim.rank(r, today), form);
  return { ses: t, yazi: t, form: !!form };
}
/** Sakinin işi: "[özne]: [alan]." ve ardından durumu. Asıl mesleğinin yeri açık değilse anakarada çalışır.
 *  Özne cinsiyetsiz ("Diese Person", "Die erste Person"); sonraki cümleler öznesiz (zamir yok). */
function isCumleleri(r, ozne) {
  const dream = sim.dreamJob(r), job = sim.job(r);
  if (dream.id === "emekli") return [c(`${ozne}: Ruhestand.`), c("Den ganzen Tag auf der Insel.", null, true)];
  if (dream.id === "uzaktan") return [c(`${ozne}: Homeoffice.`), c("Arbeitsweg: null Meter.", "Arbeitsweg: 0 Meter.", true)];
  if (dream.id === "ogrenci") return [c(`${ozne}: Studium auf dem Festland.`), c("Jeden Morgen mit der Fähre.", null, true)];
  if (dream.id === "anakara") return [c(`${ozne}: Arbeit auf dem Festland.`), c("Jeden Morgen mit der Fähre.", null, true)];
  const f = feld(r, dream);
  if (job.id !== dream.id) {
    const yer = catalog.isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((x, y) => x[0] - y[0])[0][1];
    return [c(`${ozne}: ${f.ses}.`, kir(`${ozne}: ${f.yazi}.`)), c(`${buyuk(yerAd(yer, 1))} gibt es noch nicht.`, kir(`${buyuk(yerAd(yer, 1))} gibt es noch nicht.`)), c("Bis dahin: jeden Morgen die Fähre.", null, true)];
  }
  const wp = sim.workplace(r).name;
  return [c(`${ozne}: ${f.ses}.`, kir(`${ozne}: ${f.yazi}.`)), c(`Arbeitsplatz: ${wp}.`, kir(`Arbeitsplatz: ${wp}.`))];
}

// Katalogdan doğrulanmış eşikler (boş ada konuları bunları söyler; katalog değişirse cümleler de değişir).
const esik = (key) => stages.find((s) => s.acar.includes(key));
const kadroSira = (id) => (catalog.meslekler.find((m) => m.id === id)?.kadro?.sira ?? 0) + 1; // slot 7 → "Nummer acht"
const E10 = esik("kahvehane:0"), E20 = esik("market:0"), EFIRIN = esik("firin:0"), FENER = kadroSira("fener_bekcisi"), BUDE = kadroSira("kahveci");
const ilkAdres = sim.streetAddress(0);
const ilkMahalle = sim.mahalleName(sim.addressParts(0).mahalle);
const ilkAlcak = gelgitler.find((g) => !g.high && bugunMu(g.t));

/** Boş ada konuları (sırayla, tekrar etmeden). Her biri: gövde, soru, çekimler. Hepsi koddan doğrulanmış olgular.
 *  kosul: konu bu üretimde anlamlı mı (ör. gece yalnız karanlıkta, Watt yalnız bugün alçak su varsa). */
const BOS = [
  // İmza zaten sıradaki adımı (5'te Klönbänke) söylüyor: yol haritası ondan sonrasını anlatır.
  { id: "fahrplan", govde: [
    c(`Mit ${say(E10.nufus)} Menschen kommt ${yerAd(E10.ad, 0)}.`, kir(`Mit ${fmt(E10.nufus)} Menschen kommt ${yerAd(E10.ad, 0)}.`)),
    c(`Mit ${say(E20.nufus)}: ${yerAd(E20.ad, 0)}.`, `Mit ${fmt(E20.nufus)}: ${yerAd(E20.ad, 0)}.`),
    c(`Mit ${say(EFIRIN.nufus)}: ${yerAd(EFIRIN.ad, 0)}.`, kir(`Mit ${fmt(EFIRIN.nufus)}: ${yerAd(EFIRIN.ad, 0)}.`), true)],
    soru: c("Wie viele Tage noch bis zur Bäckerei?"), cekim: ["siradaki", "meydan"] },
  { id: "leuchtturm", govde: [
    c(`Nummer ${say(FENER)} bekommt den Leuchtturm.`, `Nummer ${FENER} bekommt\nden Leuchtturm.`),
    c("Gefragt wird niemand.", null, true),
    c("Bis dahin leuchtet er von allein.")],
    soru: c(`Wer wird Nummer ${say(FENER)}?`, `Wer wird Nummer ${FENER}?`), cekim: ["fener", "fener2"] },
  { id: "faehre", govde: [
    c("Die Fähre kommt alle zwanzig Minuten.", "Die Fähre kommt\nalle 20 Minuten."),
    c("Aussteigen tut niemand.", null, true),
    c("Gewartet wird trotzdem acht Minuten.", "Gewartet wird trotzdem\n8 Minuten.")],
    soru: c("Wer steigt als Erstes aus?"), cekim: ["iskele", "iskele2"] },
  { id: "beruf", govde: [
    c("Wer einzieht, bekommt einen Beruf."),
    c("Aussuchen kannst du ihn in den Kommentaren.", "Aussuchen kannst du ihn\nin den Kommentaren."),
    c("Kein Arbeitsplatz auf der Insel?"),
    c("Dann jeden Morgen die Fähre.", null, true)],
    soru: c("Welchen Beruf würdest du nehmen?"), cekim: ["meydan2", "iskele"] },
  { id: "adresse", govde: [
    c("Die erste Adresse steht schon fest."),
    c(`${adresSes(ilkAdres)}.`, `${ilkAdres},\n${ilkMahalle}`),
    c("Gebaut wird, sobald jemand einzieht.", "Gebaut wird,\nsobald jemand einzieht.", true)],
    soru: c("Wessen Adresse wird das?"), cekim: ["ilkev", "meydan"] },
  { id: "fischbude", govde: [
    c(`Mit Nummer ${say(E10.nufus)} öffnet ${yerAd(E10.ad, 0)}.`, kir(`Mit Nummer ${fmt(E10.nufus)} öffnet ${yerAd(E10.ad, 0)}.`)),
    c(`Nummer ${say(BUDE)} verkauft dort die Fischbrötchen.`, `Nummer ${BUDE} verkauft dort\ndie Fischbrötchen.`),
    c("Gefragt wird auch hier niemand.", null, true)],
    soru: c("Bismarck oder Matjes?"), cekim: ["iskele2", "meydan"] },
  // Şu an kuruysa "Gerade ist Niedrigwasser." (Watt çekimi kuru çamuru gösterir); değilse bugünkü sonraki alçak su.
  { id: "watt", kosul: () => suSeviye < -0.35 || !!ilkAlcak, govde: [
    c("Zweimal am Tag ist das Meer weg."),
    ...(suSeviye < -0.35 ? [c("Gerade ist Niedrigwasser.")] : ilkAlcak ? [c(`Heute Niedrigwasser: ${uhrSes(gunDk(ilkAlcak.t))}.`, `Heute Niedrigwasser:\n${uhrYazi(gunDk(ilkAlcak.t))}`)] : []),
    c("Die Fähre fährt trotzdem.", null, true)],
    soru: c("Wattwandern oder Strandkorb?"), cekim: ["watt", "iskele"] },
  { id: "abend", kosul: () => karanlik, govde: [
    c("Abend auf der Insel."), c("Der Leuchtturm ist an."), c("Zuschauen tut niemand.", null, true)],
    soru: c("Wer verbringt hier die erste Nacht?"), cekim: ["fener", "ucus"] },
];
// BUDE ile E10 aynı eşik değilse (katalog değişti) "fischbude" konusu yanlış olur: düşür.
if (BUDE !== E10.nufus) BOS.splice(BOS.findIndex((k) => k.id === "fischbude"), 1);

let tur, govde = [], soru, cekim = [], etiketler = [], saat = "12:00", konuId = null, ozelKanca = null, imza2 = null, ilkCekim = "ucus", soruCekim = null, onsoz = [], onsozCekim = null, tasinCekim = "iskele", acilis = "bayrak", einziehen = null;
if (acilan.length) {
  tur = "acilis";
  const s = acilan.at(-1);
  if (s.acar.includes("zeplin")) {
    // Zeplin bir yer değil: gelişini anlat (zeplin.js SCHEDULE 09:00–22:00), gece ışıklı reklam alanıyla çek.
    govde.push(c("Heute ist ein Zeppelin angekommen."), c("Er kommt um neun und fliegt um zweiundzwanzig Uhr zurück.", "Er kommt um 9 Uhr\nund fliegt um 22 Uhr zurück."),
      c(ZEPLIN_REKLAM.ad ? `Auf der Seite steht: ${ZEPLIN_REKLAM.ad}.` : "Auf der Seite steht: Wattenoog.", null, true));
  } else govde.push(c(acildiCumlesi(s), kir(acildiCumlesi(s))));
  // Bu açılışla anakaradan adaya dönenler: dünkü düzeyde anakarada, bugün adada çalışanlar.
  sim.setTown(durum.zirve);
  const once = new Map(residents.map((r) => [r.slot, sim.job(r).id]));
  sim.setTown(level);
  const donen = residents.filter((r) => once.get(r.slot) === "anakara" && sim.job(r).id !== "anakara");
  if (s.acar.includes("zeplin")) cekim = ["zeplin", "zeplin2"];
  else if (donen.length) govde.push(donen.length === 1
    ? c("Eine Person pendelt ab heute nicht mehr aufs Festland.", "Eine Person pendelt ab heute\nnicht mehr aufs Festland.", true)
    : c(`${say(donen.length)} Menschen pendeln ab heute nicht mehr aufs Festland.`, `${fmt(donen.length)} Menschen pendeln ab heute\nnicht mehr aufs Festland.`, true));
  else if (s.acar.some((k) => catalog.isyerleri[k.split(":")[0]])) govde.push(c("Noch kein Personal."), c("Die Tür steht trotzdem offen.", null, true));
  else govde.push(c("Genutzt hat das noch niemand."), c("Bisher.", null, true));
  etiketler = donen.filter(named).slice(0, 5).map((r) => r.handle);
  soru = next ? c(`Was meinst du: Wann kommt ${yerAd(next.ad, 0)}?`, kir(`Was meinst du: Wann kommt ${yerAd(next.ad, 0)}?`)) : c("Die Insel ist komplett. Was soll noch kommen?");
  if (!cekim.length) cekim = ["ucus", "meydan"];
} else if (yeniler.length) {
  tur = "yeniler";
  govde.push(yeniler.length === 1 ? c("Heute ist eine Person eingezogen.") : c(`Heute sind ${say(yeniler.length)} Menschen eingezogen.`, `Heute sind ${fmt(yeniler.length)} Menschen eingezogen.`));
  const fener = yeniler.find((r) => sim.dreamJob(r).id === "fener_bekcisi");
  const ilk = fener ?? yeniler.find(named) ?? yeniler[0];
  if (fener) govde.push(c(`Nummer ${say(fener.slot + 1)} ist da.`, `Nummer ${fener.slot + 1} ist da.`), c("Ab jetzt: der Leuchtturm."), c("Gefragt wurde niemand.", null, true));
  else govde.push(...isCumleleri(ilk, ilk === yeniler[0] ? "Die erste Person" : "Eine Person darunter"));
  etiketler = yeniler.filter(named).slice(0, 8).map((r) => r.handle);
  soru = c("Wer zieht morgen ein?");
  cekim = named(ilk) ? ["iskele", { sakin: ilk.handle }] : ["iskele", "meydan"];
} else if (istekDegisen.length) {
  tur = "istek";
  const r = istekDegisen[0];
  const o = r.overrides;
  if (o.meslek) {
    // Kişinin istediği alan (ya da seçtiği biçim); "Wunsch erfüllt."; ardından durumu (yeri yoksa anakarada).
    const j = catalog.meslekler.find((m) => m.id === o.meslek);
    const t = sim.jobTitle(j, 1, String(o.form ?? ""));
    govde.push(c(`Ein Wunsch aus den Kommentaren: ${t}.`, kir(`Ein Wunsch aus den Kommentaren: ${t}.`)), c("Wunsch erfüllt.", null, true), ...isCumleleri(r, "Diese Person").slice(1));
  } else if (o.evcil) govde.push(c(`Ein Wunsch aus den Kommentaren: ${evcilAd(o.evcil)}.`, kir(`Ein Wunsch aus den Kommentaren: ${evcilAd(o.evcil)}.`)), c("Wunsch erfüllt.", null, true));
  else if (o.hobi) govde.push(c("Ein Wunsch aus den Kommentaren: ein neues Hobby.", "Ein Wunsch aus den Kommentaren:\nein neues Hobby."), c(`Ab jetzt: ${sim.hobby(r).ad}.`, null, true));
  else govde.push(c("Ein Wunsch aus den Kommentaren."), c("Steht jetzt auf der Website.", null, true));
  etiketler = istekDegisen.slice(0, 5).map((r) => r.handle);
  soru = c("Ist der nächste Wunsch von dir?");
  cekim = [{ sakin: r.handle }, "meydan"];
} else if (N > 0) {
  tur = "sakin";
  // Sırayla, daha önce anlatılmamış ve adı görünen bir sakin.
  const r = residents.filter(named).find((x) => !durum.sakinler.includes(x.handle)) ?? residents.filter(named)[0];
  if (r) {
    const t = sim.tenure(r, today);
    govde.push(c("Heute haben wir eine Person begleitet."), ...isCumleleri(r, "Diese Person"));
    const h = sim.hobby(r), p = sim.pet(r, today);
    govde.push(c(`Freizeit: ${h.ad}.`));
    if (p) govde.push(c(`Dazu: ${evcilAd(p)}.`, null, true));
    else if (t > 0) govde.push(t === 1 ? c("Seit einem Tag auf der Insel.", null, true) : c(`Seit ${say(t)} Tagen auf der Insel.`, `Seit ${fmt(t)} Tagen auf der Insel.`, true));
    etiketler = [r.handle];
    soru = c("Weißt du, wer nebenan wohnt?");
    cekim = [{ sakin: r.handle }, { sakin: r.handle }];
  }
}
if (opt("--hikaye")) {
  // Elle yazılmış hikâye (seçimin yerine geçer).
  const h = JSON.parse(readFileSync(opt("--hikaye"), "utf8"));
  const cc = (x) => ({ ...c(x.ses, x.yazi ?? null, !!x.vurus), ...(x.ara ? { ara: x.ara } : {}) });
  tur = h.tur ?? "ozel"; govde = h.govde.map(cc); soru = cc(h.soru); cekim = h.cekim; etiketler = h.etiketler ?? [];
  saat = h.saat ?? saat; ozelKanca = h.kanca ?? null;
  imza2 = h.imza2 ? cc(h.imza2) : null; ilkCekim = h.ilk ?? ilkCekim; soruCekim = h.soruCekim ?? null; tasinCekim = h.tasinCekim ?? tasinCekim;
  onsoz = (h.onsoz ?? []).map(cc); onsozCekim = h.onsozCekim ?? null;
  if (h.acilis !== undefined) acilis = h.acilis;
  if (h.einziehen !== undefined) einziehen = !!h.einziehen;
}
if (acilis === "bayrak" && !sim.isOpen("belediye:0")) console.log("not: ada bayrağı direği Rathaus'la gelir (100. sakin); açılış çekimi şimdilik fener (kaydet.mjs)");
if (!tur || !govde.length) {
  tur = "bos";
  const uygun = BOS.filter((k) => !k.kosul || k.kosul());
  const konu = uygun.find((k) => !durum.konular.includes(k.id)) ?? uygun[durum.konular.length % uygun.length];
  konuId = konu.id;
  govde = konu.govde; soru = konu.soru; cekim = konu.cekim; saat = konu.saat ?? saat;
}

// Ada saati = videonun üretildiği andaki gerçek ada saati (Berlin). Yayın saatine ya da güzel ışığa göre SEÇİLMEZ
// (kullanıcı kararı, 2 Kasım 2026: öğle videosu 18:40'ta çekilmişti). Hikâyedeki "saat" yok sayılır; yalnız
// kullanıcı açıkça isterse --saat HH:MM.
const istenenSaat = saat;
saat = opt("--saat") ?? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
if (!opt("--saat") && istenenSaat !== saat) console.log(`ada saati ${saat} (Berlin, şimdi); "${istenenSaat}" kullanılmadı`);
// Feribot iskele çekiminde iskelede olsun (kullanıcı, 3 Kasım: "vapur yokken vapur çekilmeye çalışılıyor"): ada saatinde
// feribot açıktaysa iskele çekimleri bir sonraki yanaşmanın 1 dk sonrasına (en çok ~17 dk ileri) alınır; diğerleri şimdi.
function dakika(t) { const [h, m, sn = 0] = t.split(":").map(Number); return h * 60 + m + sn / 60; }
function saatYaz(m) { return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.floor(m) % 60).padStart(2, "0")}`; }
const vapurSaati = ferryOut(dakika(saat)) === 0 && ferryOut(dakika(saat) + 1) === 0 ? saat : saatYaz(nextArrival(dakika(saat)) + 1);
if (vapurSaati !== saat) console.log(`feribot ${saat} iskelede değil: iskele çekimleri ${vapurSaati}`);

// İmza (kilit sayacı, ANLATIM-STANDARDI §3) ve kapanış (soru + takip + istek kalıbı).
//   "Auf Wattenoog wohnen zwölf Menschen. Für die Bäckerei fehlen noch drei." Varyantlar: kimse yok ("wohnt noch niemand",
//   "fehlen fünf Menschen"), tek kişi ("wohnt ein Mensch"), hedefe bir kişi ("fehlt nur noch einer"), ada küçüldü (nüfus <
//   zirve: "Zwei sind gegangen." + "fehlen noch drei Neue": eşik zirveden sayılır, ayrılanın sırası yeniden verilmez),
//   bugün açıldı (gövde "… hat heute eröffnet", imza sıradakini söyler).
const yer = next ? yerAd(next.ad, 1) : "";
// "onsoz" (isteğe bağlı, 3 Kasım): imzadan önce vurucu açılış (izleyici ilk 1–2 sn'de kaydırıyor), ör. "Medizin. Ohne
// Klinik." (unvan değil alan: "Ein Arzt" cinsiyetli). "onsozCekim" verilirse kendi çekimlerinde (kart yok), yoksa ilk
// çekimde. "soruCekim": soru karesinin çekimi.
const giden = Math.max(0, level - N);
const imzaSon = () => {
  if (!next) return [c("Die Insel ist komplett.")];
  if (N === 0) return [need === 1 ? c(`Für ${yer} fehlt ein Mensch.`, kir(`Für ${yer} fehlt 1 Mensch.`)) : c(`Für ${yer} fehlen ${say(need)} Menschen.`, kir(`Für ${yer} fehlen ${fmt(need)} Menschen.`))];
  if (need === 1) return [c(`Für ${yer} fehlt nur noch einer.`, kir(`Für ${yer} fehlt nur noch einer.`))];
  return [c(`Für ${yer} fehlen noch ${say(need)}${giden ? " Neue" : ""}.`, kir(`Für ${yer} fehlen noch ${fmt(need)}${giden ? " Neue" : ""}.`))];
};
const imza = [...onsoz, ...(N === 0
  ? [c("Auf Wattenoog wohnt noch niemand."), ...(imza2 ? [imza2] : imzaSon())]
  : [N === 1 ? c("Auf Wattenoog wohnt ein Mensch.") : c(`Auf Wattenoog wohnen ${say(N)} Menschen.`, `Auf Wattenoog wohnen ${fmt(N)} Menschen.`),
     ...(giden && !imza2 ? [giden === 1 ? c("Eine Person ist gegangen.") : c(`${say(giden)} sind gegangen.`, `${fmt(giden)} sind gegangen.`)] : []),
     ...(imza2 ? [imza2] : imzaSon())])];
// Açılış (7 Kasım, kullanıcı: "bayrakla başlayan videolar daha çok izlendi, varsayılan olsun ama kurgu bayrak etrafında
// dönmesin"): videonun İLK cümlesi kendi çekiminde, varsayılan "bayrak" (kart yok, bölünmez). Bayrak yalnız burada;
// önsözün kalan cümleleri onsozCekim'e, imza "ilk"e sırayla dağılır.
const A = acilis ? 1 : 0;
const onGrup = onsoz.length && onsozCekim ? onsoz.length : 0;
const imzaBas = Math.max(onGrup, A);
const ilkler = Array.isArray(ilkCekim) ? ilkCekim : [ilkCekim];
// Kapanış (her videoda aynı kalıp): "[Frage] Folg uns, dann ziehst du auf die Insel. Such dir deinen Beruf aus. Schreib:
// Beruf, Fischerei." (altyazıda "Beruf: Fischerei"; iş alanı örneği cinsiyetsiz, ayrıştırıcı tanır). Eski takipçiler (taban,
// DEVIR §4.7) yorumda istemedikçe taşınmaz: her üç videoda bir (tarih + yuva, deterministik) sona "Du folgst schon länger?
// Schreib: einziehen." eklenir; hikâyede "einziehen": true|false ezer.
if (einziehen == null) einziehen = (today * 2 + (yuva === "aksam" ? 1 : 0)) % 3 === 0;
const kapanis = [soru, c("Folg uns, dann ziehst du auf die Insel.", "Folg uns, dann ziehst du\nauf die Insel."), c("Such dir deinen Beruf aus."), c("Schreib: Beruf, Fischerei.", "Schreib:\nBeruf: Fischerei"),
  ...(einziehen ? [c("Du folgst schon länger? Schreib: einziehen.", "Du folgst schon länger?\nSchreib: einziehen")] : [])];
const cumleler = [...imza, ...govde, ...kapanis];
const gruplar = [
  ...(A ? [{ cekim: acilis, acilis: true, ilk: 0, son: 0 }] : []),
  ...(onGrup > A ? splitGovde(onGrup - A, onsozCekim).map(([a, b, ck]) => ({ cekim: ck, ilk: A + a, son: A + b })) : []),
  ...(imza.length > imzaBas ? splitGovde(imza.length - imzaBas, ilkler).map(([a, b, ck], i) => ({ cekim: ck, ...(i === 0 ? { arayuz: true } : {}), ilk: imzaBas + a, son: imzaBas + b })) : []),
  ...splitGovde(govde.length, cekim).map(([a, b, ck]) => ({ cekim: ck, ilk: imza.length + a, son: imza.length + b })),
  // Kapanış üç çekim: soru (konunun son açısı), "takip eden adaya taşınıyor" (iskele), istek kalıbı (yazılı son kare).
  { cekim: soruCekim ?? (sakinMi(cekim.at(-1)) ? "meydan" : cekim.at(-1)), ilk: imza.length + govde.length, son: imza.length + govde.length },
  { cekim: tasinCekim, tasin: true, ilk: imza.length + govde.length + 1, son: imza.length + govde.length + 1 },
  { cekim: "kapanis", ilk: imza.length + govde.length + 2, son: cumleler.length - 1 },
];
function sakinMi(ck) { return !!ck && typeof ck === "object" && "sakin" in ck; }
/** Kullanım sayacı anahtarı: aynı yer (ayarlı ya da değil) aynı sayacı paylaşır; ham yörünge kendi başına. */
function ckAnahtar(ck) { return typeof ck === "string" ? ck : sakinMi(ck) ? "sakin:" + ck.sakin : ck.yer ?? (ck.taslak && !ck.yorunge ? "taslak:" + ck.taslak : JSON.stringify(ck.yorunge)); }
function splitGovde(n, ck) {
  // Gövde cümleleri çekimlere sırayla bölünür (en az bir cümle).
  const k = Math.min(ck.length, n), out = [];
  for (let i = 0; i < k; i++) out.push([Math.floor((i * n) / k), Math.floor(((i + 1) * n) / k) - 1, ck[i]]);
  return out;
}

const ad = opt("--ad") ? `gunluk/${opt("--ad")}` : `gunluk/${tarih}-${yuva}`; // --ad: yalnız deneme (ayrı çıktı klasörü)
const out = resolve("cikti", ad);
mkdirSync(out, { recursive: true });
const aralar = Object.fromEntries(cumleler.map((x, k) => [k, x.ara ?? (x.vurus ? 0.35 : 0)]).filter(([, d]) => d));
const S0 = { ad, seslendirme: cumleler.map(({ ses, yazi }) => ({ ses, ...(yazi ? { yazi } : {}) })), aralar };

console.log(`${tarih} ${yuva} · ${tur}${konuId ? ` (${konuId})` : ""} · nüfus ${N}, takipçi ${takipci}`);
// Kuru çalıştırmada da uyar: Watt çekimi yüksek suda deniz gösterir (çekim üretiminde CEKIM0 aynı uyarıyı yineler).
if (suSeviye > -0.35 && gruplar.some((g) => { const k = g.cekim; return k === "watt" || k?.yer === "watt" || k?.yorunge?.hedef === "watt"; }))
  console.log(`UYARI: "watt" çekimi var ama Watt şu an su altında (su ${suSeviye.toFixed(2).replace(".", ",")} m; Niedrigwasser ${sonrakiAlcak ? uhrYazi(gunDk(sonrakiAlcak.t)) : "-"}): metni ya da çekimi değiştir`);
for (const x of cumleler) console.log("   " + x.ses + (x.vurus ? "   [vuruş]" : ""));

// --- açıklama (etkileşim: kanca + soru + istek kalıbı + etiketler) ---
const kanca = ozelKanca ?? { acilis: "Heute ist auf der Insel etwas dazugekommen 🏗️", yeniler: yeniler.length === 1 ? "Heute ist jemand nach Wattenoog gezogen 🧳" : `${fmt(yeniler.length)} neue Nachbarn auf Wattenoog 🧳`, istek: "Ein Kommentarwunsch ist wahr geworden ✍️", sakin: "Ein Tag auf der Insel, mit einer Person von hier 👀", bos: "Auf dieser Insel wohnt noch niemand 🏝️" }[tur];
// Adres yok, tam 5 Almanca hashtag, önceki iki videoyla ortak yok, beşli daha önce kullanılmamış (etiket.mjs; 17 Kasım kuralı).
const aciklama = [
  kanca,
  `${(soru.yazi ?? soru.ses).replace(/\n/g, " ")} 👇`,
  `Folg uns, dann ziehst du ein. Such dir deinen Beruf aus: Schreib „Beruf: Fischerei“ (oder einen anderen).`,
  einziehen ? `Du folgst schon länger? Schreib „einziehen“, dann bekommst du ein Haus.` : null,
  etiketler.length ? etiketler.map((h) => "@" + h).join(" ") : null,
  "",
  ETIKET.sec(tarih, yuva).join(" "),
].filter((x) => x != null).join("\n");
writeFileSync(`${out}/ACIKLAMA.txt`, aciklama + "\n");
writeFileSync(`${out}/malzeme.json`, JSON.stringify({ tarih, yuva, tur, konuId, nufus: N, takipci, level, sıradaki: next?.ad, need, yeniler: yeniler.map((r) => r.handle), etiketler, einziehen,
  gelgit: { su: +suSeviye.toFixed(2), niedrigwasser: sonrakiAlcak ? uhrYazi(gunDk(sonrakiAlcak.t)) : null, hochwasser: sonrakiYuksek ? uhrYazi(gunDk(sonrakiYuksek.t)) : null }, karanlik }, null, 2));

const dene = opt("--cekim-dene"); // tek çekim denemesi (önizleme ölçeği, durum yazılmaz)
const onizleme = args.includes("--onizleme") || !!dene;
if (!args.includes("--uret") && !dene) {
  writeFileSync(`${out}/senaryo-taslak.json`, JSON.stringify({ ...S0, gruplar }, null, 2));
  console.log(`taslak: ${out} (üretmek için --uret)`);
  process.exit(0);
}

// --- ses ve çekim süreleri ---
const ses = await seslendir(S0);
const kay = (k) => Object.entries(aralar).reduce((a, [j, d]) => a + (Number(j) <= k ? d : 0), 0);
const bas = (k) => ses.cumleler[k].bas + kay(k), son = (k) => ses.cumleler[k].son + kay(k);
// Kurgu (3 Kasım 2026, kullanıcı: "art arda aynı sahne, heyecan/vuruculuk yok"): geçiş kısa (neredeyse kesme),
// her çekim en çok PARCA sn (uzun grup bölünür), aynı yerin her kullanımı başka açı (yer başına sayaç, bkz. canlandir),
// kamera her çekimde belirgin hareket eder (itme/çekme + yay). Sakin izleme en çok 4,2 sn, kalanı meydan.
const X = 0.12, bitis = son(cumleler.length - 1) + 1.2, PARCA = 2.6;
const kesitler = [];
gruplar.forEach((g, gi) => {
  const t0 = gi === 0 ? 0 : bas(g.ilk) - 0.15;
  const t1 = gi === gruplar.length - 1 ? bitis : bas(gruplar[gi + 1].ilk) - 0.15;
  const sakin = sakinMi(g.cekim);
  // Bölme eşiğinde %12 pay: grup 2,6 sn'ye çok yakınken ses yenilenince kendiliğinden ikiye bölünüp AYNI/BENZER
  // veriyordu (7 Kasım kod notu). Açılış çekimi hiç bölünmez.
  const parca = g.cekim === "kapanis" || g.acilis ? 1 : Math.max(1, Math.ceil((t1 - t0) / (sakin ? 4.2 : PARCA) - 0.12));
  for (let k = 0; k < parca; k++) kesitler.push({ ...g, parca: k, g0: t0, cekim: sakin && k > 0 ? "meydan" : g.cekim, t0: t0 + ((t1 - t0) * k) / parca, t1: t0 + ((t1 - t0) * (k + 1)) / parca });
});
const kullanim = {};
// Kilitli yerin taslağı ({"taslak": "balikci_koyu:0"}): yerin binalarının ortası ve boyu sitenin kendi yerleşiminden
// (layout.js, aynı düzeyde) hesaplanır; site ?taslak= ile o binaları yarı saydam taslak + çit olarak çizer.
const TASLAK = {};
{
  const anahtarlar = new Set();
  const topla = (ck) => { if (Array.isArray(ck)) ck.forEach(topla); else if (ck && typeof ck === "object" && ck.taslak) anahtarlar.add(ck.taslak); };
  [cekim, ilkCekim, onsozCekim, soruCekim, tasinCekim, acilis].forEach(topla);
  if (anahtarlar.size) {
    const { World } = await import("../web/src/world/layout.js");
    const W = new World(residents.reduce((m, r) => Math.max(m, r.slot + 1), 0));
    for (const k of anahtarlar) {
      const bs = (W.lots ?? []).filter((b) => b._k === k);
      if (!bs.length) {
        const kilitli = [...new Set((W.lots ?? []).map((b) => b._k))].filter((x) => !x.startsWith("carsi:"));
        console.error(`taslak "${k}": bu düzeyde kilitli binası yok (açık ya da binasız yer). Kilitli: ${kilitli.join(" ")}`);
        process.exit(1);
      }
      const xs = bs.flatMap((b) => [b.x - b.w / 2, b.x + b.w / 2]), zs = bs.flatMap((b) => [b.z - b.d / 2, b.z + b.d / 2]);
      const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
      TASLAK[k] = { x: +((x0 + x1) / 2).toFixed(1), z: +((z0 + z1) / 2).toFixed(1), boy: Math.max(x1 - x0, z1 - z0) };
    }
  }
}
/** Yer başına hareket seçenekleri (kütüphane yörünge: doğal hareket "yorunge"). bayrak (alçaktan açılış) ve
 *  zeplin2 sabit. drone/vertigo listede olsa da yalnız hikâye zorlarsa (SINIR 0). */
const SECENEK = {
  ucus: ["yorunge", "drone", "vertigo"], // yanKay yok: meydana iniyordu, imzanın ada ölçeği kayboluyordu (Driftwood dersi)
  iskele: ["yorunge", "yanKay", "tele", "vinc"], // alcak yok: iskelede gökyüzüne bakıyordu (feribot kadraj dışı)
  iskele2: ["yorunge", "yanKay", "whip", "el"],
  meydan: ["yorunge", "vinc", "alcak", "whip", "yanKay", "el"],
  meydan2: ["yorunge", "vinc", "alcak", "whip", "yanKay", "el"],
  kilise: ["yorunge", "vinc", "alcak", "yanKay", "whip"],
  fener: ["yorunge", "tele", "vinc"],
  fener2: ["yorunge", "whip", "yanKay"],
  ilkev: ["yorunge", "vinc", "yanKay", "alcak"],
  siradaki: ["yorunge", "vinc"],
  watt: ["yorunge", "yanKay", "tele"], // alcak yok: 0,9 m'den yalnız çamur görünür
  strand: ["yorunge", "yanKay", "alcak", "el"],
  muehle: ["yorunge", "vinc", "alcak", "tele"],
  wasserturm: ["yorunge", "vinc", "tele", "yanKay"],
  zeplin: ["yorunge", "tele"],
};
/** Dönüştürmede yörünge yerine kullanılacak temel kadraj (uçuş 700 m'lik yörünge: başka harekette Marktplatz'a iner). */
const TEMEL = {
  ucus: { hedef: "meydan", a: -0.4, D: 120, H: 60, bak: 2 },
};
/** Olay çekimleri: temel kadraj ve hareket seçenekleri. */
const OLAY_CEKIM = {
  // Uzaklıklar (17 Kasım akşamı, kullanıcı: "çekimler çok yakın"): ~%35 geniş (olay 45→60, yakın 32→44, kalabalık 14→20).
  olay: { D: 60, H: 28, secenek: ["vinc", "yorunge", "yanKay"] },
  "olay-yakin": { D: 44, H: 3, goz: 2.4, secenek: ["el", "alcak", "whip"], sarsinti: 0.5 },
  "olay-kalabalik": { D: 20, H: 3.5, secenek: ["yanKay", "el"], sarsinti: 0.3 },
  "olay-tele": { D: 45, H: 20, secenek: ["tele", "yanKay"], sarsinti: 0.2 }, // tek seçenek art arda/sınır üstü tele veriyordu (17 Kasım QC)
  "olay-hava": { D: 120, H: 6, secenek: ["yanKay", "tele"] },
  "olay-arac": { D: 14, H: 4, secenek: ["takip", "yanTakip"] },
};
/** Aynı uyarı bölünen çekimin her parçasında tekrarlanmasın. */
const uyarilan = new Set();
const birKez = (m) => { if (!uyarilan.has(m)) { uyarilan.add(m); console.log(m); } };
/** Olay türüne göre sahnedeki araçlar (olay.js: kazada polis/ambulans/çekici, yangında itfaiye). */
const OLAY_ARACLARI = { kaza: ["polis", "ambulans", "cekici"], yangin: ["itfaiye"], dugun: ["gelin"], yaris: ["lider"] }; // gelin: gelin arabası, lider: yarışta önde giden
/** Saat verilmeyen olay çekiminin anı (olay türü → çekim → saat; araç: o aracın yolda olduğu evre). */
const OLAY_ANI = {
  kaza: { olay: "olay:polis", "olay-yakin": "olay+1.5", "olay-kalabalik": "olay:polis", "olay-tele": "olay:polis", "olay-hava": "olay:polis", arac: { polis: "olay+5.2", ambulans: "olay+7.4", itfaiye: "olay+5.2", cekici: "olay:cekici+3" } },
  yangin: { olay: "olay:sondurme", "olay-yakin": "olay:sondurme", "olay-kalabalik": "olay:sondurme", "olay-tele": "olay:sondurme", "olay-hava": "olay:sondurme", arac: { itfaiye: "olay:alarm", polis: "olay:alarm", ambulans: "olay:alarm" } },
  firtina: { olay: "olay:yagmur", "olay-yakin": "olay:yagmur", "olay-kalabalik": "olay:yagmur", "olay-tele": "olay:yagmur", "olay-hava": "olay:yagmur" },
  sis: { olay: "olay:yogun", "olay-yakin": "olay:yogun", "olay-kalabalik": "olay:yogun", "olay-tele": "olay:yogun", "olay-hava": "olay:yogun" },
  yunus: { olay: "olay:oyun" },
  balina: { olay: "olay:oyun" },
  // Olay modülleri (17 Kasım akşamı; web/src/world/olay-moduller.js): hareketli hedefi olanlarda kamera onu izler.
  zeplin: { olay: "olay:yerde", "olay-yakin": "olay:inis", "olay-kalabalik": "olay:yerde+4", "olay-tele": "olay:alcalma+3", "olay-hava": "olay:alcalma+2" },
  // --- ajan E --- Kar: yoğun yağışın ortası (çocuklar kartopunda), seyrelirken kardan adam bitmiş; "olay:sonra" beyaz ada güneşte.
  kar: { olay: "olay:yogun", "olay-yakin": "olay:seyrelme", "olay-kalabalik": "olay:seyrelme", "olay-tele": "olay:yogun", "olay-hava": "olay:yogun" },
  // --- ajan D --- balon: kalkış hepsi birden, iniş "olay:inis+4" / söndü "olay:yerde+3"; uçurtma: takılma "olay:takildi+2".
  balon: { olay: "olay:kalkis+2", "olay-yakin": "olay:sisirme+9", "olay-kalabalik": "olay:sisirme+10", "olay-tele": "olay:suzulme+8", "olay-hava": "olay:suzulme+4" },
  ucurtma: { olay: "olay:senlik+5", "olay-yakin": "olay:takildi+3", "olay-kalabalik": "olay:senlik+8", "olay-tele": "olay:senlik+2", "olay-hava": "olay:senlik+10" },
  // kus = Ringelgänse (olay-ayar.js KUS.evre: gelis → inis → otlama → gidis): sürü Watt üstünde döner, Salzwiese'ye iner, otlar.
  kus: { olay: "olay:inis+1", "olay-yakin": "olay:otlama+4", "olay-kalabalik": "olay:otlama+6", "olay-tele": "olay:gelis+3", "olay-hava": "olay:inis+0.4" },
  // moose: "kasabada" middle = browsing at the end of the walk, watchers there; +3/+6 = walking in along the paths/Main Street.
  moose: { olay: "olay:kasabada", "olay-yakin": "olay:kasabada+6", "olay-kalabalik": "olay:kasabada", "olay-tele": "olay:gorundu+3", "olay-hava": "olay:kasabada+3" },
  // --- ajan D sonu ---
  // --- ajan B (liman/tekne olayları) ---
  vapur: { olay: "olay:romorkor+7", "olay-yakin": "olay:ariza+2.3", "olay-kalabalik": "olay:cekme+3", "olay-tele": "olay:cekme+2", "olay-hava": "olay:ariza+2" },
  gemi: { olay: "olay:yanasma+10", "olay-yakin": "olay:limanda+6", "olay-kalabalik": "olay:limanda+3", "olay-tele": "olay:gorundu+8", "olay-hava": "olay:yanasma+4" },
  balik: { olay: "olay:indirme+2", "olay-yakin": "olay:foto+3", "olay-kalabalik": "olay:foto+5", "olay-tele": "olay:donus+7", "olay-hava": "olay:donus+8" },
  tekne_yarisi: { olay: "olay:yaris+1.5", "olay-yakin": "olay:yaris+3", "olay-kalabalik": "olay:yaris+4.6", "olay-tele": "olay:yaris+2.2", "olay-hava": "olay:toplanma+8" },
  // --- ajan B sonu ---
  // --- ajan C (olay-dugun/film/yaris/marti.js) ---
  // Düğün: konvoy yolda (gelin arabası izlenir), halay meydanda (halay sırasının ortası izlenir).
  dugun: { olay: "olay:konvoy+3", "olay-yakin": "olay:halay+4", "olay-kalabalik": "olay:halay+6", "olay-tele": "olay:konvoy+5", "olay-hava": "olay:halay+3", arac: { gelin: "olay:konvoy+2" } },
  // Film: çekim döngüsü 1,5 dk, "motor"dan 0,12–0,57 dk sonra aksiyon (oyuncular oynar, figüranlar yürür, vinç kalkar).
  film: { olay: "olay:cekim+3.2", "olay-yakin": "olay:cekim+4.7", "olay-kalabalik": "olay:cekim+6.25", "olay-tele": "olay:cekim+1.75", "olay-hava": "olay:kurulum+5" },
  // Yarış: start takın altından (yakın), yolda önde gidenler, bitişte seyirci.
  yaris: { olay: "olay:yaris+6", "olay-yakin": "olay:yaris+0.05", "olay-kalabalik": "olay:bitis+0.3", "olay-tele": "olay:yaris+12", "olay-hava": "olay:yaris+9", arac: { lider: "olay:yaris+4" } },
  // Martı: dalış kapma evresinin başından 3 sn sonra simidi kapar (çekim 2× hızda ~5 sn'yi kapsar), kahkahalar, kovalama.
  marti: { olay: "olay:kapma+0", "olay-yakin": "olay:kapma+0", "olay-kalabalik": "olay:kapma+0.12", "olay-tele": "olay:kovalama+0.6", "olay-hava": "olay:kovalama+1.5" },
  // --- ajan A (deniz ve kıyı: olay-fok.js, olay-kopekbaligi.js, olay-hortum.js, olay-dalga.js); hiz: çekim hızı (deniz ve dalga
  // hareketi gerçek zamanlıya yakın okunsun) ---
  fok: { olay: "olay:kayada+6", "olay-yakin": "olay:kayada+3", "olay-kalabalik": "olay:kayada+8", "olay-tele": "olay:kayada+12", "olay-hava": "olay:kayada+10", hiz: 1.5 },
  kopekbaligi: { olay: "olay:kapali+4", "olay-yakin": "olay:kapali+8", "olay-kalabalik": "olay:kapali+6", "olay-tele": "olay:gorundu+2", "olay-hava": "olay:bosaltma+2", hiz: 1.5 },
  hortum: { olay: "olay:hortum+3", "olay-yakin": "olay:hortum+6", "olay-kalabalik": "olay:hortum+5", "olay-tele": "olay:hortum+12", "olay-hava": "olay:hortum+8", hiz: 2 },
  dalga: { olay: "olay:dovme+5", "olay-yakin": "olay:dovme+9", "olay-kalabalik": "olay:dovme+7", "olay-tele": "olay:dovme+12", "olay-hava": "olay:yukselme+4", hiz: 2 },
  // --- ajan A sonu ---
};
const efektler = [];
// Hareket dili (16 Kasım 2026, Mercanada kullanıcısı: "sürekli bir yerlere yaklaşan çekimler yerine daha karışık ve dikkat
// çekici"): her çekime bir hareket türü atanır (kamera kaydet.mjs HAREKET'te). Seçim (yonet): hikâye "hareket" verdiyse
// o; yoksa yerin seçenekleri (SECENEK) içinden, bir önceki çekimle AYNI AİLEDEN OLMAYAN ve videoda en az kullanılmış
// olan. Elle kadraj (ayarli: aci/uzak/yuk, ham yörünge, taslak) kadrajını korur: yalnız yorunge, el, whip ya da küçük
// yanKay. Sabit: bayrak, zeplin2, sakin, kapanış. Ardından geçişler (gecisSec) ve son süreler (önceki çekim sonraki geçiş
// kadar uzun; kaydet.mjs aynı süreyi bindirir).
const HAREKETLER = ["itme", "yorunge", "vinc", "yanKay", "alcak", "tele", "el", "whip", "vertigo", "drone", "takip", "yanTakip"];
const AILE = (t) => (t === "yanTakip" ? "takip" : t === "itme" ? "yorunge" : t);
// Drone ve vertigo yalnız hikâye zorlarsa ("hareket"): kendiliğinden seçildiklerinde çatı sıyıran/rastgele açılış veriyordu.
const SINIR = { vertigo: 0, drone: 0, tele: 2, whip: 2, vinc: 3, el: 3 };
const GECIS = { kesme: 0.1, solma: 0.25, kaydir: 0.2, flas: 0.3, yakinlas: 0.22 };
const hs = { onceki: null, sayac: {}, zorla: {}, grup: 0, flas: 0, duduk: -99, gok: -99, olayN: 0 };
const ham = kesitler.map((k, i) => {
  hs.parca = k.parca; // olayCekimi: grubun kaydırması parçalarda aynı kalır
  const sure = +(k.t1 - k.t0 + X).toFixed(3); // geçici; geçişler seçilince düzeltilir
  const anahtar = ckAnahtar(k.cekim);
  const v = (kullanim[anahtar] = (kullanim[anahtar] ?? -1) + 1);
  // "Taşın" karesi iskelenin geniş açısı (v çift): gövdede iskele kullanıldıysa kod ona sıradaki açıyı veriyordu.
  if (k.tasin && k.cekim === "iskele") {
    const shot = CEKIM("iskele", 0, sure, false);
    shot.secenek = ["yorunge", "yanKay"];
    return yonet(shot, k, 0, i);
  }
  // Bölünen ayarlı çekimde parça başına kadraj (7 Kasım kod notu: 2. parçanın sabit sapması temiz kadrajı bozuyordu):
  // {"yer"|"yorunge": .., "parcalar": [{aci, uzak, yuk} | {yorunge}, ...]} → k. parça (k ≥ 1) parcalar[k − 1] ile.
  const pk = k.parca > 0 && k.cekim && typeof k.cekim === "object" ? k.cekim.parcalar?.[k.parca - 1] : null;
  // Parçada ham kamera/yörünge varsa ana çekimin "yer"i düşer (20 Kasım deneme: yer öncelikli olduğu için parçanın yörüngesi
  // yok sayılıyordu).
  const pYer = pk && (pk.yorunge || pk.kamera) && pk.yer === undefined ? { yer: undefined } : {};
  if (pk) return yonet(parcaSaati(Object.assign(CEKIM({ ...k.cekim, ...pYer, ...pk, parcalar: undefined, hareket: undefined }, v, sure, k.arayuz), { parcaKadraj: true }), k), k, 0, i);
  return yonet(parcaSaati(CEKIM(k.cekim, v, sure, k.arayuz), k), k, v, i);
});
/** Bölünen olay çekiminde k. parça olayın akışını sürdürür (17 Kasım QC: parçalar aynı anı baştan oynatıyor ya da
 *  saatte ileri geri sıçrıyordu). Parçanın saati, grubun başından geçen süre × sayfa hızı kadar ileri alınır. */
function parcaSaati(shot, k) {
  if (!(k.parca > 0) || !(shot.olayEvreAd || shot.aracAni)) return shot;
  const hiz = Number(/hiz=([\d.]+)/.exec(shot.adres)?.[1] ?? 1) || 1, ofs = ((k.t0 - k.g0) * hiz) / 60; // dakika
  if (shot.aracAni?.oto) { shot.aracAni.ofs = ofs; return shot; } // kaydet.mjs aracın saatini sayfadan bulur, ofs ekler
  const q = /saat=(\d+):(\d+)(?::(\d+))?/.exec(shot.adres);
  if (!q) return shot;
  const sn = Math.min(86399, Math.round((+q[1] * 60 + +q[2] + (+q[3] || 0) / 60 + ofs) * 60));
  shot.adres = shot.adres.replace(/saat=[^&]*/, `saat=${String(Math.floor(sn / 3600) % 24).padStart(2, "0")}:${String(Math.floor(sn / 60) % 60).padStart(2, "0")}:${String(sn % 60).padStart(2, "0")}`);
  return shot;
}
/** Çekimin hareketini seçer ve uygular (bkz. yukarı). */
function yonet(shot, k, v, i) {
  const ck = k.cekim && typeof k.cekim === "object" ? k.cekim : null;
  shot.sure = +(k.t1 - k.t0 + X).toFixed(3);
  const bitir = (aile, ad) => { hs.onceki = aile; shot.hareketAd = ad; if (ad) hs.sayac[ad] = (hs.sayac[ad] ?? 0) + 1; return shot; };
  if (k.cekim === "kapanis") return bitir("kapanis", "yorunge");
  if (shot.serbest) return bitir("sakin", "sakin");
  if (shot.sabit) { canlandir(shot, shot.ayarli ? k.parca : v); return bitir(shot.sabit, shot.sabit === "alcak" ? "alcak" : "sabit"); }
  let zorla = k.parca === 0 ? ck?.hareket : null;
  if (zorla && !HAREKETLER.includes(zorla)) { console.log(`UYARI: bilinmeyen hareket "${zorla}" (${HAREKETLER.join(", ")}): yok sayıldı`); zorla = null; }
  // Aynı hareketi hikâyede çok kez zorlamak videoyu tekdüzeleştirir (17 Kasım: 5 çekime "yorunge" verilmişti).
  if (zorla && (hs.zorla[zorla] = (hs.zorla[zorla] ?? 0) + 1) === 3) console.log(`UYARI: "hareket": "${zorla}" hikâyede 3. kez verildi: hareketi yalnız kusuru gidermek için ver, gerisini otomatiğe bırak (aynı hareket en çok 2 kez)`);
  const dogal = shot.hareket ? null : shot.kamera ? "itme" : "yorunge";
  // Açılış çekimi (hikâyede ham yörünge ile bayrak benzeri): doğal hareketiyle, alçak açı ailesinden sayılır.
  if (k.acilis && !zorla && !shot.hareket) { canlandir(shot, 0); return bitir("alcak", dogal); }
  const zeplinMi = typeof shot.yorunge?.hedef === "string" && shot.yorunge.hedef.startsWith("zeplin");
  // Elle kadrajda el kamerası yalnız alçak kadrajda (yüksek/uzak yörüngede sarsıntı tuhaf duruyor).
  const alcakKadraj = (shot.yorunge?.h ?? 99) <= 12 && (shot.yorunge?.r ?? 99) <= 60;
  const secenek = zorla ? [zorla] : zeplinMi ? ["yorunge", "tele"] : shot.ayarli && !shot.hareket ? [dogal, "whip", "yanKay", ...(alcakKadraj ? ["el"] : [])] : shot.secenek ?? [dogal ?? "yorunge"];
  // Drone ve vertigo zaman ister: 2 sn'den kısa çekimde seçilmez.
  const kisa = shot.sure < 2 && !zorla ? secenek.filter((t) => t !== "drone" && t !== "vertigo") : secenek;
  const tur = sec(kisa.length ? kisa : secenek, v);
  if (shot.hareket) shot.hareket.tur = tur;
  else if (tur === dogal || (tur === "yorunge" && zeplinMi)) canlandir(shot, shot.parcaKadraj ? 0 : shot.ayarli ? k.parca : v);
  else {
    // Kütüphane kadrajından temel geometri: hedef, açı (yay ortası), uzaklık, yükseklik.
    let t = shot.ayarli ? null : shot.temel; // elle kadrajda temel, verilen kadrajın kendisi
    if (!t && shot.kamera) {
      const [, kx, ky, kz, bx, by, bz] = shot.kamera[0];
      t = { hedef: [bx, by, bz], a: +Math.atan2(kx - bx, kz - bz).toFixed(3), D: +Math.hypot(kx - bx, kz - bz).toFixed(2), Hb: +(ky - by).toFixed(2) };
    } else if (!t) {
      const y = shot.yorunge;
      t = { hedef: y.hedef, a: +((y.a0 + y.a1) / 2).toFixed(3), D: y.r, H: y.h, bak: y.bak };
    }
    shot.hareket = { tur, ...t, ...(shot.ayarli ? { aciSabit: true } : {}) };
    delete shot.kamera; delete shot.yorunge;
  }
  if (shot.hareket) {
    shot.hareket.yon = ck?.yon ?? (i % 2 ? -1 : 1);
    if (ck?.fov) shot.hareket.fov = ck.fov;
  } else if (ck?.fov) shot.fov = ck.fov;
  if (ck?.sarsinti != null) shot.sarsinti = ck.sarsinti;
  if (tur === "el") shot.sarsinti = Math.max(shot.sarsinti ?? 0, 0.6);
  return bitir(AILE(tur), tur);
}
function sec(secenek, v) {
  if (secenek.length === 1) return secenek[0];
  const n = secenek.length;
  const sira = secenek.map((t, j) => [t, (hs.sayac[t] ?? 0) + (t === "itme" || t === "yorunge" ? 0.6 : 0), (((j - v) % n) + n) % n]);
  const farkli = sira.filter(([t]) => AILE(t) !== hs.onceki);
  const uygun = farkli.filter(([t]) => (hs.sayac[t] ?? 0) < (SINIR[t] ?? 9));
  const izinli = (l) => l.filter(([t]) => (SINIR[t] ?? 9) > 0);
  // Yedek sırası: sınırın altındaki (aile tekrar etse de) → izinli farklı aile → izinli → hepsi (17 Kasım QC: sınır üstü seçiliyordu).
  const altinda = sira.filter(([t]) => (hs.sayac[t] ?? 0) < (SINIR[t] ?? 9));
  const L = (uygun.length ? uygun : altinda.length ? altinda : izinli(farkli).length ? izinli(farkli) : izinli(sira).length ? izinli(sira) : sira).sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return L[0][0];
}
/** Çekime GİRİŞ geçişi. Hikâye "gecis" verirse o (ilk parçada); whip'e kaydırma, çarpma/gök efektine ve şimşek anına flaş
 *  (videoda en çok 2), kapanışa solma, drone'a yakınlaşma; grup içi parçalar kesme; grup sınırlarında çoğunlukla kesme,
 *  her üçüncüsü solma. */
function gecisSec(k, shot) {
  const ck = k.cekim && typeof k.cekim === "object" ? k.cekim : null;
  if (k.parca === 0 && ck?.gecis) {
    if (GECIS[ck.gecis]) return ck.gecis;
    console.log(`UYARI: bilinmeyen geçiş "${ck.gecis}" (${Object.keys(GECIS).join(", ")}): otomatik`);
  }
  const efs = k.parca === 0 ? [ck?.efekt].flat().map((e) => (typeof e === "string" ? e : e?.ad)) : [];
  if (shot.hareketAd === "whip") return "kaydir";
  if (efs.includes("carpisma") || efs.includes("gok")) return "flas";
  if (shot.anAni?.tur === "simsek" && hs.flas < 2) { hs.flas++; shot.anAni.flas = true; return "flas"; }
  if (k.cekim === "kapanis") return "solma";
  if (k.parca > 0) return "kesme";
  if (shot.hareketAd === "drone") return "yakinlas";
  return ++hs.grup % 3 === 0 ? "solma" : "kesme";
}
const gecisler = ham.map((shot, i) => (i ? gecisSec(kesitler[i], shot) : null));
const cekimler = ham.map((shot, i) => {
  const k = kesitler[i], sure = +(k.t1 - k.t0 + (i < ham.length - 1 ? GECIS[gecisler[i + 1]] : 0)).toFixed(3);
  // Anahtar karelerin zamanı yeni süreye ölçeklenir.
  if (shot.kamera) shot.kamera = shot.kamera.map(([t, ...r]) => [+((t * sure) / shot.sure).toFixed(3), ...r]);
  shot.sure = sure;
  if (i) shot.gecis = { tur: gecisler[i], sure: GECIS[gecisler[i]] };
  return ozellik(k, i, shot);
});
// Fırtına çekimlerinde tek yağmur yatağı: art arda olay çekimleri boyunca (çekim başına ayrı başlayınca dalgalanıyordu).
for (let i = 0; i < cekimler.length; i++) {
  if (!cekimler[i].yagmur) continue;
  let j = i;
  while (j + 1 < cekimler.length && cekimler[j + 1].yagmur) j++;
  const t0 = kesitler[i].t0, t1 = kesitler[j].t1 + 0.4;
  efektler.push({ dosya: efekt("yagmur", resolve("cikti/efekt"), +(t1 - t0).toFixed(1)), bas: +t0.toFixed(3), ses: EFEKT_SES.yagmur, ad: "yagmur" });
  i = j;
}
for (const c of cekimler) delete c.yagmur;
/** Çekime hikâyeden gelen ekler: ses efekti (çekimin başında + "bas" sn; dizi olabilir; bölünmüş çekimde yalnız ilk
 *  parçada; olay araçlarında siren, şimşekte gök gürültüsü, siste sis düdüğü kendiliğinden; "efekt": false kapatır).
 *  Olay anı (şimşek/sıçrama) çekimin hangi saniyesine düşecek: flaşlı girişte 0,3 sn (beyazın hemen ardından), değilse
 *  çekimin ~%35'i. */
function ozellik(k, i, shot) {
  const ck = k.cekim && typeof k.cekim === "object" ? k.cekim : null;
  const kapali = ck && (ck.efekt === false || ck.efekt === null);
  if (shot.anAni) {
    shot.anAni.t = +(shot.anAni.flas ? 0.3 : Math.min(1.2, Math.max(0.3, shot.sure * 0.35))).toFixed(2);
    // Gök gürültüsü üst üste binmesin (gürleme ~6 sn): öncekinden en az 4 sn sonra.
    if (shot.anAni.tur === "simsek" && k.t0 + shot.anAni.t - hs.gok >= 4) { hs.gok = k.t0 + shot.anAni.t; (shot.otoEfekt ??= []).push({ ad: "gok", bas: shot.anAni.t + 0.15 }); }
    delete shot.anAni.flas;
  }
  const efs = k.parca === 0 && ck?.efekt ? [ck.efekt].flat() : !kapali ? (shot.otoEfekt ?? []).filter((e) => k.parca === 0 || e.ad === "gok") : [];
  for (const e0 of efs) {
    const e = typeof e0 === "string" ? { ad: e0 } : e0;
    if (!e?.ad) continue;
    // Bilinmeyen efekt üretimi durdurmaz (17 Kasım QC: efekt.mjs hata fırlatıp bütün koşuyu bitiriyordu).
    if (!EFEKTLER.includes(e.ad)) { birKez(`UYARI: bilinmeyen efekt "${e.ad}" (${EFEKTLER.join(", ")}): atlandı`); continue; }
    efektler.push({ dosya: efekt(e.ad, resolve("cikti/efekt"), e.sure), bas: +(k.t0 + (e.bas ?? 0)).toFixed(3), ses: e.ses ?? EFEKT_SES[e.ad] ?? null, ad: e.ad });
  }
  // Sis düdüğü (fenerin): siste olay çekiminin başında, en çok 9 sn'de bir.
  if (shot.sisduduk && !kapali && !(k.parca === 0 && ck?.efekt) && k.t0 - hs.duduk >= 9) {
    hs.duduk = k.t0;
    efektler.push({ dosya: efekt("sisduduk", resolve("cikti/efekt")), bas: +(k.t0 + 0.1).toFixed(3), ses: EFEKT_SES.sisduduk, ad: "sisduduk" });
  }
  delete shot.sisduduk;
  if (kapali) delete shot.yagmur;
  delete shot.otoEfekt;
  return shot;
}
// Art arda iki çekim aynı kalmasın (aynı adres + yörünge/hareket): olursa ikincisi döndürülür (güvenlik ağı).
for (let i = 1; i < cekimler.length; i++) {
  const ayni = (a, b) => a.adres === b.adres && JSON.stringify(a.kamera ?? a.yorunge ?? a.hareket ?? null) === JSON.stringify(b.kamera ?? b.yorunge ?? b.hareket ?? null);
  if (ayni(cekimler[i - 1], cekimler[i]) && !cekimler[i].serbest) {
    if (cekimler[i].hareket) { cekimler[i].hareket.yon = -(cekimler[i].hareket.yon ?? 1); cekimler[i].hareket.a = (cekimler[i].hareket.a ?? 0) + 0.6; }
    else canlandir(cekimler[i], 3);
  }
}
// Çekim listesi (her üretimde): yer, hareket, süre, ada saati (olay çekiminde çözülmüş saat), giriş geçişi, cümleler.
kesitler.forEach((k, i) => {
  const c = cekimler[i], sa = /saat=([^&]*)/.exec(c.adres)?.[1];
  console.log(`  çekim ${i + 1}: ${JSON.stringify(k.cekim)} · ${c.hareketAd ?? "-"}${c.sarsinti ? ` (sarsıntı ${c.sarsinti})` : ""} · ${c.sure} sn · saat ${sa}${c.olayBek ? ` [olay ${c.olayEvreAd ?? ""}]` : ""}${c.anAni ? ` [${c.anAni.tur} @${c.anAni.t} sn]` : ""} · giriş ${c.gecis?.tur ?? "-"} · ${cumleler.slice(k.ilk, k.son + 1).map((x) => x.ses).join(" / ")}`);
});
const turSay = new Set(cekimler.map((c) => c.hareketAd).filter((t) => t && t !== "sakin" && t !== "sabit"));
console.log(`  hareketler: ${turSay.size} tür (${[...turSay].join(", ")})`);

/** Aynı yerin v. kullanımı başka kadraj: DUZEN[v] = [açı (rad, hedef çevresinde), uzaklık çarpanı] (geniş → yakın →
 *  daha geniş …; art arda aynı yer bile belirgin farklı görünür). Çekim içinde de hareket: çift v'de sona doğru içeri
 *  itilir, tekte dışarı çekilir. Yörüngede yay en az 0,5 rad, r1 bitiş uzaklığı (kaydet.mjs uygular). */
function canlandir(shot, v) {
  const DUZEN = [[0, 1], [0.6, 0.55], [-0.6, 1.45], [1.1, 0.75], [-1.1, 1.25], [1.6, 0.6], [-1.6, 1.1]];
  // Ayarlı/ham çekim (hikâyede kadraj elle verildi): v = grubun parça sırası; ilk parça verilen kadraj (yalnız
  // itme), sonrakiler ondan yarım ölçüde sapar (uzun grupta art arda aynı kare olmasın).
  const d = DUZEN[v % DUZEN.length], [aci, olc] = shot.ayarli ? [d[0] * 0.5, 1 + (d[1] - 1) * 0.5] : d, m = v % 2 ? 1.12 : 0.82;
  if (shot.kamera) {
    const [, kx0, ky0, kz0, bx0, by0, bz0] = shot.kamera[0];
    const yakin = Math.hypot(kx0 - bx0, ky0 - by0, kz0 - bz0) < 25; // sokak düzeyi: binaya girmesin
    const th = aci * (yakin ? 0.6 : 1), o = yakin ? Math.min(1.2, Math.max(0.8, olc)) : olc;
    const c = Math.cos(th), s = Math.sin(th), n = shot.kamera.length;
    shot.kamera = shot.kamera.map(([t, kx, ky, kz, bx, by, bz], i) => {
      const k = o * (i === n - 1 ? m : 1), dx = kx - bx, dz = kz - bz;
      return [t, bx + (dx * c - dz * s) * k, by + (ky - by) * k, bz + (dx * s + dz * c) * k, bx, by, bz];
    });
  } else if (shot.yorunge && shot.yorunge.hedef !== "zeplin-yer") {
    const y = shot.yorunge, yay = Math.max(Math.abs(y.a1 - y.a0), 0.5) * (Math.sign(y.a1 - y.a0) || 1);
    const o = y.r < 50 ? Math.max(0.85, olc) : olc; // yakın yörünge daha da yaklaşmaz (çardağa, direğe, bacaya girdi, 3 Kasım)
    y.a0 += aci; y.a1 = y.a0 + yay; y.r = +(y.r * o).toFixed(2); y.h = +(y.h * o).toFixed(2);
    // Yörünge hedefe yaklaşmaz (17 Kasım, kullanıcı: Mercanada 18:30'da 5 çekim "eski mantıkla" hedefe yaklaşıyordu;
    // 16 Kasım isteği "sürekli yaklaşan çekimler yerine karışık"): sabit uzaklıkta döner, tek kullanımda hafif açılır.
    if (y.hedef !== "zeplin" && m > 1) y.r1 = +(y.r * m).toFixed(2);
  }
  return shot;
}

/** Çekim kütüphanesi: gerçek adanın sabit ve dinamik açıları (koordinatlar: senaryolar/acilis.mjs notları). */
function CEKIM(ad, v, sure, arayuz) {
  // Kadraj ayarı: kütüphane çekimi hedefi çevresinde döndürülür/uzaklaştırılır (hikâyeden, kod değişmeden).
  // Yalnız "yer" (+ hareket/saat/efekt…) verilirse kadraj elle sayılmaz: hareket seçimi serbest kalır.
  if (ad && typeof ad === "object" && ad.yer) {
    const shot = CEKIM0(ad.yer, ad.varyant ?? v, sure, arayuz);
    return zaman(ad.aci != null || ad.uzak != null || ad.yuk != null || ad.varyant != null ? kadraj(shot, ad) : shot, ad);
  }
  return zaman(CEKIM0(ad, v, sure, arayuz), ad);
}
// Çekimin saati/hızı hikâyeden ("saat": "HH:MM[:SS]" ya da olay saati, "hiz"); --tarih ile deneme günü.
// Olay saati (16 Kasım): "saat": "olay+12" (olay başından 12 dk sonra; kesirli ve eksi olur: "olay-0.2"),
// "olay:<evre>" (o evrenin ortası), "olay:<evre>+N" (evre başından N dk sonra). Olay çekimleri saat verilmezse
// OLAY_ANI'ndaki ana göre. Bugün olay yoksa saat değişmez (UYARI).
function zaman(shot, ad) {
  const o = ad && typeof ad === "object" ? ad : {};
  const spec = o.saat ?? shot.olayAni;
  if (o.saat && shot.aracAni) shot.aracAni.oto = false;
  if (spec) {
    let hm = String(spec).startsWith("olay") ? olaySaati(spec, shot, o.saat ? 0 : shot.olayOfs ?? 0) : spec;
    // Limana bakan olay çekimi (sis olay-hava): feribot iskelede olsun (açıktaysa sonraki yanaşmanın 0,5 dk sonrası).
    if (hm && shot.vapurAni && !o.saat) {
      const m = dakika(hm);
      if (ferryOut(m) !== 0 || ferryOut(m + 0.7) !== 0) {
        const y = nextArrival(m) + 0.5;
        hm = `${saatYaz(y)}:30`;
        if (olay && y > olay.son) console.log(`UYARI: feribot ${hm}'te iskelede ama olay ${saatYaz(olay.son)}'te bitiyor`);
      }
    }
    if (hm) shot.adres = shot.adres.replace(/saat=[^&]*/, "saat=" + hm);
  }
  const hiz = o.hiz ?? shot.olayHiz;
  if (hiz) shot.adres = shot.adres.replace(/hiz=[^&]*/, "hiz=" + hiz);
  if (o.an === false) delete shot.anAni;
  delete shot.olayOfs; delete shot.vapurAni;
  if (opt("--tarih") && !shot.adres.includes("tarih=")) shot.adres += "&tarih=" + opt("--tarih");
  if (olayAdres && !shot.adres.includes("&olay=")) shot.adres += olayAdres;
  return shot;
}
/** Olay evrelerinin [baş, son] dakikaları (olayEvre taranır; "sonra" en çok 12 sa). */
function olayEvreleri() {
  const E = {};
  for (let i = 0, m = olay.bas; m <= olay.son + 720; m = olay.bas + ++i * 0.05) {
    const e = olayEvre(olay, m);
    if (!e) { if (m > olay.son) break; continue; }
    (E[e.ad] ??= [m, m])[1] = m;
  }
  // Evre başları ikiye bölmeyle kesinleşir (17 Kasım: 3 sn'lik ızgara martının 3 sn'lik dalışını kaçırıyordu).
  for (const [ad, e] of Object.entries(E)) {
    let a = e[0] - 0.05, b = e[0];
    if (a < olay.bas) continue;
    for (let k = 0; k < 24; k++) { const c = (a + b) / 2; if (olayEvre(olay, c)?.ad === ad) b = c; else a = c; }
    e[0] = b;
  }
  return E;
}
function olaySaati(spec, shot, ofs = 0) {
  const m = /^olay(?::([a-z]+))?([+-]\d+(?:[.,]\d+)?)?$/.exec(String(spec).trim());
  if (!m) { console.log(`UYARI: saat "${spec}" anlaşılmadı (olay+12 | olay:evre | olay:evre+3)`); return null; }
  if (!olay) { console.log(`UYARI: saat "${spec}": bugün olay yok, ada saati değişmedi`); return null; }
  const N = m[2] != null ? Number(m[2].replace(",", ".")) : null;
  let dk;
  if (m[1]) {
    const E = olayEvreleri(), e = E[m[1]];
    if (!e) { console.log(`UYARI: "${olay.tur}" olayında "${m[1]}" evresi yok (${Object.keys(E).join(", ")}): olay başı`); dk = olay.bas + (N ?? 0); }
    else dk = N != null ? e[0] + N : m[1] === "sonra" ? e[0] + Math.min(10, (e[1] - e[0]) / 2) : (e[0] + e[1]) / 2;
  } else dk = olay.bas + (N ?? 0);
  dk = Math.max(0, Math.min(24 * 60 - 0.02, dk + ofs));
  const sn = Math.round(dk * 60), hm = `${String(Math.floor(sn / 3600)).padStart(2, "0")}:${String(Math.floor(sn / 60) % 60).padStart(2, "0")}:${String(sn % 60).padStart(2, "0")}`;
  shot.olayEvreAd = olayEvre(olay, dk)?.ad ?? "olay dışı";
  if (!olayZorla && !opt("--saat") && dk > dakika(saat) + 0.5) console.log(`UYARI: ${spec} = ${hm} henüz gelmedi (ada saati ${saat}): olay o an sitede yok`);
  return hm;
}
function CEKIM0(ad, v, sure, arayuz) {
  // Watt çekimi yalnız alçak suda anlamlı (gelgit sitede zamandan hesaplanır; aynı formül): yüksek suda deniz görünür.
  const wattMi = ad === "watt" || ad?.yer === "watt" || ad?.yorunge?.hedef === "watt";
  if (wattMi && suSeviye > -0.35) birKez(`UYARI: "watt" çekimi: Watt şu an su altında (su ${suSeviye.toFixed(2).replace(".", ",")} m; Niedrigwasser ${sonrakiAlcak ? uhrYazi(gunDk(sonrakiAlcak.t)) : "-"}): metin "Meer ist da" demeli ya da başka çekim`);
  const vapurlu = typeof ad === "string" ? ad.startsWith("iskele") : !!(ad?.vapur || ad?.yorunge?.hedef === "iskele");
  // Bilgi kartlı (arayuz) çekim kartta saati gösterir: gerçek saatte kalır (iskele bile olsa).
  const a = `saat=${!arayuz && vapurlu ? vapurSaati : saat}&hiz=4`;
  const tsl = ad && typeof ad === "object" && ad.taslak ? `&taslak=${encodeURIComponent(ad.taslak)}` : "";
  if (ad && typeof ad === "object" && ad.yorunge) {
    const { hedef, r, h, a0 = 0, a1 = a0 + 0.3, bak = 2 } = ad.yorunge;
    return { adres: a + tsl, yorunge: { hedef, r, h, a0, a1, bak }, ayarli: true, ...(arayuz ? { arayuz: true } : {}) };
  }
  // Kilitli yerin taslağı: yerin ortası çevresinde yörünge (r varsayılan boyun 2,2 katı, en az 40 m; a: 0 denizden).
  if (ad && typeof ad === "object" && ad.taslak) {
    const T = TASLAK[ad.taslak], r = ad.r ?? Math.max(40, 2.2 * T.boy), a0 = ad.a0 ?? 0.3;
    return { adres: a + tsl, yorunge: { hedef: [T.x, T.z], r, h: ad.h ?? +(0.45 * r).toFixed(1), a0, a1: ad.a1 ?? a0 + 0.4, bak: ad.bak ?? 2 }, ayarli: true, ...(arayuz ? { arayuz: true } : {}) };
  }
  // Sakin: site onu bulup izler (evdeyse evinin içi açılır). Kart gizli: telefon düzeninde altyazının üstüne biner.
  // Dışarıdaki sakinin çevresinde kamera döner (sakinYorunge). Üstte ayrıca "@ad" yazısı YOK (6 Kasım, Mercanada):
  // sitenin ad etiketi sakinin başında zaten görünüyor, ikisi üst üste binip ad iki kez okunuyordu.
  if (sakinMi(ad)) return { adres: `${a}&bul=${encodeURIComponent(ad.sakin)}`, serbest: true, isinma: 60, sakinYorunge: { yon: ad.yon ?? (v % 2 ? -1 : 1) } };
  const yor = (hedef, r, h, a0, a1, bak = 2) => ({ adres: a, yorunge: { hedef, r, h, a0, a1, bak } });
  // Hepsi yörünge çekimi (hedef sitede hesaplanır; ada değişse de kadraj doğru kalır). a: 0 = kamera denizden (+z) bakar.
  const L = {
    // Açılış: Rathaus'un önündeki ada bayrağı direği (layout.js "gonder" ada: true, 56/−17; 12 m, bayrak doğuya uzanır,
    // geniş yüzü güneye/kuzeye) alttan, gökyüzü önünde; kamera güney-güneybatıdan (Rathaus doğuda, arkada kalır). Direk
    // Rathaus'la gelir (100. sakin); yokken kaydet.mjs feneri alttan çeker (UYARI). Hedef sitede çözülür ("bayrak").
    bayrak: () => (v % 2 ? yor("bayrak", 10.5, 2.4, -0.1, 0.05, 11) : yor("bayrak", 10.5, 2.2, -0.6, -0.5, 11.2)),
    // Ada büyük (x −3400…3700): uçuş köyü (Marktplatz'tan kumsala ve limana) güneyden, Watt'ın üstünden gösterir.
    ucus: () => yor([0, -250], 700, 300, -0.45 + 0.9 * (v % 2), -0.25 + 0.9 * (v % 2), 0),
    // Fähranleger (x 95, rıhtımdan güneye 124 m), feribot doğu yanında. Feribot dakika 0–7 (mod 20) iskelede.
    iskele: () => (v % 2 ? yor("iskele", 30, 6, 2.5, 2.75, 2) : yor("iskele", 75, 28, 0.5, 0.8, 2)),
    iskele2: () => yor("iskele", 45, 14, -0.8, -0.55, 3),
    // Marktplatz (90 × 70 m klinker), ortada alçak Marktbrunnen; lambalar 20 m halkada: yakın çekim 30 m dışından.
    meydan: () => (v % 2 ? yor("meydan", 30, 5, 2.3, 2.6, 2) : yor("meydan", 50, 22, 0.3, 0.6, 1)),
    meydan2: () => yor("meydan", 30, 5, 2.3 + v, 2.6 + v, 2),
    // Inselkirche (Marktplatz'ın batısı, kule ve kapı meydana bakar; 50. sakinde). Kamera meydanın üstünden (doğudan),
    // ıhlamurların arasından kule cephesine (20 Kasım ekran görüntüsüyle seçildi; 48 m dikey kadrajda kiliseyi kesiyordu).
    kilise: () => yor("kilise", 72, 20, 1.5, 1.65, 11),
    // Leuchtturm Westkopf (−3250/−560, yüksek kumulda, 22 m): kara tarafından (doğu), deniz arkada.
    fener: () => yor("fener", 80, 34, 1.2 + 0.5 * v, 1.5 + 0.5 * v, 14),
    fener2: () => yor("fener", 28, 20, 2.0, 2.3, 20),
    ilkev: () => yor("ilkev", 38, 20, 0.4 + v, 0.75 + v, 3),
    siradaki: () => yor("siradaki", 70, 40, 0.6 + v, 1.1 + v, 2),
    // Watt: limanın batısında Watt düzlüğü. v0: kıyıya ~70 m'den güneyden alçak bakış (önde kuru çamur, arkada tuzlu
    // bataklık, set ve koyunlar, köy); v1: adadan dışarı, Priel'li çamura yukarıdan (x −645'teki kanal). Yalnız alçak suda
    // kuru (gelgit satırı ve UYARI). 20 Kasım ekran görüntüleriyle seçildi: uzak/yüksek açı düz kahverengi bant veriyordu.
    watt: () => (v % 2 ? yor([-660, 1060], 120, 22, 2.78, 2.92, 0) : yor("watt", 70, 6, -0.38, -0.22, 2)),
    // Hauptstrand (Strandstraße'nin ucunda): Strandkörbe (60. sakinde) denize bakar; kamera denizden (kuzeyden). v1: kumsal
    // boyunca alçak bakış (sıralar).
    strand: () => (v % 2 ? yor("strand", 40, 3.5, 1.75, 1.95, 1.2) : yor("strand", 52, 13, 2.7, 3.0, 1)),
    // Windmühle (Polder kenarı, 2140/−300; ~18 m + kanatlar) ve Wasserturm (−560/−1060, kumul üstünde, ~31 m): baştan var.
    muehle: () => yor("muehle", 60, 14, 0.4 + 0.6 * v, 0.7 + 0.6 * v, 10),
    wasserturm: () => yor("wasserturm", 75, 26, 2.6 + 0.6 * v, 2.9 + 0.6 * v, 18),
    // Zeplin: yanından, gidişine göre dönen kamera (dikey kadraja sığacak uzaklıkta); ikincisi iskeleden bakış.
    zeplin: () => yor("zeplin", 150, -18, 1.1 + 0.3 * v, 1.6 + 0.3 * v, 0),
    zeplin2: () => yor("zeplin-yer", 0, 0, 0, 0, 0),
    kapanis: () => ({ ...yor([0, -250], 860, 400, -0.1, 0.1, 0), yazilar: [{ metin: "Folg uns,<br>zieh auf die Insel.", alt: `auf TikTok<br><small>@${TIKTOK}</small>`, bas: 0.2, son: sure, yer: "ust" }] }),
  };
  if (typeof ad === "string" && ad.startsWith("olay")) return Object.assign(olayCekimi(ad, a, L), arayuz ? { arayuz: true } : {});
  const shot = (L[ad] ?? L.ucus)();
  // Hareket seçenekleri ve dönüştürmede temel kadraj (bkz. yonet).
  if (typeof ad === "string" && SECENEK[ad]) shot.secenek = SECENEK[ad];
  if (typeof ad === "string" && TEMEL[ad]) shot.temel = TEMEL[ad];
  if (ad === "bayrak") shot.sabit = "alcak";
  if (ad === "zeplin2") shot.sabit = "sabit";
  // Zeplin henüz açılmadıysa çekimde önizleme olarak gösterilir (?zeplin); metin bunu söylemeli ("150. sakinde").
  if (typeof ad === "string" && ad.startsWith("zeplin") && !sim.isOpen("zeplin")) shot.adres += "&zeplin";
  if (arayuz) shot.arayuz = true;
  return shot;
}

function olayCekimi(ad0, a, L) {
  // Hava çekimi yalnız hava/deniz olayında anlamlı; kaza ve yangında geniş olay çekimi.
  const ad = ad0 === "olay-hava" && (olay?.tur === "kaza" || olay?.tur === "yangin") ? "olay" : ad0;
  const tur = ad.startsWith("olay-arac:") ? "olay-arac" : ad, b = OLAY_CEKIM[tur];
  if (!b) { console.log(`UYARI: bilinmeyen olay çekimi "${ad}" (${Object.keys(OLAY_CEKIM).join(", ")}): meydan`); return Object.assign(L.meydan(), { secenek: SECENEK.meydan }); }
  if (!olay) {
    const yedek = ad === "olay-hava" || ad === "olay-tele" ? "ucus" : "meydan";
    console.log(`UYARI: bugün olay yok: "${ad}" yerine ${yedek}`);
    const shot = L[yedek]();
    shot.secenek = SECENEK[yedek]; if (TEMEL[yedek]) shot.temel = TEMEL[yedek];
    return shot;
  }
  const arac = tur === "olay-arac" ? ad.slice(10) : null, ani = OLAY_ANI[olay.tur] ?? {};
  // Olayda olmayan araç (17 Kasım QC: kazada itfaiye, fırtınada polis istenince siren sesi boş çekime ekleniyordu).
  if (arac && !(OLAY_ARACLARI[olay.tur] ?? []).includes(arac)) {
    birKez(`UYARI: "${olay.tur}" olayında "${arac}" aracı yok (${(OLAY_ARACLARI[olay.tur] ?? []).join(", ") || "araçsız olay"}): geniş olay çekimi`);
    return olayCekimi("olay", a, L);
  }
  const cek = arac === "cekici", deniz = olay.tur === "yunus" || olay.tur === "balina";
  // Sis: denizden limana bakan hava çekimi daha yüksekten (alçakta iskele kadrajı kapatıyordu).
  // Mutur (Wattenoog'un "yunus"u: 1,6 m, koyu, yalnız nefeste sırtı görünür; 20 Kasım deneme: varsayılan kadrajlar düz su
  // veriyordu, yalnız ~13 m yakın kadraj hayvanı gösterdi): bütün olay kadrajları yakın ve alçak.
  // Göz yüksekliği ≥ 4,5 m: alçakta dalga sırtı hayvanı örtüyor (yakın kadraj 2,2 m'de düz su verdi).
  const MUTUR = { olay: [34, 12], "olay-yakin": [13, 4.5], "olay-kalabalik": [20, 5], "olay-tele": [26, 8], "olay-hava": [48, 10] };
  const [D, H] = cek ? [26, 8] : olay.tur === "sis" && ad === "olay-hava" ? [90, 16] : olay.tur === "yunus" && MUTUR[ad] ? MUTUR[ad] : [b.D, b.H];
  const hava = olay.tur === "sis" || olay.tur === "firtina", sokakEv = hava && ad === "olay-kalabalik"; // seyirci yok: Marktplatz karşı yandan
  const shot = { adres: a, hareket: { tur: null, hedef: ad, D, H, ...(b.goz && olay.tur !== "yunus" ? { goz: b.goz } : {}) }, secenek: cek ? ["yorunge", "vinc", "alcak"] : sokakEv ? ["yanKay", "vinc"] : olay.tur === "yunus" && ad === "olay-yakin" ? ["yorunge", "vinc"] : b.secenek, olayBek: olay.tur,
    olayAni: arac ? ani.arac?.[arac] ?? ani.olay ?? "olay+5" : ani[ad] ?? ani.olay ?? "olay+5",
    ...(b.sarsinti && !sokakEv ? { sarsinti: b.sarsinti } : {}),
    // Hız: araç takibi 1,5; çekici yüklemesi 10; balina sıçraması gerçek zamanlı (~3,5 sn) → 1,2; fırtınada şimşek
    // çakışı 1,3 sn → 2; yakın çekim 2; diğerleri 4 (sis akar).
    olayHiz: cek ? 10 : arac ? 1.5 : olay.tur === "marti" && ad !== "olay-tele" && ad !== "olay-hava" ? 2 : ani.hiz ?? (deniz ? 1.2 : olay.tur === "firtina" && ad !== "olay-kalabalik" ? 2 : ad === "olay-yakin" ? 2 : null) };
  if (arac && !cek) shot.otoEfekt = arac === "gelin" ? [{ ad: "korna", sure: 4 }] : arac === "lider" ? [] : [{ ad: "siren-arac", sure: 6 }];
  if (arac) shot.aracAni = { ad: arac, oto: true };
  if (olay.tur === "firtina") shot.yagmur = true;
  // Olay anı (kaydet.mjs anAni): fırtınada sıradaki şimşek, balinada sıradaki sıçrama çekimin içine oturur.
  if (olay.tur === "firtina" && ad !== "olay-kalabalik") shot.anAni = { tur: "simsek" };
  if (deniz && (ad !== "olay-hava" || olay.tur === "yunus")) shot.anAni = { tur: "sicrama" }; // mutur: nefes anı (kaydet.mjs)
  if (olay.tur === "sis") shot.sisduduk = true;
  // Limana/iskeleye bakan çekimler (sis hava; fırtına/sis yakın: iskelenin üstü): feribot iskelede olsun.
  if ((olay.tur === "sis" && ad === "olay-hava") || ((olay.tur === "sis" || olay.tur === "firtina") && ad === "olay-yakin")) shot.vapurAni = true;
  // Saati verilmeyen olay çekimleri aynı ana yığılmasın (fırtınada hep aynı şimşek, siste aynı kare): n. çekim kaydırılır.
  // Bölünen grubun parçaları aynı kaydırmayı alır (sürekliliği parcaSaati verir).
  if (!hs.parca || hs.olayGrupOfs == null) hs.olayGrupOfs = [0, 1.6, -1.2, 3, -2.4, 4.2, -3.6, 5.4][hs.olayN++ % 8];
  shot.olayOfs = hs.olayGrupOfs;
  return shot;
}

/** {aci, uzak, yuk}: yörünge açısı +aci, yarıçap ×uzak, yükseklik ×yuk (kamera çekiminde hedef çevresinde döndürme). */
function kadraj(shot, { aci = 0, uzak = 1, yuk = 1 }) {
  if (shot.hareket) {
    // Olay çekimi: kadraj ayarı temel geometriyi değiştirir (hareket yine seçilir).
    const h = shot.hareket;
    h.a = (h.a ?? 0) + aci; h.D = +(h.D * uzak).toFixed(2); h.H = +(h.H * yuk).toFixed(2);
    return shot;
  }
  shot.ayarli = true;
  if (shot.kamera) {
    const c = Math.cos(aci), s = Math.sin(aci);
    shot.kamera = shot.kamera.map(([t, kx, ky, kz, bx, by, bz]) => {
      const dx = kx - bx, dz = kz - bz;
      return [t, bx + (dx * c - dz * s) * uzak, by + (ky - by) * yuk, bz + (dx * s + dz * c) * uzak, bx, by, bz];
    });
  } else if (shot.yorunge && shot.yorunge.hedef !== "zeplin-yer") {
    const y = shot.yorunge;
    y.a0 += aci; y.a1 += aci; y.r = +(y.r * uzak).toFixed(2); y.h = +(y.h * yuk).toFixed(2);
  }
  return shot;
}

const MUZIK = "cikti/muzik/ada-1.mp3"; // müzik yoksa sessiz (anlatım standardı 7)
const S = { ...S0, olcek: 2, gecis: X, ...(existsSync(MUZIK) ? { muzik: MUZIK } : {}), ...(efektler.length ? { efektler } : {}), fps: 30, w: 1080, h: 1920, cekimler, aciklama };
writeFileSync(`${out}/senaryo.json`, JSON.stringify(S, null, 2));

if (dene) {
  // Çekim listesi (numara → yer, cümleler): kadrajı düzeltilecek çekimi seçmek için.
  if (!cekimler[Number(dene) - 1]) { console.error(`çekim ${dene} yok (1–${cekimler.length})`); process.exit(1); }
}
// --- çizim: site derlenir, yerel önizleme sunucusu açılır, kaydet.mjs çalışır ---
const PORT = Number(process.env.ONIZLEME_PORT) || 4199;
execFileSync("npx", ["vite", "build"], { cwd: resolve(HERE, "../web"), stdio: "ignore" });
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: resolve(HERE, "../web"), stdio: "ignore", detached: true });
try {
  await new Promise((ok) => setTimeout(ok, 3000));
  execFileSync("node", ["kaydet.mjs", `${out}/senaryo.json`, ...(onizleme ? ["--onizleme"] : []), ...(dene ? ["--cekim", dene] : [])], { stdio: "inherit", env: { ...process.env, SITE: `http://localhost:${PORT}/` } });
} finally {
  try { process.kill(-server.pid); } catch {}
}
if (dene) {
  // Baş/orta/son kare yan yana: kadrajı Read ile kontrol et.
  const n = Number(dene), c = cekimler[n - 1], mp4 = `${out}/cekim${n}.mp4`, jpg = `${out}/cekim${n}-kareler.jpg`;
  const zaman = [0.1, c.sure / 2, Math.max(0.1, c.sure - 0.25)];
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...zaman.flatMap((t) => ["-ss", t.toFixed(2), "-i", mp4]),
    "-filter_complex", "[0:v]scale=360:-2[a];[1:v]scale=360:-2[b];[2:v]scale=360:-2[c];[a][b][c]hstack=3", "-frames:v", "1", "-q:v", "3", jpg]);
  const grup = kesitler[n - 1];
  console.log(`çekim ${n}/${cekimler.length}: ${JSON.stringify(grup.cekim)} · ${c.sure} sn · cümleler: ${cumleler.slice(grup.ilk, grup.son + 1).map((x) => x.ses).join(" / ")}`);
  console.log("kareler:", jpg);
  process.exit(0);
}
const video = `${out}/${ad.split("/").pop()}${onizleme ? "-onizleme" : ""}.mp4`;

// Durum: bir sonraki çalıştırmada "bugün ne değişti" buna göre bulunur.
if (!args.includes("--onizleme")) {
  durum.zirve = level;
  durum.istekler = Object.fromEntries(residents.filter((r) => named(r) && r.overrides).map((r) => [r.handle, r.overrides]));
  if (konuId) durum.konular = [...new Set([...durum.konular, konuId])];
  if (tur === "sakin") durum.sakinler = [...new Set([...durum.sakinler, ...etiketler])].slice(-500);
  durum.son = { tarih, yuva, tur, video };
  writeFileSync(durumYolu, JSON.stringify(durum, null, 2));
}

// TikTok bağlıysa (node tiktok.mjs baglan) video gelen kutusuna taslak olarak gider; olmazsa dosyadan yüklenir.
let taslak = null;
// --taslaksiz: TikTok'a yükleme (Mac'teki otomatik üretim videoyu sosyal sistemin takvimine verir, taslağı o gönderir).
if (!args.includes("--onizleme") && !args.includes("--taslaksiz") && existsSync(resolve(HERE, "../secret/tiktok-dev/token.json"))) {
  try {
    taslak = await yukle(video);
    console.log("TikTok taslağı:", taslak.publish_id);
  } catch (e) {
    console.log("TikTok'a yüklenemedi:", e.message);
  }
}

if (args.includes("--bildir")) {
  // Açıklama panoya; bildirim paylaşma saatini söyler.
  try { execFileSync("pbcopy", { input: aciklama }); } catch {}
  const msg = taslak
    ? `Video TikTok gelen kutunda (taslak). Açıklama panoda. Paylaşım: ${SAAT[yuva]} (Berlin)`
    : `Video hazır (${tur}), dosyadan yükle. Açıklama panoda. Paylaşım: ${SAAT[yuva]} (Berlin)`;
  try { execFileSync("osascript", ["-e", `display notification ${JSON.stringify(msg)} with title "Wattenoog" subtitle ${JSON.stringify(video.split("/").pop())}`]); } catch {}
}
console.log("video:", video);
if (args.includes("--ac")) try { execFileSync("open", [out]); } catch {}

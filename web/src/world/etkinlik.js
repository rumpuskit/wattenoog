// Dışarıdaki etkinlikler ve günün olayı. Plan (sim.js) yalnız "dışarı çıkış" saatlerini verir; nereye gidilip
// ne yapılacağı burada seçilir: saat, gün, mevsim, adada açık olan yerler ve kişinin sevdiği etkinlikler
// belirler. Açılmamış yerin etkinliği seçilmez; ada büyüdükçe liste uzar. Her şey günden ve kişiden türetilir:
// herkes aynı anda aynı şeyi görür.
//
// Günün olayı (dayTheme): her gün adaya bir hava verir (pazar ayini, cumartesi pazarı ve plaj sineması, cuma Shanty-Chor,
// Watt yürüyüşü...); seçimde ilgili etkinliklerin ağırlığı artar ve üst panelde "Heute" satırında görünür. Alman
// takvimi (DEVIR §4.5): resmî tatiller sim.holidayOf'tan, tatil olmayan gelenek günleri (Biikebrennen, Osterfeuer,
// Tanz in den Mai, St. Martin, Nikolaus, Heiligabend, Silvester) tarihten. Görünen metinler Almanca.
import * as THREE from "three";
import { civilFromDays, easterOf, holidayOf, roll, weekday } from "../sim.js";
import { moonPhase, sunTimes } from "./sky.js";
import { votedFilm, votedTheme } from "../tercih.js";
import { clockText } from "../fmt.js";

const frac = (n) => (n >>> 0) / 4294967296;
const gunduz = (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set - 20;

/**
 * Etkinlikler. mode: people.js'teki davranış; yer: kartta ve yolculukta görünen yer (people override);
 * ad: kartta "Jetzt" satırı (kişi zamiri yok: cinsiyet tahmin edilmez); gerek(c): adada var mı; saat(seg, c): bu çıkışa
 * uyar mı; w: temel ağırlık; olay: yalnız günün olayı onu seçince (o saatteki herkesin çoğu katılır).
 * c: { w: dünya, pools, groupPools, dog, sun: {rise, set}, theme, workplace(kind) }
 * "watt" ve "deich" yer anahtarlarını dünya sağlar; yoksa bu etkinlikler seçilmez.
 */
export const ETKINLIK = {
  meydan_sohbet: { ad: "Auf dem Marktplatz", mode: "group:meydan", yer: "meydan", w: 7, sosyal: true },
  meydan_bank: { ad: "Auf einer Klönbank am Marktplatz", mode: "seat:meydan", yer: "meydan", w: 4, sosyal: true },
  kafe: { ad: "Draußen vor dem Café", mode: "seat:kafe", yer: "meydan", w: 6, sosyal: true, gerek: (c) => c.pools["seat:kafe"]?.length, saat: (s) => s.bas >= 480 && s.bas < 1380 },
  carsi: { ad: "Bummeln in der Strandstraße", mode: "shop", yer: "meydan", w: 5, gerek: (c) => !!c.w.carsiWalks, saat: (s) => s.bas >= 570 && s.bas < 1260 },
  kahvehane: { ad: "In der Fischbude", mode: "inside:kahvehane", yer: "kahvehane", w: 5, sosyal: true, gerek: (c) => !!c.w.places.kahvehane, saat: (s) => s.bas >= 420 },
  kahvehane_bahce: { ad: "Fischbrötchen vor der Fischbude", mode: "seat:kahvehane", yer: "kahvehane", w: 3, sosyal: true, gerek: (c) => c.pools["seat:kahvehane"]?.length, saat: (s) => s.bas >= 420 },
  park: { ad: "Im Kurpark", mode: "group:park", yer: "park", w: 5, sosyal: true, gerek: (c) => !!c.w.places.park, saat: (s) => s.bas >= 390 && s.bas < 1320 },
  park_bank: { ad: "Auf einer Bank im Kurpark", mode: "seat:park", yer: "park", w: 3, gerek: (c) => c.pools["seat:park"]?.length, saat: (s) => s.bas >= 390 && s.bas < 1320 },
  sahil_yolu: { ad: "Spaziergang auf der Strandpromenade", mode: "stroll", yer: "sahil_yolu", w: 5, gerek: (c) => !!c.w.places.sahil_yolu, saat: (s, c) => s.bas >= c.sun.rise - 30 && s.bas < 1350 },
  pazar: { ad: "Einkaufen auf dem Wochenmarkt", mode: "stroll", yer: "pazar", w: 4, gerek: (c) => !!c.w.places.pazar, saat: (s) => s.bas >= 480 && s.bas < 1170 },
  piknik: { ad: "Picknick in den Dünen", mode: "group:piknik", yer: "tepe", w: 3, sosyal: true, gerek: (c) => c.groupPools.piknik?.length, saat: (s, c) => s.bas >= 600 && s.son <= c.sun.set + 30 && s.son - s.bas >= 60 },
  tepe_yuruyus: { ad: "Auf dem Dünenpfad zum Wasserturm", mode: "hike", yer: "tepe", w: 3, saat: (s, c) => s.bas >= c.sun.rise + 20 && s.bas <= c.sun.set - 50 },
  plaj_yuruyus: { ad: "Strandspaziergang", mode: "beachwalk", yer: "plaj", w: 4, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set + 70 },
  kosu: { ad: "Joggen am Strand", mode: "jog:plaj", yer: "plaj", w: 1.5, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set + 40 },
  gun_batimi: { ad: "Sonnenuntergang am Leuchtturm", mode: "sunset", yer: "fener", w: 9, gerek: (c) => c.pools.sunset?.length, saat: (s, c) => s.bas <= c.sun.set + 5 && s.son >= c.sun.set - 25 && s.bas >= c.sun.set - 120 },
  vapur: { ad: "Am Fähranleger, die Fähre kommt", mode: "pier", yer: "iskele_vapur", w: 3, gerek: (c) => c.pools.pier?.length, saat: (s) => s.bas >= 360 && s.bas < 1380 },
  tas: { ad: "Steine flitschen am Wasser", mode: "skip", yer: "plaj", w: 2, gerek: (c) => c.pools.skip?.length, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set },
  kiyi_balik: { ad: "Angeln vom Ufer", mode: "fish", yer: "kiyi", w: 2, gerek: (c) => c.pools.fish?.length, saat: (s) => s.bas >= 330 && s.bas < 1320 },
  fotograf: { ad: "Fotos von der Aussicht", mode: "view", yer: "fener", w: 1.5, gerek: (c) => c.pools.view?.length, saat: (s, c) => s.bas >= c.sun.rise && s.bas <= c.sun.set },
  kapi_onu: { ad: "Vor der Haustür", mode: "kapi", yer: "kapi", w: 5, sosyal: true, saat: (s) => s.bas >= 960 && s.bas < 1380 },
  yildiz: { ad: "Sternegucken auf der Düne", mode: "stars", yer: "tepe", w: 1.5, gerek: (c) => c.pools.stars?.length, saat: (s, c) => s.bas >= c.sun.set + 75 && s.son - s.bas >= 45 },
  market: { ad: "Einkaufen im Laden", mode: "inside:market", yer: "market", w: 3, gerek: (c) => !!c.workplace("market"), saat: (s) => s.bas >= 480 && s.bas < 1320 && s.son - s.bas <= 80 },
  firin: { ad: "Brötchen holen in der Bäckerei", mode: "inside:firin", yer: "firin", w: 2, gerek: (c) => !!c.workplace("firin"), saat: (s) => s.bas >= 420 && s.bas < 1200 && s.son - s.bas <= 70 },
  cami: { ad: "Beim Gottesdienst in der Inselkirche", mode: "inside:cami", yer: "cami", w: 0, olay: true, gerek: (c) => !!c.workplace("cami"), saat: (s, c) => c.theme?.id === "kilise" && s.bas < c.theme.son && s.son > c.theme.bas },
  mac: { ad: "Fußball gucken beim SV Wattenoog", mode: "seat:tribun", yer: "saha", w: 0, olay: true, gerek: (c) => c.pools["seat:tribun"]?.length, saat: (s, c) => c.theme?.id === "mac" && s.bas < c.theme.son - 30 && s.son > c.theme.bas + 15 },
  ucurtma: { ad: "Drachen steigen lassen", mode: "kite", yer: "tepe", w: 0.4, gerek: (c) => c.pools.kite?.length, saat: (s, c) => s.bas >= c.sun.rise + 30 && s.bas <= c.sun.set - 30 },
  kopek: { ad: "Gassi gehen", mode: "stroll", yer: "plaj", w: 0, kopek: 9, saat: (s, c) => s.bas >= c.sun.rise - 30 && s.bas < 1380 },
  sinema: { ad: "Beim Strandkino", mode: "seat:sinema", yer: "plaj", w: 0, olay: true, gerek: (c) => c.pools["seat:sinema"]?.length, saat: (s, c) => c.theme?.id === "sinema" && s.bas < c.theme.son - 30 && s.son > c.theme.bas + 20 },
  temizlik: { ad: "Beim Strandputz", mode: "cleanup", yer: "plaj", w: 0, olay: true, saat: (s, c) => c.theme?.id === "temizlik" && s.bas < c.theme.son && s.son > c.theme.bas },
  // Wattenoog'a özgü: Watt ve set (yerleri dünyadan; yoksa seçilmez), kum kalesi yarışması (eğilip kum toplayan
  // "cleanup" duruşu), Boßeln.
  watt_yuruyus: { ad: "Wattwanderung", mode: "stroll", yer: "watt", w: 1.5, sosyal: true, gerek: (c) => !!c.w.places.watt, saat: gunduz },
  deich_spaziergang: { ad: "Spaziergang auf dem Deich", mode: "stroll", yer: "deich", w: 3, gerek: (c) => !!c.w.places.deich, saat: gunduz },
  bosseln: { ad: "Boßeln auf dem Deichweg", mode: "stroll", yer: "deich", w: 0.5, sosyal: true, gerek: (c) => !!c.w.places.deich, saat: gunduz },
  sandburg: { ad: "Beim Sandburgen-Wettbewerb", mode: "cleanup", yer: "plaj", w: 0, olay: true, saat: (s, c) => c.theme?.id === "sandburg" && s.bas < c.theme.son && s.son > c.theme.bas },
};
const IDS = Object.keys(ETKINLIK);
// Herkesin sevdiği üç etkinlik (yeri adada açıldıkça devreye girer): seçimde üç kat ağırlık.
const SEVILEN = IDS.filter((id) => ETKINLIK[id].w > 0 && !id.startsWith("meydan"));

export function favorites(seed) {
  const out = [];
  for (let n = 0; out.length < 3 && n < 20; n++) {
    const id = SEVILEN[roll(seed, "sevilen", n) % SEVILEN.length];
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

const KIS = (mo) => mo >= 11 || mo <= 3; // kasım–mart: kumsal etkinlikleri seyrek, sinema battaniyeli
const yerVar = (world, k) => !!world.places?.[k];

/**
 * Takvime bağlı günler (tatiller ve gelenek günleri): her şeyin önünde, oylanmaz. Yoksa null.
 */
function calendarTheme(day, world) {
  const [y, mo, d] = civilFromDays(day);
  const hol = holidayOf(day);
  const sun = sunTimes(day);
  const deich = yerVar(world, "deich") ? "deich" : "plaj";
  const aufDeich = deich === "deich" ? "auf dem Deich" : "am Strand";
  const hafen = yerVar(world, "kahvehane") ? "kahvehane" : "meydan";
  if (mo === 12 && d === 31) return { id: "silvester", ad: "Silvester: um Mitternacht Feuerwerk über dem Hafen", yer: hafen, boost: { meydan_sohbet: 2, kapi_onu: 2, sahil_yolu: 2 } };
  if (mo === 1 && d === 1) return { id: "neujahr", ad: "Neujahr: ausschlafen, dann Neujahrsspaziergang am Strand", yer: "plaj", boost: { plaj_yuruyus: 3, kafe: 2, deich_spaziergang: 2 } };
  if (mo === 12 && d === 24) return { id: "heiligabend", ad: "Heiligabend: ab dem Nachmittag wird es still auf der Insel", yer: "meydan", boost: { kapi_onu: 3, firin: 2, market: 2 } };
  if (hol === "weihnachten1" || hol === "weihnachten2") return { id: "weihnachten", ad: `${hol === "weihnachten1" ? "1." : "2."} Weihnachtstag: Lichter auf dem Marktplatz`, yer: "meydan", boost: { meydan_sohbet: 3, kapi_onu: 2, plaj_yuruyus: 1.5 } };
  if (mo === 12 && d === 6) return { id: "nikolaus", ad: "Nikolaus: Stiefel vor der Tür, morgens sind sie gefüllt", yer: "meydan", boost: { kapi_onu: 3, firin: 2 } };
  if (mo === 11 && d === 11) return { id: "martin", ad: "Sankt Martin: Laternenumzug der Kinder", yer: "meydan", bas: 1050, son: 1110, boost: { meydan_sohbet: 4, kapi_onu: 2 } };
  if (hol === "reformation") return { id: "reformation", ad: "Reformationstag: Feiertag; abends ziehen verkleidete Kinder von Tür zu Tür", yer: "meydan", boost: { kapi_onu: 4, meydan_sohbet: 1.5 } };
  if (hol === "einheit") return { id: "einheit", ad: `Tag der Deutschen Einheit: Flagge am Rathaus, Spaziergang ${aufDeich}`, yer: deich, boost: { deich_spaziergang: 4, plaj_yuruyus: 2, piknik: 2 } };
  if (mo === 2 && d === 21) return { id: "biike", ad: `Biikebrennen: großes Feuer am Strand nach Sonnenuntergang (${clockText(sun.set)} Uhr)`, yer: "plaj", boost: { gun_batimi: 3, plaj_yuruyus: 3 } };
  if (hol === "karfreitag") return { id: "karfreitag", ad: "Karfreitag: stiller Feiertag auf der Insel", yer: "plaj", boost: { plaj_yuruyus: 2.5, deich_spaziergang: 2, kafe: 0.5 } };
  if (day === easterOf(y) - 1) return { id: "osterfeuer", ad: `Osterfeuer am Strand nach Sonnenuntergang (${clockText(sun.set)} Uhr)`, yer: "plaj", boost: { gun_batimi: 3, plaj_yuruyus: 3, kapi_onu: 0.5 } };
  if (hol === "ostermontag") return { id: "ostern", ad: `Ostermontag: Osterspaziergang ${aufDeich}`, yer: deich, boost: { deich_spaziergang: 6, plaj_yuruyus: 2, piknik: 2 } };
  if (mo === 4 && d === 30) return { id: "maitanz", ad: "Tanz in den Mai: abends Musik auf dem Marktplatz", yer: "meydan", bas: 1200, son: 1380, boost: { meydan_sohbet: 4, meydan_bank: 2 } };
  if (hol === "maifeiertag") return { id: "maifeiertag", ad: "Maifeiertag: Radtour und Picknick", yer: "tepe", boost: { piknik: 4, plaj_yuruyus: 2, deich_spaziergang: 2 } };
  if (hol === "himmelfahrt") return { id: "himmelfahrt", ad: "Christi Himmelfahrt: mit dem Bollerwagen über die Insel", yer: deich, boost: { piknik: 4, tepe_yuruyus: 2, deich_spaziergang: 3 } };
  if (hol === "pfingstmontag") return { id: "pfingsten", ad: "Pfingstmontag: Ausflug zum Leuchtturm", yer: "fener", boost: { fotograf: 3, gun_batimi: 2, plaj_yuruyus: 2 } };
  return null;
}

/** Hafta sonu ve cuma: sabit günler (oylanmaz). Yoksa null. */
function weekTheme(day, world) {
  const wd = weekday(day);
  const [, mo, d] = civilFromDays(day);
  const has = (kind) => world.workplaces[kind]?.some(Boolean);
  // Cuma akşamı: yazın ayın ilk cuması Feuerwehrfest (itfaiye açıksa), diğer cumalar Shanty-Chor.
  if (wd === 4 && has("itfaiye") && d <= 7 && mo >= 5 && mo <= 9) return { id: "feuerwehr", ad: "Feuerwehrfest auf dem Marktplatz, ab 18 Uhr", yer: "meydan", bas: 1080, son: 1290, boost: { meydan_sohbet: 4, meydan_bank: 3 } };
  if (wd === 4) return { id: "konser", ad: "Der Shanty-Chor singt auf dem Marktplatz", yer: "meydan", bas: 1140, son: 1260, boost: { meydan_sohbet: 4, meydan_bank: 3 } };
  // Cumartesi: (açıksa) sabah Wochenmarkt, akşam plaj sineması (film haftalık ankette seçilir).
  if (wd === 5) {
    const kino = KIS(mo) ? "abends Strandkino mit Wolldecken" : "abends Strandkino";
    return { id: "sinema", ad: (has("pazar") ? `Vormittags Wochenmarkt, ${kino}` : kino[0].toUpperCase() + kino.slice(1)), yer: "plaj", bas: 1230, son: 1365, boost: { sinema: 1, pazar: 4 } };
  }
  // Pazar: kilise açıksa 10:00 çanlar ve ayin (fırından Brötchen), değilse set üstünde pazar yürüyüşü.
  if (wd === 6 && has("cami")) return { id: "kilise", ad: "Glockenläuten und Gottesdienst in der Inselkirche", yer: "cami", bas: 600, son: 675, boost: { cami: 1, firin: 3, deich_spaziergang: 2, piknik: 1.5, tepe_yuruyus: 1.5 } };
  if (wd === 6) return { id: "sonntag", ad: yerVar(world, "deich") ? "Sonntagsspaziergang auf dem Deich" : "Sonntagsspaziergang am Strand", yer: yerVar(world, "deich") ? "deich" : "plaj", boost: { deich_spaziergang: 6, plaj_yuruyus: 2.5, firin: 2, kafe: 2 } };
  return null;
}

/** O gün sabit mi (takvim ya da hafta sonu/cuma; anket açılmaz)? Sabitse olay, değilse null. */
export function fixedTheme(day, world) {
  return calendarTheme(day, world) ?? weekTheme(day, world);
}

/** Pazartesi–perşembe dönen (ve ankette oylanan) olaylar; yalnız yeri adada olanlar. */
export function themeOptions(day, world) {
  const sun = sunTimes(day);
  const [, mo] = civilFromDays(day);
  const moon = moonPhase(day, 1320);
  const promenade = yerVar(world, "sahil_yolu") ? "sahil_yolu" : "plaj";
  return [
    ...(yerVar(world, "watt") ? [{ id: "wattwanderung", ad: "Wattwanderung bei Niedrigwasser", yer: "watt", boost: { watt_yuruyus: 25, plaj_yuruyus: 1.5 } }] : []),
    ...(yerVar(world, "deich") ? [{ id: "bosseln", ad: "Boßelturnier auf dem Deichweg", yer: "deich", boost: { bosseln: 30, deich_spaziergang: 2 } }] : []),
    { id: "kutter", ad: "Die Krabbenkutter kommen zurück: alle am Hafen", yer: "iskele", boost: { kiyi_balik: 6, vapur: 2, kahvehane_bahce: 3 } },
    ...(yerVar(world, "kahvehane") ? [{ id: "klonschnack", ad: "Klönschnack an der Fischbude", yer: "kahvehane", boost: { kahvehane: 3, kahvehane_bahce: 4 } }] : []),
    { id: "gunbatimi", ad: `Sonnenuntergang an der Promenade (${clockText(sun.set)} Uhr)`, yer: promenade, boost: { gun_batimi: 3, sahil_yolu: 3, plaj_yuruyus: 2, fotograf: 2 } },
    ...(moon < 0.12 || moon > 0.88 ? [{ id: "yildiz", ad: "Mondlose Nacht: Sternegucken auf der Düne", yer: "tepe", boost: { yildiz: 12 } }] : []),
    { id: "ucurtma", ad: "Drachenwetter: alle lassen Drachen steigen", yer: "tepe", boost: { ucurtma: 30, plaj_yuruyus: 1.5 } },
    { id: "temizlik", ad: "Strandputz um 10 Uhr am Hauptstrand", yer: "plaj", bas: 600, son: 720, boost: { temizlik: 1 } },
    ...(KIS(mo) ? [] : [{ id: "sandburg", ad: "Sandburgen-Wettbewerb am Hauptstrand", yer: "plaj", bas: 840, son: 960, boost: { sandburg: 1, plaj_yuruyus: 1.5 } }]),
    { id: "komsuluk", ad: "Straßenfest: alle sind vor der Haustür", yer: "meydan", boost: { kapi_onu: 3, piknik: 1.5 } },
  ];
}

/**
 * Günün olayı. id, ad (üst panel), yer (kamera için yer anahtarı), isteğe bağlı saat aralığı (bas, son) ve
 * etkinlik ağırlık çarpanları. Takvim günleri önce, sonra cuma/cumartesi/pazar; diğer günler sırayla döner
 * (ya da sitedeki ankette oylanan olay).
 */
export function dayTheme(day, world) {
  const fixed = fixedTheme(day, world);
  if (fixed) return fixed;
  const list = themeOptions(day, world);
  // Sitedeki ankette bir gün önceden oylanan olay (oy varsa) sıranın yerine geçer.
  const voted = votedTheme(day);
  const pick = list.find((t) => t.id === voted);
  if (pick) return { ...pick, oylama: true };
  return list[roll(day, "gunun_olayi") % list.length];
}

/**
 * Bir çıkış için etkinlik seçer. seg: plan parçası; k: sırası; hobby: hobi çıkışıysa true (yalnız bazı günler
 * değişir); c: bağlam. Uygun etkinlik yoksa null (eski davranış: meydan).
 */
export function chooseActivity(seed, day, k, seg, c, fav) {
  const opts = [];
  let total = 0;
  for (const id of IDS) {
    const e = ETKINLIK[id];
    if (e.gerek && !e.gerek(c)) continue;
    if (e.saat && !e.saat(seg, c)) continue;
    let w = e.w;
    if (e.kopek) w = c.dog ? e.kopek : 0;
    if (fav.includes(id)) w *= 3;
    w *= c.theme?.boost?.[id] ?? 1;
    if (e.olay) w = c.theme?.boost?.[id] ? 40 : 0; // olay saatindeki herkesin çoğu katılır
    if (w <= 0) continue;
    opts.push([id, w]);
    total += w;
  }
  if (!total) return null;
  let x = frac(roll(seed, "etkinlik", day * 16 + k)) * total;
  for (const [id, w] of opts) { if (x < w) return id; x -= w; }
  return opts[opts.length - 1][0];
}

/**
 * Plajda açık hava sineması: perde (gece ışıklı, oynayan film) ve sandalye sıraları. Kumsalda engelsiz bir
 * yer bulunamazsa kurulmaz. seats: oturma yerleri (people.js "seat:sinema" havuzu).
 */
// Film türü (haftalık ankette kazanan; yoksa komedi): perdedeki gökyüzü, ışık ve silüetler.
const FILMS = {
  komedi: { skies: [["#87c3e8", "#f6f4ef"], ["#f2c230", "#fff3c4"]], walk: 18 },
  macera: { skies: [["#1b2a4a", "#f2a65a"], ["#0f2a2a", "#2f9c9a"]], walk: 34 },
  korku: { skies: [["#2a2a2a", "#d6d6d6"], ["#111111", "#9a9a9a"]], walk: 12 }, // "Klassiker": siyah-beyaz eski film
  animasyon: { skies: [["#7ad1c4", "#f6b2d6"], ["#b5a6ef", "#fde2a8"]], walk: 22 },
};

export function buildCinema(world) {
  const beach = world.places.plaj?.anchors ?? [];
  const sand = (x, z) => world.isWalkable(x, z) && world.height(x, z) > 0.25;
  // Deniz hangi yanda (Hauptstrand kuzeyde: −z): perde denize yakın, sıralar kara tarafında.
  const mid = beach[beach.length >> 1];
  const sg = mid && world.height(mid[0], mid[1] + 20) < world.height(mid[0], mid[1] - 20) ? 1 : -1;
  let spot = null;
  for (const [bx, bz] of [...beach].sort((a, b) => Math.abs(a[0] - beach[beach.length >> 1][0]) - Math.abs(b[0] - beach[beach.length >> 1][0]))) {
    // Perde denize yakın (kıyıya bakarak), sıralar onun kara tarafında.
    let ok = sand(bx, bz + 3 * sg);
    for (let r = 0; r < 4 && ok; r++) for (let cI = -3; cI <= 3 && ok; cI++) ok = sand(bx + cI * 1.1, bz - sg * (3 + r * 1.3));
    if (ok) { spot = [bx, bz]; break; }
  }
  if (!spot) return null;
  const [sx, sz] = spot;
  const group = new THREE.Group();
  group.visible = false;
  const gy = (x, z) => world.groundY(x, z);
  // Perde: iki direk, çerçeve, film tuvali (gece parlar).
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const frame = new THREE.MeshStandardMaterial({ color: "#2a2d33", roughness: 0.7 });
  const y0 = gy(sx, sz + 3 * sg);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), screenMat);
  screen.position.set(sx, y0 + 3.0, sz + 3 * sg);
  screen.rotation.y = sg > 0 ? Math.PI : 0; // kara tarafına bakar
  const back = new THREE.Mesh(new THREE.BoxGeometry(6.7, 3.5, 0.08), frame);
  back.position.set(sx, y0 + 3.0, sz + 3.05 * sg);
  group.add(screen, back);
  for (const dx of [-3.35, 3.35]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 4.8, 8), frame);
    post.position.set(sx + dx, y0 + 2.4, sz + 3.08 * sg);
    group.add(post);
  }
  // Sandalyeler: 4 sıra × 7 (katlanır plaj sandalyesi).
  const chairGeo = new THREE.BoxGeometry(0.46, 0.06, 0.44).translate(0, 0.42, 0);
  const backGeo = new THREE.BoxGeometry(0.46, 0.5, 0.05).translate(0, 0.7, -0.22);
  const legGeo = new THREE.BoxGeometry(0.42, 0.42, 0.04).translate(0, 0.21, 0);
  const seats = [];
  const n = 28;
  const meshes = [chairGeo, backGeo, legGeo].map((g, j) => new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: j === 2 ? "#3a3d44" : "#ffffff", roughness: 0.6 }), n));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
  const colors = ["#e9667f", "#2f9c9a", "#f2c230", "#f6f4ef"].map((h) => new THREE.Color(h));
  let idx = 0;
  for (let r = 0; r < 4; r++) for (let cI = -3; cI <= 3; cI++) {
    const x = sx + cI * 1.1 + (r % 2 ? 0.3 : 0), z = sz - sg * (3 + r * 1.3);
    const y = gy(x, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg > 0 ? 0 : Math.PI); // perdeye bakar
    m4.compose(pos.set(x, y, z), q, one);
    for (const mesh of meshes) mesh.setMatrixAt(idx, m4);
    meshes[0].setColorAt(idx, colors[(idx * 7) % 4]);
    meshes[1].setColorAt(idx, colors[(idx * 7) % 4]);
    seats.push({ x, z, heading: sg > 0 ? 0 : Math.PI, top: y + 0.45, place: "sinema" });
    idx++;
  }
  for (const mesh of meshes) { mesh.castShadow = true; group.add(mesh); }
  let last = -1, genre = "komedi";
  const draw = (t) => {
    // Basit "film": gökyüzü, ufuk, sahnede yürüyen iki silüet; sahneler 20 sn'de bir değişir.
    const g = cv.getContext("2d");
    const film = FILMS[genre] ?? FILMS.komedi;
    const skies = film.skies[Math.floor(t / 20) % film.skies.length];
    const gr = g.createLinearGradient(0, 0, 0, 128);
    gr.addColorStop(0, skies[0]); gr.addColorStop(1, skies[1]);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, 92, 256, 36);
    g.fillStyle = "#111";
    for (const [k, sp] of [[0, film.walk], [1, -film.walk * 0.7]]) {
      const x = ((t * sp + k * 120) % 300 + 300) % 300 - 22;
      g.fillRect(x, 62, 10, 30); g.beginPath(); g.arc(x + 5, 56, 7, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(0, (t * 40) % 128, 256, 2);
    tex.needsUpdate = true;
  };
  return {
    group, seats, spot,
    update(theme, minute, real, day) {
      genre = votedFilm(day) ?? "komedi";
      const on = theme?.id === "sinema" && minute >= theme.bas - 60 && minute <= theme.son + 30;
      group.visible = on;
      screen.visible = on && minute >= theme.bas - 10 && minute <= theme.son;
      if (screen.visible && Math.floor(real * 8) !== last) { last = Math.floor(real * 8); draw(real); }
    },
  };
}

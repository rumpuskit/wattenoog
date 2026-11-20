// Insel Wattenoog'un biçimi: kıyı, arazi yüksekliği (kumullar, set, tuzlu bataklık, Watt), liman havuzu, ana yollar ve
// mahalle bölgeleri. Nüfustan bağımsızdır: ada boş başladığında da tam hâliyle vardır; mahalleler buradaki bölgelere
// dolar (layout.js).
//
// Koordinatlar: x doğu, z güney, metre; (0,0) Marktplatz'ın ortası. Ada doğu–batı uzanan bir bariyer adası (Doğu Frizya
// adaları gibi): kuzeyde açık Kuzey Denizi, kesintisiz geniş kumsal ve kumul kuşağı; güneyde Wattenmeer (gelgitle kuruyan
// sığ deniz), tuzlu bataklık (Salzwiese) ve onu köyden ayıran set (Deich). Liman güney kıyıda, moloz dalgakıranlı bir havuz;
// feribot güneye (anakaraya) kanal boyunca gider. Batı ucunda yüksek kumul (Westkopf) ve deniz feneri; doğuya doğru ada
// incelir ve uzun bir kum burnu (Ostplate, kuş koruma alanı) olur. Köy merkezi limanla kumsal arasında: Marktplatz'tan
// kuzeye Strandstraße (yaya bölgesi) Kurhaus'a ve sahil yoluna çıkar.
import { fbm, hash2 } from "./noise.js";
import SAVED_ZONES from "./zones.json" with { type: "json" };

export const FLAT_Y = 1.2;

const BODY = { x: -300, z: -420, rx: 3650, rz: 1230 };
export const HUB = [0, 0];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** Elipse işaretli uzaklık (yaklaşık, metre; dışarıda +). */
function ellipseSd(x, z, e) {
  const px = (x - e.x) / e.rx, pz = (z - e.z) / e.rz;
  const k0 = Math.hypot(px, pz), k1 = Math.hypot(px / e.rx, pz / e.rz);
  return (k0 * (k0 - 1)) / (k1 || 1e-9);
}

/** Kapsüle işaretli uzaklık (dışarıda +). */
function capsuleSd(x, z, ax, az, bx, bz, r) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(x - ax - vx * t, z - az - vz * t) - r;
}

/** Yumuşak birleşim (içeride + değerler için büyük olan). */
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/** Güney (Watt) kıyısı, gürültüsüz: x'teki kıyı çizgisinin z'si. */
export function southShoreZ(x) {
  const u = (x - BODY.x) / BODY.rx;
  return BODY.z + BODY.rz * Math.sqrt(Math.max(0, 1 - u * u));
}
/** Kuzey (açık deniz) kıyısı, gürültüsüz. */
export function northShoreZ(x) {
  const u = (x - BODY.x) / BODY.rx;
  return BODY.z - BODY.rz * Math.sqrt(Math.max(0, 1 - u * u));
}

// --- liman (Hafen) ---
// Havuz kıyıdan içeri kazılmış; kuzey rıhtımı (Hafenkante) z = 640, batı ve doğu duvarları x = −160 / 320. İki moloz
// dalgakıran güneye uzanıp ağızda (x 40…150) birbirine döner. Feribot iskelesi havuzun doğu yarısında, Kutterhafen batı
// yarısında. Ağızdan güneye taranmış kanal (Fahrrinne): feribot gelgitten bağımsız işler.
export const HAFEN = { x0: -160, x1: 320, z0: 640, z1: 916, mouth: [30, 150], kutterX: 40 };
/** Mendirekler (taş dalgakıran): kara değil, üstü yürünebilir yapı (layout.js piers + city.js "mendirek"). Kutular. */
export const MOLES = [
  { x0: -170, x1: -160, z0: 690, z1: 916 }, // batı mendirek (havuzun batı duvarının uzantısı)
  { x0: -170, x1: 30, z0: 906, z1: 916 }, // batı kol
  { x0: 320, x1: 330, z0: 690, z1: 916 }, // doğu mendirek
  { x0: 150, x1: 330, z0: 906, z1: 916 }, // doğu kol
];
/** Hafenstraße: havuzun kuzeyinde, rıhtıma paralel (z = 560); arada 80 m'lik rıhtım önü (feribot, Versorgungshafen). */
export const HAFEN_Z = 560;

// --- Strandstraße: Marktplatz'tan kumsala (yaya bölgesi; ilk ~450 m dükkân, sonra Kurviertel villaları) ---
export const STRAND = [[0, -45], [-6, -330], [-20, -720], [-14, -1110], [0, -1490]];
/** Kurhaus ve sahil yolu (Promenade): kumulların ilk sırasının arkası (kuzey kıyıdan 150 m içeride). */
export const PROMENADE_X = [-640, 560];
export const promenadeZ = (x) => northShoreZ(x) + 150;

// Gelgit kıyısı: güney kıyıda tuzlu bataklık şeridi (kıyı ile set arası) ve set (Deich). Liman çevresinde set yok
// (rıhtım duvarları ve yükseltilmiş köy).
export const DEICH = { ic: 105, taban: 44, tepe: 4, h: 4.6 }; // kıyıdan iç mesafe (merkez), taban genişliği, tepe, yükseklik
const DEICH_ARALIK = [[-2700, -320], [420, 2300]];
/** Setin bu x'te olup olmadığı (0..1, uçlarda yumuşak). */
export function deichAt(x) {
  let w = 0;
  for (const [a, b] of DEICH_ARALIK) w = Math.max(w, smooth((x - a) / 80) * smooth((b - x) / 80));
  return w;
}
/** Set merkez çizgisinin z'si. */
export const deichZ = (x) => southShoreZ(x) - DEICH.ic;

function boxIn(x, z, b) {
  return Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
}

/** Köy ve liman kıyısında kıyı gürültüsü yok (rıhtımlar ve sokaklar kıyıya göre dizilir). */
function quiet(x, z) {
  const along = smooth((x + 1000) / 160) * smooth((1000 - x) / 160);
  const near = smooth((260 - Math.abs(z - southShoreZ(x))) / 120);
  return along * near;
}

const landCache = new Map();
/** Kara içi uzaklık (metre, yaklaşık): + karada, kıyıda 0, − denizde. */
export function land(x, z) {
  // Anahtar 1/16 m (Driftwood dersi: 1 m yuvarlama kıyıyı basamaklıyordu).
  const key = Math.round(x * 16) * 1048576 + Math.round(z * 16);
  let d = landCache.get(key);
  if (d !== undefined) return d;
  d = -ellipseSd(x, z, BODY);
  d = smax(d, -capsuleSd(x, z, 1800, -440, 3750, -680, 250), 170); // doğu: incelen gövde
  d = smax(d, -capsuleSd(x, z, 3650, -660, 4600, -780, 95), 80); // Ostplate kum burnu
  d = smax(d, -capsuleSd(x, z, -3550, -480, -3100, -420, 470), 200); // batı başı (Westkopf)
  d += fbm(x / 190, z / 190, 5) * 55 * (1 - quiet(x, z));
  // Liman havuzu: kıyıdan içeri kazılmış (kuzey rıhtımı z0); mendirekler kara değil (MOLES).
  const basin = boxIn(x, z, { x0: HAFEN.x0, x1: HAFEN.x1, z0: HAFEN.z0, z1: 1000 });
  d = Math.min(d, -basin);
  if (landCache.size > 400000) landCache.clear();
  landCache.set(key, d);
  return d;
}

// --- ayrılmış alanlar (mahalle kurulmaz) ---

export const RESERVES = {
  town: { x0: -430, x1: 470, z0: -560, z1: 660 }, // Marktplatz, Strandstraße'nin dükkânlı kısmı, Hafenweg, kilise, Rathaus
  kur: { x0: -170, x1: 170, z0: -1560, z1: -560 }, // Strandstraße'nin Kurviertel kısmı (villalar), Kurhaus
  hafen: { x0: -340, x1: 600, z0: 540, z1: 1000 }, // liman havuzu, Bootswerft, Seenotretter, Seehundstation
  polder: { x0: 1950, x1: 3000, z0: -260, z1: 900 }, // set arkası tarlalar, çiftlik, yel değirmeni
  wasserturm: { x: -560, z: -1060, r: 100 }, // kumul üstünde su kulesi ve seyir yeri
  westkopf: { x: -3280, z: -560, r: 470 }, // batı başı: yüksek kumul, deniz feneri, fener bekçisinin evi
  ostplate: { x0: 3000, x1: 4700, z0: -1300, z1: 600 }, // doğu ucu: kuş koruma alanı, kum burnu
};

/** late: 25. mahalleden sonra kumul kuşağının iç kenarı da kullanılabilir (ada doluyor). */
export function inReserve(x, z, pad = 0, late = false) {
  const R = RESERVES;
  for (const k of ["town", "kur", "hafen", "polder", "ostplate"]) {
    const b = R[k];
    if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return k;
  }
  if (Math.hypot(x - R.wasserturm.x, z - R.wasserturm.z) < R.wasserturm.r + pad) return "wasserturm";
  if (Math.hypot(x - R.westkopf.x, z - R.westkopf.z) < R.westkopf.r + pad) return "westkopf";
  if (z < northShoreZ(x) + (late ? 200 : 260) + pad) return "dunes";
  // Set ve önündeki tuzlu bataklık: kıyıdan setin iç eteğine (+ 25 m güvenlik) kadar.
  if (deichAt(x) > 0.05 && z > deichZ(x) - DEICH.taban / 2 - 10 - pad) return "deich";
  return null;
}

// --- ana yollar (köyden dışa; mahalleler bunların iki yanına dizilir) ---
// Strandstraße yaya bölgesi olduğu için araç trafiği köyün çevresinden: Westerweg (batıya, fenere), Ostdorfer Straße
// (doğuya, polderin kuzeyinden), Dünenweg (kuzeybatıya, kumul kuşağı boyunca), Kurstraße (kuzeydoğuya, Kurviertel'in
// doğusundan kumullara).
export const TRUNKS = [
  { id: "west", name: "Westerweg", pts: [[-115, 20], [-520, 60], [-1000, 80], [-1550, 40], [-2150, -80], [-2750, -260]] },
  { id: "ost", name: "Ostdorfer Straße", pts: [[115, 20], [480, -20], [850, -120], [1250, -260], [1700, -420], [2200, -560], [2700, -640], [3050, -700]] },
  { id: "duene", name: "Dünenweg", pts: [[-115, -70], [-260, -500], [-560, -880], [-1000, -1020], [-1550, -1080], [-2200, -1060], [-2650, -980]] },
  { id: "kur", name: "Kurstraße", pts: [[115, -70], [300, -500], [480, -880], [820, -1060], [1350, -1120], [1950, -1020], [2450, -880]] },
];

/** Polilin üstünde s uzunluğundaki nokta ve birim teğet. */
export function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === pts.length - 1) {
      const t = clamp(s / L, 0, 1);
      return { p: [ax + (bx - ax) * t, az + (bz - az) * t], t: [(bx - ax) / L, (bz - az) / L] };
    }
    s -= L;
  }
  return { p: pts[0], t: [1, 0] };
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

// --- mahalle bölgeleri ---
//
// Her bölge döndürülmüş bir dikdörtgen: yerel u ana yol boyunca, v yoldan içeri (derinlik). Giriş kenarı (v = 0)
// ana yola bakar; ortada giriş caddesi (u = 0) içeri gider, iki yanında 5 sıra sokak (10 sokak), en dışta mahalle
// yerleri şeridi ve kenar yolları. Genişlik konut tipine göre (ev cephesi × evler).

export const ZONE = { pitch: 60, row0: 30, avenue: 7, strip: 27, side: 7, depth: 310 };

/** Konut tipinin ölçüleri: sokakta bir yandaki yapı sayısı, yapı cephesi (parsel genişliği). */
export const HOUSE = {
  friesenhaus: { perSide: 20, lot: 14 },
  doppelhaus: { perSide: 10, lot: 16 },
  kapitaenshaus: { perSide: 5, lot: 22 },
  mehrfamilienhaus: { perSide: 3, lot: 34 },
};

export function streetLength(tip) {
  return HOUSE[tip].perSide * HOUSE[tip].lot;
}

export function zoneHalfWidth(tip) {
  return ZONE.avenue + streetLength(tip) + ZONE.strip + ZONE.side + 6;
}

/** Bölgenin yerel (u, v) noktasından dünyaya. */
export function zoneToWorld(z, u, v) {
  const [tx, tz] = z.t, nx = z.n[0], nz = z.n[1];
  return [z.ox + tx * u + nx * v, z.oz + tz * u + nz * v];
}

export function worldToZone(z, x, y) {
  const dx = x - z.ox, dz = y - z.oz;
  return [dx * z.t[0] + dz * z.t[1], dx * z.n[0] + dz * z.n[1]];
}

/** Bölgenin dört köşesi (dünya), pad kadar büyütülmüş. */
function corners(z, pad) {
  const D = ZONE.depth;
  return [[-z.hw - pad, -pad], [z.hw + pad, -pad], [z.hw + pad, D + pad], [-z.hw - pad, D + pad]].map(([u, v]) => zoneToWorld(z, u, v));
}

function rectsOverlap(a, b, pad) {
  const A = corners(a, pad), B = corners(b, pad);
  for (const ax of [a.t, a.n, b.t, b.n]) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of A) { const d = x * ax[0] + z * ax[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d); }
    for (const [x, z] of B) { const d = x * ax[0] + z * ax[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d); }
    if (a1 <= b0 || b1 <= a0) return false;
  }
  return true;
}

let trunkCache = null;
function trunkSamples() {
  if (!trunkCache) {
    trunkCache = [];
    for (const tr of TRUNKS) {
      const L = polyLength(tr.pts);
      for (let s = 0; s <= L; s += 8) trunkCache.push(along(tr.pts, s).p);
    }
  }
  return trunkCache;
}

function zoneFits(c, placed) {
  const hw = c.hw, D = ZONE.depth;
  // Kenar örnekleri: karada (kıyıdan 45 m içeride), ayrılmış alanların dışında.
  for (let u = -hw; u <= hw + 0.1; u += Math.min(40, hw)) {
    for (let v = 0; v <= D + 0.1; v += 50) {
      const [x, z] = zoneToWorld(c, u, v);
      if (land(x, z) < 45) return false;
      if (inReserve(x, z, 12, c.m >= 25)) return false;
    }
  }
  // Diğer bölgelerle çakışma: dikdörtgenler arasında en az 3 m (SAT, her biri 1,5 m büyütülmüş).
  for (const o of placed) {
    if (Math.hypot(o.cx - c.cx, o.cz - c.cz) > o.r + c.r + 10) continue;
    if (rectsOverlap(c, o, 1.5)) return false;
  }
  // Hiçbir ana yol bölgenin içinden geçmez (kendi giriş yolu dışarıda kalır).
  for (const p of trunkSamples()) {
    if (Math.abs(p[0] - c.cx) > c.r + 10 || Math.abs(p[1] - c.cz) > c.r + 10) continue;
    const [u, v] = worldToZone(c, p[0], p[1]);
    if (Math.abs(u) < hw + 4 && v > 4 && v < D + 4) return false;
  }
  return true;
}

/** Bölgenin çevre yolları (yan ve arka; dünya koordinatında, dışa bakan yönüyle): komşu bölgeler bunlara bağlanır. */
export function zoneEdges(z) {
  const D = ZONE.depth, e = ZONE.side, hw = z.hw;
  const P = (u, v) => zoneToWorld(z, u, v);
  return [
    { pts: [P(-hw + e, -11), P(-hw + e, D - e)], out: [-z.t[0], -z.t[1]] }, // sol yan
    { pts: [P(hw - e, D - e), P(hw - e, -11)], out: z.t }, // sağ yan
    { pts: [P(hw - e, D - e), P(-hw + e, D - e)], out: z.n }, // arka
  ];
}

let zoneCache = null;

/**
 * 50 mahalle bölgesinin yeri (ada başına; sonraki adalar aynı planı kullanır). Sırayla, köye en yakın sığan yere: bir
 * ana yolun ya da önceki bir mahallenin çevre yolunun yanına (giriş kenarı yolun 11 m yanında, yola teğet).
 * typeOf(m) → konut tipi ("friesenhaus", ...).
 */
export function zones(count, typeOf) {
  if (zoneCache && zoneCache.length >= count) return zoneCache;
  // Önceden hesaplanmış kopya (web/tests/zones.mjs ile üretilir ve CI'da doğrulanır).
  if (SAVED_ZONES.length >= count && SAVED_ZONES.every((z) => z.tip === typeOf(z.m))) return (zoneCache = SAVED_ZONES);
  return (zoneCache = computeZones(count, typeOf));
}

/** Bölgeleri sıfırdan hesaplar (zones.json'u üretmek ve doğrulamak için). */
export function computeZones(count, typeOf) {
  const placed = [];
  for (let m = 0; m < count; m++) {
    const tip = typeOf(m), hw = zoneHalfWidth(tip);
    const roads = TRUNKS.map((tr) => ({ pts: tr.pts, sides: [-1, 1], id: tr.id }));
    for (const o of placed) for (const [k, e] of zoneEdges(o).entries()) roads.push({ pts: e.pts, out: e.out, id: `m${o.m}:${k}` });
    const cands = [];
    for (const rd of roads) {
      const L = polyLength(rd.pts);
      for (let s = Math.min(hw + 10, L / 2); s <= L - Math.min(hw + 10, L / 2) + 0.1; s += 12) {
        const { p } = along(rd.pts, s);
        const a = along(rd.pts, Math.max(0, s - hw * 0.8)).p, b = along(rd.pts, Math.min(L, s + hw * 0.8)).p;
        const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const tt = [(b[0] - a[0]) / tl, (b[1] - a[1]) / tl];
        for (const side of [-1, 1]) {
          const n = [-tt[1] * side, tt[0] * side];
          if (rd.out && n[0] * rd.out[0] + n[1] * rd.out[1] < 0.5) continue; // bölge yolu: yalnız dış yana
          const ox = p[0] + n[0] * 11, oz = p[1] + n[1] * 11;
          const c = { m, tip, hw, ox, oz, t: side > 0 ? tt : [-tt[0], -tt[1]], n, road: rd.id, s, side };
          [c.cx, c.cz] = zoneToWorld(c, 0, ZONE.depth / 2);
          c.r = Math.hypot(hw, ZONE.depth / 2);
          // Köye yakınlık; doğu–batı biraz hafif (ada uzun ve dar: köy önce yollar boyunca uzar).
          c.cost = Math.hypot(c.cx * 0.9, c.cz * 1.2) + hash2(m, Math.round(s), 91) * 4;
          c.i = cands.length;
          cands.push(c);
        }
      }
    }
    cands.sort((a, b) => a.cost - b.cost || a.i - b.i);
    let best = null;
    for (const c of cands) if (zoneFits(c, placed)) { best = c; break; }
    if (!best) break; // ada doldu (sonraki mahalleler: sonraki ada)
    placed.push(best);
  }
  return placed;
}

// --- arazi yüksekliği ---

const WESTKOPF = { x: -3250, z: -560, r: 260, h: 11 };
export const WASSERTURM = { x: -560, z: -1060, r: 55, h: 10 };

/** Doğal yükseklik (FLAT_Y üstü): kumul kuşağı ve dağınık kumul tepecikleri, Westkopf, su kulesi kumulu. Köy düz. */
export function naturalHeight(x, z) {
  let h = Math.max(0, fbm(x / 120, z / 120, 3)) * 2.5;
  // Kumul kuşağı: dış kıyıdan 70–330 m içeride; ilk sıra (Weißdüne) en yüksek, içe doğru alçalan Graudüne.
  const dn = z - northShoreZ(x);
  if (dn > 55 && dn < 340) {
    const env = smooth((dn - 55) / 35) * smooth((340 - dn) / 110);
    const ilk = Math.exp(-(((dn - 120) / 42) ** 2));
    h += env * (2.5 + (fbm(x / 34, z / 15, 17) + 0.5) * (4 + 7 * ilk));
  }
  const wk = Math.exp(-((x - WESTKOPF.x) ** 2 + (z - WESTKOPF.z) ** 2) / (2 * WESTKOPF.r ** 2));
  h += wk * (WESTKOPF.h + 4 * fbm(x / 50, z / 50, 11));
  const wt = Math.exp(-((x - WASSERTURM.x) ** 2 + (z - WASSERTURM.z) ** 2) / (2 * WASSERTURM.r ** 2));
  h += wt * WASSERTURM.h;
  return h;
}

/** Set profili (FLAT_Y üstü, metre): trapez; tepede 4 m düz yürüyüş yolu, iki yana 1:4,5 şev. */
export function deichHeight(x, z) {
  const w = deichAt(x);
  if (w <= 0) return 0;
  const e = Math.abs(z - deichZ(x));
  const half = DEICH.taban / 2, top = DEICH.tepe / 2;
  if (e >= half) return 0;
  return w * DEICH.h * (e <= top ? 1 : smooth((half - e) / (half - top)));
}

/** 0..1: arazi ne kadar düzlenmiş (köy, mahalle bölgeleri, tarlalar). Izgarada önceden hesaplanır. */
let flatGrid = null;
export function setFlatAreas(rects) {
  // rects: [{poly: [[x,z]...]}] (dışbükey dörtgenler); 10 m ızgara, 30 m yumuşak kenar.
  const S = 10, X0 = -4100, Z0 = -1750, NX = 900, NZ = 300;
  const g = new Float32Array(NX * NZ);
  const inside = (poly, x, z) => {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
      const ex = bx - ax, ez = bz - az, L = Math.hypot(ex, ez);
      d = Math.min(d, ((x - ax) * -ez + (z - az) * ex) / L); // iç tarafta + (saat yönünün tersi)
    }
    return d;
  };
  for (const r of rects) {
    const xs = r.poly.map((q) => q[0]), zs = r.poly.map((q) => q[1]);
    const i0 = clamp(Math.floor((Math.min(...xs) - 40 - X0) / S), 0, NX - 1), i1 = clamp(Math.ceil((Math.max(...xs) + 40 - X0) / S), 0, NX - 1);
    const j0 = clamp(Math.floor((Math.min(...zs) - 40 - Z0) / S), 0, NZ - 1), j1 = clamp(Math.ceil((Math.max(...zs) + 40 - Z0) / S), 0, NZ - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * NX + i;
        if (g[k] >= 1) continue;
        const d = inside(r.poly, X0 + i * S, Z0 + j * S);
        if (d > -40) g[k] = Math.max(g[k], smooth((d + 40) / 40));
      }
    }
  }
  flatGrid = { g, S, X0, Z0, NX, NZ };
}

export function flatness(x, z) {
  if (!flatGrid) return 0;
  const { g, S, X0, Z0, NX, NZ } = flatGrid;
  const fx = (x - X0) / S, fz = (z - Z0) / S;
  const i = clamp(Math.floor(fx), 0, NX - 2), j = clamp(Math.floor(fz), 0, NZ - 2);
  const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1);
  const a = g[j * NX + i], b = g[j * NX + i + 1], c = g[(j + 1) * NX + i], d = g[(j + 1) * NX + i + 1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Liman kıyısı rıhtım mı (0..1)? Havuzun duvarları ve iki yanı (x −330…430; ötesi set ve tuzlu bataklık). */
export function quay(x, z) {
  return quiet(x, z) * smooth((x + 330) / 20) * smooth((430 - x) / 20) * smooth((z - 600) / 30);
}
/** Liman havuzunun içi mi (mendireklerin iç tarafı)? */
export function inBasin(x, z) {
  return x > HAFEN.x0 && x < HAFEN.x1 && z > HAFEN.z0 && z < HAFEN.z1;
}

// --- deniz tabanı: gelgit (gelgit seviyesi deniz.js; ortalama 0, ±~0,9 m) ---
/** Tuzlu bataklık yüksekliği (mutlak): bahar gelgitinin yüksek suyunda kısmen su basar. */
export const SALZWIESE_Y = 0.72;
/** Watt düzlüğünün yüksekliği (mutlak): alçak suda kurur. */
export const WATT_Y = -0.3;

// Priele: Watt'ta alçak suda da ıslak kalan kıvrımlı kanallar (yaklaşık polilinler; genişlik ve derinlik).
const PRIELE = [
  { w: 34, pts: [[95, 916], [80, 1100], [140, 1350], [60, 1650], [120, 2100], [60, 2700]] }, // Fahrrinne (taranmış kanal)
  { w: 22, pts: [[-1400, 820], [-1300, 1020], [-1500, 1300], [-1350, 1700], [-1600, 2300]] },
  { w: 18, pts: [[1300, 900], [1450, 1150], [1350, 1450], [1600, 1800], [1500, 2400]] },
  { w: 14, pts: [[-600, 920], [-700, 1100], [-560, 1350], [-760, 1600]] },
  { w: 12, pts: [[2500, 500], [2700, 760], [2600, 1060], [2900, 1400]] },
];
function prielDist(x, z) {
  let best = Infinity;
  for (const p of PRIELE) {
    for (let i = 1; i < p.pts.length; i++) {
      const [ax, az] = p.pts[i - 1], [bx, bz] = p.pts[i];
      const vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t) / (p.w / 2));
    }
  }
  return best; // 1 = kanal kenarı
}
/** Seehundbank: Watt'ta alçak suda kuruyan kum adası (foklar orada yatar). */
export const SEEHUNDBANK = { x: 1850, z: 1550, rx: 380, rz: 110 };

/** Deniz tabanı (mutlak yükseklik): kuzeyde hızla derinleşen açık deniz, güneyde sığ Watt + Priele + Seehundbank. */
function seabed(x, z, L) {
  const north = z < BODY.z ? smooth((BODY.z - z) / 400) : 0; // ada ekseninin kuzeyi açık deniz
  const open = Math.max(-14, -0.4 + L * 0.06);
  const pd = prielDist(x, z);
  let watt = WATT_Y + fbm(x / 140, z / 140, 23) * 0.18;
  if (pd < 2.2) watt = Math.min(watt, -0.5 - 2.4 * smooth(1 - (pd - 0.6) / 1.6));
  const sb = ((x - SEEHUNDBANK.x) / SEEHUNDBANK.rx) ** 2 + ((z - SEEHUNDBANK.z) / SEEHUNDBANK.rz) ** 2;
  if (sb < 1) watt = Math.max(watt, -0.15 + 0.12 * smooth(1 - sb));
  // Kıyıdan Watt'a yumuşak iniş (ilk 40 m), uzakta (z > 2600) derinleşir.
  watt = Math.max(watt, Math.min(0.3, L * 0.03)) - smooth((z - 2600) / 600) * 6;
  return north * open + (1 - north) * watt;
}

/** Doğal arazi (tesviyesiz): kuzeyde kumsala iner, güneyde tuzlu bataklık + set, liman önünde rıhtım duvarı. */
export function terrainHeight(x, z) {
  const L = land(x, z);
  const f = flatness(x, z);
  const q = quay(x, z);
  let h = FLAT_Y + naturalHeight(x, z) * (1 - f) * (1 - q * smooth((45 - L) / 25)) + deichHeight(x, z);
  if (q > 0.9) {
    // Rıhtım: kıyı çizgisinin 0,5 m içine kadar tam yükseklik, sonra duvarın dibine. Havuz: feribot ve
    // Versorgungshafen tarafı taranmış (−3,5), Kutterhafen tarafı (x < kutterX) sığ (−1,1: bahar gelgitinin alçak
    // suyunda kutter'lar çamura oturur); havuz dışındaki rıhtım önü −2.
    const t = clamp((0.5 - L) / 0.2, 0, 1);
    const floor = inBasin(x, z) ? (x < HAFEN.kutterX - 20 ? -1.1 : x < HAFEN.kutterX + 20 ? -1.1 - 2.4 * smooth((x - HAFEN.kutterX + 20) / 40) : -3.5) : -2;
    return L >= 0.5 ? h : h * (1 - t) + floor * t;
  }
  const southSide = z > BODY.z;
  if (southSide && deichAt(x) > 0.05 && L >= 0) {
    // Setin önü (deniz tarafı): tuzlu bataklık; set eteğinden kıyıya alçalır, kıyıda Watt'a 1 m'lik kenar.
    const e = deichZ(x) - z + DEICH.taban / 2; // set eteğinden denize doğru (−: setin iç tarafı)
    if (e < 0) {
      const w = deichAt(x), marsh = SALZWIESE_Y + fbm(x / 30, z / 30, 31) * 0.12;
      const s = smooth(-e / 18), edge = smooth(L / 6);
      return (h * (1 - s) + marsh * s) * w * edge + (1 - w * edge) * (L < 6 ? WATT_Y + 1.2 * smooth(L / 6) : h);
    }
  }
  if (!southSide) {
    // Kumsal: su kenarından (L = 0, −0,6) kumul eteğine (L = 95, +1,8) yükselir; ortalama su L ≈ 17'de, bahar
    // gelgitinin yüksek suyu (+0,9) L ≈ 52'de. Strandkorb'lar L ≥ 65'te (layout.js). Ötesi kumul arazisine karışır.
    const BAND = 95;
    if (L >= 0 && L < BAND + 40) {
      const beach = -0.6 + 2.4 * Math.pow(Math.min(1, L / BAND), 0.8);
      const t = smooth((L - BAND) / 40);
      return beach * (1 - t) + Math.max(h, beach) * t;
    }
  } else if (L >= 0 && L < 30) {
    const t = 1 - L / 30;
    return h * (1 - smooth(t)) + 0.1 * t;
  }
  if (L >= 0) return h;
  if (L < 0 && !southSide) return Math.max(-14, Math.min(-0.6 + L * 0.05, seabed(x, z, L)));
  return Math.max(seabed(x, z, L), southSide ? -12 : -14);
}

// --- geçici uyum (Aşama 5'te kaldırılacak): Driftwood yerleşim kodunun beklediği adlar ---
export const shoreZ = southShoreZ;
export const MAIN_X = [-430, 480];
export const mainZ = () => HAFEN_Z - 30;
export const waterZ = () => HAFEN_Z;

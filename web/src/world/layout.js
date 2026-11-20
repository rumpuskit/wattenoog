// Adanın yerleşimi: nüfustan deterministik olarak hesaplanır. Aynı nüfus her cihazda aynı adayı verir.
// Ölçek gerçektir: 1 birim = 1 metre. Koordinatlar: x doğu, z güney, y yukarı; (0,0) Marktplatz'ın ortası.
//
// Adanın biçimi (kıyı, arazi), ana yollar ve mahalle bölgeleri island.js'tedir ve nüfustan bağımsızdır. Burada
// köy (Marktplatz, Strandstraße, Hafenweg), liman (havuz, Kutterhafen, feribot, Versorgungshafen, mendirekler), kıyı ve
// doğa yerleri (kumsal ve Strandkorb'lar, Promenade, Kurhaus, set, polder, fener, su kulesi, Ostplate) ve dolan
// mahallelerin sokakları ve evleri kurulur.
//
// Gelişim: ada her zaman tam haliyle hesaplanır (her şeyin yeri sabittir), ama yalnızca açılmış parçalar
// kurulur. Her bina, yol, alan ve süs bir gelişim anahtarıyla etiketlenir (sim.js stageOf); düzey o
// anahtarın nüfusuna ulaşmamışsa ayıklanır. Boş adada feribot iskelesi, kum yollar, boş Marktplatz ve çeşme, fener,
// su kulesi, yel değirmeni, set ve koyunlar, kumsal ve kumullar vardır; evler sakinler geldikçe, gerisi gelişim tablosuna göre açılır.
import { addressParts, cap, cat, houseOf, isOpen, mahalleName, sokakName, stageOf, streetAddress, townLevel, housingOf } from "../sim.js";
import { fbm, hash2 } from "./noise.js";
import { buildNetwork, H as LAYER, stations } from "./roads.js";
import * as I from "./island.js";

// Eski hücre ölçüleri (yalnız geriye uyum; yeni kod kullanmaz).
export const CELL_W = 560;
export const CELL_D = 270;
export const FLAT_Y = I.FLAT_Y;
// Tesviye: yüzey kenarından sonra düz omuz ve doğal araziye geçiş (m). Omuz ≥ arazi ağının ince adımının köşegeni.
const GRADE_SHOULDER = 6, GRADE_BLEND = 6;
// roads.js'in FLAT_Y'de döşeme çizdiği meydan türleri (park, göl çevresi gibi çizilmeyenler tesviye edilmez).
const PLAZA_GRADE = new Set(["meydan", "cimen", "tarla", "saha", "pazar", "avlu", "oyun", "basket", "otopark"]);
export const FLOOR_H = 3.2;

const HUB = I.HUB;
const MARKT = { x0: -45, x1: 45, z0: -35, z1: 35 }; // Marktplatz (klinker)
const RING = { x0: -115, x1: 115, z0: -70, z1: 70 }; // "Am Markt" sokağı
const STRAND_HALF = 6; // Strandstraße: 12 m klinker yaya caddesi

// Yol kesitleri (toplam genişlik = taşıt yolu + iki kaldırım).
export const ROADS = {
  cadde: { width: 14, carriage: 8, surface: "asfalt" },
  sokak: { width: 13, carriage: 8, surface: "asfalt" }, // iki şerit + iki yanda kenar parkı
  koy: { width: 6.5, carriage: 6.5, surface: "asfalt" },
  yaya: { width: 6, carriage: 0, surface: "klinker" }, // klinker yaya yolu (Strandstraße, Hafenkante)
  sahil: { width: 7, carriage: 0, surface: "klinker" }, // Promenade
  patika: { width: 2.6, carriage: 0, surface: "toprak" }, // patika; geniş verilirse asfaltlanmamış kum yol
  giris: { width: 6, carriage: 6, surface: "asfalt" }, // otopark, klinik ve garaj girişi
};

// Kırmızı/kahve klinker tonları ve açık sıva (Kuzey Alman köyü).
const KLINKER = ["#9a3f30", "#a2452f", "#8e3a2c", "#b0533f", "#7f3a2e", "#a65a3c"];
const PUTZ = ["#f4f1ea", "#efe9dc", "#e8e1cf", "#f2ead8", "#dfe3e0"];
const VILLA = ["#f7f5ef", "#f4f1ea", "#f2efe6", "#eef0ec"];
const VILLA_AD = ["Seeblick", "Möwe", "Strandgut", "Nordlicht", "Dünenrose", "Meeresbrise", "Sonnenschein", "Friesenhof", "Wellenspiel", "Seestern", "Bernstein", "Lotsenhaus", "Kapitänshaus", "Strandläufer", "Leuchtfeuer", "Sanddorn"];

// İş yeri türlerinin bina biçimi (metre). Tuğla ağırlıklı; Bäderarchitektur beyaz.
const STYLES = {
  belediye: { w: 20, d: 28, floors: 2, roof: "gable", wall: "#9a3f30", roofColor: "#3c3f45", stufen: true, brick: true, plate: "#2f4256" },
  muze: { w: 28, d: 14, floors: 1, roof: "gable", wall: "#e9e4da", roofColor: "#4b6352", sign: "#2f6f4f" },
  kutuphane: { w: 18, d: 13, floors: 2, roof: "gable", wall: "#8e3a2c", roofColor: "#3c3f45", brick: true, giebel: true },
  saglik: { w: 36, d: 20, floors: 3, roof: "flat", wall: "#eef0f2", roofColor: "#c9c4bb", sign: "#c0392b" },
  okul: { w: 36, d: 15, floors: 2, roof: "gable", wall: "#a2452f", roofColor: "#3c3f45", brick: true },
  otel: { w: 40, d: 16, floors: 3, roof: "hip", wall: "#f7f5ef", roofColor: "#4b5058", balconies: true, villa: true },
  plaza: { w: 20, d: 15, floors: 3, roof: "gable", wall: "#7f3a2e", roofColor: "#3c3f45", brick: true, giebel: true },
  market: { w: 18, d: 14, floors: 2, roof: "gable", wall: "#a2452f", roofColor: "#3c3f45", shop: true, awning: "#2f4256", giebel: true, brick: true },
  firin: { w: 10, d: 12, floors: 2, roof: "gable", wall: "#efe9dc", roofColor: "#8e3b2a", shop: true, awning: "#8e2f2a", giebel: true },
  kafe: { w: 10, d: 12, floors: 2, roof: "gable", wall: "#f4f1ea", roofColor: "#3c3f45", shop: true, awning: "#2f4256", giebel: true },
  atolye: { w: 14, d: 12, floors: 1, roof: "gable", wall: "#e8e1cf", roofColor: "#3c3f45", shop: true, awning: "#6f7d4a", giebel: true },
  kahvehane: { w: 8, d: 5, floors: 1, roof: "flat", wall: "#2f5d8a", roofColor: "#e9e4da", shop: true, awning: "#f4f1ea", stripes: "#2f5d8a", kiosk: true },
  karakol: { w: 20, d: 13, floors: 2, roof: "flat", wall: "#f2f2ee", roofColor: "#c9c4bb", band: "#1f3f8f", plate: "#1f3f8f", flag: true },
  adliye: { w: 26, d: 17, floors: 2, roof: "hip", wall: "#8e3a2c", roofColor: "#3c3f45", brick: true, plate: "#5a4636", flag: true },
  muhtarlik: { w: 14, d: 9, floors: 1, roof: "gable", wall: "#a2452f", roofColor: "#3c3f45", brick: true, plate: "#2f5d8a", flag: true },
  eczane: { w: 12, d: 12, floors: 2, roof: "gable", wall: "#efe9dc", roofColor: "#3c3f45", shop: true, awning: "#c0392b", giebel: true, apotheke: true },
  berber: { w: 9, d: 12, floors: 2, roof: "gable", wall: "#e8e1cf", roofColor: "#3c3f45", shop: true, awning: "#2f2f2f", giebel: true },
  veteriner: { w: 12, d: 11, floors: 1, roof: "gable", wall: "#f2ead8", roofColor: "#3c3f45", shop: true, awning: "#3e7a5a", giebel: true },
  lunapark: { w: 48, d: 20, floors: 3, roof: "hip", wall: "#f7f5ef", roofColor: "#4b5058", villa: true, balconies: true, veranda: true, columns: true },
};

// Şubelerin kendi cephe kimliği (tente ve duvar rengi): aynı türden işletmeler birbirinin kopyası olmasın.
const BRANCH = {
  "kafe:0": { awning: "#2f4256", wall: "#f4f1ea" }, // Café Strandgut
  "kafe:1": { awning: "#6f4a32", wall: "#9a3f30", brick: true, signFont: "serif", signFg: "#f3d9a4" }, // Teestube Kluntje
  "kafe:2": { awning: "#3e7a5a", wall: "#eef1e4", signFont: "serif" }, // Café Deichblick
  "kafe:3": { awning: "#b8433c", wall: "#f4f1ea" }, // Leuchtturm-Café
  "kafe:4": { awning: "#c9a441", wall: "#f3ead2" }, // Dünencafé
  "kafe:5": { awning: "#2f7fb5", wall: "#ffffff" }, // Milchbar am Strand
  "firin:0": { awning: "#8e2f2a", wall: "#efe9dc" }, // Inselbäckerei Janssen
  "firin:1": { awning: "#e07a9a", wall: "#f7e9ef" }, // Konditorei
  "firin:2": { awning: "#5a4a3a", wall: "#a2452f", brick: true, signFont: "serif", signFg: "#f0d7a8" }, // Backstube am Deich
  "market:0": { awning: "#2f4256" }, // Inselkaufmann
  "market:1": { awning: "#3e7a3a", wall: "#f1ead6", brick: false }, // Dorfladen am Hafenweg
  "market:2": { awning: "#1f5f8f", wall: "#e9eef2", brick: false }, // Fischhandel Kutterfang
  "market:3": { awning: "#5b7f2a", wall: "#f3ece2", brick: false, signFont: "serif", signFg: "#f3e2b8" }, // Bioladen Sanddorn
  "atolye:0": { awning: "#b5653f" }, // Töpferei
  "atolye:1": { awning: "#7a5a3e", wall: "#e8dcc8", signFont: "serif" }, // Tischlerei
  "atolye:2": { awning: "#7a6a9a", wall: "#eee8f0" }, // Kunstatelier
  "atolye:3": { awning: "#2f4256", wall: "#eef2f5" }, // Segelmacherei
  "atolye:4": { awning: "#2f7fb5", wall: "#f4f1ea" }, // Strandkorbmacherei
  "atolye:5": { awning: "#c98a2a", wall: "#efe9dc", signFont: "serif" }, // Bernsteinschleiferei
};

// Dolgu dükkânların zanaatları (iç düzeni isletme.js) ve tabeladaki ad: "Buchhandlung Janssen"...
const DUKKANLAR = [
  ["berber", "Barbier"], ["terzi", "Schneiderei"], ["kirtasiye", "Schreibwaren"], ["cicekci", "Blumen"],
  ["aktar", "Bonbonmacherei"], ["nalbur", "Eisenwaren"], ["kuyumcu", "Goldschmiede"], ["kitapci", "Buchhandlung"],
];
const SOYADLAR = ["Janssen", "Harms", "Peters", "Onken", "Gerdes", "Eilers", "Hinrichs", "Behrends", "Folkerts", "Ihnen", "Albers", "Rinke"];

// Cephe hatları: pts, hattan cepheye uzaklık (off), açık yanlar, dükkân aralığı (s0…s1, metre), boşluklar (gaps).
const FRONTS = {
  marktN: { pts: [[-62, -35], [62, -35]], off: 3.5, sides: [-1], s0: 0, s1: 124, gaps: [[54, 70]], name: "Am Markt" },
  marktS: { pts: [[-62, 35], [62, 35]], off: 3.5, sides: [1], s0: 0, s1: 124, gaps: [[54, 70]], name: "Am Markt" },
  strand: { pts: I.STRAND, off: STRAND_HALF + 0.8, sides: [-1, 1], s0: 42, s1: 440, name: "Strandstraße" },
  hafenweg: { pts: [[0, 70], [0, 600]], off: 7.3, sides: [-1, 1], s0: 12, s1: 330, gaps: [[150, 172]], name: "Hafenweg" },
  kur: { pts: I.STRAND, off: STRAND_HALF + 4, sides: [-1, 1], s0: 470, s1: 1370, name: "Strandstraße" },
};
// Cephe hatlarındaki iş yerleri: [tür, şube, hat, tercih edilen s, yan].
const FRONT_ORDER = [
  ["kafe", 0, "marktN", 32, -1], ["market", 0, "marktN", 92, -1], ["firin", 0, "marktS", 32, 1], ["eczane", 0, "marktS", 92, 1],
  ["karakol", 0, "strand", 70, 1], ["kafe", 1, "strand", 80, -1], ["berber", 0, "strand", 120, -1], ["adliye", 0, "strand", 150, 1],
  ["kutuphane", 0, "strand", 190, -1], ["plaza", 0, "strand", 250, 1], ["firin", 1, "strand", 260, -1], ["market", 3, "strand", 310, -1],
  ["kafe", 2, "strand", 330, 1], ["atolye", 4, "strand", 360, 1], ["atolye", 0, "strand", 370, -1], ["plaza", 1, "strand", 410, 1],
  ["atolye", 5, "hafenweg", 40, -1], ["atolye", 2, "hafenweg", 70, 1], ["market", 1, "hafenweg", 110, -1], ["atolye", 1, "hafenweg", 130, 1],
  ["veteriner", 0, "hafenweg", 200, 1], ["plaza", 2, "hafenweg", 230, -1], ["otel", 1, "hafenweg", 290, 1], ["market", 2, "hafenweg", 315, -1],
  ["atolye", 3, "hafenweg", 270, -1],
];

// Konut cephe renkleri: klinker ağırlıklı, aralarda sıvalı beyaz ve açık renkler.
const HOUSE_WALLS = ["#9a3f30", "#a2452f", "#8e3a2c", "#b0533f", "#7f3a2e", "#f4f1ea", "#efe9dc", "#a65a3c", "#9a3f30", "#e8e1cf", "#8e3a2c", "#a2452f"];
const HOUSE_ROOFS = ["#3c3f45", "#8e3b2a", "#4b5058", "#a0452e", "#3a3f46"];

const OUTDOOR_KINDS = new Set(["liman", "balikci_koyu", "tersane", "tarla", "plaj", "fener", "saha", "pazar"]);

// Gelişim anahtarıyla etiketlenen listeler.
const TAGGED = ["buildings", "roads", "plazas", "features", "labels", "seats", "lamps", "piers", "parks"];
// Tek nesne olarak tutulan yerler ve açıldıkları anahtar.
const REFS = {
  carsiWalks: "carsi_yol", pitch: "saha", hospital: "saglik:0", port: "liman:0", tersane: "tersane:0",
  koy: "balikci_koyu:0", promenade: "sahil_yolu", fireStation: "itfaiye", depot: "garaj", beach: "plaj:0", lunapark: "lunapark:0",
};
// Sakinlerin evlerinin dışında kimsenin oturmadığı dekor binalar (villa, Vereinsheim, Bahnhof): iç mekân yok.
export const DEKOR = new Set(["villa", "vereinsheim", "bahnhof", "kulube", "liman"]);

// Yol yüksekliği için yumuşatma çekirdeği (12 m çapında, ağırlıklı).
const KERNEL = (() => {
  const k = [[0, 0, 4]];
  for (const r of [3, 6]) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + r; k.push([Math.cos(a) * r, Math.sin(a) * r, r === 3 ? 2 : 1]); }
  const sum = k.reduce((t, [, , w]) => t + w, 0);
  return k.map(([x, z, w]) => [x, z, w / sum]);
})();

export function perMahalle() {
  return cap("daire_per_bina") * cap("bina_per_sokak") * cap("sokak_per_mahalle");
}

export function mahalleCount(population) {
  return Math.max(1, Math.ceil(population / perMahalle()));
}

/** Ada başına 50 mahalle bölgesi (island.js; nüfustan bağımsız, hep aynı). */
export function islandZones() {
  return I.zones(cap("mahalle_per_ada"), (m) => housingOf(m).tip);
}

// Konut tiplerinin yapı ölçüleri: Friesenhaus (tek katlı, sazdan çatı, çatı arası), Zweifamilienhaus (2 kat, katta bir
// daire), Kapitänshaus (2 kat, katta iki daire, kırma çatı), Mehrfamilienhaus (3 kat, katta üç daire; sonuncusunda iki).
const HOUSE_DIMS = {
  friesenhaus: { w: 10, d: 8.5, floors: 1, perFloor: 1 },
  doppelhaus: { w: 9, d: 13, floors: 2, perFloor: 1 },
  kapitaenshaus: { w: 13, d: 13, floors: 2, perFloor: 2 },
  mehrfamilienhaus: { w: 28, d: 13, floors: 3, perFloor: 3 },
};

function curveX(fn, x0, x1, step = 20) {
  const pts = [];
  for (let x = x0; x < x1 - 0.1; x += step) pts.push([x, fn(x)]);
  pts.push([x1, fn(x1)]);
  return pts;
}

/** Yolları 40 m'lik ızgarada tutar: bir noktanın hangi yolun üstünde olduğunu hızlıca bulur. */
export class RoadIndex {
  constructor(roads) {
    this.cells = new Map();
    roads.forEach((road) => {
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1], [bx, bz] = road.points[i];
        const pad = road.width / 2 + 1;
        for (let gx = Math.floor((Math.min(ax, bx) - pad) / 40); gx <= Math.floor((Math.max(ax, bx) + pad) / 40); gx++) {
          for (let gz = Math.floor((Math.min(az, bz) - pad) / 40); gz <= Math.floor((Math.max(az, bz) + pad) / 40); gz++) {
            const key = gx * 100003 + gz;
            if (!this.cells.has(key)) this.cells.set(key, []);
            this.cells.get(key).push({ road, ax, az, bx, bz });
          }
        }
      }
    });
  }

  /** Noktanın üstünde olduğu yol (en geniş olanı) ve merkez çizgisine uzaklığı; yoksa null. */
  at(x, z, margin = 0) {
    const list = this.cells.get(Math.floor(x / 40) * 100003 + Math.floor(z / 40));
    let best = null;
    for (const s of list ?? []) {
      const dx = s.bx - s.ax, dz = s.bz - s.az;
      const len2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / len2));
      const d = Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
      if (d < s.road.width / 2 - margin && (!best || s.road.width > best.road.width)) best = { road: s.road, dist: d };
    }
    return best;
  }
}

export class World {
  constructor(population) {
    this.population = population;
    this.level = townLevel(); // gelişim düzeyi: en yüksek nüfus (main.js sim.setTown ile verir)
    this.zones = islandZones();
    this.mahalleler = Math.min(mahalleCount(population), this.zones.length);
    // Eski hücre modeli yok: yer türü zoneAt() ile sorulur.
    this.cells = [];
    this.cellByKey = new Map();
    this.bounds = { x0: -4000, x1: 4700, z0: -2000, z1: 2000 };
    this.hill = { x: I.WASSERTURM.x, z: I.WASSERTURM.z, r: I.WASSERTURM.r, h: I.WASSERTURM.h };
    this._villaKeys = new Set();
    // Düzlenen alanlar (binalar FLAT_Y'de durur): köy, liman önü, Strandstraße koridoru ve Promenade (kumullar onları
    // gömmesin), polder, bütün mahalle bölgeleri.
    const R = I.RESERVES, box = (b) => ({ poly: [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z1], [b.x1, b.z0]] });
    const pz = I.promenadeZ;
    I.setFlatAreas([
      box({ x0: -440, x1: 480, z0: -570, z1: 640 }), box({ x0: -340, x1: 440, z0: 540, z1: 800 }),
      box({ x0: -60, x1: 60, z0: -1520, z1: -560 }), // Strandstraße'nin Kurviertel kısmı
      { poly: [[-700, pz(-700) - 12], [-700, pz(-700) + 90], [620, pz(620) + 90], [620, pz(620) - 12]] }, // Promenade, Kurhaus, otel
      box({ x0: 2000, x1: 2700, z0: -300, z1: 380 }), // polder
      box({ x0: -2940, x1: -2855, z0: -470, z1: -385 }), // Leuchtturm-Hof (bekçi evi, kafe)
      ...this.zones.map((z) => ({ poly: [[-z.hw, -12], [-z.hw, I.ZONE.depth], [z.hw, I.ZONE.depth], [z.hw, -12]].map(([u, v]) => I.zoneToWorld(z, u, v)) })),
    ]);

    this.buildings = [];   // {kind, x, z, rot, w, d, floors, roofType, wall, roof, ...}
    this.roads = [];       // {points, type, width, carriage, surface}
    this.plazas = [];      // {x, z, r} veya {x0, z0, x1, z1, kind}
    this.features = [];    // bandstand, iskele, vapur, fener, bank, ...
    this.labels = [];      // {text, x, z, h}
    this.workplaces = {};  // kind -> [{name, door, path, anchor, spread, outdoor}]
    this.places = {};      // place -> {anchors, spread, path}
    this.blocked = new Set(); // ağaç dikilmeyecek 4x4'lük kareler
    this.seats = [];       // oturulabilecek yerler {x, z, heading, top, place}
    this.piers = [];       // iskeleler {x0, x1, z0, z1, top}
    this.lamps = [];       // yollar dışındaki sokak lambaları {x, z, dir}
    this.buildingBySlot0 = new Map();
    this.parks = [];       // küçük mahalle parkları (ağaç dikilebilir)

    this._roadHCache = new Map();
    this._groundCache = new Map();
    this.cols = new Map();
    this.rows = new Map();
    this._key = null;      // şu an kurulan parçanın gelişim anahtarı
    this._blockOps = [];   // ağaç yasağı işlemleri (açılan parçalarınki sonradan uygulanır)
    this._staged = false;

    this._layoutTown();
    this._layoutWaterfront();
    this._layoutNature();
    for (let m = 0; m < this.mahalleler; m++) this._layoutMahalle(this.zones[m]);
    this._emitRows();
    this._applyStage();
    this.network = buildNetwork(this.roads);
    // Adada trafik ışığı yok (küçük Kuzey Denizi köyü: sağdan gelen önceliklidir).
    for (const n of this.network.nodes) n.signal = false;
    this.roadIndex = new RoadIndex(this.roads);
    this._gradeRoads();
    for (const seat of this.seats) seat.top = this.groundY(seat.x, seat.z) + seat.h;
    this.obstacles = new Set();
    this._markObstacles();
    if (import.meta.env?.DEV || globalThis.location?.search.includes("denetle")) this._validate();
  }

  /** Kumul kuşağı mı (dış kıyının 55–340 m içi; arazi rengi ve ağaç seyrekliği için)? */
  isDune(x, z) {
    const dn = z - I.northShoreZ(x);
    return dn > 50 && dn < 340 && this.zoneAt(x, z) !== "mahalle";
  }

  /** Bir noktanın yer türü: merkez (kasaba), mahalle, tepe (Bluff Head), kumul, kir. */
  zoneAt(x, z) {
    for (let m = 0; m < this.mahalleler; m++) {
      const zn = this.zones[m];
      if (Math.hypot(x - zn.cx, z - zn.cz) > zn.r) continue;
      const [u, v] = I.worldToZone(zn, x, z);
      if (Math.abs(u) <= zn.hw && v >= 0 && v <= I.ZONE.depth) return "mahalle";
    }
    const r = I.inReserve(x, z);
    if (r === "town" || r === "hafen" || r === "kur") return "merkez";
    if (r === "wasserturm" || r === "westkopf") return "tepe";
    if (r === "dunes") return "kumul";
    if (r === "polder") return "tarla";
    if (r === "deich") return "deich";
    if (r === "ostplate") return "kumul";
    return "kir";
  }

  get flatY() {
    return FLAT_Y;
  }

  // --- gelişim ---

  /** Anahtar açık mı? (anahtarsız parçalar hep açıktır) */
  has(key) {
    return key == null || isOpen(key);
  }

  /** fn içinde eklenen her şeyi anahtarla etiketler (iç içe çağrıda içteki anahtar kalır). */
  _tag(key, fn) {
    const prev = this._key;
    this._key = key;
    const snap = TAGGED.map((n) => this[n].length);
    fn();
    TAGGED.forEach((n, i) => {
      const list = this[n];
      for (let j = snap[i]; j < list.length; j++) if (list[j]._k === undefined) list[j]._k = key;
    });
    this._key = prev;
  }

  _place(name, place) {
    place._k = this._key;
    this.places[name] = place;
    return place;
  }

  /**
   * Açılmamış parçaları ayıklar ve bir sonraki gelişim adımını (yer, ad, eksik nüfus) hazırlar.
   * Ayıklanan binalar "sites" olur: harita sıradaki yapının yerini gösterir.
   */
  _applyStage() {
    const all = this.buildings;
    const before = Object.fromEntries(TAGGED.map((n) => [n, this[n]]));
    for (const n of TAGGED) this[n] = this[n].filter((x) => this.has(x._k));
    for (const [name, pl] of Object.entries(this.places)) {
      if (!this.has(pl._k)) { delete this.places[name]; continue; }
      if (pl.anchorKeys) {
        pl.anchors = pl.anchors.filter((_, i) => this.has(pl.anchorKeys[i]));
        if (!pl.anchors.length) delete this.places[name];
      }
    }
    for (const list of Object.values(this.workplaces)) list.forEach((w, i) => { if (w && !this.has(w._k)) list[i] = null; });
    for (const [name, key] of Object.entries(REFS)) if (!this.has(key)) this[name] = null;
    if (!this.has("meydan_duzen")) this.flowerBeds = [];
    this.schools = (this.schools ?? []).filter((s) => this.has(s._k));
    this.parkingLots = this.has("cevre_yolu") ? this.parkingLots : [];
    this.vehicles = this.has("cevre_yolu"); // özel araç, taksi, otobüs, hizmet araçları
    this._staged = true;
    for (const [op, x0, z0, x1, z1, pad, key] of this._blockOps) if (this.has(key)) (op ? this.block : this.unblock).call(this, x0, z0, x1, z1, pad);
    this._blockOps = null;

    // Sıradaki adım: kilitli anahtarlar içinde en küçük eşik.
    let next = Infinity;
    const keys = new Set();
    for (const b of all) if (b._k != null && !this.has(b._k)) keys.add(b._k);
    for (const st of cat().gelisim) for (const k of st.acar) if (!this.has(k)) keys.add(k);
    for (const k of keys) next = Math.min(next, stageOf(k));
    // Açılmamış binaların parselleri (sıradaki şantiye dahil): ağaç dikilmez (7 Kasım: Diner şantiyesinin içinde
    // ağaç duruyordu, hayalet bina ağaçla iç içe görünüyordu; bina açılınca ağaç da binanın içinde kalırdı).
    this.lots = all.filter((b) => b._k != null && !this.has(b._k));
    this.sites = [];
    this.nextStage = null;
    if (next < Infinity) {
      this._before = before;
      const open = [...keys].filter((k) => stageOf(k) === next);
      this.sites = all.filter((b) => open.includes(b._k));
      const entry = cat().gelisim.find((st) => st.nufus === next);
      this.nextStage = { nufus: next, keys: open, name: entry?.ad ?? stageName(open[0], this._villaKeys), at: this._stageSpot(open) };
      this._before = null;
      const at = this.nextStage.at;
      // Etiket başka bir etiketin üstüne düşmesin (ör. Town Green): yakında etiket varsa biraz güneye kayar.
      if (at) {
        const near = this.labels.some((l) => Math.hypot(l.x - at[0], l.z - at[1]) < 30);
        this.labels.push({ text: `${this.nextStage.name} · bei ${next} Einwohnern`, x: at[0], z: at[1] + (near ? 34 : 0), h: 22, site: true });
      }
    }
  }

  /** Bir gelişim adımının haritadaki yeri (binası varsa binası, yoksa ilk parçası). */
  _stageSpot(keys) {
    const b = this.sites[0];
    if (b) return [b.x, b.z];
    for (const n of ["plazas", "features", "roads", "seats"]) {
      const it = this._before[n].find((x) => keys.includes(x._k));
      if (!it) continue;
      if (it.points) return it.points[Math.floor(it.points.length / 2)];
      if (it.x0 != null) return [(it.x0 + it.x1) / 2, (it.z0 + it.z1) / 2];
      return [it.x, it.z];
    }
    return keys.includes("carsi_yol") ? I.along(I.STRAND, 200).p : null;
  }

  // --- tesviye: eğimli arazide yollar yumuşak bir eğimi izler, altlarındaki arazi yola göre kazılır/doldurulur ---

  /** Yol yüksekliği: arazinin 12 m'lik pencerede yumuşatılmış hali; düz kasabada FLAT_Y. */
  roadH(x, z) {
    const key = Math.round(x * 2) * 100003 + Math.round(z * 2);
    let h = this._roadHCache.get(key);
    if (h === undefined) {
      h = 0;
      for (const [dx, dz, w] of KERNEL) h += w * Math.max(FLAT_Y, this.rawHeight(x + dx, z + dz));
      this._roadHCache.set(key, h);
    }
    return h;
  }

  surfaceY(x, z) {
    return this.roadH(x, z);
  }

  /**
   * Tesviye haritası (2 m hücre): yolların ve meydanların altı yüzeyin hemen altında düz, kenardan sonra
   * GRADE_SHOULDER kadar düz omuz, ardından GRADE_BLEND boyunca doğal araziye yumuşak geçiş. Omuz, arazi ağının
   * en ince adımının (terrain.js, 4 m) köşegeninden geniş: yolu kesen hiçbir üçgen yüzeyin üstüne çıkamaz.
   * Hücre: { h: yüzey yüksekliği, e: yüzey kenarından uzaklık (içeride ≤ 0) }.
   */
  _gradeRoads() {
    this.grade = new Map();
    const put = (x, z, h, e) => {
      const key = Math.floor(x / 2) * 100003 + Math.floor(z / 2);
      const cur = this.grade.get(key);
      if (!cur || e < cur.e) this.grade.set(key, { h, e });
    };
    const reach = GRADE_SHOULDER + GRADE_BLEND + 1;
    for (const e of this.network.edges) {
      const hw = e.road.width / 2;
      for (const st of stations(e.pts, 0, 0, 1)) {
        const h = this.roadH(st.p[0], st.p[1]);
        for (let o = -(hw + reach); o <= hw + reach; o += 1) put(st.p[0] + st.n[0] * o, st.p[1] + st.n[1] * o, h, Math.abs(o) - hw);
      }
    }
    // İskele ve dolgu rıhtım (yük terminali) döşemeleri: altlarındaki doğal arazi döşemenin altına indirilir
    // (yalnız indirilir; sudaki iskelenin altına kara çıkmaz).
    for (const p of this.piers) {
      for (let x = p.x0; x <= p.x1 + 1; x += 2) for (let z = p.z0; z <= p.z1 + 1; z += 2) {
        const key = Math.floor(x / 2) * 100003 + Math.floor(z / 2);
        if (!this.grade.has(key)) this.grade.set(key, { h: p.top - 0.08, e: 0, low: true });
      }
    }
    // Binalar FLAT_Y'de oturur: tabanlarının (1 m payla) altı ve çevresi de tesviye.
    for (const b of this.buildings) {
      if (!Number.isFinite(b.x) || !b.w || !b.d) continue;
      this._gradeRect(put, b.x, b.z, b.w / 2 + 1, b.d / 2 + 1, Math.cos(b.rot ?? 0), Math.sin(b.rot ?? 0), reach);
    }
    // Meydanlar (çim, avlu, oyun, saha, tarla...) sabit FLAT_Y'de çizilir: altları ve çevreleri ona tesviye.
    for (const pl of this.plazas) {
      if (!PLAZA_GRADE.has(pl.kind)) continue;
      const pad = pl.kind === "saha" ? 4 : pl.kind === "oyun" ? 0.5 : 0;
      let cx, cz, hx, hz, c = 1, sn = 0;
      if (pl.r) { cx = pl.x; cz = pl.z; hx = hz = pl.r; }
      else if (pl.rot != null) { cx = pl.cx; cz = pl.cz; hx = pl.w / 2 + pad; hz = pl.d / 2 + pad; c = Math.cos(pl.rot); sn = Math.sin(pl.rot); }
      else { cx = (pl.x0 + pl.x1) / 2; cz = (pl.z0 + pl.z1) / 2; hx = (pl.x1 - pl.x0) / 2 + pad; hz = (pl.z1 - pl.z0) / 2 + pad; }
      if (pl.r) this._gradeRect(put, cx, cz, hx, hz, 1, 0, reach, true);
      else this._gradeRect(put, cx, cz, hx, hz, c, sn, reach);
    }
  }

  /** Merkezi (cx, cz), yarı boyutları hx × hz, dönüşü (c = cos, sn = sin) olan dikdörtgen (ya da daire) çevresini FLAT_Y'ye tesviye eder. */
  _gradeRect(put, cx, cz, hx, hz, c, sn, reach, circle = false) {
    const R = Math.hypot(hx, hz) + reach;
    for (let x = cx - R; x <= cx + R; x += 2) {
      for (let z = cz - R; z <= cz + R; z += 2) {
        const dx = x + 1 - cx, dz = z + 1 - cz;
        let e;
        if (circle) e = Math.hypot(dx, dz) - hx;
        else {
          // Döndürülmüş dikdörtgene uzaklık (yerel eksenlerde).
          const lx = Math.abs(dx * c - dz * sn) - hx, lz = Math.abs(dx * sn + dz * c) - hz;
          e = lx > 0 || lz > 0 ? Math.hypot(Math.max(lx, 0), Math.max(lz, 0)) : Math.max(lx, lz);
        }
        if (e <= reach) put(x + 1, z + 1, FLAT_Y, e);
      }
    }
  }

  // --- engeller: binalar, ağaç gövdeleri, çeşme, bank, masa, lamba... (0,5 m'lik ızgara) ---

  _obKey(x, z) {
    return Math.floor(x * 2) * 100003 + Math.floor(z * 2);
  }

  addObstacleCircle(x, z, r) {
    for (let gx = Math.floor((x - r) * 2); gx <= Math.floor((x + r) * 2); gx++) {
      for (let gz = Math.floor((z - r) * 2); gz <= Math.floor((z + r) * 2); gz++) {
        const cx = gx / 2 + 0.25, cz = gz / 2 + 0.25;
        if (Math.hypot(cx - x, cz - z) <= r + 0.25) this.obstacles.add(gx * 100003 + gz);
      }
    }
  }

  addObstacleRect(x, z, w, d, rot = 0) {
    const c = Math.cos(rot), sn = Math.sin(rot), ext = (Math.abs(w * c) + Math.abs(d * sn) + Math.abs(w * sn) + Math.abs(d * c)) / 2 + 0.5;
    for (let gx = Math.floor((x - ext) * 2); gx <= Math.floor((x + ext) * 2); gx++) {
      for (let gz = Math.floor((z - ext) * 2); gz <= Math.floor((z + ext) * 2); gz++) {
        const dx = gx / 2 + 0.25 - x, dz = gz / 2 + 0.25 - z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) <= w / 2 + 0.25 && Math.abs(lz) <= d / 2 + 0.25) this.obstacles.add(gx * 100003 + gz);
      }
    }
  }

  /** Bir insan (x, z)'de durabilir mi? Engelsiz, karada ya da iskelede. */
  isWalkable(x, z) {
    if (this.obstacles.has(this._obKey(x, z))) return false;
    if (this.piers.some((p) => x > p.x0 + 0.3 && x < p.x1 - 0.3 && z > p.z0 && z < p.z1)) return true;
    return this.height(x, z) > 0.25;
  }

  /** Nokta bir taşıt yolunun (şeritler ve kenar parkı) üstünde mi? Yaya geçitleri de dahil. */
  inCarriage(x, z) {
    const C = 20;
    if (!this._carGrid) {
      this._carGrid = new Map();
      for (const r of this.roads) {
        if (!(r.carriage > 0)) continue;
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1], b = r.points[i], h = r.carriage / 2;
          const seg = [a, b, h];
          for (let gx = Math.floor((Math.min(a[0], b[0]) - h) / C); gx <= Math.floor((Math.max(a[0], b[0]) + h) / C); gx++) {
            for (let gz = Math.floor((Math.min(a[1], b[1]) - h) / C); gz <= Math.floor((Math.max(a[1], b[1]) + h) / C); gz++) {
              const k = gx * 100003 + gz;
              if (!this._carGrid.has(k)) this._carGrid.set(k, []);
              this._carGrid.get(k).push(seg);
            }
          }
        }
      }
    }
    for (const [a, b, h] of this._carGrid.get(Math.floor(x / C) * 100003 + Math.floor(z / C)) ?? []) {
      const ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez || 1;
      const q = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2));
      if (Math.hypot(a[0] + ex * q - x, a[1] + ez * q - z) < h) return true;
    }
    return false;
  }

  /** (x, z)'ye en yakın yürünebilir nokta (spiral arama). */
  nearestWalkable(x, z, max = 6) {
    if (this.isWalkable(x, z)) return [x, z];
    for (let r = 0.5; r <= max; r += 0.5) {
      const n = Math.max(8, Math.round(r * 8));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.isWalkable(px, pz)) return [px, pz];
      }
    }
    return [x, z];
  }

  _markObstacles() {
    for (const b of this.buildings) this.addObstacleRect(b.x, b.z, b.w + 0.3, b.d + 0.3, b.rot);
    for (const f of this.features) {
      switch (f.type) {
        case "cesme":
          this.addObstacleCircle(f.x, f.z, 8.3);
          for (const [bx, bz] of this.flowerBeds ?? []) this.addObstacleCircle(bx, bz, 1.8);
          break;
        case "gol": this.addObstacleCircle(f.x, f.z, f.r + 0.9); break;
        case "havuz": this.addObstacleRect(f.x, f.z, f.w + 1, f.d + 1); break;
        case "tezgah": this.addObstacleRect(f.x, f.z, 3.4, 2.2); break;
        case "bank": this.addObstacleRect(f.x, f.z, 1.9, 0.6, f.rot); break;
        case "masa1": this.addObstacleCircle(f.x, f.z, 0.45); break;
        case "sandalye": this.addObstacleCircle(f.x, f.z, 0.25); break;
        case "semsiye": this.addObstacleCircle(f.x, f.z, 0.2); break;
        case "sezlong": this.addObstacleRect(f.x, f.z, 0.8, 2, f.rot); break;
        case "cankurtaran": this.addObstacleRect(f.x, f.z, 2.2, 2.2); break;
        case "fener": this.addObstacleCircle(f.x, f.z, 4.6); break;
        case "bandstand": this.addObstacleCircle(f.x, f.z, 6.2); break;
        case "dikilitas": this.addObstacleRect(f.x, f.z, 1.6, 1.6); break;
        case "kilise_kule": this.addObstacleRect(f.x, f.z, 5, 5, f.rot); break;
        case "gonder": this.addObstacleCircle(f.x, f.z, 0.6); break;
        case "minare": this.addObstacleCircle(f.x, f.z, 1.8); break;
        case "sadirvan": this.addObstacleCircle(f.x, f.z, 2.9); break;
        case "oyun": for (const o of playgroundItems(f)) this.addObstacleRect(o.x, o.z, o.w, o.d, o.rot); break;
        case "pota": this.addObstacleCircle(f.x, f.z, 0.5); break;
        case "vinc": this.addObstacleRect(f.x, f.z, 1.8, 1.8); break;
        case "okul_bahce": {
          // Bahçe duvarı (güneyde 4 m'lik kapı açıklığı); bayrak direği.
          const { x0, x1, z0, z1, gateX } = f;
          this.addObstacleRect(x0, (z0 + z1) / 2, 0.4, z1 - z0);
          this.addObstacleRect(x1, (z0 + z1) / 2, 0.4, z1 - z0);
          this.addObstacleRect((x0 + gateX - 2) / 2, z1, gateX - 2 - x0, 0.4);
          this.addObstacleRect((gateX + 2 + x1) / 2, z1, x1 - gateX - 2, 0.4);
          this.addObstacleCircle(x0 + 2, z0 + 1.5, 0.3);
          break;
        }
        case "hastane_on":
          for (const dz of [-5.5, 5.5]) this.addObstacleCircle(f.x + 6.5, f.z + dz, 0.35);
          for (const [dx, dz] of [[2, -11], [2, 11], [16, -12.5], [16, 12.5]]) this.addObstacleCircle(f.x + dx, f.z + dz, 0.8);
          break;
      }
    }
  }

  /** Kuzey-güney yönündeki sınır caddeleri (aynı hatta olanlar birleştirilir). */
  addCol(x, z0, z1) {
    if (!this.cols.has(x)) this.cols.set(x, []);
    this.cols.get(x).push([Math.min(z0, z1), Math.max(z0, z1), this._key]);
  }

  /** Aynı hat üzerindeki cadde parçalarını birleştirir (üst üste binen yollar olmasın). */
  addRow(z, x0, x1) {
    if (!this.rows.has(z)) this.rows.set(z, []);
    this.rows.get(z).push([Math.min(x0, x1), Math.max(x0, x1), this._key]);
  }

  _emitRows() {
    // Açılmamış parçalar çizilmez.
    for (const map of [this.cols, this.rows]) {
      for (const [k, list] of map) {
        const open = list.filter((q) => this.has(q[2]));
        if (open.length) map.set(k, open); else map.delete(k);
      }
    }
    for (const [x, list] of this.cols) {
      list.sort((a, b) => a[0] - b[0]);
      let [a, b] = list[0];
      for (const [c, d] of list.slice(1)) {
        if (c <= b + 1) b = Math.max(b, d);
        else { this.addRoad([[x, a], [x, b]], "cadde"); [a, b] = [c, d]; }
      }
      this.addRoad([[x, a], [x, b]], "cadde");
    }
    for (const [z, list] of this.rows) {
      list.sort((a, b) => a[0] - b[0]);
      let [a, b] = list[0];
      for (const [c, d] of list.slice(1)) {
        if (c <= b + 1) b = Math.max(b, d);
        else { this.addRoad([[a, z], [b, z]], "cadde"); [a, b] = [c, d]; }
      }
      this.addRoad([[a, z], [b, z]], "cadde");
    }
  }

  /** Geliştirme kontrolü: bir bina bir yolun ya da yaya alanının üstüne biniyor mu? */
  _validate() {
    for (const b of this.buildings) {
      const c = Math.cos(b.rot), sn = Math.sin(b.rot);
      for (const [fx, fz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0], [0, 0.5], [0, -0.5], [0.5, 0], [-0.5, 0]]) {
        const lx = fx * b.w, lz = fz * b.d;
        const x = b.x + lx * c + lz * sn, z = b.z - lx * sn + lz * c;
        const hit = this.roadIndex.at(x, z, 0.3);
        if (hit) {
          console.warn(`Bina yolda: ${b.kind} (${b.x.toFixed(0)}, ${b.z.toFixed(0)}) -> ${hit.road.type}`);
          break;
        }
      }
    }
  }

  // --- arazi ---

  /** Kıyıya işaretli uzaklık: karada −, denizde +. (Eski hücre modelindeki anlamıyla: margin 0 kıyı çizgisi.) */
  sdf(x, z) {
    return -I.land(x, z);
  }

  margin() {
    return 0;
  }

  /** Arazi: yolların ve meydanların altı ve çevresi tesviye edilmiş (_gradeRoads). */
  height(x, z) {
    const raw = this.rawHeight(x, z);
    const g = this.grade?.get(Math.floor(x / 2) * 100003 + Math.floor(z / 2));
    if (!g) return raw;
    if (g.low) return Math.min(raw, g.h - 0.12);
    if (g.e <= 0) return g.h - 0.12; // yüzeyin hemen altında
    if (Math.abs(raw - g.h) < 0.12) return raw; // düz kasabada omuz gerekmez (arazi zaten yüzey düzeyinde)
    const t = Math.max(0, Math.min(1, (g.e - GRADE_SHOULDER) / GRADE_BLEND));
    const y = g.h - 0.12 + (raw - g.h + 0.12) * t * t * (3 - 2 * t);
    // Omuz denize taşmasın: kıyıda (doğal arazi suya inerken) omuz doğal araziye bırakılır.
    if (raw >= 0.6 || y <= raw) return y;
    const k = Math.max(0, raw) / 0.6;
    return raw + (y - raw) * k * k;
  }

  /** Doğal arazi (tesviyesiz): island.js. */
  rawHeight(x, z) {
    return I.terrainHeight(x, z);
  }

  /** Yürünen yüzeyin yüksekliği: iskele, meydan, yol katmanı (asfalt, kaldırım, yaya yolu) ya da arazi. */
  groundY(x, z) {
    const key = Math.round(x * 4) * 400009 + Math.round(z * 4);
    let y = this._groundCache.get(key);
    if (y !== undefined) return y;
    y = this._groundY(x, z);
    if (this.roadIndex) this._groundCache.set(key, y);
    return y;
  }

  _groundY(x, z) {
    for (const p of this.piers) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.top;
    for (const p of this.plazas) if (p.r && Math.hypot(x - p.x, z - p.z) < p.r) return FLAT_Y + 0.2;
    for (const p of this.plazas) if (p.klinker && x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return FLAT_Y + 0.12; // Marktplatz döşemesi
    const hit = this.roadIndex?.at(x, z);
    if (hit) {
      const r = hit.road;
      const base = this.roadH(x, z);
      if (r.carriage > 0) return base + (hit.dist < r.carriage / 2 ? LAYER.carriage : LAYER.walk);
      return base + (r.type === "patika" ? LAYER.trail : LAYER.ped);
    }
    return this.height(x, z);
  }

  addBench(x, z, rot, place) {
    this.features.push({ type: "bank", x, z, rot });
    for (const o of [-0.45, 0.45]) {
      this.seats.push({ x: x + Math.cos(rot) * o, z: z - Math.sin(rot) * o, heading: rot, h: 0.49, place });
    }
  }

  addTables(x, z, n, axis, toward, place) {
    // Kaldırımdaki masalar: `toward` yönüne (yola) doğru 1,6 m açıkta, yan yana.
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6;
      const [tx, tz] = axis === "x" ? [x + along, z + toward * 1.6] : [x + toward * 1.6, z + along];
      this.features.push({ type: "masa1", x: tx, z: tz });
      for (const side of [-1, 1]) {
        const cx = axis === "x" ? tx + side * 0.7 : tx, cz = axis === "x" ? tz : tz + side * 0.7;
        const heading = Math.atan2(tx - cx, tz - cz);
        this.features.push({ type: "sandalye", x: cx, z: cz, rot: heading });
        this.seats.push({ x: cx, z: cz, heading, h: 0.475, place, table: [tx, tz] });
      }
    }
  }

  isLand(x, z) {
    return this.height(x, z) > 0.15;
  }

  /** (x0, z0)'dan (dx, dz) yönünde ilerleyip kıyıyı bulur; kıyıdan `back` metre içerideki nokta. */
  coastPoint(x0, z0, dx, dz, back = 0) {
    const len = Math.hypot(dx, dz);
    dx /= len; dz /= len;
    for (let s = 0; s < 2000; s += 1) {
      if (this.height(x0 + dx * s, z0 + dz * s) <= 0) return [x0 + dx * (s - back), z0 + dz * (s - back)];
    }
    return [x0, z0];
  }

  block(x0, z0, x1, z1, pad = 2) {
    if (!this._staged) { this._blockOps.push([1, x0, z0, x1, z1, pad, this._key]); return; }
    for (let x = Math.floor((x0 - pad) / 4); x <= Math.floor((x1 + pad) / 4); x++) {
      for (let z = Math.floor((z0 - pad) / 4); z <= Math.floor((z1 + pad) / 4); z++) this.blocked.add(x * 100003 + z);
    }
  }

  unblock(x0, z0, x1, z1) {
    if (!this._staged) { this._blockOps.push([0, x0, z0, x1, z1, 0, this._key]); return; }
    for (let gx = Math.floor(x0 / 4); gx <= Math.floor(x1 / 4); gx++) {
      for (let gz = Math.floor(z0 / 4); gz <= Math.floor(z1 / 4); gz++) this.blocked.delete(gx * 100003 + gz);
    }
  }

  isBlocked(x, z) {
    return this.blocked.has(Math.floor(x / 4) * 100003 + Math.floor(z / 4));
  }

  addRoad(points, type, extra = {}) {
    const spec = { ...ROADS[type], ...extra };
    this.roads.push({ points, type, ...spec });
    const hw = spec.width / 2 + 1;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      this.block(Math.min(ax, bx) - hw, Math.min(az, bz) - hw, Math.max(ax, bx) + hw, Math.max(az, bz) + hw, 0);
    }
  }

  addBuilding(b) {
    this.buildings.push(b);
    const c = Math.abs(Math.cos(b.rot)), s = Math.abs(Math.sin(b.rot));
    const hx = (b.w * c + b.d * s) / 2, hz = (b.w * s + b.d * c) / 2;
    this.block(b.x - hx, b.z - hz, b.x + hx, b.z + hz, 2);
    return b;
  }

  // --- köy: Marktplatz, Strandstraße, Hafenweg ---

  /** Köy yolları: araçlar gelene kadar (cevre_yolu) kum yol, sonra asfalt. */
  _townRoad(points, type, extra = {}) {
    if (this.has("cevre_yolu")) this.addRoad(points, type, extra);
    else this.addRoad(points, "patika", { width: type === "sokak" && extra.width ? 7 : 5, ...(extra.trunk ? { trunk: extra.trunk } : {}) });
  }

  /** Yaya caddesi (Strandstraße): klinker döşenene kadar (carsi_yol) kum yol. */
  _walkRoad(points, extra = {}) {
    if (this.has("carsi_yol")) this.addRoad(points, "yaya", { width: STRAND_HALF * 2, carsi: true, ...extra });
    else this.addRoad(points, "patika", { width: 5, ...extra });
  }

  _layoutTown() {
    const m = MARKT;
    // Marktplatz: klinker döşeli meydan, ortada Marktbrunnen; çevresinde Klönbänke ve ıhlamurlar (meydan_duzen).
    this.block(m.x0, m.z0, m.x1, m.z1, 0);
    this.plazas.push({ ...m, kind: "meydan", klinker: true });
    this.features.push({ type: "brunnen", x: 0, z: 0 });
    this._tag("meydan_duzen", () => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        this.addBench(Math.cos(a) * 12, Math.sin(a) * 12, Math.atan2(-Math.cos(a), -Math.sin(a)), "meydan");
      }
      for (const x of [-36, -18, 18, 36]) for (const z of [m.z0 + 4, m.z1 - 4]) this.features.push({ type: "agac", x, z, tur: "linde" });
      for (const z of [-14, 14]) for (const x of [m.x0 + 4, m.x1 - 4]) this.features.push({ type: "agac", x, z, tur: "linde" });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.lamps.push({ x: Math.cos(a) * 20, z: Math.sin(a) * 20, dir: Math.atan2(-Math.cos(a), -Math.sin(a)) });
      }
    });
    this._place("meydan", { anchors: [[0, 0], [-25, -18], [25, 18], [-25, 20], [25, -20]], spread: 8, path: [HUB] });
    this.labels.push({ text: "Marktplatz", x: 0, z: 0, h: 34 });

    // "Am Markt": meydanın çevresinde dikdörtgen sokak; ana yollar köşelerden çıkar (island.js TRUNKS).
    const R = RING;
    this._townRoad([[R.x0, R.z0], [R.x1, R.z0]], "sokak");
    this._townRoad([[R.x0, R.z1], [R.x1, R.z1]], "sokak");
    this._townRoad([[R.x0, R.z0], [R.x0, R.z1]], "sokak");
    this._townRoad([[R.x1, R.z0], [R.x1, R.z1]], "sokak");
    // Meydanın dört yanından sokağa yaya bağlantıları (köşelerde değil, kilise ve Rathaus'un önünden).
    const walk = this.has("carsi_yol") ? "yaya" : "patika";
    const wk = walk === "patika" ? { width: 2.4, noLamps: true } : { width: 4, noLamps: true };
    for (const z of [-24, 24]) this.addRoad([[m.x0, z], [-62, z]], walk, wk), this.addRoad([[m.x1, z], [62, z]], walk, wk);
    // Strandstraße (yaya, kuzeye Kurhaus'a) ve Hafenweg (araçlı, güneye limana).
    this._walkRoad([[0, m.z0], ...I.STRAND.slice(1)]);
    this.labels.push({ text: "Strandstraße", x: -10, z: -260, h: 26 });
    this.strandAt = I.along(I.STRAND, 220).p;
    this._townRoad([[0, R.z1], [0, I.HAFEN_Z]], "sokak", { hafenweg: true });
    this._townRoad([[0, m.z1], [0, R.z1]], "giris");
    this.labels.push({ text: "Hafenweg", x: 0, z: 330, h: 24 });

    // Inselkirche (tuğla, batı kuleli; 50. sakinde): meydanın batısında, kapısı meydana bakar.
    this._tag("cami:0", () => this._church(-84, -5, Math.PI / 2, "Inselkirche", null));
    // Rathaus (tuğla, basamaklı alınlık; 100. sakinde): meydanın doğusunda.
    this._tag("belediye:0", () => {
      const st = STYLES.belediye;
      const b = this.addBuilding({ kind: "belediye", x: 62 + 1 + st.d / 2, z: 0, rot: -Math.PI / 2, w: st.w, d: st.d, floors: st.floors, roofType: st.roof, wall: st.wall, roof: st.roofColor, style: st, workplace: true, address: "Am Markt 1" });
      const door = [62 + 0.65, 0];
      this._addWorkplace("belediye", 0, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
      this.features.push({ type: "gonder", x: 56, z: 17, de: true });
    });
    // Ada bayrağı direği baştan var (20 Kasım: videolar bayrakla açılır; Rathaus 100. sakinde gelir, Almanya bayrağı onunla).
    this.features.push({ type: "gonder", x: 56, z: -17, ada: true });

    this._fronts();
    this._tag("carsi_yol", () => {
      // Strandstraße'nin klinker yaya yolu: vitrinlere bakarak yürünen iki şerit.
      const walks = [];
      for (const side of [-1, 1]) {
        const pts = [], L = I.polyLength(I.STRAND);
        for (let s = 30; s <= Math.min(L, FRONTS.strand.s1); s += 10) {
          const a = I.along(I.STRAND, s), n = [-a.t[1], a.t[0]];
          pts.push([a.p[0] + n[0] * side * 4.5, a.p[1] + n[1] * side * 4.5]);
        }
        walks.push(pts);
      }
      this.carsiWalks = walks;
    });
    this._tag("cevre_yolu", () => this._layoutParking());
    this._tag("saglik:0", () => this._layoutHospital());
    this._tag("pazar", () => this._layoutMarket());
    this._tag("saha", () => this._layoutPitch());
    this._tag("beyzbol", () => this._layoutTennis());
    this._tag("park", () => this._layoutPondPark());
    this._tag("kleingarten", () => this._layoutKleingarten());
    this._layoutBahn();
  }

  /** Tuğla Kuzey Alman köy kilisesi: batı kulesi (sivri külah), uzun kemerli pencereler. (x, z) gövde merkezi, rot cephe yönü. */
  _church(x, z, rot, name, m) {
    const w = 13, d = 24;
    const b = this.addBuilding({ kind: "cami", x, z, rot, w, d, floors: 2, icKat: 1, roofType: "gable", wall: "#9a3f30", roof: "#3c3f45", workplace: true, style: { church: true, brick: true }, address: name });
    const f = [Math.sin(rot), Math.cos(rot)];
    this.features.push({ type: "kilise_kule", x: x + f[0] * (d / 2 + 2.6), z: z + f[1] * (d / 2 + 2.6), rot });
    if (m != null) b.mahalle = m;
    const door = [x + f[0] * (d / 2 + 5.6), z + f[1] * (d / 2 + 5.6)];
    (this.workplaces.cami ??= []).push({ name, door, anchor: door, spread: 3, path: [door, HUB], building: b, _k: this._key });
    b.isim = name;
    return b;
  }

  /** Bir cephe hattı (yol ya da meydan kenarı) üstünde s'deki yapı yeri. side: hattın hangi yanı (+: normal yönü). */
  _frontAt(F, s, side, w, d) {
    const a = I.along(F.pts, s), n = [-a.t[1], a.t[0]];
    const off = F.off;
    const f = [-n[0] * side, -n[1] * side]; // cephe yönü: hatta
    const at = (k) => [a.p[0] + n[0] * side * k, a.p[1] + n[1] * side * k];
    const [x, z] = at(off + d / 2);
    return { x, z, rot: Math.atan2(f[0], f[1]), door: at(off + 0.35), out: at(off - 1.2), f, t: a.t };
  }

  /**
   * Cephe hatları: Marktplatz'ın kuzey ve güney kenarı, Strandstraße'nin dükkânlı ilk kısmı, Hafenweg. İş yerleri
   * FRONT_ORDER'daki tercih ettikleri yere en yakın boş cepheye; kalanlar dükkân (carsi:i, gelisim_dukkan); Strandstraße'nin
   * Kurviertel kısmında beyaz Bäderarchitektur villaları (aynı sıra: carsi:i, adları "Villa ...").
   */
  _fronts() {
    const used = {};
    const key = (fr, side) => `${fr}:${side}`;
    const free = (fr, side, a, b) => {
      const F = FRONTS[fr];
      if (a < F.s0 || b > F.s1) return false;
      if ((F.gaps ?? []).some(([p, q]) => !(b < p || a > q))) return false;
      return (used[key(fr, side)] ?? []).every(([p, q]) => b < p || a > q);
    };
    const take = (fr, side, a, b) => (used[key(fr, side)] ??= []).push([a, b]);
    const frontage = (fr, side, want, w) => {
      for (let k = 0; k < 300; k++) for (const sg of k ? [1, -1] : [1]) {
        const s = want + sg * k * 2;
        if (free(fr, side, s - w / 2 - 1.2, s + w / 2 + 1.2)) { take(fr, side, s - w / 2 - 1.2, s + w / 2 + 1.2); return s; }
      }
      return null;
    };
    const no = (fr, s, side) => `${FRONTS[fr].name} ${1 + 2 * Math.round(s / 9) + (side > 0 ? 1 : 0)}`;
    for (const [kind, index, fr, want, side] of FRONT_ORDER) this._tag(`${kind}:${index}`, () => {
      const style = { ...STYLES[kind], ...BRANCH[`${kind}:${index}`] };
      const s = frontage(fr, side, want, style.w);
      if (s == null) return;
      const q = this._frontAt(FRONTS[fr], s, side, style.w, style.d);
      const b = this.addBuilding({ kind, x: q.x, z: q.z, rot: q.rot, w: style.w, d: style.d, floors: style.floors, roofType: style.roof, address: no(fr, s, side), wall: style.wall, roof: style.roofColor, style, workplace: true });
      this._addWorkplace(kind, index, { door: q.door, path: [q.door, HUB], anchor: q.door, spread: 2, building: b });
      if (kind === "kafe" || kind === "firin") this._sidewalkTables(q, kind === "kafe" ? 3 : 2, "kafe");
    });
    // Dolgu dükkânlar: Giebelhaus (alınlığı sokağa bakan tuğla ya da sıvalı ev), altı dükkân üstü daire; meydana
    // yakından uzağa açılır.
    const fillers = [];
    let k = 0;
    for (const fr of ["marktN", "marktS", "strand", "hafenweg"]) {
      const F = FRONTS[fr];
      for (const side of F.sides) {
        for (let s = F.s0 + 2; s < F.s1 - 6; s += 2) {
          const kk = 9000 + k;
          const w = 8 + Math.floor(hash2(kk, 1, 9) * 3) * 2;
          if (!free(fr, side, s - 0.6, s + w + 0.6)) continue;
          take(fr, side, s - 0.6, s + w + 0.6);
          k++;
          const d = 13, q = this._frontAt(F, s + w / 2, side, w, d);
          const brick = hash2(kk, 5, 9) < 0.6;
          const wall = brick ? KLINKER[Math.floor(hash2(kk, 6, 9) * KLINKER.length)] : PUTZ[Math.floor(hash2(kk, 7, 9) * PUTZ.length)];
          const awning = ["#2f4256", "#8e2f2a", "#3e7a5a", "#c9a441", "#6f7d4a", "#5a4a6a", "#2f7fb5"][Math.floor(hash2(kk, 2, 9) * 7)];
          const a = I.along(F.pts, s + w / 2).p;
          fillers.push([Math.hypot(a[0], a[1]), this.addBuilding({
            kind: "carsi", x: q.x, z: q.z, rot: q.rot, w, d, floors: 2 + Math.floor(hash2(kk, 3, 9) * 2), roofType: "gable",
            address: no(fr, s + w / 2, side), wall, roof: hash2(kk, 4, 9) < 0.5 ? "#3c3f45" : "#8e3b2a",
            style: { shop: true, awning, brick, giebel: true, stufen: brick && hash2(kk, 8, 9) < 0.35 }, workplace: true,
          })]);
          s += w;
        }
      }
    }
    // Kurviertel: Strandstraße'nin kuzey kısmında iki yanda beyaz villalar (Bäderarchitektur: balkonlu, kırma çatılı).
    const villas = [];
    const V = FRONTS.kur;
    for (const side of [-1, 1]) {
      for (let s = V.s0, i = 0; s < V.s1 - 14; s += 30, i++) {
        const w = 14 + Math.floor(hash2(i, side, 21) * 3) * 2, d = 13;
        const q = this._frontAt(V, s + w / 2, side, w, d);
        const a = I.along(V.pts, s + w / 2).p;
        villas.push([Math.hypot(a[0], a[1]), this.addBuilding({
          kind: "villa", x: q.x, z: q.z, rot: q.rot, w, d, floors: 3, roofType: "hip", address: no("kur", s + w / 2, side),
          wall: VILLA[Math.floor(hash2(i, side, 22) * VILLA.length)], roof: "#4b5058", style: { villa: true, balconies: true, veranda: true },
        })]);
        this.features.push({ type: "agac", x: q.x + q.t[0] * (w / 2 + 6), z: q.z + q.t[1] * (w / 2 + 6), tur: "linde" });
      }
    }
    // Açılış sırası: meydana yakın olan önce; dükkânlar ve villalar aynı carsi sırasında (villalar Kurhaus'tan önce
    // açılmaz: ilk villa sırası 260 nüfustan sonra gelir).
    fillers.sort((a, b) => a[0] - b[0] || a[1].x - b[1].x);
    villas.sort((a, b) => a[0] - b[0] || a[1].x - b[1].x);
    const order = [];
    let vi = 0;
    fillers.forEach((f, i) => { order.push(f[1]); if (i % 2 === 1 && vi < villas.length && i > 1) order.push(villas[vi++][1]); });
    while (vi < villas.length) order.push(villas[vi++][1]);
    order.forEach((b, i) => {
      b._k = `carsi:${i}`;
      if (b.kind === "villa") { b.isim = `Villa ${VILLA_AD[i % VILLA_AD.length]}`; this._villaKeys.add(b._k); return; }
      const [dukkan, ek] = DUKKANLAR[i % DUKKANLAR.length];
      b.dukkan = dukkan;
      b.isim = `${ek} ${SOYADLAR[Math.floor(i / DUKKANLAR.length) % SOYADLAR.length]}`;
    });
  }

  /** Kaldırımdaki masalar (kafe, fırın): kapının önünde, cepheye paralel. */
  _sidewalkTables(q, n, place) {
    for (let i = 0; i < n; i++) {
      const along = (i - (n - 1) / 2) * 2.6 + 3.2;
      const tx = q.out[0] + q.t[0] * along + q.f[0] * -1.2, tz = q.out[1] + q.t[1] * along + q.f[1] * -1.2;
      this.features.push({ type: "masa1", x: tx, z: tz });
      for (const sd of [-1, 1]) {
        const cx = tx + q.t[0] * sd * 0.7, cz = tz + q.t[1] * sd * 0.7;
        const heading = Math.atan2(tx - cx, tz - cz);
        this.features.push({ type: "sandalye", x: cx, z: cz, rot: heading });
        this.seats.push({ x: cx, z: cz, heading, h: 0.475, place, table: [tx, tz] });
      }
    }
  }

  _layoutParking() {
    // Otoparklar Hafenweg'in iki yanında, limana yakın (girişleri Hafenweg'den).
    this.parkingLots = [];
    const lots = [
      { x0: 24, x1: 120, z0: 430, z1: 520, gateSide: -1 },
      { x0: -120, x1: -24, z0: 430, z1: 520, gateSide: 1 },
    ];
    for (const lot of lots) {
      const mid = (lot.z0 + lot.z1) / 2, gx = lot.gateSide < 0 ? lot.x0 : lot.x1;
      lot.gate = [gx, mid]; lot.gateX = gx;
      this.addRoad([[0, mid], [gx, mid]], "giris");
      this.parkingLots.push(lot);
      this.plazas.push({ x0: lot.x0, z0: lot.z0, x1: lot.x1, z1: lot.z1, kind: "otopark" });
      this.block(lot.x0, lot.z0, lot.x1, lot.z1, 1);
    }
  }

  _layoutHospital() {
    // Inselklinik: Kurstraße'nin batısında, köyün kuzeydoğusu; önünde ambulans alanı, Kurstraße'den giriş yolu.
    const hx = 250, hz = -230, kz = hz, kx = 115 + (300 - 115) * ((-70 - kz) / (-70 + 500));
    const b = this.addBuilding({ kind: "saglik", x: hx + 10, z: hz, rot: -Math.PI / 2, w: 36, d: 20, floors: 3, roofType: "flat", wall: "#eef0f2", roof: "#c9c4bb", workplace: true, style: STYLES.saglik, address: "Kurstraße 12" });
    this.plazas.push({ x0: hx - 14, z0: hz - 14, x1: hx, z1: hz + 14, kind: "avlu" });
    this.addRoad([[kx + 7, kz], [hx - 4, kz]], "giris");
    const door = [hx - 0.35, hz];
    this._addWorkplace("saglik", 0, { door, path: [door, [kx, kz], HUB], anchor: door, spread: 2, building: b });
    this.hospital = { building: b, bay: [hx - 6, hz], door };
    this.features.push({ type: "tabela_h", x: hx - 12, z: hz - 9 });
  }

  _layoutMarket() {
    // Wochenmarkt: Hafenweg'in batısında açık meydan (cumartesi sabahı); iki koridor tezgâh.
    const market = { x0: -170, z0: 205, x1: -70, z1: 255 };
    this.plazas.push({ ...market, kind: "pazar" });
    this.block(market.x0, market.z0, market.x1, market.z1, 0);
    const aisles = [market.z0 + 13, market.z0 + 37];
    let n = 0;
    for (const az of aisles) {
      for (const dir of [1, -1]) {
        let k = 0;
        for (let x = market.x0 + 12; x <= market.x1 - 12; x += 3.6, k++) {
          if (k % 6 === 5) continue;
          this.features.push({ type: "tezgah", x, z: az - dir * 2.4, dir, c: n++ % 10 });
        }
      }
    }
    const cx = (market.x0 + market.x1) / 2;
    const aisleAnchors = aisles.flatMap((az) => [-30, 0, 30].map((dx) => [cx + dx, az]));
    this.addRoad([[market.x1 + 4, (market.z0 + market.z1) / 2], [-6.5, (market.z0 + market.z1) / 2]], "patika");
    this._addWorkplace("pazar", 0, { door: [market.x1, 230], path: [[market.x1, 230], [0, 230], HUB], anchor: [cx, 230], spread: 20, outdoor: true });
    this._place("pazar", { anchors: aisleAnchors, spread: 6, path: [[market.x1, 230], [0, 230], HUB], aisles: aisles.map((az) => [market.x0 + 10, market.x1 - 10, az]) });
  }

  /** Sportplatz des SV Wattenoog: futbol sahası, Vereinsheim, ışıklar; köyün güneybatısı. */
  _layoutPitch() {
    const cx = -290, cz = 380, x0 = cx - 50, x1 = cx + 50, z0 = cz - 32, z1 = cz + 32;
    this.plazas.push({ x0, z0, x1, z1, kind: "saha" });
    this.pitch = { x0, z0, x1, z1, cx, cz };
    for (const side of [-1]) {
      const edge = z0;
      this.features.push({ type: "tribun", x0: x0 + 25, x1: x1 - 25, z: edge, side });
      for (let r = 0; r < 3; r++) for (let x = x0 + 26; x < x1 - 25; x += 0.62) this.seats.push({ x, z: edge + side * (1.2 + r * 0.8), heading: 0, h: 0.45 + r * 0.4, place: "tribun", absolute: true });
    }
    for (const gx of [x0 + 2, x1 - 2]) this.features.push({ type: "kale", x: gx, z: cz, dir: gx < cx ? 1 : -1 });
    for (const [mx, mz] of [[x0 - 3, z0 - 5], [x1 + 3, z0 - 5], [x0 - 3, z1 + 5], [x1 + 3, z1 + 5]]) {
      this.features.push({ type: "projektor", x: mx, z: mz });
      this.lamps.push({ x: mx, z: mz, dir: Math.atan2(cx - mx, cz - mz), r: 48, flood: true, stadium: true });
    }
    // Vereinsheim: sahanın batısında tek katlı tuğla bina.
    this.addBuilding({ kind: "vereinsheim", x: x0 - 16, z: cz, rot: Math.PI / 2, w: 18, d: 10, floors: 1, roofType: "gable", wall: "#a2452f", roof: "#3c3f45", address: "Vereinsheim SV Wattenoog" });
    const gate = [x1 + 8, cz];
    this.addRoad([[-6.5, cz], gate], "patika", { width: 3 });
    this._place("saha", { anchors: [[cx, cz]], spread: 20, path: [gate, [0, cz], HUB] });
    this._addWorkplace("saha", 0, { door: gate, path: [gate, HUB], anchor: [cx, cz], spread: 20 });
    this.block(x0 - 28, z0 - 10, x1 + 6, z1 + 8, 0);
    this.labels.push({ text: "Sportplatz", x: cx, z: cz, h: 24 });
  }

  /** Tennisplätze (iki kort, kırmızı kum): sahanın kuzeyinde. */
  _layoutTennis() {
    for (let i = 0; i < 2; i++) {
      const cx = -320 + i * 38, cz = 300;
      this.plazas.push({ x0: cx - 17, z0: cz - 9, x1: cx + 17, z1: cz + 9, kind: "tenis" });
      this.features.push({ type: "tennisnetz", x: cx, z: cz });
    }
    this.block(-340, 290, -264, 310, 0);
  }

  _layoutPondPark() {
    // Kurpark: göl, çevresinde yürüyüş yolu ve banklar (köyün kuzeybatısı).
    const px = -280, pz = -320;
    this.features.push({ type: "gol", x: px, z: pz, r: 44 });
    this.plazas.push({ x0: px - 95, z0: pz - 95, x1: px + 95, z1: pz + 95, kind: "park" });
    this.block(px - 48, pz - 48, px + 48, pz + 48, 0);
    const ring = [];
    for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; ring.push([px + Math.cos(a) * 56, pz + Math.sin(a) * 56]); }
    this.addRoad(ring, "patika", { width: 2.4 });
    this.addRoad([[px + 56, pz], [-120, pz]], "patika", { width: 2.4 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      this.addBench(px + Math.cos(a) * 60, pz + Math.sin(a) * 60, Math.atan2(-Math.cos(a), -Math.sin(a)), "park");
    }
    this._place("park", { anchors: [0, 2, 4, 6].map((i) => { const a = (i / 8) * Math.PI * 2 + 0.2; return [px + Math.cos(a) * 62, pz + Math.sin(a) * 62]; }), spread: 6, path: [[-120, pz], HUB] });
    this.labels.push({ text: "Kurpark", x: px, z: pz, h: 22 });
  }

  /** Kleingartenkolonie: çitli küçük bahçeler, bahçe kulübeleri (Gartenlaube), ortada yol. */
  _layoutKleingarten() {
    const x0 = -380, x1 = -230, z0 = 150, z1 = 250;
    this.plazas.push({ x0, z0, x1, z1, kind: "kleingarten" });
    this.addRoad([[x0, (z0 + z1) / 2], [x1, (z0 + z1) / 2]], "patika", { width: 2.6, noLamps: true });
    let i = 0;
    for (let x = x0 + 9; x < x1 - 8; x += 18) for (const side of [-1, 1]) {
      const cz = (z0 + z1) / 2 + side * 26;
      this.features.push({ type: "parzelle", x, z: cz, w: 16, d: 44, seed: i++, side });
    }
    this.block(x0, z0, x1, z1, 0);
  }

  /**
   * Inselbahn: limandaki Hafenbahnhof'tan köydeki Bahnhof'a dar hatlı ada treni (gelişim inselbahn:0 ile çalışır;
   * ray ve istasyonlar baştan vardır: eski hat). Tren feribotla eşzamanlı gider gelir (inselbahn.js).
   */
  _layoutBahn() {
    const track = [[170, 612], [170, 575], [176, 480], [192, 380], [210, 260], [222, 160], [222, 96]];
    this.bahn = { track, hafen: [170, 600], ort: [222, 104] };
    this.features.push({ type: "gleis", pts: track });
    this.addBuilding({ kind: "bahnhof", x: 240, z: 104, rot: -Math.PI / 2, w: 16, d: 9, floors: 1, roofType: "gable", wall: "#a2452f", roof: "#3c3f45", style: { canopy: true }, address: "Bahnhof Wattenoog", isim: "Wattenoog" });
    this.features.push({ type: "bahnsteig", x: 226, z: 110, w: 3, len: 34 });
    this.features.push({ type: "bahnsteig", x: 176, z: 596, w: 3, len: 30 });
    this._tag("inselbahn:0", () => {
      const door = [235.3, 104];
      this._addWorkplace("inselbahn", 0, { door, path: [door, HUB], anchor: [222, 110], spread: 3 });
    });
    this.labels.push({ text: "Bahnhof", x: 240, z: 92, h: 18 });
  }

  /** Eski "sahil bulvarı" profili (otobüs hatları ve kamera için): Hafenstraße. */
  avenueZ() {
    return I.HAFEN_Z;
  }

  avenuePath(x0, x1) {
    const pts = [];
    const step = x1 > x0 ? 10 : -10;
    for (let x = Math.round(x0 / 10) * 10; step > 0 ? x <= x1 : x >= x1; x += step) pts.push([x, I.HAFEN_Z]);
    return pts;
  }

  _addWorkplace(kind, index, entry) {
    const names = cat().isyerleri[kind];
    const name = names[index % names.length];
    (this.workplaces[kind] ??= [])[index] = { name, outdoor: OUTDOOR_KINDS.has(kind), ...entry, _k: this._key };
    if (entry.building) { entry.building.sube = index; entry.building.isim = name; }
  }

  // --- liman: Hafenstraße, havuz (Kutterhafen, feribot, Versorgungshafen), mendirekler, Bootswerft, Seenotretter ---

  _layoutWaterfront() {
    const H = I.HAFEN, qz = H.z0, HZ = I.HAFEN_Z;
    this._townRoad([[-330, HZ], [560, HZ]], "sokak");
    this.labels.push({ text: "Hafenstraße", x: -200, z: HZ, h: 20 });
    // Mendirekler: taş dalgakıran, üstü yürünebilir (balık tutulur, feribot izlenir).
    for (const mo of I.MOLES) {
      this.piers.push({ ...mo, top: 2.3, mole: true });
      this.features.push({ type: "mendirek", ...mo, top: 2.3 });
    }
    for (const [mx, mz, c] of [[25, 911, "#c0392b"], [155, 911, "#2e8b57"]]) this.features.push({ type: "molenfeuer", x: mx, z: mz, c });

    // Hafenkante: rıhtım boyunca klinker gezinti yolu (sahil yolu açılınca banklar ve lambalar).
    const kante = [[-150, qz - 5], [60, qz - 5]];
    this.addRoad(kante, this.has("carsi_yol") ? "yaya" : "patika", { width: 6, noLamps: !this.has("carsi_yol") });

    // Fähranleger: rıhtımdan güneye 124 m iskele; feribot yanaşmış (doğu yanı). Boş adada da var.
    const fx = 95;
    this.features.push({ type: "iskele", x: fx, z: qz - 4, len: 124, w: 10 });
    this.ferryPier = { x0: fx - 5, x1: fx + 5, z0: qz - 4, z1: qz + 120, top: 1.53 };
    this.piers.push(this.ferryPier);
    this.features.push({ type: "vapur", x: fx + 13, z: qz + 64 });
    this.ferryRun = { dx: -13, dz: 420 }; // ağızdan (x 30…150) güneye kanal boyunca
    this.addRoad([[fx, HZ], [fx, qz - 3]], this.has("cevre_yolu") ? "yaya" : "patika", { width: 8 });
    this.addBuilding({ kind: "liman", x: fx + 36, z: qz - 22, rot: Math.PI, w: 20, d: 10, floors: 1, roofType: "gable", wall: "#a2452f", roof: "#3c3f45", address: "Fähranleger", isim: "Fähranleger" });
    const ferryDoor = [fx + 3.5, qz + 60];
    const q = { x0: fx - 4, x1: fx + 4, z: qz + 58.5 };
    this._addWorkplace("anakara", 0, { door: ferryDoor, path: [ferryDoor, [fx, qz - 6], [0, HZ], HUB], anchor: ferryDoor, spread: 2, queue: q });
    this._tag("zeplin:0", () => this._addWorkplace("zeplin", 0, { door: ferryDoor, path: [ferryDoor, [fx, qz - 6], HUB], anchor: ferryDoor, spread: 2, queue: q }));
    this._addWorkplace("ev", 0, { door: null, path: [HUB], anchor: HUB, spread: 0, home: true });
    this.labels.push({ text: "Fähranleger", x: fx, z: qz + 40, h: 22 });

    this._tag("liman:0", () => this._layoutPort());
    this._tag("balik_iskelesi", () => this._layoutFishingPier());
    this._tag("tersane:0", () => this._layoutShipyard());
    this._tag("balikci_koyu:0", () => this._layoutCove());
    this._tag("kahvehane:0", () => this._layoutFischbude());
    this._tag("seenot:0", () => this._layoutSeenot());
    this._tag("sahil_guvenlik:0", () => this._layoutKuestenwache());
    this._tag("muze:0", () => this._layoutSeehundstation());
    // Havuzda boş adada da birkaç tekne (Kutterhafen tarafında sandallar).
    for (const [x, z, r] of [[-120, 690, 0.1], [-90, 730, -0.2]]) this.features.push({ type: "tekne", x, z, rot: r, len: 6 });
    this.labels.push({ text: "Hafen", x: 40, z: 790, h: 36 });

    // Rıhtım duvarı: havuzun kuzey ve yan duvarları ve iki yanındaki kıyı (island.js quay); iskeleler keser.
    const wall = [];
    for (let x = -330; x <= 430; x += 5) {
      let cz = HZ + 20;
      if (I.land(x, cz) > 0) {
        while (cz < 1100 && I.land(x, cz) > 0) cz += 2;
        let lo = cz - 2;
        for (let k = 0; k < 8; k++) { const m = (lo + cz) / 2; if (I.land(x, m) > 0) lo = m; else cz = m; }
      }
      const a = wall.at(-1);
      if (I.quay(x, cz - 2) > 0.9) {
        if (a && Math.abs(cz - a[1]) > 6) {
          const up = cz > a[1], side = [];
          for (let z = a[1] + (up ? 2.5 : -2.5); up ? z < cz : z > cz; z += up ? 5 : -5) {
            let sx = up ? x : a[0];
            while (Math.abs(sx - (up ? x : a[0])) < 5 && I.land(sx, z) > 0) sx += up ? -0.25 : 0.25;
            side.push([sx, z]);
          }
          if (side.length) {
            if (up) side.push([side.at(-1)[0], cz]);
            else side.unshift([side[0][0], a[1]]);
          }
          wall.push(...side);
        }
        wall.push([x, cz]);
      } else if (wall.length && wall.at(-1) !== null) wall.push(null);
    }
    const wallZ = (x) => {
      for (let i = 1; i < wall.length; i++) {
        const a = wall[i - 1], b = wall[i];
        if (a && b && b[0] - a[0] > 0.5 && x >= a[0] && x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
      }
      return null;
    };
    const kesik = [];
    for (const p of this.piers) {
      if (p.mole) continue;
      const xa = p.x0 - 0.05, xb = p.x1 + 0.05, za = wallZ(xa), zb = wallZ(xb), zc = wallZ((p.x0 + p.x1) / 2);
      if (za === null || zb === null || zc === null || p.z0 > Math.min(za, zb, zc) - 0.3 || p.z1 < Math.max(za, zb, zc) + 0.6) continue;
      const f = this.features.find((f) => f.type === "iskele" && f.x === (p.x0 + p.x1) / 2 && f.z === p.z0);
      if (f) {
        const z0 = Math.min(p.z0, Math.min(za, zb, zc) - 5.4);
        f.len += f.z - z0;
        f.z = p.z0 = z0;
      }
      kesik.push({ xa, xb, za, zb, pier: p, ...(f ? { dayanak: { z0: p.z0, top: p.top - 0.42 } } : {}) });
    }
    this.features.push({ type: "rihtim", pts: wall, kesik: kesik.sort((c, d) => c.xa - d.xa) });
    // İnsanlar için kıyı noktaları: rıhtımda balık tutma ve seyir (people.js).
    this.fishCoast = [];
    for (let x = -150; x <= 310; x += 3.5) if (Math.abs(x - fx) > 9 && Math.abs(x - H.kutterX + 80) > 30) this.fishCoast.push([x, qz - 1.6, 0]);
    this.viewCoast = [];
    for (let x = -140; x <= 300; x += 12) if (Math.abs(x - fx) > 9) this.viewCoast.push([x, qz - 2.2, 0]);
  }

  _layoutFishingPier() {
    // Anglersteg: Kutterhafen'in batısında rıhtımdan havuza tahta iskele (balık tutma hobisi).
    const ix = -125, iz = I.HAFEN.z0;
    this.features.push({ type: "iskele", x: ix, z: iz - 3, len: 38, w: 3 });
    this.piers.push({ x0: ix - 1.5, x1: ix + 1.5, z0: iz - 3, z1: iz + 35, top: 1.53 });
    const fishing = [];
    for (let k = 0; k < 6; k++) {
      const side = k % 2 ? 1 : -1;
      fishing.push({ x: ix + side * 1.05, z: iz + 12 + k * 3.6, heading: side * Math.PI / 2 });
    }
    this._place("iskele", { anchors: fishing.map((f) => [f.x, f.z]), spots: fishing, spread: 0, path: [[ix, iz - 3], [0, I.HAFEN_Z], HUB] });
  }

  /**
   * Versorgungshafen: havuzun kuzey rıhtımında (Hafenstraße ile rıhtım arası) beton saha, yanaşmış yük gemisi, vinç,
   * istif, ambar. Mercanada/Driftwood'daki yerleşimin aynısı, (dx, dz) kadar kaydırılmış (port.js göreli çalışır).
   */
  _layoutPort() {
    const dx = 160, dz = 394;
    const x0 = 40 + dx, x1 = 150 + dx, z0 = 176 + dz, z1 = 246 + dz, top = FLAT_Y + 0.3;
    const gateX = 95 + dx;
    const P = {
      x0, x1, z0, z1, top, gateX,
      ship: { x: 95 + dx, z: z1 + 7.1, len: 84, beam: 13, depth: 6.6 },
      crane: { x: 95 + dx, legX: [86 + dx, 104 + dx], landZ: 226 + dz, seaZ: 242 + dz },
      transfer: [95 + dx, 234 + dz],
      stack: { x0: 108 + dx, x1: 147 + dx, z0: 201 + dz, z1: 223 + dz },
      warehouse: { x: 61 + dx, z: 186 + dz, w: 38, d: 15 },
      truck: { x: 52 + dx, z: 207 + dz, heading: 0 },
      booth: [gateX + 6.5, z0 + 3.2],
      benches: [[86 + dx, 196.5 + dz, Math.PI], [90 + dx, 196.5 + dz, Math.PI]],
      masts: [[x0 + 3, z1 - 6], [x1 - 3, z1 - 6], [x1 - 3, z0 + 6], [x0 + 46, z0 + 26]],
    };
    for (const [mx, mz] of P.masts) this.lamps.push({ x: mx, z: mz, dir: Math.atan2(95 + dx - mx, 215 + dz - mz), r: 40, flood: true });
    this.port = P;
    this.piers.push({ x0, x1, z0, z1, top });
    this.block(x0, z0 - 2, x1, z1, 2);
    const wh = P.warehouse;
    this.addBuilding({ kind: "ambar", x: wh.x, z: wh.z, rot: 0, w: wh.w, d: wh.d, floors: 2, roofType: "gable", wall: "#c9d2dc", roof: "#6f7f92", industrial: true, style: { door: "#d9822b", sign: "#1f3b5a" }, address: "Versorgungshafen, Lagerhalle" });
    this.addRoad([[gateX, I.HAFEN_Z], [gateX, z0 + 1]], "giris");
    const door = [gateX - 4.5, z0 + 1.5];
    const posts = [];
    const post = (type, x, z, heading = 0, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    post("vinc", P.crane.x, P.crane.landZ);
    post("isaretci", 101.5 + dx, 236.5 + dz, Math.PI * 1.2);
    post("istif", 0, 0, 0, { k: 0 });
    post("forklift", 0, 0, 0, { k: 0 });
    for (let k = 0; k < 4; k++) post("bagci", 64 + dx + k * 17, 0, 0, { k });
    for (const bx of [52, 136, 70]) post("palamar", bx + dx, z1 - 2.2, 0);
    for (let k = 0; k < 3; k++) post("kontrol", 0, 0, 0, { k });
    post("bekci", P.booth[0], P.booth[1], Math.PI);
    for (let k = 0; k < 3; k++) post("ambar", 0, 0, 0, { k });
    post("sofor", P.truck.x + 2.2, P.truck.z + 7.5, -Math.PI / 2);
    for (const [bx, bz, h] of P.benches) for (const ox of [-0.5, 0.5]) post("mola", bx + ox, bz, h);
    P.posts = posts;
    const innerDoor = [wh.x + wh.w / 2 - 1.6, wh.z + wh.d / 2 + 0.6];
    this._addWorkplace("liman", 0, { door, innerDoor, path: [door, [gateX, I.HAFEN_Z], HUB], anchor: [95 + dx, 215 + dz], spread: 20 });
    this.labels.push({ text: "Versorgungshafen", x: 98 + dx, z: 215 + dz, h: 22 });
  }

  _layoutShipyard() {
    // Bootswerft: havuzun batısında, kıyıya inen kızakla (taranmış küçük havuzcuk).
    const [tx, tz] = this.coastPoint(-255, I.HAFEN_Z + 30, 0, 1);
    this.addBuilding({ kind: "tersane", x: tx, z: tz - 13, rot: 0, w: 30, d: 18, floors: 2, roofType: "gable", wall: "#8f8a80", roof: "#3c3f45", workplace: true, industrial: true, style: { door: "#2f4256", sign: "#2f4256" }, address: "Hafenstraße 2" });
    const top = FLAT_Y + 0.25;
    const S = { x: tx, x0: tx - 6, x1: tx + 6, z0: tz - 3.5, zFlat: tz + 16, z1: tz + 40, top, boat: { x: tx, z: tz + 6.5, len: 16 }, timber: [tx - 11, tz - 1] };
    this.tersane = S;
    this.piers.push({ x0: S.x0, x1: S.x1, z0: S.z0, z1: S.zFlat, top });
    this.block(S.x0 - 6, S.z0, S.x1 + 6, S.z1, 1);
    this.features.push({ type: "tekne", x: tx + 15, z: tz + 22, rot: 0.1, len: 12 });
    const posts = [];
    const post = (type, x, z, heading, extra = {}) => posts.push({ post: type, x, z, heading, ...extra });
    const half = S.boat.len / 2;
    for (const side of [-1, 1]) {
      post("iskele2", S.x + side * 3.6, S.boat.z - 3.5, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 2 });
      post("iskele2", S.x + side * 3.6, S.boat.z + 3, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 2 });
      post("iskele1", S.x + side * 3.6, S.boat.z, side > 0 ? -Math.PI / 2 : Math.PI / 2, { level: 1 });
      post("boya", S.x + side * 2.2, S.boat.z + side * 4.5, side > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
    post("kaynak", S.x + 0.9, S.boat.z - half + 2.5, -Math.PI / 2);
    post("kaynak", S.x - 0.9, S.boat.z + half - 3, Math.PI / 2);
    post("tasima", 0, 0, 0, { k: 0 });
    post("tasima", 0, 0, 0, { k: 1 });
    post("vinc", S.x1 + 0.8, S.boat.z - 6, -Math.PI / 2);
    post("kontrol", S.x - 2.5, S.boat.z + half + 1.8, Math.PI);
    S.posts = posts;
    const tDoor = [tx, tz - 23];
    this.addRoad([[tx, I.HAFEN_Z], tDoor], this.has("cevre_yolu") ? "giris" : "patika");
    this._addWorkplace("tersane", 0, { door: tDoor, innerDoor: [tx + 15 - 1.6, tz - 13 + 9 + 0.6], path: [tDoor, [tx, I.HAFEN_Z], HUB], anchor: [tx, S.boat.z], spread: 5 });
    this.labels.push({ text: "Bootswerft", x: tx, z: tz, h: 20 });
  }

  _layoutCove() {
    // Kutterhafen: havuzun batı yarısı; yüzer iskelede Krabbenkutter'lar (ağ kolları yukarıda), rıhtımda ağ
    // kulübeleri, ağ askıları, kasalar.
    const qz = I.HAFEN.z0, bx = -95, bz = qz - 2;
    for (let i = 0; i < 3; i++) {
      this.addBuilding({ kind: "kulube", x: bx - 14 + i * 12, z: qz - 22, rot: 0, w: 8, d: 6, floors: 1, roofType: "gable", wall: ["#2f4a6a", "#8e2f2a", "#e9e4da"][i], roof: "#3c3f45", address: `Kutterhafen, Netzschuppen ${i + 1}` });
    }
    const jx = -40, jz = qz - 2, jlen = 90;
    this.features.push({ type: "iskele", x: jx, z: jz, len: jlen, w: 3, ponton: true });
    this.piers.push({ x0: jx - 1.5, x1: jx + 1.5, z0: jz, z1: jz + jlen, top: 1.4 });
    for (const [x, z, r] of [[jx + 5.5, jz + 18, 0], [jx - 5.5, jz + 34, 0], [jx + 5.5, jz + 52, 0], [jx - 5.5, jz + 70, 0]]) this.features.push({ type: "tekne", x, z, rot: r, len: 17, kutter: true });
    const K = {
      jetty: { x: jx, z0: jz, z1: jz + jlen },
      racks: [[bx - 14, qz - 12], [bx + 13, qz - 12]],
      upturned: [bx - 25, qz - 13.5, 0.3],
      crates: [jx, jz - 1.8],
      table: [bx - 3.5, qz - 13.4],
      buoys: [[jx - 12, jz + 30], [jx + 12, jz + 60], [jx - 2, jz + 96]],
      huts: [0, 1, 2].map((i) => [bx - 14 + i * 12, qz - 22]),
      boardwalk: [[bx - 20, qz - 15.8], [bx, qz - 15.8]],
      stall: [jx + 4.5, jz - 0.8],
      beached: [],
      traps: [[bx - 19.6, qz - 17.0], [bx - 8.6, qz - 17.0], [bx + 3.0, qz - 17.0]],
      ropes: [[jx - 0.7, jz + 4], [jx + 0.7, jz + 12], [jx - 0.7, jz + 20]],
      rocks: null,
      sign: [bx, qz - 27.5],
      kutter: true,
    };
    for (const lx of [bx - 22, bx - 8, bx + 4]) this.lamps.push({ x: lx, z: qz - 14.6, dir: Math.PI });
    const kposts = [];
    const kpost = (type, x, z, heading, extra = {}) => kposts.push({ post: type, x, z, heading, ...extra });
    for (const [rx, rz] of K.racks) for (const ox of [-1.4, 1.4]) kpost("ag", rx + ox, rz + 1.3, Math.PI);
    kpost("kasa", 0, 0, 0, { k: 0 });
    kpost("kasa", 0, 0, 0, { k: 1 });
    kpost("iskele", jx + 0.6, jz + 9, Math.PI / 2);
    kpost("iskele", jx - 0.6, jz + 16.5, -Math.PI / 2);
    kpost("boya", K.upturned[0] + 2.2, K.upturned[1], -Math.PI / 2);
    kpost("cay", K.table[0] - 0.75, K.table[1], Math.PI / 2);
    kpost("cay", K.table[0] + 0.75, K.table[1], -Math.PI / 2);
    K.posts = kposts;
    this.koy = K;
    const bDoor = [bx, qz - 27];
    cat().isyerleri.balikci_koyu.forEach((_, i) => this._addWorkplace("balikci_koyu", i, {
      door: bDoor, innerDoor: [jx, jz + jlen - 1], path: [bDoor, [0, I.HAFEN_Z], HUB], anchor: [bx, qz - 8], spread: 7,
    }));
    this.labels.push({ text: "Kutterhafen", x: -60, z: qz + 50, h: 20 });
  }

  /** Fischbude: Kutterhafen'in rıhtımında mavi ahşap büfe, önünde ayakta masalar (10. sakin işletir). */
  _layoutFischbude() {
    const qz = I.HAFEN.z0, x = -10, z = qz - 18;
    const b = this.addBuilding({ kind: "kahvehane", x, z, rot: 0, w: 8, d: 5, floors: 1, roofType: "flat", wall: "#2f5d8a", roof: "#e9e4da", style: { ...STYLES.kahvehane }, workplace: true, address: "Am Kutterhafen 1" });
    const door = [x, z + 2.85];
    this._place("kahvehane", { anchors: [door], spread: 3, path: [door, [0, I.HAFEN_Z], HUB], building: b });
    this._addWorkplace("kahvehane", 0, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
    for (const [tx, tz] of [[x - 4, z + 6], [x + 4, z + 6], [x, z + 9]]) this.features.push({ type: "stehtisch", x: tx, z: tz });
    for (let i = 0; i < 3; i++) this.seats.push({ x: x - 6 + i * 6, z: z + 7.5, heading: Math.PI, h: 0, stand: true, place: "kahvehane" });
  }

  _layoutSeenot() {
    // Seenotrettungsstation: havuzun doğusunda kayıkhane ve istasyon binası; kurtarma kruvazörü doğu duvarda yanaşık.
    const b = this.addBuilding({ kind: "seenot", x: 384, z: 612, rot: -Math.PI / 2, w: 18, d: 11, floors: 2, roofType: "gable", wall: "#f4f1ea", roof: "#c0392b", style: { plate: "#c0392b" }, workplace: true, address: "Hafenstraße 30" });
    const door = [378.15, 612];
    this._addWorkplace("seenot", 0, { door, path: [door, [372, I.HAFEN_Z], HUB], anchor: [330, 700], spread: 4, building: b });
    this.features.push({ type: "rettungskreuzer", x: 304, z: 712, rot: 0 });
    this.labels.push({ text: "Seenotretter", x: 384, z: 625, h: 18 });
  }

  _layoutKuestenwache() {
    const b = this.addBuilding({ kind: "sahil_guvenlik", x: 392, z: 690, rot: -Math.PI / 2, w: 16, d: 10, floors: 2, roofType: "flat", wall: "#eef0f2", roof: "#c9c4bb", style: { band: "#1f4f8f", plate: "#1f4f8f" }, workplace: true, address: "Hafenstraße 32" });
    const door = [386.65, 690];
    this.addRoad([[372, I.HAFEN_Z], [372, 690]], "giris");
    this._addWorkplace("sahil_guvenlik", 0, { door, path: [door, [372, I.HAFEN_Z], HUB], anchor: [330, 760], spread: 3, building: b });
    this.features.push({ type: "tekne", x: 305, z: 770, rot: 0, len: 14, kuestenwache: true });
  }

  _layoutSeehundstation() {
    // Seehundstation ve Nationalpark-Haus: Hafenstraße'nin doğu ucunda; arkasında deniz suyu havuzları ve yavru foklar.
    const b = this.addBuilding({ kind: "muze", x: 520, z: 582, rot: Math.PI, w: 28, d: 14, floors: 1, roofType: "gable", wall: "#e9e4da", roof: "#4b6352", style: STYLES.muze, workplace: true, address: "Hafenstraße 40" });
    const door = [520, 574.65];
    this._addWorkplace("muze", 0, { door, path: [door, [520, I.HAFEN_Z], HUB], anchor: [520, 630], spread: 8, building: b });
    for (const [px, pz, r] of [[492, 614, 8], [522, 620, 9], [552, 614, 7]]) this.features.push({ type: "robbenbecken", x: px, z: pz, r });
    this.block(470, 598, 575, 632, 0);
    this._place("seehunde", { anchors: [[507, 600], [537, 600]], spread: 4, path: [door, HUB] });
    this.labels.push({ text: "Seehundstation", x: 520, z: 600, h: 18 });
  }

  // --- doğa ve ada yolları: kumsal, Promenade, Kurhaus, set, polder, fener, su kulesi, Ostplate ---

  _layoutNature() {
    for (const tr of I.TRUNKS) this._townRoad(tr.pts, "cadde", { trunk: tr.id });

    // Wasserturm: kumul üstünde tuğla su kulesi (simge, baştan var); tepesinde seyir yeri (tepe).
    const W = I.WASSERTURM, top = [W.x, W.z];
    this.features.push({ type: "wasserturm", x: W.x, z: W.z });
    this.hill = { x: W.x, z: W.z, r: W.r, h: W.h };
    const trailStart = I.along(I.TRUNKS.find((t) => t.id === "duene").pts, 470).p;
    const trail = [trailStart, [W.x - 20, W.z + 90], [W.x - 6, W.z + 14]];
    this.addRoad(trail, "patika");
    for (const [ox, oz, r] of [[8, 9, 0.4], [-9, 8, -0.4], [12, -2, 1.2]]) this.addBench(W.x + ox, W.z + oz, r, "tepe");
    this._place("tepe", { anchors: [[W.x, W.z + 12]], spread: 7, path: [...trail].reverse().concat([HUB]) });
    this._tag("wasserturm", () => this.features.push({ type: "aussicht", x: W.x, z: W.z }));
    this.labels.push({ text: "Wasserturm", x: W.x, z: W.z, h: 40 });

    // Leuchtturm Westkopf: batı başındaki yüksek kumulda; Westerweg'in ucundan kumul patikası.
    const lx = -3250, lz = -560;
    this.features.push({ type: "fener", x: lx, z: lz, de: true });
    this.block(lx - 6, lz - 6, lx + 6, lz + 6, 0);
    const lend = I.TRUNKS.find((t) => t.id === "west").pts.at(-1);
    const fenerTrail = [lend, [-2860, -380], [-3000, -470], [-3140, -520], [lx + 7, lz + 6]];
    this.addRoad(fenerTrail, "patika");
    const fenerPath = [...fenerTrail].reverse().concat([HUB]);
    this._addWorkplace("fener", 0, { door: [lx, lz], path: fenerPath, anchor: [lx + 4, lz + 3], spread: 2 });
    const views = [];
    for (const rr of [9, 12, 15, 18]) {
      const n = Math.round((2 * Math.PI * rr) / 2.2);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rr;
        const vx = lx + Math.cos(a) * rr, vz = lz + Math.sin(a) * rr;
        if (vx - lx > 3) continue; // denize (batıya) bakan yarı
        views.push({ x: vx, z: vz, heading: Math.atan2(vx - lx - 20, vz - lz) });
      }
    }
    this._place("fener", { anchors: views.map((v) => [v.x, v.z]), spots: views, spread: 0, path: fenerPath });
    this.fener = { x: lx, z: lz, door: [lx + 4.8, lz + 1] };
    // Bekçi evi ve kafe tepenin eteğinde, düzlenmiş küçük alanda (constructor setFlatAreas: Leuchtturm-Hof).
    this.addBuilding({ kind: "kulube", x: -2905, z: -405, rot: Math.PI, w: 10, d: 7, floors: 1, roofType: "reet", wall: "#a2452f", roof: "#b39a5e", address: "Leuchtturmwärterhaus" });
    this._tag("kafe:3", () => {
      const st = { ...STYLES.kafe, ...BRANCH["kafe:3"] };
      const b = this.addBuilding({ kind: "kafe", x: -2880, z: -445, rot: -Math.PI / 2, w: 12, d: 10, floors: 1, roofType: "gable", wall: st.wall, roof: st.roofColor, style: st, workplace: true, address: "Am Leuchtturm 2" });
      const door = [-2885.35, -445];
      this._addWorkplace("kafe", 3, { door, path: [door, ...fenerPath], anchor: door, spread: 2, building: b });
    });
    this.labels.push({ text: "Leuchtturm Westkopf", x: lx, z: lz, h: 40 });

    // Feuerwehr (Freiwillige Feuerwehr, 30. sakinde) ve Bauhof: Westerweg'in güneyinde, köyün batısı.
    const wz = (x) => 20 + (60 - 20) * ((-x - 115) / (520 - 115));
    this._tag("itfaiye", () => {
      const sx = -330, sz = wz(sx) + 7 + 2 + 7;
      const fs = this.addBuilding({ kind: "itfaiye", x: sx, z: sz, rot: Math.PI, w: 24, d: 14, floors: 2, roofType: "gable", wall: "#a2452f", roof: "#3c3f45", style: { garage: "#c0392b", tower: false }, workplace: true, address: "Westerweg 4" });
      this.fireStation = { building: fs, bay: [sx, sz - 11] };
      this._addWorkplace("itfaiye", 0, { door: [sx + 10, sz - 7.35], path: [[sx + 10, sz - 7.35], HUB], anchor: [sx, sz - 11], spread: 4, building: fs });
    });
    this._tag("garaj", () => {
      const gx = -385, gz = wz(gx) + 7 + 2 + 7;
      const dp = this.addBuilding({ kind: "garaj", x: gx, z: gz, rot: Math.PI, w: 20, d: 14, floors: 1, roofType: "gable", wall: "#d9dde2", roof: "#6f7f92", style: { garage: "#3e7a3a" }, workplace: true, address: "Westerweg 6" });
      this.depot = { building: dp, bay: [gx, gz - 11] };
      this._addWorkplace("garaj", 0, { door: [gx + 8, gz - 7.35], path: [[gx + 8, gz - 7.35], HUB], anchor: [gx, gz - 11], spread: 4, building: dp });
    });

    this._layoutDeich();
    this._layoutPolder();
    this._layoutOstplate();
    this._layoutBeach();
    this._tag("lunapark:0", () => this._layoutKurhaus());
  }

  /** Set (Deich): tepesinde yürüyüş yolu; şevlerde ve tuzlu bataklıkta koyunlar; köyden sete çıkış patikaları. */
  _layoutDeich() {
    const segs = [[-2650, -380], [470, 2250]];
    this.deichPaths = [];
    for (const [a, b] of segs) {
      const pts = [];
      for (let x = a; x <= b; x += 25) pts.push([x, I.deichZ(x)]);
      this.addRoad(pts, "patika", { width: 3, deich: true, noLamps: true });
      this.deichPaths.push(pts);
      // Koyunlar: setin iki şevinde ve önündeki bataklıkta küçük sürüler.
      for (let x = a + 40; x < b - 40; x += 70) {
        const n = 3 + Math.floor(hash2(x, 3, 71) * 5);
        const side = hash2(x, 4, 71) < 0.55 ? 1 : -1;
        this.features.push({ type: "schafe", x: x + hash2(x, 5, 71) * 30, z: I.deichZ(x) + side * (10 + hash2(x, 6, 71) * 18), n, seed: x });
      }
    }
    const marsh = [-1400, 900, 1600];
    this._place("deich", { anchors: [-1200, -700, 800, 1300].map((x) => [x, I.deichZ(x)]), spread: 5, path: [HUB] });
    this._place("watt", { anchors: marsh.map((x) => [x, I.southShoreZ(x) + 30]), spread: 15, path: [HUB] });
    this.labels.push({ text: "Deich", x: -1200, z: I.deichZ(-1200), h: 18 });
  }

  /** Polder: setin arkasında tarlalar (patates, kolza), Gulfhof, Hofladen, Deichschäferei; kenarında yel değirmeni. */
  _layoutPolder() {
    const lane = [[2420, I.along(I.TRUNKS.find((t) => t.id === "ost").pts, 2560).p[1] + 8], [2420, 440]];
    lane[0][1] = -615;
    this._tag("tarla:0", () => this.addRoad(lane, this.has("cevre_yolu") ? "koy" : "patika", { width: 5 }));
    // Yel değirmeni (Galerieholländer): baştan var; Mühlencafé (windmuehle) açılınca kanatlar döner, kapı açılır.
    this.features.push({ type: "windmuehle", x: 2140, z: -300, open: false });
    this._tag("windmuehle", () => { const f = this.features.find((f) => f.type === "windmuehle"); if (f) f.open = true; });
    this.labels.push({ text: "Windmühle", x: 2140, z: -300, h: 30 });
    cat().isyerleri.tarla.forEach((name, i) => this._tag(`tarla:${i}`, () => {
      if (i === 0) {
        for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) {
          const fx0 = 2160 + c * 120, fz0 = -140 + r * 110;
          this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 105, z1: fz0 + 95, kind: "tarla", ekin: "kartoffel", crop: 2 });
          this.block(fx0, fz0, fx0 + 105, fz0 + 95, 0);
        }
      } else if (i === 1) {
        for (let r = 0; r < 3; r++) {
          const fx0 = 2460, fz0 = -140 + r * 110;
          this.plazas.push({ x0: fx0, z0: fz0, x1: fx0 + 140, z1: fz0 + 95, kind: "tarla", ekin: "raps", crop: 1 });
          this.block(fx0, fz0, fx0 + 140, fz0 + 95, 0);
        }
      }
      const spots = [[2620, -230, -Math.PI / 2], [2380, -230, Math.PI / 2], [2620, 260, -Math.PI / 2]];
      const [bx, bz, rot] = spots[i];
      const barn = this.addBuilding({ kind: "ahir", x: bx, z: bz, rot, w: i === 0 ? 30 : 16, d: i === 0 ? 20 : 11, floors: 2, roofType: i === 0 ? "reet" : "gable", wall: "#a2452f", roof: i === 0 ? "#b39a5e" : "#3c3f45", workplace: true, industrial: i !== 0, style: { door: "#2e5e3a", gulfhof: i === 0 }, address: name });
      const f = [Math.sin(rot), Math.cos(rot)];
      const door = [bx + f[0] * (barn.d / 2 + 0.4), bz + f[1] * (barn.d / 2 + 0.4)];
      this._addWorkplace("tarla", i, { door, path: [door, [2420, bz], HUB], anchor: i === 2 ? [2300, I.deichZ(2300) + 10] : [2300 + i * 200, 0], spread: 40 });
    }));
    this.labels.push({ text: "Polder", x: 2400, z: 120, h: 30 });
  }

  /** Ostplate: doğu ucunda kuş koruma alanı; Vogelwarte kulübesi ve gözlem kulesi; Ostdorfer Straße'nin ucundan patika. */
  _layoutOstplate() {
    const end = I.TRUNKS.find((t) => t.id === "ost").pts.at(-1);
    const trail = [end, [3350, -720], [3700, -735]];
    this.addRoad(trail, "patika", { noLamps: true });
    this.features.push({ type: "vogelturm", x: 3720, z: -745 });
    this.addBuilding({ kind: "kulube", x: 3690, z: -760, rot: Math.PI, w: 8, d: 6, floors: 1, roofType: "reet", wall: "#e9e4da", roof: "#b39a5e", address: "Vogelwarte Ostplate" });
    this.labels.push({ text: "Ostplate", x: 3800, z: -740, h: 30 });
  }

  /**
   * Hauptstrand: Strandstraße'nin ucunda kumul geçitleri (Strandaufgang) ve sahil yolu (Promenade, sahil_yolu); kumsalda
   * numaralı Strandkorb sıraları, Rettungsturm, büfe (plaj:0). "Geri" = su kenarından karaya metre (ortalama su).
   */
  _layoutBeach() {
    const dir = [0, -1];
    const pz = I.promenadeZ;
    // Strandaufgänge: Promenade'den kumsala kumulların üstünden tahta yollar (baştan var; ilki Strandstraße'nin ucu).
    const ups = [-420, 0, 330];
    this.strandUps = [];
    for (const x of ups) {
      const [cx, cz] = this.coastPoint(x, pz(x) - 10, dir[0], dir[1], 52);
      const pts = [[x, pz(x) + (x === 0 ? 0 : 6)], [x, cz]];
      this.addRoad(pts, "patika", { width: 3, surface: "tahta", aufgang: true, noLamps: true });
      this.strandUps.push(pts);
    }
    const [px, pzz] = this.coastPoint(0, pz(0), 0, -1, 48);
    const beach = [];
    for (let i = -5; i <= 5; i++) beach.push(this.coastPoint(i * 24, pz(i * 24), 0, -1, 44));
    const beachPath = [[px, pzz], [0, pz(0)], ...[...I.STRAND].reverse(), HUB];
    this._place("plaj", { anchors: beach.map(([x, z]) => [x, z]), spread: 5, path: beachPath });
    this._tag("plaj:0", () => {
      this._layoutStrandkoerbe(px);
      this._addWorkplace("plaj", 0, { door: [px + 14, pzz + 4], path: beachPath, anchor: [px + 14, pzz + 2], spread: 3 });
      this.features.push({ type: "cankurtaran", x: px + 14, z: pzz + 2, dlrg: true });
    });
    this._tag("sahil_yolu", () => {
      const prom = [];
      for (let x = I.PROMENADE_X[0]; x <= I.PROMENADE_X[1]; x += 10) prom.push([x, pz(x)]);
      this.addRoad(prom, "sahil");
      this.promenade = prom;
      this._place("sahil_yolu", { anchors: prom.filter((_, i) => i % 6 === 0), spread: 1.5, path: [[0, pz(0)], ...[...I.STRAND].reverse(), HUB] });
      for (let i = 3; i < prom.length - 2; i += 6) this.addBench(prom[i][0], prom[i][1] - 4.2, Math.PI, "sahil_yolu");
      this.features.push({ type: "musikmuschel", x: -150, z: pz(-150) + 18, rot: Math.PI });
    });
    this._tag("kafe:4", () => {
      const st = { ...STYLES.kafe, ...BRANCH["kafe:4"] };
      const x = -330, z = pz(-330) + 14;
      const b = this.addBuilding({ kind: "kafe", x, z, rot: Math.PI, w: 12, d: 9, floors: 1, roofType: "gable", wall: st.wall, roof: st.roofColor, style: st, workplace: true, address: "Promenade 3" });
      const door = [x, z - 4.85];
      this._addWorkplace("kafe", 4, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
    });
    this._tag("kafe:5", () => {
      // Milchbar: kumsalın üstünde direkler üzerinde ahşap kafe (Kuzey Denizi klasiği).
      const st = { ...STYLES.kafe, ...BRANCH["kafe:5"] };
      const [x, z] = this.coastPoint(150, pz(150), 0, -1, 46);
      const b = this.addBuilding({ kind: "kafe", x, z, rot: Math.PI, w: 14, d: 9, floors: 1, roofType: "flat", wall: st.wall, roof: st.roofColor, style: { ...st, stelzen: true }, workplace: true, address: "Am Strand 1" });
      const door = [x, z - 4.85];
      this._addWorkplace("kafe", 5, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
    });
    this._tag("otel:0", () => {
      const st = STYLES.otel, x = 250, z = pz(250) + 32;
      const b = this.addBuilding({ kind: "otel", x, z, rot: Math.PI, w: st.w, d: st.d, floors: st.floors, roofType: st.roof, wall: st.wall, roof: st.roofColor, style: st, workplace: true, address: "Promenade 12" });
      const door = [x, z - st.d / 2 - 0.35];
      this._addWorkplace("otel", 0, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
      this.features.push({ type: "havuz", x: x + 30, z: z + 4, w: 12, d: 22 });
    });
    this.labels.push({ text: "Hauptstrand", x: px, z: pzz, h: 20 });
  }

  /** Strandkorb sıraları: su kenarından 18–40 m geride, 3 sıra, numaralı; denize bakar. */
  _layoutStrandkoerbe(cx) {
    const B = { face: Math.PI, koerbe: [], buoys: [], volley: null, bins: [] };
    let nr = 1;
    for (let x = cx - 150; x <= cx + 150; x += 4.2) {
      if (this.strandUps.some((p) => Math.abs(p[0][0] - x) < 5) || Math.abs(x - cx - 14) < 6) continue;
      for (const [back, off] of [[50, 0], [57, 2.1], [64, 0]]) {
        const [kx, kz] = this.coastPoint(x + off, I.promenadeZ(x), 0, -1, back);
        B.koerbe.push({ x: kx, z: kz, nr: nr++, c: Math.floor(hash2(Math.round(x * 10), back, 31) * 4) });
        this.seats.push({ x: kx, z: kz + 0.15, heading: Math.PI, h: 0.42, place: "plaj", strandkorb: true });
      }
    }
    for (let x = cx - 160; x <= cx + 160; x += 5) B.buoys.push(this.coastPoint(x, I.promenadeZ(x), 0, -1, -45));
    const [vx, vz] = this.coastPoint(cx + 200, I.promenadeZ(cx + 200), 0, -1, 56);
    B.volley = { x: vx, z: vz, rot: Math.PI };
    this.beach = B;
    const zs = B.koerbe.map((c) => c.z);
    this.block(cx - 160, Math.min(...zs) - 4, cx + 220, Math.max(...zs) + 4, 0);
  }

  /** Kurhaus: Strandstraße'nin ucunda, sahil yolunda beyaz Bäderarchitektur binası; önünde teras. */
  _layoutKurhaus() {
    const z = I.promenadeZ(0) + 26, st = STYLES.lunapark;
    const b = this.addBuilding({ kind: "lunapark", x: 42, z, rot: Math.PI, w: st.w, d: st.d, floors: st.floors, roofType: st.roof, wall: st.wall, roof: st.roofColor, style: st, workplace: true, address: "Promenade 1" });
    const door = [42, z - st.d / 2 - 0.35];
    this._addWorkplace("lunapark", 0, { door, path: [door, [0, I.promenadeZ(0)], ...[...I.STRAND].reverse(), HUB], anchor: door, spread: 6, building: b });
    this.lunapark = { building: b };
    this._place("lunapark", { anchors: [[42, z - st.d / 2 - 6], [0, I.promenadeZ(0) - 8], [-60, I.promenadeZ(-60)], [80, I.promenadeZ(80)]], spread: 4, path: [door, HUB] });
    this.labels.push({ text: "Kurhaus", x: 42, z, h: 30 });
  }

  // --- mahalleler ---

  /** Mahallenin karakteri (tohumdan): ön bahçe derinliği, renk eğilimi. */
  mahalleStyle(m) {
    this._styles ??= new Map();
    if (!this._styles.has(m)) {
      const h = (salt) => hash2(m, salt, 77);
      this._styles.set(m, { yard: 4.5 + h(4) * 2, tint: Math.floor(h(5) * HOUSE_WALLS.length) });
    }
    return this._styles.get(m);
  }

  /** Bölgenin yerel noktasından dünyaya (kısaltma). */
  _zw(z, u, v) {
    return I.zoneToWorld(z, u, v);
  }

  _rowV(r) {
    return I.ZONE.row0 + r * I.ZONE.pitch;
  }

  /** Sokak s'nin sırası ve yanı: girişe yakın sıradan uzağa, önce sağ (+u) yan. */
  _street(s) {
    return { r: Math.floor(s / 2), c: s % 2 ? -1 : 1 };
  }

  /** Bir yapının (ev ya da apartman) bölgedeki yeri: sokak s, yapı sırası ev (0'dan; iki yana dönüşümlü). */
  _housePos(zone, s, ev) {
    const tip = zone.tip, H = I.HOUSE[tip], { r, c } = this._street(s);
    const k = Math.floor(ev / 2), back = ev % 2 === 1; // tek numaralar ön (giriş) tarafta, çiftler arkada
    const u = c * (I.ZONE.avenue + 3 + H.lot * (k + 0.5));
    const dims = HOUSE_DIMS[tip];
    const style = this.mahalleStyle(zone.m);
    const yard = tip === "mehrfamilienhaus" ? 4 : style.yard;
    const rv = this._rowV(r), sgn = back ? 1 : -1;
    const v = rv + sgn * (ROADS.sokak.width / 2 + yard + dims.d / 2);
    const [x, z] = this._zw(zone, u, v);
    // Cephe sokağa bakar: önde +v, arkada −v.
    const f = back ? [-zone.n[0], -zone.n[1]] : zone.n;
    const door = this._zw(zone, u, rv + sgn * (ROADS.sokak.width / 2 + yard + 0.35));
    return { x, z, rot: Math.atan2(f[0], f[1]), door, u, v, k, back, dims };
  }

  _layoutMahalle(zone) {
    const m = zone.m, hw = zone.hw, D = I.ZONE.depth, side = I.ZONE.side;
    const cars = this.has("cevre_yolu");
    const tip = zone.tip, H = I.HOUSE[tip], dims = HOUSE_DIMS[tip];
    const birim = housingOf(m).birim;
    const first = m * perMahalle();
    const perSokak = cap("daire_per_bina") * cap("bina_per_sokak");
    const sideU = hw - side;
    // Çevre yolları (yanlar ve arka) ve giriş caddesi araçlarla birlikte; yan yollar ana yola kadar iner.
    this._tag("cevre_yolu", () => {
      for (const sg of [-1, 1]) this.addRoad([this._zw(zone, sg * sideU, -11), this._zw(zone, sg * sideU, D - side)], "cadde");
      this.addRoad([this._zw(zone, -sideU, D - side), this._zw(zone, sideU, D - side)], "cadde");
    });
    const built = new Map(); // sıra r -> { 1: en uzak u, -1: ... }
    const style = this.mahalleStyle(m);
    for (let s = 0; s < cap("sokak_per_mahalle"); s++) {
      const houses = (perSokak / birim) | 0;
      for (let ev = 0; ev < houses; ev++) {
        const slot0 = first + s * perSokak + ev * birim;
        if (slot0 >= this.population) continue;
        const q = this._housePos(zone, s, ev);
        const { r, c } = this._street(s);
        const reach = built.get(r) ?? { 1: 0, "-1": 0 };
        reach[c] = Math.max(reach[c], Math.abs(q.u) + H.lot / 2 + 3);
        built.set(r, reach);
        const key = m * 100000 + s * 100 + ev;
        const wall = HOUSE_WALLS[(style.tint + Math.floor(hash2(key, 3, 5) * 5)) % HOUSE_WALLS.length];
        // Friesenhaus: tuğla duvar, sazdan çatı (reet), yeşil ya da mavi kepenkler; diğerleri klinker ya da sıva,
        // koyu ya da kırmızı kiremit.
        const fries = tip === "friesenhaus";
        const b = this.addBuilding({
          kind: "konut", house: tip, x: q.x, z: q.z, rot: q.rot, w: dims.w, d: dims.d, floors: dims.floors,
          perFloor: dims.perFloor, daireler: birim, slot0, yard: tip === "mehrfamilienhaus" ? 4 : style.yard, pathSeed: key,
          roofType: fries ? "reet" : tip === "kapitaenshaus" ? "hip" : "gable",
          wall: fries ? KLINKER[Math.floor(hash2(key, 3, 5) * KLINKER.length)] : wall,
          roof: fries ? ["#b39a5e", "#a88f55", "#9c8650"][Math.floor(hash2(key, 4, 5) * 3)] : HOUSE_ROOFS[Math.floor(hash2(key, 4, 5) * HOUSE_ROOFS.length)],
          porch: false, shutters: fries && hash2(key, 6, 5) < 0.7, garage: false,
          address: streetAddress(slot0).replace(/, Whg\. \d+$/, ""),
        });
        this.buildingBySlot0.set(slot0, b);
      }
    }
    // Sokaklar: evi olan sıralar; araçlar gelene kadar evlerin önüne kadar, sonra yan yollara kadar. Giriş caddesi
    // en uzak sokağa kadar (araçlarla arka yola kadar) gider.
    const reach = new Map();
    for (const a of this._amenityPlan(zone)) {
      if (!this.has(a.key)) continue;
      if (!reach.has(a.row)) reach.set(a.row, new Set());
      reach.get(a.row).add(a.side);
    }
    let far = -1;
    for (const r of new Set([...built.keys(), ...reach.keys()])) {
      far = Math.max(far, r);
      const b = built.get(r) ?? { 1: 0, "-1": 0 };
      const ua = cars || reach.get(r)?.has(-1) ? -sideU : -Math.max(8, b[-1]);
      const ub = cars || reach.get(r)?.has(1) ? sideU : Math.max(8, b[1]);
      const pts = [];
      for (let u = ua; u < ub - 0.1; u += 20) pts.push(this._zw(zone, u, this._rowV(r)));
      pts.push(this._zw(zone, ub, this._rowV(r)));
      this.addRoad(pts, "sokak");
    }
    if (far >= 0 || cars) {
      const vEnd = cars ? D - side : this._rowV(far);
      // Giriş caddesi ana yoldan (11 m dışarıda) içeri.
      this.addRoad([this._zw(zone, 0, -11), this._zw(zone, 0, vEnd)], cars ? "cadde" : "sokak");
    }
    this._layoutAmenities(zone);
    if (built.size) this.labels.push({ text: mahalleName(m), x: zone.cx, z: zone.cz, h: 45 });
  }

  /**
   * Mahalle yerleri: iki yandaki şeritlerde sokak araları. Sol: kilise (her üç mahallede bir; ilk mahallenin kilisesi
   * Marktplatz'tadır), Eisdiele, oyun parkı, park; sağ: Grundschule (okul sayısı kadar mahallede) ya da park, Eisdiele +
   * Bürgerhaus, oyun parkı, basketbol.
   */
  _amenityPlan(zone) {
    const m = zone.m;
    const sides = { "-1": [m % 3 === 0 && m > 0 ? "cami" : "park", "cay", "oyun", "park"], "1": [m < cat().isyerleri.okul.length ? "okul" : "park", "cay", "oyun", "basket"] };
    const out = [];
    for (const side of [-1, 1]) {
      sides[side].forEach((kind, i) => out.push({ side, kind, r: i, row: i, key: `${kind === "park" ? "mpark" : kind}:${m}` }));
    }
    return out;
  }

  _layoutAmenities(zone) {
    const m = zone.m, hw = zone.hw;
    const Ls = I.streetLength(zone.tip);
    const place = "mahalle:" + m;
    const anchors = [], anchorKeys = [];
    const u0 = I.ZONE.avenue + 3 + Ls, u1 = hw - I.ZONE.side - 7; // şerit
    const su = (u0 + u1) / 2, sw = u1 - u0;
    const rot0 = Math.atan2(zone.n[0], zone.n[1]); // +v'ye bakan
    const rplaza = (side, v, w, d, kind, extra = {}) => {
      const [cx, cz] = this._zw(zone, side * su, v);
      const ext = (Math.abs(w * zone.t[0]) + Math.abs(d * zone.n[0])) / 2, ezz = (Math.abs(w * zone.t[1]) + Math.abs(d * zone.n[1])) / 2;
      this.plazas.push({ x0: cx - ext, x1: cx + ext, z0: cz - ezz, z1: cz + ezz, cx, cz, w, d, rot: rot0, kind, ...extra });
      return [cx, cz];
    };
    for (const { side, kind, r, key } of this._amenityPlan(zone)) {
      const v = (this._rowV(r) + this._rowV(r + 1)) / 2, gh = I.ZONE.pitch - ROADS.sokak.width - 2;
      this._tag(key, () => {
        const [cx, cz] = this._zw(zone, side * su, v);
        this.block(cx - sw / 2 - 4, cz - sw / 2 - 4, cx + sw / 2 + 4, cz + sw / 2 + 4, 0);
        switch (kind) {
          case "cami": {
            // Mahalle kilisesi: tuğla, kulesi sokağa (girişe yakın sıraya) bakar.
            this._church(cx, cz + 0, rot0 + Math.PI, `Kirche ${mahalleName(m)}`, m);
            break;
          }
          case "okul": {
            const b = this.addBuilding({ kind: "okul", x: cx, z: cz, rot: rot0 + Math.PI, w: Math.min(30, sw - 2), d: 13, floors: 2, roofType: "gable", wall: "#a2452f", roof: "#3c3f45", workplace: true, style: STYLES.okul, address: `${cat().isyerleri.okul[m]}, ${mahalleName(m)}` });
            const [dx, dz] = this._zw(zone, side * su, v - 6.85);
            const door = [dx, dz];
            this._addWorkplace("okul", m, { door, path: [door, HUB], anchor: door, spread: 2, building: b });
            // Fahrradständer: çocuklar okula bisikletle gelir (okulun önünde, sokağa paralel).
            const [ox, oz] = this._zw(zone, side * (su - 8), this._rowV(r) + 9.5);
            this.features.push({ type: "fahrradstaender", x: ox, z: oz, rot: Math.atan2(zone.t[0], zone.t[1]), n: 12 });
            (this.schools ??= []).push({ x0: cx - 12, x1: cx + 12, z0: cz - 12, z1: cz + 12, x: cx, building: b, _k: this._key });
            break;
          }
          case "cay": {
            // Eisdiele: küçük büfe ve önünde masalar.
            rplaza(side, v, sw - 2, gh - 2, "avlu");
            // Şeridin ucunda; sağ şeritte yanındaki Community Center'la arasında 0,5 m (şerit 21 m: 14 + 0,5 + 6).
            const bp = this._zw(zone, side * su + side * (sw / 2 - 3.5), v - gh / 2 + 4);
            this.addBuilding({ kind: "bufe", x: bp[0], z: bp[1], rot: rot0 + Math.PI, w: 6, d: 4.5, floors: 1, roofType: "flat", wall: "#f7e9ef", roof: "#c9c4bb", style: { shop: true, awning: "#e07a9a" }, address: `Eisdiele ${mahalleName(m)}` });
            for (let t = 0; t < 6; t++) {
              const [tx, tz] = this._zw(zone, side * su - 5 + (t % 2) * 9 - side * 2, v - 6 + Math.floor(t / 2) * 7);
              this.features.push({ type: "masa1", x: tx, z: tz, piknik: true });
              this.features.push({ type: "semsiye", x: tx, z: tz, c: (m + t) % 4, town: true });
              for (const dv of [-0.7, 0.7]) {
                const [sx, sz] = this._zw(zone, side * su - 5 + (t % 2) * 9 - side * 2, v - 6 + Math.floor(t / 2) * 7 + dv);
                const heading = Math.atan2(tx - sx, tz - sz);
                this.features.push({ type: "sandalye", x: sx, z: sz, rot: heading });
                this.seats.push({ x: sx, z: sz, heading, h: 0.475, place, table: [tx, tz] });
              }
            }
            anchors.push([cx, cz]);
            anchorKeys.push(this._key);
            break;
          }
          case "oyun": {
            const seedP = m * 7 + r * 3 + (side > 0 ? 1 : 0);
            rplaza(side, v, Math.min(22, sw - 2), gh - 4, "oyun", { color: ["#4f8a57", "#b8523f", "#4f78a8", "#7a8f3f", "#3e8a86"][seedP % 5] });
            this.features.push({ type: "oyun", x: cx, z: cz, seed: seedP, w: Math.min(20, sw - 4), d: gh - 6 });
            for (const dv of [-1, 1]) {
              const [bx, bz] = this._zw(zone, side * su - side * 10.5, v + dv * 6);
              this.addBench(bx, bz, rot0 + (side > 0 ? -Math.PI / 2 : Math.PI / 2), place);
            }
            break;
          }
          case "basket": {
            rplaza(side, v, 16, 28, "basket");
            const [ax, az] = this._zw(zone, side * su, v - 13), [bx, bz] = this._zw(zone, side * su, v + 13);
            this.features.push({ type: "pota", x: ax, z: az, rot: rot0 });
            this.features.push({ type: "pota", x: bx, z: bz, rot: rot0 + Math.PI });
            break;
          }
          default: {
            this.unblock(cx - sw / 2, cz - sw / 2, cx + sw / 2, cz + sw / 2);
            this.parks.push({ x0: cx - sw / 2 + 2, z0: cz - gh / 2, x1: cx + sw / 2 - 2, z1: cz + gh / 2 });
            this.addBench(cx, cz, rot0, place);
            anchors.push([cx, cz]);
            anchorKeys.push(this._key);
          }
        }
      });
      // Bürgerhaus: sağdaki Eisdiele şeridinde, girişe yakın sokağa bakan tek katlı tuğla bina.
      if (kind === "cay" && side > 0) this._tag(`muhtarlik:${m}`, () => {
        const st = STYLES.muhtarlik;
        const cu = su - sw / 2 + st.w / 2; // şeridin öbür ucu (dondurmacının karşı yanı)
        const [bx, bz] = this._zw(zone, cu, v - gh / 2 + st.d / 2 + 1);
        const names = cat().isyerleri.muhtarlik;
        const b = this.addBuilding({
          kind: "muhtarlik", x: bx, z: bz, rot: rot0 + Math.PI, w: st.w, d: st.d, floors: st.floors, roofType: st.roof,
          wall: st.wall, roof: st.roofColor, workplace: true, style: st, address: `${names[m % names.length]}`,
        });
        const door = this._zw(zone, cu, v - gh / 2 + 1.35);
        this._addWorkplace("muhtarlik", m % names.length, { door, path: [door, HUB], anchor: door, spread: 1.5, building: b });
      });
    }
    this._place(place, { anchors, anchorKeys, spread: 4, path: [this._zw(zone, 0, this._rowV(2))], mahalle: m });
  }

  /** Bir sakinin evi: yapının konumu ve yönü, kapı ve Green'e giden yol. */
  homeOf(slot) {
    const p = addressParts(slot);
    const zone = this.zones[p.mahalle % this.zones.length];
    const h = houseOf(slot);
    const perSokak = cap("daire_per_bina") * cap("bina_per_sokak");
    const first = p.mahalle * perMahalle() + p.sokak * perSokak + h.ev * h.birim;
    const q = this._housePos(zone, p.sokak, h.ev);
    return { bx: q.x, bz: q.z, rot: q.rot, door: q.door, path: [q.door, HUB], north: !q.back, parts: p, building: this.buildingBySlot0.get(first) };
  }

  workplaceOf(wp) {
    const list = this.workplaces[wp.kind];
    return list[wp.index] ?? list.find(Boolean);
  }

  placeOf(name) {
    return this.places[name] ?? this.places.meydan;
  }
}

/** Tabloda adı olmayan gelişim adımlarının adı (Strandstraße dükkânları ve villaları, sonraki mahallelerin yerleri). */
function stageName(key, villas) {
  const [kind, n] = key.split(":");
  const m = Number(n);
  switch (kind) {
    case "carsi": return villas?.has(key) ? "Eine neue Villa im Kurviertel" : "Ein neuer Laden in der Strandstraße";
    case "cami": return `Kirche ${mahalleName(m)}`;
    case "cay": return `Eisdiele ${mahalleName(m)}`;
    case "mpark": return `Park ${mahalleName(m)}`;
    case "oyun": return `Spielplatz ${mahalleName(m)}`;
    case "basket": return `Basketballplatz ${mahalleName(m)}`;
    default: return cat().isyerleri[kind]?.[m] ?? key;
  }
}

/** Oyun parkındaki aletler: tohuma göre seçilir ve yerleştirilir (her park farklı). */
export function playgroundItems(f) {
  const h = (n) => ((Math.imul((f.seed + 1) * 2654435761 + n * 40503, 2246822519) >>> 0) % 10000) / 10000;
  const pool = ["kule", "salincak", "tahterevalli", "yayli", "kum", "kubbe", "atlikarinca", "tirmanma"];
  // Karıştır; alanın büyüklüğüne göre (iki sütun × 7 m'lik sıralar) en çok 8 alet yerleştir.
  const order = pool.map((k, i) => [h(i + 1), k]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const SIZES = { kule: [5, 4], salincak: [4.5, 2.6], tahterevalli: [3.6, 1.2], yayli: [3, 1.4], kum: [3.4, 3.4], kubbe: [3.6, 3.6], atlikarinca: [3.2, 3.2], tirmanma: [4.4, 1.6] };
  const depth = f.d ?? 12, width = f.w ?? 18;
  const rows = Math.max(2, Math.floor((depth - 2) / 7));
  const colX = width >= 16 ? [-width / 4 - 0.5, width / 4 + 0.5] : [-3, 3];
  const cells = [];
  for (let r = 0; r < rows; r++) for (const cx of colX) cells.push([cx, -((rows - 1) * 7) / 2 + r * 7]);
  const n = Math.min(order.length, cells.length);
  const flip = h(21) < 0.5 ? -1 : 1;
  return order.slice(0, n).map((kind, i) => {
    const [cx, cz] = cells[i];
    const [w, d] = SIZES[kind];
    const rot = Math.floor(h(30 + i) * 4) * (Math.PI / 2) + (h(40 + i) - 0.5) * 0.3;
    return { kind, x: f.x + cx * flip + (h(50 + i) - 0.5) * 1.2, z: f.z + cz + (h(60 + i) - 0.5) * 0.8, w, d, rot, c: Math.floor(h(70 + i) * 5) };
  });
}

/**
 * Rıhtım duvarının noktaları, verilen iskele kesikleriyle: kesiğin uç noktaları [x, z, 1] (city.js orada duvarı
 * uzatmaz, şeridi iskeleye paralel bitirir), kesik boyunca null. Kesik iki nokta arasına da düşebilir (marina
 * iskelesi 2,4 m, nokta aralığı 5 m).
 */
export function rihtimNoktalari(wall, kesik) {
  const pts = [];
  for (let i = 0; i < wall.length; i++) {
    const a = wall[i - 1], b = wall[i];
    if (!b) { pts.push(null); continue; }
    if (a) for (const c of kesik) {
      if (c.xa >= b[0] || c.xb <= a[0]) continue;
      if (c.xa > a[0]) pts.push([c.xa, c.za, 1]);
      pts.push(null);
      if (c.xb < b[0]) pts.push([c.xb, c.zb, 1]);
    }
    if (!kesik.some((c) => b[0] > c.xa && b[0] < c.xb)) pts.push(b);
  }
  return pts;
}

/**
 * Konut katının planı: merdiven çekirdeği (2,4 m) ve daireler; birimler üst üste binmez. Tek katlı evde
 * (friesenhaus) çekirdek yok, daire binanın tamamı. Katta tek daire varsa (iki aileli ev) çekirdek sol yan
 * duvarda (ön cephede merdiven kapısı onun önünde), daire kalan genişlik. Daha çok dairede çekirdek ortada,
 * daireler iki yana bölüştürülür (tek sayıda solda bir fazla: 28 m apartmanda solda iki, sağda bir geniş
 * daire). Katta ikiden fazla daire varsa arkada ortak koridor bulunur. Hem dış cephe hem iç mekân bunu kullanır.
 * side: çekirdeğin dairenin hangi yanında kaldığının tersi (-1 çekirdek sağda, +1 solda, 0 çekirdek yok).
 */
export function unitLayout(b) {
  const W = 2.4, n = b.perFloor, hw = b.w / 2;
  if (b.floors === 1 && n === 1) {
    return { core: null, units: [{ col: 0, x0: -hw, x1: hw, cx: 0, side: 0 }], corridor: false, corridorDepth: 0 };
  }
  if (n === 1) {
    const x0 = -hw + W;
    return { core: [-hw, x0], units: [{ col: 0, x0, x1: hw, cx: (x0 + hw) / 2, side: 1 }], corridor: false, corridorDepth: 0 };
  }
  const L = Math.ceil(n / 2), R = n - L, uL = (hw - W / 2) / L, uR = (hw - W / 2) / R;
  const units = [];
  for (let c = 0; c < n; c++) {
    const x0 = c < L ? -hw + c * uL : W / 2 + (c - L) * uR, u = c < L ? uL : uR;
    units.push({ col: c, x0, x1: x0 + u, cx: x0 + u / 2, side: c < L ? -1 : 1 });
  }
  return { core: [-W / 2, W / 2], units, corridor: n > 2, corridorDepth: 1.5 };
}

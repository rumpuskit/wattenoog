// Olay modülleri için ortak yardımcılar (17 Kasım akşamı; düğün, film, yarış ve martı modülleri kullanır): yol boyunca
// konum (çizgi), trafik şeridi ve yol ağı üzerinde rota, sakin olmayan figürlerin görünümü ve duruşları, low-poly parçalar.
// Hepsi saf ve deterministik: aynı girdi her yerde aynı sonucu verir (video günün her saniyesini yeniden çizer).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { CLOTHES, BOTTOMS, SKIN, HAIR } from "./palette.js";
import { kesir } from "./olay-plan.js";

export const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const clamp01 = (u) => Math.max(0, Math.min(1, u));
export const lerp = (a, b, u) => a + (b - a) * u;
export const aci = (dx, dz) => Math.atan2(dx, dz);
/** Açı farkı (−π, π]. */
export const fark = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- çizgi ve rota

export function temizle(pts, min = 0.3) {
  const out = [pts[0]];
  for (const p of pts.slice(1)) if (p && Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > min) out.push(p);
  return out;
}

/** Köşeleri r yarıçaplı ikinci derece eğriyle yumuşatır (araç/bisikletli savrulmasın). */
export function yumusat(pts, r = 5, n = 6) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const d1 = [(b[0] - a[0]) / l1, (b[1] - a[1]) / l1], d2 = [(c[0] - b[0]) / l2, (c[1] - b[1]) / l2];
    if (d1[0] * d2[0] + d1[1] * d2[1] > 0.995) { out.push(b); continue; }
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const p1 = [b[0] - d1[0] * rr, b[1] - d1[1] * rr], p2 = [b[0] + d2[0] * rr, b[1] + d2[1] * rr];
    for (let k = 0; k <= n; k++) {
      const u = k / n, v = 1 - u;
      out.push([v * v * p1[0] + 2 * v * u * b[0] + u * u * p2[0], v * v * p1[1] + 2 * v * u * b[1] + u * u * p2[1]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return temizle(out, 0.05);
}

/** Çizgi: [[x, z], …] → { pts, cum, len, at(s, out) } (out: x, z, heading, nx/nz: sağ normal; s uçlara kenetlenir). */
export function cizgi(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  return {
    pts, cum, len,
    at(s, out = {}) {
      s = Math.max(0, Math.min(len, s));
      let lo = 1, hi = cum.length - 1;
      while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
      const j = Math.max(1, lo), u = (s - cum[j - 1]) / ((cum[j] - cum[j - 1]) || 1);
      const dx = pts[j][0] - pts[j - 1][0], dz = pts[j][1] - pts[j - 1][1], l = Math.hypot(dx, dz) || 1;
      out.x = pts[j - 1][0] + dx * u; out.z = pts[j - 1][1] + dz * u;
      out.heading = Math.atan2(dx, dz);
      // Sağ (x doğu, z güney; yön (sin h, cos h)): (−dz, dx)/l.
      out.nx = -dz / l; out.nz = dx / l;
      return out;
    },
  };
}

/** Noktanın çizgiye en yakın yeri: { s, d, x, z }. maxD verilirse yalnız o kadar yakın parçalar (ızgarayla, hızlı). */
export function enYakin(C, x, z, maxD = null) {
  let best = { s: 0, d: Infinity, x: 0, z: 0 };
  const P = C.pts;
  let liste = null;
  if (maxD != null) {
    if (!C._izgara) {
      C._izgara = new Map();
      for (let i = 1; i < P.length; i++) {
        const x0 = Math.floor(Math.min(P[i - 1][0], P[i][0]) / 20), x1 = Math.floor(Math.max(P[i - 1][0], P[i][0]) / 20);
        const z0 = Math.floor(Math.min(P[i - 1][1], P[i][1]) / 20), z1 = Math.floor(Math.max(P[i - 1][1], P[i][1]) / 20);
        for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) { const k = gx * 100003 + gz; if (!C._izgara.has(k)) C._izgara.set(k, []); C._izgara.get(k).push(i); }
      }
    }
    liste = new Set();
    const r = Math.ceil(maxD / 20);
    for (let gx = Math.floor(x / 20) - r; gx <= Math.floor(x / 20) + r; gx++) for (let gz = Math.floor(z / 20) - r; gz <= Math.floor(z / 20) + r; gz++) for (const i of C._izgara.get(gx * 100003 + gz) ?? []) liste.add(i);
  }
  for (const i of liste ?? P.keys()) {
    if (i < 1) continue;
    const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const qx = ax + dx * t, qz = az + dz * t, d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { s: C.cum[i - 1] + Math.sqrt(l2) * t, d, x: qx, z: qz };
  }
  return best;
}

/**
 * Sağ şerit boyunca rota: trafik ağında noktalar arasında art arda; her bacak bir öncekinin şeridinden ve yerinden
 * devam eder (geri dönüş, şerit atlama yok). Noktalar taşıt yolunun üstünde/kenarında olmalı. Dönüş: [[x, z]…] ya da null.
 */
export function seritYolu(traffic, noktalar) {
  if (!traffic?.lanes?.length) return null;
  const out = [];
  let cur = null;
  for (let k = 1; k < noktalar.length; k++) {
    const ob = traffic._laneOptions(noktalar[k]);
    if (!ob) return null;
    const goals = new Map(ob.opts.map((o) => [o.lane, Math.max(0.5, o.c)]));
    let starts;
    if (!cur) {
      const oa = traffic._laneOptions(noktalar[0]);
      if (!oa) return null;
      starts = oa.opts.map((o) => ({ lane: o.lane, c: Math.min(o.c, traffic.lanes[o.lane].len - 0.5) }));
    } else starts = [cur];
    const f = traffic._search(starts, goals);
    if (!f) return null;
    const seq = f.seq, cS = starts.find((s) => s.lane === seq[0])?.c ?? 0, cE = goals.get(seq[seq.length - 1]);
    const parca = [];
    traffic._lanesToPieces(parca, seq, cS, cE);
    for (const p of parca) out.push(...p.pts);
    cur = { lane: seq[seq.length - 1], c: cE };
  }
  return temizle(out, 0.25);
}

/**
 * Yol ağı (world.network) üzerinde orta çizgi rotası: noktalar en yakın düğüme oturtulur (≤ 40 m), aralarında tipler'deki
 * yollardan en kısa yol. Dönüş: [[x, z]…] ya da null (bağlantı yoksa).
 */
export function agYolu(world, noktalar, tipler) {
  const net = world.network;
  if (!net) return null;
  const izin = (e) => tipler.includes(e.road?.type);
  const kom = new Map();
  for (const e of net.edges) {
    if (!izin(e)) continue;
    const L = e.pts.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - e.pts[i - 1][0], p[1] - e.pts[i - 1][1]) : 0), 0);
    for (const [a, b, ters] of [[e.a, e.b, false], [e.b, e.a, true]]) {
      if (!kom.has(a.id)) kom.set(a.id, []);
      kom.get(a.id).push({ to: b.id, L, e, ters });
    }
  }
  const dugum = (p) => {
    let en = null, dm = 40;
    for (const n of net.nodes) { if (!kom.has(n.id)) continue; const d = Math.hypot(n.p[0] - p[0], n.p[1] - p[1]); if (d < dm) { dm = d; en = n; } }
    return en;
  };
  const ids = noktalar.map(dugum);
  if (ids.some((n) => !n)) return null;
  const out = [];
  for (let k = 1; k < ids.length; k++) {
    const A = ids[k - 1].id, B = ids[k].id;
    if (A === B) continue;
    const g = new Map([[A, 0]]), prev = new Map(), acik = new Set([A]);
    while (acik.size) {
      let u = null;
      for (const v of acik) if (u == null || g.get(v) < g.get(u)) u = v;
      acik.delete(u);
      if (u === B) break;
      for (const k2 of kom.get(u) ?? []) {
        const c = g.get(u) + k2.L;
        if (c < (g.get(k2.to) ?? Infinity)) { g.set(k2.to, c); prev.set(k2.to, { from: u, k: k2 }); acik.add(k2.to); }
      }
    }
    if (!prev.has(B)) return null;
    const yol = [];
    for (let v = B; v !== A; v = prev.get(v).from) yol.push(prev.get(v).k);
    yol.reverse();
    for (const k2 of yol) out.push(...(k2.ters ? [...k2.e.pts].reverse() : k2.e.pts));
  }
  return temizle(out, 0.3);
}

// ---------------------------------------------------------------- figürler (sakin olmayan)

const RENK = new Map();
export const renk = (hex) => { let c = RENK.get(hex); if (!c) RENK.set(hex, (c = new THREE.Color(hex))); return c; };

/** Sakin olmayan bir figürün görünümü (tohumdan): ust/alt verilirse o renkler (hex ya da Color). */
export function gorunum(tohum, ust = null, alt = null, o = {}) {
  const f = (k) => kesir("figur", tohum, k);
  const kadin = o.kadin ?? f(0) < 0.5;
  const c = (v) => (typeof v === "string" ? renk(v) : v);
  return {
    style: o.style ?? (kadin ? [2, 3, 4, 7][Math.floor(f(1) * 4)] : [0, 1, 5, 6][Math.floor(f(1) * 4)]),
    skin: SKIN[Math.floor(f(2) * SKIN.length)], hairColor: HAIR[Math.floor(f(3) * 5)],
    top: c(ust) ?? CLOTHES[Math.floor(f(4) * CLOTHES.length)], bottom: c(alt) ?? BOTTOMS[Math.floor(f(5) * BOTTOMS.length)],
    sleeves: o.sleeves ?? true, beard: !kadin && f(6) < 0.25, glasses: f(7) < 0.12, hat: o.hat ?? null, hatColor: o.hatColor ? c(o.hatColor) : null,
    shorts: !!o.shorts, height: o.height ?? (kadin ? 1.6 : 1.72) + f(8) * 0.14,
  };
}

/** İki kemik bacak ters kinematiği (people.js legIK ile aynı; bisiklet pedalı). */
function bacakIK(dz, dy) {
  const L1 = 0.45, L2 = 0.47, d = Math.min(L1 + L2 - 1e-3, Math.hypot(dz, dy));
  const alpha = Math.atan2(dz, -dy);
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2))));
  const beta = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  return { hip: alpha + beta, knee };
}
/** Bisiklet sürüşü (people.js "bike" ile aynı): sele 0,95 m, pedallar krank açısında; p.y = zemin. */
export function bisikletPoz(p, krank, egil = 0.42) {
  const kk = p.height / 1.75, ground = p.y;
  p.y = ground + 0.95 - 0.92 * kk;
  p.groundY = ground;
  for (const [yan, hk, kn] of [[0, "hipL", "kneeL"], [Math.PI, "hipR", "kneeR"]]) {
    const fz = 0.32 + 0.17 * Math.sin(krank + yan), fy = 0.3 + 0.17 * Math.cos(krank + yan);
    const ik = bacakIK(fz / kk, (fy - 0.95) / kk);
    p[hk] = ik.hip; p[kn] = ik.knee;
  }
  p.lean = egil; p.shL = p.shR = 1.0; p.elL = p.elR = 0.35; p.abL = p.abR = 0.06; p.headPitch = -0.3;
  p.props = ["bisiklet"]; p.moving = true;
}

/**
 * Seyirci/katılımcı duruşları (p: sıfırlanmış duruş): cek (telefonla çeker), goster (eliyle gösterir), sasir (eller
 * başta), alkis (alkışlar), salla (el sallar), gul (güler: geriye yaslanır, karnını tutar), konus/bak.
 * bak: başın dönmesi gereken açı (gövdeye göre). idle: people.js idleGesture.
 */
export function tavirPoz(p, tavir, t, ph, bak, idle) {
  switch (tavir) {
    case "cek": p.shR = 1.45; p.elR = 0.35; p.shL = 0.5; p.elL = 1.2; p.props = ["telefon"]; p.headPitch = -0.05; break;
    case "goster": { const g = Math.max(0, Math.sin(t * 0.7 + ph)); p.shR = 0.4 + 1.0 * g; p.elR = 0.2; p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.8; idle(p, t, ph, false); break; }
    case "sasir": p.shL = p.shR = 2.3; p.elL = p.elR = 2.4; p.abL = p.abR = 0.25; p.headPitch = -0.08; break;
    case "alkis": { const w = Math.abs(Math.sin(t * 7 + ph)); p.shL = p.shR = 0.95; p.abL = p.abR = -0.25 + 0.25 * w; p.elL = p.elR = 1.25; p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.7; break; }
    case "salla": { const w = Math.sin(t * 6 + ph); p.shR = 2.5; p.elR = 0.35; p.abR = 0.25 + 0.3 * w; p.shL = 0.1; p.headYaw = Math.max(-1, Math.min(1, bak)) * 0.8; break; }
    case "gul": { const w = Math.abs(Math.sin(t * 5 + ph)); p.lean = -0.18 - 0.06 * w; p.headPitch = -0.3; p.shL = 0.5; p.elL = 1.5; p.abL = -0.1; p.shR = 0.3 + 0.9 * Math.max(0, Math.sin(t * 0.8 + ph)); p.elR = 0.3; p.y += 0.015 * w; break; }
    default: idle(p, t, ph, tavir === "konus"); p.headYaw = p.headYaw * 0.4 + Math.max(-1, Math.min(1, bak)) * 0.6;
  }
}

// ---------------------------------------------------------------- low-poly parçalar

/** Geometriye tek renk (vertex color). */
export function boya(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  if (g.attributes.uv) g.deleteAttribute("uv");
  return g;
}
export function birlestir(parcalar) {
  const g = mergeGeometries(parcalar);
  g.computeVertexNormals();
  return g;
}
export const kutu = (w, h, d, x, y, z, hex, ry = 0, rx = 0, rz = 0) => boya(new THREE.BoxGeometry(w, h, d).rotateZ(rz).rotateX(rx).rotateY(ry).translate(x, y, z), hex);
export const silindir = (rt, rb, h, x, y, z, hex, seg = 8, rx = 0, rz = 0) => boya(new THREE.CylinderGeometry(rt, rb, h, seg).rotateZ(rz).rotateX(rx).translate(x, y, z), hex);
let _mat = null;
export const malzeme = () => (_mat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, flatShading: true }));

/** Yazılı doku (pankart, levha): metin ortada, zemin rengi; canvas w×h. */
export function yaziDoku(metin, { zemin = "#ffffff", renk: yr = "#1a1a1a", w = 512, h = 128, font = "bold 84px sans-serif", serit = null } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = zemin; x.fillRect(0, 0, w, h);
  if (serit) { x.fillStyle = serit; for (let i = -h; i < w; i += h * 0.7) { x.beginPath(); x.moveTo(i, h); x.lineTo(i + h * 0.35, h); x.lineTo(i + h * 0.35 + h, 0); x.lineTo(i + h, 0); x.fill(); } }
  if (metin) { x.fillStyle = yr; x.font = font; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(metin, w / 2, h / 2 + 4); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Işıma (ışık kaynağı yerine; PointLight yok): yumuşak, additive sprite malzemesi. */
let _isimaDoku = null;
export function isimaMalzeme(hex = "#fff4d0", opacity = 0.7) {
  if (!_isimaDoku) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 1, 32, 32, 31);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    _isimaDoku = new THREE.CanvasTexture(c);
  }
  return new THREE.SpriteMaterial({ map: _isimaDoku, color: hex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

/** Yürünebilir, taşıt yolunun dışında bir nokta mı (seyirci/görevli yeri). */
export function yayaYeri(world, traffic, x, z) {
  if (!world.isWalkable?.(x, z)) return false;
  if (world.inCarriage?.(x, z)) return false;
  if (traffic?.locate?.([x, z], 3.6, ["cadde", "sokak", "koy", "giris"])) return false;
  return true;
}

// ---------------------------------------------------------------- açık alan ve tur halkası (Wattenoog, 20 Kasım)

/** Ağaç ve küçük engeller (ağaç, bank, lamba, çeşme, çöp kutusu…) merkezin r metre çevresinde: [x, z, yarıçap]. */
export function engeller(world, merkez, r) {
  const yakin = (x, z) => Math.hypot(x - merkez[0], z - merkez[1]) < r;
  const out = [];
  for (const t of world.trees ?? []) if (yakin(t.x, t.z)) out.push([t.x, t.z, 2.5]);
  for (const f of world.features ?? []) if (f.x != null && yakin(f.x, f.z)) out.push([f.x, f.z, f.type === "agac" ? 2.5 : f.r ?? (f.type === "brunnen" || f.type === "cesme" ? 6 : 0.8)]);
  for (const l of world.lamps ?? []) if (yakin(l.x, l.z)) out.push([l.x, l.z, 0.5]);
  return out;
}

/** Merkez çevresinde engellerden (≥ pay m) uzak, yürünebilir kapalı halka: her açıda r0'dan rMax'a (sayı ya da açının işlevi)
 *  ilk uygun yarıçap, sonra
 *  komşuların en büyüğüyle yumuşatılır. icinde(x, z) verilirse halka onun içinde kalır. Dönüş: nokta dizisi ya da null. */
export function turHalkasi(world, merkez, { r0, rMax, pay = 3, N = 72, icinde = null, ek = [] }) {
  const E = [...engeller(world, merkez, (typeof rMax === "function" ? 200 : rMax) + 20), ...ek], rr = [];
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2, ra = typeof r0 === "function" ? r0(a) : r0, rm = typeof rMax === "function" ? rMax(a) : rMax;
    let r = ra;
    for (; r <= rm; r += 1) {
      const x = merkez[0] + Math.cos(a) * r, z = merkez[1] + Math.sin(a) * r;
      if (world.isWalkable?.(x, z) && !world.inCarriage?.(x, z) && (!icinde || icinde(x, z)) && !E.some(([ex, ez, er]) => Math.hypot(ex - x, ez - z) < er + pay)) break;
    }
    if (r > rm) return null;
    rr.push(r);
  }
  const rs = rr.map((_, k) => Math.max(...[-3, -2, -1, 0, 1, 2, 3].map((d) => rr[(k + d + N) % N])));
  const out = [];
  for (let k = 0; k <= N; k++) { const a = (k / N) * Math.PI * 2, r = rs[k % N]; out.push([merkez[0] + Math.cos(a) * r, merkez[1] + Math.sin(a) * r]); }
  return out;
}

/** Merkeze rMin–rMax uzaklıkta uz × en metrelik açık alan (çim; bina, ağaç, yol, su yok): { x, z, h } ya da null.
 *  Zeplin/balon inişi için yedek (Wattenoog'da saha ve park açılmadan önce). Saf: aynı dünya hep aynı yeri verir. */
export function acikAlan(world, merkez, { uz, en, rMin = 120, rMax = 700, adim = 30 }) {
  const E = engeller(world, merkez, rMax + uz).filter(([, , r]) => r >= 2.5);
  const binalar = world.buildings.filter((b) => Math.hypot(b.x - merkez[0], b.z - merkez[1]) < rMax + uz);
  // Yol noktaları (her türden yol, toprak yol dahil; 4 m arayla): alan yolun üstüne düşmesin.
  const yolN = [];
  for (const e of world.network?.edges ?? []) for (let i = 1; i < e.pts.length; i++) {
    const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i], L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 4);
    for (let j = 0; j <= n; j++) { const x = ax + ((bx - ax) * j) / n, z = az + ((bz - az) * j) / n; if (Math.hypot(x - merkez[0], z - merkez[1]) < rMax + uz) yolN.push([x, z]); }
  }
  for (let r = rMin; r <= rMax; r += adim) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / adim));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, x = merkez[0] + Math.sin(a) * r, z = merkez[1] + Math.cos(a) * r;
      for (const h of [0, Math.PI / 2]) {
        const c = Math.cos(h), s = Math.sin(h);
        let ok = true, hMin = Infinity, hMax = -Infinity;
        for (let u = -uz / 2; u <= uz / 2 && ok; u += 6) for (let v = -en / 2; v <= en / 2 && ok; v += 6) {
          const px = x + c * u - s * v, pz = z + s * u + c * v;
          if (!world.isWalkable?.(px, pz) || world.inCarriage?.(px, pz) || !(world.isLand?.(px, pz) ?? true)) ok = false;
          const hh = world.height?.(px, pz) ?? 1; hMin = Math.min(hMin, hh); hMax = Math.max(hMax, hh);
        }
        // Düz ve kuru (kumul yamacı, set, bataklık kıyısı değil).
        if (!ok || hMax - hMin > 1.2 || hMin < 1.0) continue;
        if (E.some(([ex, ez, er]) => { const dx = ex - x, dz = ez - z, u = dx * c + dz * s, v = -dx * s + dz * c; return Math.abs(u) < uz / 2 + er + 4 && Math.abs(v) < en / 2 + er + 4; })) continue;
        if (yolN.some(([ex, ez]) => { const dx = ex - x, dz = ez - z, u = dx * c + dz * s, v = -dx * s + dz * c; return Math.abs(u) < uz / 2 + 6 && Math.abs(v) < en / 2 + 6; })) continue;
        if (binalar.some((b) => { const dx = b.x - x, dz = b.z - z, u = dx * c + dz * s, v = -dx * s + dz * c, br = Math.max(b.w ?? 6, b.d ?? 6) / 2; return Math.abs(u) < uz / 2 + br + 6 && Math.abs(v) < en / 2 + br + 6; })) continue;
        return { x, z, h };
      }
    }
  }
  return null;
}

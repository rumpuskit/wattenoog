// Bayraklar ve tatil süsleri (Almanya, Kuzey Denizi adası). Marktplatz'taki ve Rathaus önündeki direklerde her gün ada
// bayrağı ve Almanya bayrağı dalgalanır; bazı evlerin bahçesinde yıl boyu ada bayraklı bahçe direği vardır (Kuzey
// Almanya'da yaygın). Resmî bayrak günlerinde (1 Mayıs, 9 Mayıs, 23 Mayıs, 3 Ekim) kamu binalarının önünde Almanya
// bayrağı. Silvester gece yarısı limanın açığında havai fişek. Advent'ten (Noel'den önceki 4. pazar) 6 Ocak'a dek
// pencerelerde sıcak beyaz ışık yayları ve saçak ışıkları, Marktplatz'ta Weihnachtsbaum.
import * as THREE from "three";
import { civilFromDays, daysFromCivil, holidayOf, weekday } from "../sim.js";
import { FLAT_Y, FLOOR_H } from "./layout.js";
import { sunTimes } from "./sky.js";

function monthDay(day) {
  const [, m, d] = civilFromDays(day);
  return [m, d];
}

/** Resmî bayrak günü mü (kamu binalarında Almanya bayrağı)? */
export function bayramOf(day) {
  if (holidayOf(day) === "maifeiertag" || holidayOf(day) === "einheit") return true;
  const [m, d] = monthDay(day);
  return m === 5 && (d === 9 || d === 23);
}

function halloweenOf() {
  return false; // Wattenoog'da Halloween süsü yok (31 Ekim Reformationstag)
}

/** Advent: Noel'den önceki 4. pazardan 6 Ocak'a dek. */
function christmasOf(day) {
  const [y, m, d] = civilFromDays(day);
  if (m === 1) return d <= 6;
  const xmas = daysFromCivil(y, 12, 25);
  const firstAdvent = xmas - ((weekday(xmas) + 1) % 7 || 7) - 21; // Noel'den önceki pazar − 3 hafta
  return day >= firstAdvent && m >= 11;
}

/** Havai fişek zamanı: Silvester gece yarısı (1 Ocak 00:00–00:25). */
function fireworksOn(day, minute) {
  const [m, d] = monthDay(day);
  return m === 1 && d === 1 && minute < 25;
}

function canvasFlag(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Almanya bayrağı: siyah-kırmızı-altın yatay şeritler (5:3; düzlem 19:10 olduğu için hafif uzar, fark edilmez). */
function deFlagTexture() {
  return canvasFlag(500, 300, (g, w, h) => {
    [["#000000", 0], ["#dd0000", 1], ["#ffce00", 2]].forEach(([c, i]) => { g.fillStyle = c; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); });
  });
}

/** Wattenoog ada bayrağı: mavi zemin, ortada beyaz dalga şeridi, üst köşede uçan beyaz martı (siyasi çağrışım yok). */
function flagTexture() {
  return canvasFlag(494, 260, (g, w, h) => {
    g.fillStyle = "#1f5fa8"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e8c33a"; g.fillRect(0, h * 0.78, w, h * 0.22); // altta kum sarısı şerit
    g.strokeStyle = "#ffffff"; g.lineWidth = h * 0.09; g.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = h * 0.62 + Math.sin((x / w) * Math.PI * 4) * h * 0.05; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    // Martı: iki kavisli kanat.
    g.lineWidth = h * 0.05; g.lineCap = "round"; g.beginPath();
    const cx = w * 0.3, cy = h * 0.3, s = h * 0.16;
    g.moveTo(cx - s * 1.6, cy); g.quadraticCurveTo(cx - s * 0.7, cy - s * 0.9, cx, cy + s * 0.2); g.quadraticCurveTo(cx + s * 0.7, cy - s * 0.9, cx + s * 1.6, cy);
    g.stroke();
  });
}

/** Dalgalanan bayrak malzemesi: gönder tarafı (uv.x = 0) sabit, uç tarafı rüzgârda dalgalanır. */
function waveMaterial(map, amp, uniforms) {
  const m = new THREE.MeshStandardMaterial({ map, roughness: 0.8, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        {
          vec4 ip = instanceMatrix[3];
          float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
          float u = uv.x;
          transformed.z += ${amp.toFixed(3)} * u * sin(u * 5.5 - uTime * 4.2 + ph);
          transformed.y -= ${(amp * 0.6).toFixed(3)} * u * u * (0.6 + 0.4 * sin(uTime * 1.3 + ph));
        }`);
  };
  return m;
}

const hsh = (b, salt) => (Math.imul((Math.round(b.x * 7) ^ Math.round(b.z * 13) ^ (salt * 7919)) | 0, 2654435761) >>> 0) / 4294967296;

/** Evin önü (yerel): bahçe bayrak direğinin yeri (ön bahçenin köşesi). Apartmanlarda yok. */
function porchOf(b) {
  const front = b.d / 2;
  if (b.house === "mehrfamilienhaus") return { pumpkins: [], deck: 0.1, flag: null };
  return { pumpkins: [], deck: 0.1, flag: [b.w / 2 + 0.8, front + (b.yard ?? 4) - 0.8, 0] };
}

export function buildBayram(world) {
  const group = new THREE.Group(); // bayrak günleri
  group.visible = false;
  const uniforms = { uTime: { value: 0 } };
  const tex = flagTexture(), deTex = deFlagTexture();
  // Bayrak düzlemi: sol kenar (gönder tarafı) x = 0'da, üst kenar y = 0'da; 1 × 10/19 m, ölçeklenir.
  const flagGeo = new THREE.PlaneGeometry(1, 10 / 19, 10, 2).translate(0.5, -5 / 19, 0);
  const poleMat = new THREE.MeshStandardMaterial({ color: "#e4e6e9", roughness: 0.4, metalness: 0.6 });
  const poleGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0);
  const knobGeo = new THREE.SphereGeometry(1, 10, 8);
  const gold = new THREE.MeshStandardMaterial({ color: "#e8c35a", roughness: 0.3, metalness: 0.7 });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), TILT = new THREE.Vector3(1, 0, 0);
  const mat4 = (x, y, z, rot, w, tilt = 0) => {
    q.setFromAxisAngle(UP, rot);
    if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(TILT, tilt));
    return m4.compose(p.set(x, y, z), q, sc.set(w, w, w)).clone();
  };
  const toWorld = (b, lx, lz) => {
    const c = Math.cos(b.rot), s = Math.sin(b.rot);
    return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
  };
  const inst = (geo, mat, list, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
    list.forEach((mm, i) => m.setMatrixAt(i, mm));
    m.count = list.length;
    m.castShadow = shadow;
    m.frustumCulled = false;
    return m;
  };

  // --- bayrak günleri: kamu binalarının önünde direk ve Almanya bayrağı ---
  const wave = [], poles = [];
  for (const b of world.buildings) {
    if (!["okul", "saglik", "karakol", "adliye", "kutuphane", "muze", "belediye"].includes(b.kind)) continue;
    const ahead = b.d / 2 + 4, side = b.w * 0.36;
    const x = b.x + Math.sin(b.rot) * ahead + Math.cos(b.rot) * side, z = b.z + Math.cos(b.rot) * ahead - Math.sin(b.rot) * side;
    if (!world.isLand(x, z)) continue;
    const y = world.groundY(x, z);
    poles.push({ x, y, z, h: 8, r: 0.06 });
    wave.push(mat4(x, y + 8 - 0.15, z, b.rot - Math.PI / 2, 1.9));
  }
  // Bahçe direkleri (yıl boyu, evlerin ~%12'sinde): 6 m direk, ada bayrağı.
  const porchFlags = { always: [], holiday: [] };
  const gardenPoles = [];
  for (const b of world.buildings) {
    if (!b.house) continue;
    const pr = porchOf(b);
    if (!pr.flag || hsh(b, 1) > 0.12) continue;
    const [x, z] = toWorld(b, pr.flag[0], pr.flag[1]);
    if (!world.isLand(x, z)) continue;
    const y = world.groundY(x, z);
    gardenPoles.push({ x, y, z, h: 6, r: 0.05 });
    porchFlags.always.push(mat4(x, y + 6 - 0.1, z, b.rot - Math.PI / 2, 1.3));
  }
  group.add(inst(flagGeo, waveMaterial(deTex, 0.1, uniforms), wave));
  group.add(inst(poleGeo, poleMat, poles.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y, o.z), q.identity(), sc.set(o.r * 2, o.h, o.r * 2)))));
  group.add(inst(knobGeo, gold, poles.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h + o.r * 1.6, o.z), q.identity(), sc.setScalar(o.r * 1.9)))));

  const fireworks = buildFireworks(world);

  // --- her gün: Rathaus önündeki direkler (ada ve Almanya bayrağı), bahçe direkleri ---
  const mast = new THREE.Group();
  const mastU = { uTime: { value: 0 } };
  const masts = world.features.filter((f) => f.type === "gonder").map((f) => ({ x: f.x, y: world.groundY(f.x, f.z), z: f.z, h: 12, r: 0.1, de: !!f.de }));
  if (masts.length) {
    for (const [list, t] of [[masts.filter((o) => !o.de), tex], [masts.filter((o) => o.de), deTex]]) {
      if (list.length) mast.add(inst(flagGeo, waveMaterial(t, 0.13, mastU), list.map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h - 0.15, o.z), q.identity(), sc.setScalar(3.2)))));
    }
    mast.add(inst(poleGeo, poleMat, masts.concat(gardenPoles).map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y, o.z), q.identity(), sc.set(o.r * 2, o.h, o.r * 2)))));
    mast.add(inst(knobGeo, gold, masts.concat(gardenPoles).map((o) => new THREE.Matrix4().compose(p.set(o.x, o.y + o.h + o.r * 1.6, o.z), q.identity(), sc.setScalar(o.r * 1.9)))));
  }
  mast.add(inst(flagGeo, waveMaterial(tex, 0.05, mastU), porchFlags.always, false));
  mast.add(fireworks.points);

  // --- Halloween: verandalarda balkabakları (gece içleri yanar) ---
  const halloween = new THREE.Group();
  halloween.visible = false;
  const pumpkinMat = new THREE.MeshStandardMaterial({ color: "#e0772a", roughness: 0.7, emissive: new THREE.Color("#ff8a1e"), emissiveIntensity: 0 });
  const pumpkins = [], stems = [];
  for (const b of world.buildings) {
    if (!b.house || hsh(b, 2) > 0.7) continue;
    const pr = porchOf(b);
    pr.pumpkins.forEach(([lx, lz], i) => {
      if (i > 0 && hsh(b, 3 + i) > 0.6) return;
      const [x, z] = toWorld(b, lx, lz);
      const s = 0.34 + hsh(b, 9 + i) * 0.16;
      pumpkins.push(new THREE.Matrix4().compose(p.set(x, FLAT_Y + pr.deck + s * 0.7, z), q.identity(), sc.set(s, s * 0.78, s)));
      stems.push(new THREE.Matrix4().compose(p.set(x, FLAT_Y + pr.deck + s * 1.45, z), q.identity(), sc.set(1, 1, 1)));
    });
  }
  halloween.add(inst(new THREE.SphereGeometry(1, 12, 8).scale(1, 1, 1), pumpkinMat, pumpkins));
  halloween.add(inst(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 5), new THREE.MeshStandardMaterial({ color: "#4f6b2a" }), stems, false));

  // --- Aralık: saçak ışıkları ve Green'de Noel ağacı ---
  const christmas = new THREE.Group();
  christmas.visible = false;
  // Ampuller: örnek rengiyle çarpılan tonsuz malzeme (gece parlak, gündüz soluk).
  const bulbMat = new THREE.MeshBasicMaterial({ color: "#8c8c8c", toneMapped: false });
  const bulbs = [], bulbColors = [];
  const COLORS = ["#fff2d6", "#ffe9c2", "#fff6e6"]; // Kuzey Almanya: sıcak beyaz
  for (const b of world.buildings) {
    if (!b.house || hsh(b, 5) > 0.65) continue;
    const y = FLAT_Y + b.floors * FLOOR_H + 0.05;
    const warm = hsh(b, 6) < 0.4; // bir kısmında tek renk sıcak beyaz
    for (let lx = -b.w / 2; lx <= b.w / 2 + 0.01; lx += 0.5) {
      const [x, z] = toWorld(b, lx, b.d / 2 + 0.42);
      bulbs.push(new THREE.Matrix4().compose(p.set(x, y, z), q.identity(), sc.setScalar(1)));
      bulbColors.push(warm ? "#fff2d6" : COLORS[bulbs.length % COLORS.length]);
    }
  }
  const bulbMesh = inst(new THREE.SphereGeometry(0.07, 5, 4), bulbMat, bulbs, false);
  bulbColors.forEach((c, i) => bulbMesh.setColorAt(i, new THREE.Color(c)));
  christmas.add(bulbMesh);
  // Weihnachtsbaum (Marktplatz'ın kuzeydoğu köşesi): üç katlı koni, sıcak beyaz ışıklar, tepede yıldız.
  {
    const tx = 30, tz = -22, y = world.groundY(tx, tz);
    const tree = new THREE.MeshStandardMaterial({ color: "#2f5a34", roughness: 0.9, flatShading: true });
    for (const [r, h, yy] of [[3.4, 4.2, 1.6], [2.7, 3.6, 4.0], [1.9, 3.0, 6.2]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 10), tree);
      c.position.set(tx, y + yy + h / 2, tz);
      c.castShadow = true;
      christmas.add(c);
    }
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 1.8, 8), new THREE.MeshStandardMaterial({ color: "#5f4a3a" }));
    trunk.position.set(tx, y + 0.9, tz);
    christmas.add(trunk);
    const tb = [];
    for (let k = 0; k < 90; k++) {
      const t = k / 90, a = k * 2.4, hh = 1.8 + t * 7.0, rr = 3.3 * (1 - t) + 0.2;
      tb.push(new THREE.Matrix4().compose(p.set(tx + Math.cos(a) * rr, y + hh, tz + Math.sin(a) * rr), q.identity(), sc.setScalar(1.6)));
    }
    const treeBulbs = inst(new THREE.SphereGeometry(0.07, 5, 4), bulbMat, tb, false);
    tb.forEach((_, i) => treeBulbs.setColorAt(i, new THREE.Color(COLORS[i % COLORS.length])));
    christmas.add(treeBulbs);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshStandardMaterial({ color: "#ffd75a", emissive: new THREE.Color("#ffcf3a"), emissiveIntensity: 1.2 }));
    star.position.set(tx, y + 9.4, tz);
    christmas.add(star);
  }
  mast.add(halloween, christmas);

  let active = null, sunDay = null, sun = null;
  return {
    group,
    mast,
    counts: { lamba: wave.length - poles.length, direk: poles.length, veranda: porchFlags.always.length + porchFlags.holiday.length, balkabagi: pumpkins.length, isik: bulbs.length },
    /** px: çizim tamponu yüksekliği / 900 (parçacıklar her çözünürlükte aynı büyüklükte görünsün). */
    update(day, minute, real, px = 1) {
      mastU.uTime.value = real;
      uniforms.uTime.value = real;
      const on = bayramOf(day);
      if (on !== active) { group.visible = on; active = on; }
      if (sunDay !== day) { sun = sunTimes(day); sunDay = day; }
      // Işıklar gün batımından yarım saat önce yanar, gün doğumunda söner.
      const dark = minute > (sun.set ?? 1080) - 30 || minute < (sun.rise ?? 400);
      halloween.visible = halloweenOf(day);
      pumpkinMat.emissiveIntensity = halloween.visible && dark ? 1.4 : 0.05;
      christmas.visible = christmasOf(day);
      bulbMat.color.setScalar(dark ? 1.9 : 0.55);
      fireworks.update(fireworksOn(day, minute), real, px);
    },
  };
}

/**
 * Havai fişek: Harbor Bay'in üstünde. Altı fişek sırayla atılır; her biri yükselen bir iz, patlama anında parlama
 * ve 140 parçacıktan oluşur. Parçacıkların hızı ve yönü biraz rastgele (kusursuz küre değil), arkalarında kısa bir
 * iz bırakır, yerçekimiyle düşer, sönerken titreşir. Konumlar gölgelendiricide hesaplanır (CPU'da iş yok).
 */
function buildFireworks(world) {
  const BURSTS = 6, N = 140, TRAIL = 4;
  const count = BURSTS * (N * TRAIL + 1 + 12);
  const dir = new Float32Array(count * 3), info = new Float32Array(count * 4);
  let k = 0;
  const rnd = (n) => { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); };
  for (let b = 0; b < BURSTS; b++) {
    for (let i = 0; i < N; i++) {
      const y = 1 - (2 * (i + rnd(i + b * 31))) / N, r = Math.sqrt(Math.max(0, 1 - y * y)), a = i * 2.39996 + rnd(i * 7 + b) * 0.5;
      const sp = 0.78 + rnd(i * 3 + b * 17) * 0.3;
      for (let t = 0; t < TRAIL; t++, k++) {
        dir.set([Math.cos(a) * r * sp, y * sp, Math.sin(a) * r * sp], k * 3);
        info.set([b, 0, t, rnd(i * 11 + b * 5)], k * 4); // [fişek, tür 0: parçacık, iz sırası, rastgele]
      }
    }
    dir.set([0, 0, 0], k * 3); info.set([b, 1, 0, 0], k * 4); k++; // patlama parlaması
    for (let t = 0; t < 12; t++, k++) { dir.set([0, 0, 0], k * 3); info.set([b, 2, t, 0], k * 4); } // yükselen iz
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("aDir", new THREE.BufferAttribute(dir, 3));
  geo.setAttribute("aInfo", new THREE.BufferAttribute(info, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
  // Koyun ortası, Ferry Landing'in açığı (kasabadan ve iskeleden görünür).
  const pier = world.ferryPier ?? { z1: 300 };
  const uniforms = { uTime: { value: 0 }, uBase: { value: new THREE.Vector3(150, 0, pier.z1 + 160) }, uPx: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aDir; attribute vec4 aInfo;
      uniform float uTime; uniform vec3 uBase; uniform float uPx;
      varying vec3 vColor; varying float vA;
      float h(float n) { return fract(sin(n * 91.345) * 47453.5453); }
      void main() {
        float b = aInfo.x, kind = aInfo.y, tr = aInfo.z, rn = aInfo.w;
        float period = 3.4, rise = 1.1;
        float tt = uTime + b * period / 6.0 * 1.37;
        float cyc = floor(tt / period), lt = mod(tt, period);
        float s = cyc * 7.0 + b * 13.0;
        vec3 o = uBase + vec3((h(s) - 0.5) * 90.0, 70.0 + h(s + 1.0) * 55.0, (h(s + 2.0) - 0.5) * 60.0);
        float pick = h(s + 4.0);
        // Kırmızı, beyaz, mavi ağırlıklı; ara sıra altın.
        vec3 c = pick < 0.35 ? vec3(1.0, 0.16, 0.2) : pick < 0.65 ? vec3(1.0, 0.97, 0.94) : pick < 0.9 ? vec3(0.3, 0.5, 1.0) : vec3(1.0, 0.75, 0.25);
        vec3 p; float a = 0.0, size = 2.0;
        float bt = lt - rise; // patlamadan beri geçen süre
        if (kind > 1.5) {
          float u = clamp((lt - tr * 0.025) / rise, 0.0, 1.0);
          p = vec3(o.x, mix(2.0, o.y, 1.0 - (1.0 - u) * (1.0 - u)), o.z);
          a = lt < rise ? (1.0 - tr / 12.0) * 0.9 : 0.0;
          c = vec3(1.0, 0.8, 0.5); size = 3.0;
        } else if (kind > 0.5) {
          p = o; a = bt > 0.0 ? exp(-bt * 9.0) * 3.0 : 0.0; size = 60.0; c = mix(c, vec3(1.0), 0.6);
        } else {
          float t = max(bt - tr * 0.045, 0.0);
          float spd = 30.0 + h(s + 3.0) * 14.0;
          float drag = (1.0 - exp(-t * 1.5)) / 1.5;
          p = o + aDir * spd * drag + vec3(0.0, -3.8 * t * t, 0.0);
          float life = 1.7 + rn * 0.8;
          a = bt > tr * 0.045 ? (1.0 - smoothstep(life * 0.55, life, t)) : 0.0;
          a *= (1.0 - tr / float(${TRAIL})) * (0.75 + 0.25 * sin(uTime * 37.0 + rn * 40.0));
          size = 4.6 - tr * 0.8;
        }
        vColor = c; vA = a;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = clamp(size * 420.0 / -mv.z, 1.2, kind > 0.5 && kind < 1.5 ? 140.0 : 18.0) * uPx;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float f = exp(-d * d * 18.0);
        gl_FragColor = vec4(vColor * f * vA * 1.5, f * vA);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = false;
  return {
    points,
    update(on, real, px) {
      points.visible = on;
      if (on) { uniforms.uTime.value = real; uniforms.uPx.value = px; }
    },
  };
}

// Kuzey Alman ada yapıları ve eşyası (Wattenoog'a özgü; düzen layout.js): Marktbrunnen, yel değirmeni (Galerieholländer),
// tuğla su kulesi ve seyir platformu, kuş gözlem kulesi, set koyunları, Inselbahn (ray, peron, tren), fok havuzları,
// Musikmuschel, Fischbude ayakta masaları, tenis ağları, Kleingarten parselleri, bisiklet parkları. Hareketsiz parçalar
// renkli köşeli tek geometride birleşir; dönen kanatlar, tren ve koyunlar ayrı.
import * as THREE from "three";
import { box, colored, cyl, merged, MAT } from "./harbor.js";
import { FERRY } from "./ferry.js";

const ROT = (g, r) => g.rotateY(r);

/** Polilinde s uzunluğundaki nokta ve yön açısı. */
function along(pts, s) {
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === pts.length - 1) {
      const t = Math.max(0, Math.min(1, s / L));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, a: Math.atan2(bx - ax, bz - az) };
    }
    s -= L;
  }
  return { x: pts[0][0], z: pts[0][1], a: 0 };
}
const lengthOf = (pts) => pts.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);

export function buildKuzey(world) {
  const group = new THREE.Group();
  const parts = [];
  const gy = (x, z) => world.groundY(x, z);
  const anims = [];
  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });

  for (const f of world.features) {
    switch (f.type) {
      case "brunnen": {
        // Marktbrunnen: sekizgen granit havuz, ortada sütun ve üstünde çapa; su yüzeyi.
        const y = gy(f.x, f.z);
        parts.push(colored(new THREE.CylinderGeometry(4.2, 4.4, 0.7, 8).translate(f.x, y + 0.35, f.z), "#9c9fa3"));
        parts.push(colored(new THREE.CylinderGeometry(4.35, 4.35, 0.12, 8).translate(f.x, y + 0.72, f.z), "#b5b8bb"));
        parts.push(colored(new THREE.CylinderGeometry(3.8, 3.8, 0.05, 24).translate(f.x, y + 0.6, f.z), "#5f9fb2"));
        parts.push(cyl(0.7, 0.9, 0.8, f.x, y + 0.9, f.z, "#9c9fa3", 8), cyl(0.38, 0.45, 3.0, f.x, y + 2.7, f.z, "#a9acb0", 8));
        // Çapa (bronz): gövde, halka, kollar.
        const b = "#6f5a3a";
        parts.push(box(0.18, 2.2, 0.18, f.x, y + 5.3, f.z, b), box(1.1, 0.16, 0.16, f.x, y + 5.9, f.z, b));
        parts.push(colored(new THREE.TorusGeometry(0.28, 0.06, 6, 12).translate(f.x, y + 6.6, f.z), b));
        parts.push(colored(new THREE.TorusGeometry(0.75, 0.1, 6, 16, Math.PI).rotateZ(Math.PI).translate(f.x, y + 4.5, f.z), b));
        break;
      }
      case "windmuehle": {
        // Galerieholländer: iki katlı tuğla sekizgen kaide, galeri (balkon), sazdan kaplı daralan sekizgen gövde, başlık
        // (Kappe) ve dört kanat. Mühlencafé açıksa (open) kanatlar döner.
        const y = gy(f.x, f.z), g = new THREE.Group();
        g.position.set(f.x, y, f.z);
        const P = [];
        P.push(colored(new THREE.CylinderGeometry(6.2, 6.8, 7, 8).translate(0, 3.5, 0), "#9a3f30"));
        P.push(colored(new THREE.CylinderGeometry(8.6, 8.6, 0.25, 8).translate(0, 7.1, 0), "#6b4a35")); // galeri
        for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; P.push(box(0.08, 1.0, 0.08, Math.cos(a) * 8.4, 7.7, Math.sin(a) * 8.4, "#4a3426")); }
        P.push(colored(new THREE.TorusGeometry(8.4, 0.05, 4, 32).rotateX(Math.PI / 2).translate(0, 8.2, 0), "#4a3426"));
        P.push(colored(new THREE.CylinderGeometry(3.6, 5.8, 11, 8).translate(0, 12.7, 0), "#a88f55")); // sazlı gövde
        P.push(colored(new THREE.SphereGeometry(4.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.05, 0.75, 1.25).translate(0, 18.1, 0), "#3c3f45")); // başlık
        for (const [x, z] of [[0, 6.3], [6.3, 0], [-6.3, 0], [0, -6.3]]) P.push(box(1.0, 1.4, 0.15, x * 0.98, 4.6, z * 0.98, "#f4f1ea")); // pencereler
        P.push(box(1.6, 2.6, 0.2, 0, 1.3, 6.6, "#2e5e3a")); // kapı
        const body = new THREE.Mesh(merged(P.map((q) => (q.index ? q.toNonIndexed() : q))), MAT);
        body.castShadow = body.receiveShadow = true;
        g.add(body);
        // Kanatlar: başlığın önünde (yerel +z, rüzgâr batıdan: kanatlar batıya bakar), kafes çerçeveli.
        const sails = new THREE.Group();
        sails.position.set(0, 18.3, 5.2);
        const S = [];
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2;
          const arm = box(0.35, 11.5, 0.3, 0, 5.9, 0, "#5a4a3a").rotateZ(a);
          S.push(arm);
          for (let r = 2.2; r < 11.5; r += 1.2) S.push(box(2.2, 0.08, 0.06, 1.25, r, 0.15, "#f4f1ea").rotateZ(a));
          S.push(box(0.06, 9.4, 0.06, 2.35, 6.8, 0.15, "#f4f1ea").rotateZ(a), box(0.06, 9.4, 0.06, 0.18, 6.8, 0.15, "#f4f1ea").rotateZ(a));
        }
        S.push(cyl(0.5, 0.5, 0.9, 0, 0, 0, "#3a3d43", 8).rotateX(Math.PI / 2));
        const sm = new THREE.Mesh(merged(S.map((q) => (q.index ? q.toNonIndexed() : q))), MAT);
        sm.castShadow = true;
        sails.add(sm);
        g.add(sails);
        g.rotation.y = -Math.PI / 2; // batıya bakar
        g.userData.keep = true;
        group.add(g);
        sails.rotation.z = 0.35;
        if (f.open) anims.push((t) => { sails.rotation.z = -t * 0.55; });
        break;
      }
      case "wasserturm": {
        // Tuğla su kulesi: silindir gövde, üstte geniş hazne (pencereli), konik çatı, tepede küçük fener.
        const y = gy(f.x, f.z), P = [];
        P.push(colored(new THREE.CylinderGeometry(4.2, 4.8, 22, 16).translate(f.x, y + 11, f.z), "#9a3f30"));
        for (let k = 0; k < 4; k++) P.push(colored(new THREE.CylinderGeometry(4.35 + 0.1 * (3 - k), 4.35 + 0.1 * (3 - k), 0.3, 16).translate(f.x, y + 4 + k * 5, f.z), "#7f3a2e"));
        P.push(colored(new THREE.CylinderGeometry(7.2, 5.0, 2.5, 16).translate(f.x, y + 23.2, f.z), "#8e3a2c"));
        P.push(colored(new THREE.CylinderGeometry(7.2, 7.2, 6.5, 16).translate(f.x, y + 27.7, f.z), "#a2452f"));
        for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; P.push(ROT(box(0.9, 2.2, 0.12, 0, 0, 7.22, "#f4f1ea"), a).translate(f.x, y + 27.8, f.z)); }
        P.push(colored(new THREE.ConeGeometry(7.8, 4.5, 16).translate(f.x, y + 33.2, f.z), "#3c4a42"));
        P.push(cyl(0.6, 0.6, 1.4, f.x, y + 36, f.z, "#3c4a42", 8));
        P.push(box(1.6, 2.6, 0.3, f.x, y + 1.3, f.z + 4.7, "#3b2a1e")); // kapı
        const m = new THREE.Mesh(merged(P.map((q) => (q.index ? q.toNonIndexed() : q))), MAT);
        m.castShadow = m.receiveShadow = true;
        group.add(m);
        break;
      }
      case "aussicht": {
        // Su kulesinin tepesinde seyir platformu (açılınca): korkuluk ve çelik merdiven kafesi.
        const y = gy(f.x, f.z) + 30.95;
        for (let k = 0; k < 28; k++) { const a = (k / 28) * Math.PI * 2; parts.push(box(0.05, 1.1, 0.05, f.x + Math.cos(a) * 7.6, y + 0.55, f.z + Math.sin(a) * 7.6, "#2f3338")); }
        parts.push(colored(new THREE.TorusGeometry(7.6, 0.05, 4, 40).rotateX(Math.PI / 2).translate(f.x, y + 1.1, f.z), "#2f3338"));
        parts.push(colored(new THREE.CylinderGeometry(7.9, 7.9, 0.2, 16).translate(f.x, y, f.z), "#5a5f66"));
        break;
      }
      case "vogelturm": {
        // Kuş gözlem kulesi: ahşap dört ayak, iki sahanlıklı merdiven, üstte çatılı gözlem odası.
        const y = gy(f.x, f.z);
        for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) parts.push(box(0.3, 9, 0.3, f.x + dx, y + 4.5, f.z + dz, "#6b5440"));
        for (const h of [3, 6]) parts.push(box(4.2, 0.15, 4.2, f.x, y + h, f.z, "#8a6a4a"));
        parts.push(box(4.4, 2.2, 4.4, f.x, y + 10.1, f.z, "#7a5a3e"), box(4.6, 0.9, 4.6, f.x, y + 10.1, f.z, "#2a2d33"));
        parts.push(colored(new THREE.ConeGeometry(3.6, 1.8, 4).rotateY(Math.PI / 4).translate(f.x, y + 12.1, f.z), "#3c3f45"));
        for (let k = 0; k < 10; k++) parts.push(box(1.0, 0.08, 0.3, f.x + 2.5, y + 0.3 + k * 0.6, f.z - 1.5 + k * 0.32, "#8a6a4a"));
        break;
      }
      case "musikmuschel": {
        // Musikmuschel: beyaz yarım kubbe (deniz kabuğu biçimi) yükseltilmiş sahnede, önünde banklar.
        const y = gy(f.x, f.z), g = new THREE.Group();
        g.position.set(f.x, y, f.z);
        g.rotation.y = f.rot ?? 0;
        const P = [box(14, 1.0, 9, 0, 0.5, 0, "#d8d2c4")];
        const shell = new THREE.SphereGeometry(7, 20, 10, -Math.PI / 2, Math.PI, 0, Math.PI / 2).scale(1, 1.05, 1.0).translate(0, 1.0, -1.5);
        P.push(colored(shell, "#f7f5ef"));
        P.push(box(14.4, 6.5, 0.4, 0, 4.2, -1.8, "#ece6d8")); // arka duvar (kabuk ona dayanır)
        const m = new THREE.Mesh(merged(P.map((q) => (q.index ? q.toNonIndexed() : q))), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }));
        m.castShadow = m.receiveShadow = true;
        g.add(m);
        group.add(g);
        break;
      }
      case "stehtisch": {
        const y = gy(f.x, f.z);
        parts.push(cyl(0.38, 0.38, 0.05, f.x, y + 1.1, f.z, "#e9e4da", 12), cyl(0.05, 0.05, 1.08, f.x, y + 0.54, f.z, "#4a4f57", 6), cyl(0.3, 0.3, 0.04, f.x, y + 0.02, f.z, "#4a4f57", 10));
        break;
      }
      case "tennisnetz": {
        const y = gy(f.x, f.z);
        for (const dx of [-6.4, 6.4]) parts.push(cyl(0.05, 0.05, 1.07, f.x + dx, y + 0.53, f.z, "#2a2d33", 6));
        parts.push(box(12.8, 0.9, 0.03, f.x, y + 0.5, f.z, "#30363c"), box(12.8, 0.07, 0.05, f.x, y + 0.93, f.z, "#f4f4f2"));
        break;
      }
      case "robbenbecken": {
        // Fok havuzu: beton kenar, deniz suyu, kenarda ve suda foklar (gri, benekli).
        const y = gy(f.x, f.z);
        parts.push(colored(new THREE.CylinderGeometry(f.r + 0.6, f.r + 0.7, 0.9, 20).translate(f.x, y + 0.2, f.z), "#b9bcbf"));
        parts.push(colored(new THREE.CylinderGeometry(f.r, f.r, 0.06, 24).translate(f.x, y + 0.5, f.z), "#4f8a96"));
        for (let k = 0; k < 3; k++) {
          const a = k * 2.3 + f.r, r = k ? f.r * 0.5 : f.r + 0.15, sx = f.x + Math.cos(a) * r, sz = f.z + Math.sin(a) * r;
          const seal = new THREE.SphereGeometry(0.42, 10, 8).scale(2.3, 0.75, 0.9).rotateY(-a).translate(sx, y + (k ? 0.5 : 0.85), sz);
          parts.push(colored(seal, k % 2 ? "#8a8f94" : "#6f747a"));
          parts.push(colored(new THREE.SphereGeometry(0.3, 8, 6).translate(sx + Math.cos(a + Math.PI / 2) * 0.9, y + (k ? 0.62 : 1.0), sz + Math.sin(a + Math.PI / 2) * 0.9), "#5f646a"));
        }
        break;
      }
      case "fahrradstaender": {
        // Bisiklet parkı: çelik yaylar ve aralarında park etmiş bisikletler (çoğu dolu).
        const y = gy(f.x, f.z), n = f.n ?? 10;
        for (let k = 0; k < n; k++) {
          const lx = (k - (n - 1) / 2) * 0.9;
          const at = (dx, dz) => [f.x + Math.cos(f.rot) * dx + Math.sin(f.rot) * dz, f.z - Math.sin(f.rot) * dx + Math.cos(f.rot) * dz];
          const [px, pz] = at(lx, 0);
          parts.push(ROT(box(0.05, 0.8, 0.9, 0, 0.4, 0, "#8d949b"), f.rot).translate(px, y, pz));
          if ((k * 7) % 10 < 7) { // bisiklet
            const c = ["#2f5d8a", "#c0392b", "#2b2b2b", "#e8c33a", "#3e7a5a"][k % 5];
            for (const dz of [-0.55, 0.55]) parts.push(colored(new THREE.TorusGeometry(0.33, 0.035, 4, 14).rotateY(Math.PI / 2 + f.rot).translate(...((q) => [q[0], y + 0.34, q[1]])(at(lx + 0.18, dz))), "#1f1f22"));
            parts.push(ROT(box(0.05, 0.05, 1.0, 0, 0.62, 0, c), f.rot).translate(...((q) => [q[0], y, q[1]])(at(lx + 0.18, 0))));
            parts.push(ROT(box(0.04, 0.4, 0.04, 0, 0.6, -0.3, c), f.rot).translate(...((q) => [q[0], y, q[1]])(at(lx + 0.18, 0))));
          }
        }
        break;
      }
      case "parzelle": {
        // Kleingarten parseli: alçak çit, Gartenlaube (renkli ahşap kulübe), sebze tarhları, bir elma ağacı yerine çalı.
        const y = gy(f.x, f.z), hw = f.w / 2 - 0.5, hd = f.d / 2 - 0.5;
        for (const [dx, dz, w, d] of [[0, -hd, f.w - 1, 0.06], [0, hd, f.w - 1, 0.06], [-hw, 0, 0.06, f.d - 1], [hw, 0, 0.06, f.d - 1]]) parts.push(box(w, 0.8, d, f.x + dx, y + 0.4, f.z + dz, "#7a5a3e"));
        const hz = f.z + (f.side > 0 ? hd - 4 : -hd + 4), hc = ["#3e7a5a", "#2f5d8a", "#b8433c", "#e8c33a", "#e9e4da"][f.seed % 5];
        parts.push(box(3.4, 2.3, 2.8, f.x, y + 1.15, hz, hc), colored(new THREE.ConeGeometry(2.9, 1.0, 4).rotateY(Math.PI / 4).scale(1.15, 1, 0.95).translate(f.x, y + 2.8, hz), "#3c3f45"));
        for (let k = 0; k < 4; k++) parts.push(box(f.w - 4, 0.12, 1.4, f.x, y + 0.06, f.z + (f.side > 0 ? -hd + 3 : hd - 8) + k * 1.8 * (f.side > 0 ? 1 : 1), ["#5b7f2a", "#6b4a35", "#7a9a3a", "#6b4a35"][k]));
        break;
      }
      case "bahnsteig": {
        const y = gy(f.x, f.z);
        parts.push(box(f.w, 0.55, f.len, f.x, y + 0.27, f.z, "#a7a49c"), box(0.3, 0.05, f.len, f.x - f.w / 2 + 0.15, y + 0.57, f.z, "#f4f4f2"));
        break;
      }
      case "gleis": {
        // Dar hat (1 m): ahşap traversler ve iki ray; peronun yanından limana.
        const pts = f.pts, L = lengthOf(pts);
        for (let s = 0; s < L; s += 0.75) {
          const p = along(pts, s), y = gy(p.x, p.z);
          parts.push(ROT(box(1.7, 0.12, 0.22, 0, 0.06, 0, "#5a4a3a"), p.a).translate(p.x, y, p.z));
        }
        for (const off of [-0.5, 0.5]) for (let i = 1; i < pts.length; i++) {
          const [ax, az] = pts[i - 1], [bx, bz] = pts[i], Ls = Math.hypot(bx - ax, bz - az), a = Math.atan2(bx - ax, bz - az);
          const nx = Math.cos(a) * off, nz = -Math.sin(a) * off;
          for (let s = 0; s < Ls; s += 6) {
            const l = Math.min(6, Ls - s), t = (s + l / 2) / Ls, x = ax + (bx - ax) * t + nx, z = az + (bz - az) * t + nz;
            parts.push(ROT(box(0.08, 0.12, l, 0, 0.18, 0, "#7d8287"), a).translate(x, gy(x, z), z));
          }
        }
        break;
      }
      case "schafe": {
        // Koyunlar ayrı aşağıda (örneklemeli).
        break;
      }
    }
  }
  if (parts.length) {
    const m = new THREE.Mesh(merged(parts.map((g) => (g.index ? g.toNonIndexed() : g))), MAT);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }

  // --- set koyunları: gövde, baş, bacaklar; örneklemeli; otlarken başları iner kalkar ---
  const sheep = [];
  for (const f of world.features.filter((q) => q.type === "schafe")) {
    for (let k = 0; k < f.n; k++) {
      const a = k * 2.39996 + f.seed, r = 2 + (k % 4) * 2.4;
      const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r * 0.7;
      if (world.height(x, z) < 0.9) continue; // ıslak bataklıkta değil
      sheep.push({ x, z, y: world.height(x, z), rot: (k * 1.7 + f.seed) % 6.28, ph: k * 0.9 + f.seed * 0.01 });
    }
  }
  if (sheep.length) {
    const bodyG = new THREE.SphereGeometry(0.55, 10, 8).scale(1.45, 1.0, 0.95).translate(0, 0.78, 0);
    const headG = new THREE.SphereGeometry(0.22, 8, 6).scale(1.2, 1.0, 0.9).translate(0.78, 0.82, 0);
    const legG = merged([[-0.4, -0.2], [-0.4, 0.2], [0.4, -0.2], [0.4, 0.2]].map(([x, z]) => colored(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 5).translate(x, 0.22, z), "#2a2a2a")));
    const body = new THREE.InstancedMesh(bodyG, mat("#efeae0", { roughness: 1 }), sheep.length);
    const head = new THREE.InstancedMesh(headG, mat("#2b2724"), sheep.length);
    const legs = new THREE.InstancedMesh(legG, new THREE.MeshStandardMaterial({ vertexColors: true }), sheep.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    sheep.forEach((o, i) => {
      m4.compose(p.set(o.x, o.y, o.z), q.setFromAxisAngle(up, o.rot), one);
      body.setMatrixAt(i, m4); legs.setMatrixAt(i, m4); head.setMatrixAt(i, m4);
    });
    for (const im of [body, head, legs]) { im.castShadow = true; im.frustumCulled = false; group.add(im); }
    const hq = new THREE.Quaternion(), tilt = new THREE.Quaternion(), zAx = new THREE.Vector3(0, 0, 1);
    anims.push((t) => {
      sheep.forEach((o, i) => {
        const g = Math.max(0, Math.sin(t * 0.4 + o.ph)) * 0.55; // otlarken baş iner
        hq.setFromAxisAngle(up, o.rot).multiply(tilt.setFromAxisAngle(zAx, -g));
        head.setMatrixAt(i, m4.compose(p.set(o.x, o.y - g * 0.25, o.z), hq, one));
      });
      head.instanceMatrix.needsUpdate = true;
    });
  }

  // --- Inselbahn: lokomotif ve üç vagon; feribotla eşzamanlı (liman ↔ köy). Hat açılmadan önce köy peronunda bekler ---
  const bahn = world.bahn;
  let train = null;
  if (bahn) {
    const track = [...bahn.track], L = lengthOf(track);
    const cars = [];
    const mk = (loco) => {
      const P = loco
        ? [box(2.3, 2.6, 7, 0, 1.6, 0, "#c0392b"), box(2.1, 1.0, 2.6, 0, 3.4, -1.8, "#c0392b"), box(2.36, 0.7, 6.9, 0, 2.3, 0, "#f4f1ea"), box(2.4, 0.4, 7.2, 0, 0.35, 0, "#2a2d33")]
        : [box(2.3, 2.5, 9, 0, 1.6, 0, "#f4f1ea"), box(2.36, 0.85, 8.2, 0, 2.15, 0, "#28323e"), box(2.4, 0.3, 9.2, 0, 2.95, 0, "#c0392b"), box(2.4, 0.4, 9.2, 0, 0.35, 0, "#2a2d33")];
      const m = new THREE.Mesh(merged(P), MAT);
      m.castShadow = true;
      return m;
    };
    cars.push({ m: mk(true), off: 0 }, { m: mk(false), off: 8.5 }, { m: mk(false), off: 18 }, { m: mk(false), off: 27.5 });
    for (const c of cars) group.add(c.m);
    const place = (s) => {
      for (const c of cars) {
        const p = along(track, Math.max(0, Math.min(L, s + c.off))), y = gy(p.x, p.z);
        c.m.position.set(p.x, y + 0.12, p.z);
        c.m.rotation.y = p.a;
      }
    };
    // Hat açık mı (inselbahn:0)? Değilse tren köy peronunda durur.
    const running = !!world.workplaces.inselbahn?.find(Boolean);
    const tOrt = L - 40, tHafen = 2;
    train = (minute) => {
      if (!running || minute < FERRY.first || minute > FERRY.last + 10) return place(tOrt);
      const u = (((minute - FERRY.first) % FERRY.period) + FERRY.period) % FERRY.period; // feribot döngüsü (20 dk)
      const ease = (t) => t * t * (3 - 2 * t);
      if (u < 9) place(tHafen); // feribot yanaşık: yolcular biner/iner
      else if (u < 12) place(tHafen + (tOrt - tHafen) * ease((u - 9) / 3));
      else if (u < 16) place(tOrt);
      else if (u < 19) place(tOrt + (tHafen - tOrt) * ease((u - 16) / 3));
      else place(tHafen);
    };
    place(tOrt);
  }

  group.userData.tick = (t) => { for (const a of anims) a(t); };
  group.userData.setMinute = (m) => { train?.(m); };
  return group;
}

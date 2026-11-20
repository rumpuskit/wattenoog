// Wattenooger Inselbote (gazete): adanın o günkü hâli, yalnız gerçek veriden (sakin listesi, gelişim tablosu, simülasyon).
// Uydurma yok: her satır sitede doğrulanabilir; satıra dokununca kamera oraya/o sakine gider.
import * as sim from "./sim.js";
import { FERRY } from "./world/ferry.js";
import { TIKTOK } from "./config.js";
import { clockText, dateText, longDateText, num, plural } from "./fmt.js";

/** Gelişim adımlarının açıldığı gün: N. sakinin geldiği gün (o sırada gelen kişi açtı). */
export function openings(residents) {
  const bySlot = new Map(residents.map((r) => [r.slot, r]));
  const peak = residents.reduce((m, r) => Math.max(m, r.slot + 1), 0);
  return sim.cat().gelisim.filter((g) => g.nufus <= Math.max(peak, sim.townLevel())).map((g) => {
    const r = bySlot.get(g.nufus - 1) ?? null;
    return { ...g, r, day: r?.arrived_day ?? null };
  });
}

/**
 * Gazete sayfasının öğeleri. d: { residents, people, world, today, theme, select(i), flyTo(x,z,d), at(r) }.
 */
export function gazete(d) {
  const { residents, people, world } = d;
  const day = d.today();
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const out = [];
  const first = residents.reduce((m, r) => Math.min(m, r.arrived_day), day);
  out.push(el("p", `${longDateText(day)} · Ausgabe ${num(day - first + 1)}`, "muted"));

  // Son dakika / manşet: günün olayı (olay.js).
  const oy = d.olay?.yazi?.(d.minute?.() ?? 0);
  if (oy) {
    out.push(el("h3", d.olay.plan && (d.minute?.() ?? 0) < d.olay.plan.son ? "Eilmeldung" : "Das Ereignis des Tages"));
    const p = el("p");
    const b = el("span", oy.kisa, "link");
    b.addEventListener("click", () => d.flyToOlay?.());
    p.append(b);
    out.push(p, el("p", oy.uzun));
  }
  // Manşet: günün olayı.
  const th = people.theme;
  if (th) {
    out.push(el("h3", "Heute auf der Insel"));
    const p = el("p");
    const b = el("span", th.ad, "link");
    b.addEventListener("click", () => d.flyToTheme());
    p.append(b, th.bas != null ? ` · ${clockText(th.bas)}–${clockText(th.son)} Uhr` : "");
    out.push(p);
  }

  // Günün saklı nesnesi (ipucu bölge, bulunduysa söyler).
  const sk = d.sakli?.();
  if (sk?.ad) {
    out.push(el("h3", "Versteckt"));
    out.push(el("p", sk.bulundu ? `Das versteckte Ding von heute hast du gefunden (${sk.ad}). Morgen wird ein neues versteckt.` : `Heute auf der Insel versteckt: ${sk.ad}. Schau ${sk.area}, zoom rein und tipp es an.`));
  }

  // Bugün ve dün gelenler.
  const named = residents.map((r, i) => [r, i]).filter(([r]) => !r.hidden);
  const bugun = named.filter(([r]) => r.arrived_day === day), dun = named.filter(([r]) => r.arrived_day === day - 1);
  out.push(el("h3", "Die Insel heute"));
  const N = residents.length, nToday = residents.filter((r) => r.arrived_day === day).length;
  out.push(el("p", `Auf der Insel ${N === 1 ? "wohnt 1 Mensch" : `wohnen ${num(N)} Menschen`}. Heute ${nToday === 1 ? "ist" : "sind"} ${num(nToday)} eingezogen, gestern ${num(residents.filter((r) => r.arrived_day === day - 1).length)}.`));
  const people1 = (list, title) => {
    if (!list.length) return;
    const p = el("p");
    p.append(el("b", `${title}: `));
    list.slice(0, 24).forEach(([r, i], n) => {
      const a = el("span", d.at(r), "link");
      a.addEventListener("click", () => d.select(i));
      p.append(n ? ", " : "", a);
    });
    if (list.length > 24) p.append(` und ${num(list.length - 24)} weitere`);
    out.push(p);
  };
  people1(bugun, "Heute eingezogen");
  people1(dun, "Gestern eingezogen");

  // Açılanlar ve sıradaki.
  const ops = openings(residents);
  const recent = ops.filter((o) => o.day != null && day - o.day <= 7).reverse();
  out.push(el("h3", "Neu eröffnet"));
  if (recent.length) {
    const ul = el("ul", null, "liste");
    for (const o of recent) {
      const li = el("li");
      li.append(el("b", o.day === day ? "Heute" : o.day === day - 1 ? "Gestern" : dateText(o.day)));
      const span = el("span");
      span.append(`${o.ad} · eröffnet, als `);
      const a = el("span", d.at(o.r), "link");
      const idx = residents.indexOf(o.r);
      a.addEventListener("click", () => d.select(idx));
      span.append(a, ` einzog (Nr. ${num(o.nufus)})`);
      li.append(span);
      ul.append(li);
    }
    out.push(ul);
  } else out.push(el("p", "Diese Woche hat nichts Neues eröffnet.", "muted"));
  const next = sim.cat().gelisim.find((g) => g.nufus > sim.townLevel());
  if (next) out.push(el("p", `Als Nächstes: ${next.ad} · noch ${plural(Math.max(1, next.nufus - residents.length), "Einwohner", "Einwohner")} (eröffnet bei ${num(next.nufus)}).`));

  // Program.
  out.push(el("h3", "Programm für heute"));
  const prog = el("ul", null, "liste");
  const row = (t, s) => { const li = el("li"); li.append(el("b", t), el("span", s)); prog.append(li); };
  row(clockText(FERRY.first), `Erste Fähre; alle ${FERRY.period} Minuten, die letzte um ${clockText(FERRY.last)} Uhr`);
  if (d.zeplin) row(clockText(540), `Der Wattenoog-Zeppelin kommt, zurück zum Festland um ${clockText(1320)} Uhr`);
  if (th?.bas != null) row(clockText(th.bas), th.ad);
  if (world.pitch) row(clockText(1170), `Fußball beim SV Wattenoog${sim.weekday(day) >= 5 || sim.isHoliday(day) ? ` (auch um ${clockText(900)} Uhr)` : ""}`);
  out.push(prog);

  // Meslekler.
  const jobs = new Map();
  for (const r of residents) {
    const j = sim.dreamJob(r);
    const name = j.alan; // iş alanı (cinsiyetsiz): "Krabbenfischerei", "Backstube"
    jobs.set(name, (jobs.get(name) ?? 0) + 1);
  }
  const top = [...jobs].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const secen = residents.filter((r) => r.overrides?.meslek).length;
  if (top.length) {
    out.push(el("h3", "Berufe"));
    out.push(el("p", top.map(([n, c]) => `${n} (${num(c)})`).join(", ") + "."));
    if (secen) out.push(el("p", `${plural(secen, "Person hat", "Personen haben")} den Beruf per Kommentar selbst gewählt.`, "muted"));
  }

  // Haftanın sakini (her pazartesi değişir).
  if (named.length) {
    const week = Math.floor((day + 3) / 7);
    const [r, i] = named[sim.roll(week, "haftanin_sakini") % named.length];
    out.push(el("h3", "Gesicht der Woche"));
    const p = el("p");
    const a = el("span", d.at(r), "link");
    a.addEventListener("click", () => d.select(i));
    p.append(a, ` · ${sim.title(r, day)} · Hobby: ${people.hobbies[i].ad} · ${sim.streetAddress(r.slot)}, ${sim.mahalleName(sim.addressParts(r.slot).mahalle)}`);
    out.push(p);
  }

  // Ada tarihi.
  if (ops.length) {
    out.push(el("h3", "Inselchronik"));
    const ul = el("ul", null, "liste");
    for (const o of [...ops].reverse()) {
      const li = el("li");
      li.append(el("b", o.day != null ? dateText(o.day) : "—"));
      li.append(el("span", `${o.ad} (${plural(o.nufus, "Einwohner", "Einwohner")})`));
      ul.append(li);
    }
    out.push(ul);
  }
  if (d.tur) {
    const p = el("p");
    const a = el("span", "Inselrundgang starten (30 Sekunden)", "link");
    a.addEventListener("click", () => d.tur());
    p.append(a);
    out.push(el("h3", "Die Insel kennenlernen"), p);
  }
  out.push(el("p", `Wer @${TIKTOK} auf TikTok neu folgt, zieht beim nächsten Einzug auf die Insel. Du folgst schon länger? Schreib „einziehen“ unter ein Video. Deinen Beruf suchst du dir per Kommentar aus, zum Beispiel „Beruf: Fischerei“.`, "muted"));
  return out;
}

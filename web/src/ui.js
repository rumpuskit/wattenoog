// Ekrandaki paneller: saat ve nüfus, zaman hızı, "Finde dich" araması, sakin kartı ve ev içi görünümü.
import * as sim from "./sim.js";
import { HOME_LABELS, homeActivity } from "./world/life.js";
import { TIKTOK, TIKTOK_URL, ZEPLIN_REKLAM, hourText, nextMove } from "./config.js";
import { DAYS, DAYS_SHORT, clockText, kmh, meter, num, ordinal, plural } from "./fmt.js";
import { svg, BINA_SIMGE, ARAC_SIMGE } from "./icons.js";
import { ETKINLIK } from "./world/etkinlik.js";
import { residentCard, shareCanvas } from "./paylas.js";

// Yer adları: iş yeri olanlar katalogdan (isyerleri), diğerleri Wattenoog'un sabit yer adları (CLAUDE.md §13).
// Görünen metinler Almanca; sakin için zamir ve cinsiyetli unvan yok (cinsiyet tahmin edilmez, DEVIR §4.2).
const yerAdi = (kind, yedek) => sim.cat()?.isyerleri?.[kind]?.[0] ?? yedek;
export const PLACE_NAMES = {
  meydan: "Marktplatz", iskele: "Anglersteg", park: "Kurpark", sahil_yolu: "Strandpromenade", plaj: "Hauptstrand",
  tepe: "Wasserturm", fener: "Leuchtturm Westkopf", kahvehane: "Fischbude am Kutterhafen", pazar: "Wochenmarkt",
  saha: "Sportplatz SV Wattenoog", watt: "Watt", deich: "Deich",
};
const OUT_LABELS = {
  meydan: "Auf dem Marktplatz", park: "Spaziergang im Kurpark", sahil_yolu: "Auf der Strandpromenade",
  kahvehane: "An der Fischbude", pazar: "Auf dem Wochenmarkt", saha: "Am Sportplatz", watt: "Draußen im Watt", deich: "Auf dem Deich",
};
const HOUSE_TYPES = { friesenhaus: "Friesenhaus", doppelhaus: "Zweifamilienhaus", kapitaenshaus: "Kapitänshaus", mehrfamilienhaus: "Mehrfamilienhaus" };
// Etkinliklerin yeri (etkinlik.js yer anahtarları) kart ve "Heute" listesinde.
const EXTRA_PLACES = { iskele_vapur: "Fähranleger", kiyi: "Am Ufer", kapi: "Vor der Haustür", market: "Laden", firin: "Bäckerei", cami: "Inselkirche", sahil_yolu: "Strandpromenade", sinema: "Strandkino" };

// İş yeri adı olmayan binaların kartta görünen adı.
const BUILDING_NAMES = { cami: "Inselkirche", liman: "Fähranleger", ambar: "Hafenspeicher", tersane: "Bootswerft", kulube: "Fischerhütte", ahir: "Bauernhof", itfaiye: "Feuerwehrhaus", garaj: "Bauhof", bufe: "Kiosk", carsi: "Laden in der Strandstraße" };
// Olay türlerinin Almanca adı (olay-plan.js "en" İngilizce; o dosya üç adada ortak).
const OLAY_AD = {
  firtina: "den Sturm", sis: "den Nebel", yangin: "den Brand", kaza: "den Unfall", yunus: "die Schweinswale", balina: "den Wal",
  zeplin: "die Notlandung des Zeppelins", dugun: "den Hochzeitskorso", fok: "die Seehunde", hortum: "die Wasserhose",
  gemi: "das Riesenschiff", moose: "den Elch", vapur: "die Fähre mit Panne", balik: "den Riesenfang", tekne_yarisi: "die Kutterregatta",
  kopekbaligi: "den Hai", kar: "den Schnee", elektrik: "den Stromausfall", balon: "die Heißluftballons", ucurtma: "das Drachenfest",
  kus: "die Ringelgänse", film: "die Dreharbeiten", yaris: "den Volkslauf", marti: "die Möwe mit dem Fischbrötchen",
};
/** Kat adı: zemin kat "Erdgeschoss", üstü "1. Stock". */
const floorText = (f) => (f === 0 ? "Erdgeschoss" : `${ordinal(f)} Stock`);
/** config.nextMove ("15 Uhr" / "morgen 9 Uhr") → "um 15 Uhr" / "morgen um 9 Uhr". */
export const einzugUm = () => { const t = nextMove(); return t.startsWith("morgen ") ? "morgen um " + t.slice(7) : "um " + t; };

/** Adadaki süre: "Seit heute", "Seit gestern", "Seit 5 Tagen". */
const onIsland = (t) => (t === 0 ? "Seit heute" : t === 1 ? "Seit gestern" : `Seit ${plural(t, "Tag", "Tagen")}`);

const $ = (id) => document.getElementById(id);
// Sakinin görünen adı: adını gizlemek isteyenler "Name verborgen" olarak görünür.
export const at = (r) => (r.hidden ? "Name verborgen" : "@" + r.handle);

export function createUI({ residents, people, world, dollhouse, stories, traffic, zeplin = null, capture = null, claim = null, follow, setSpeed, flyTo, speed, today, minute, waiting = 0, listError = null, secim = null, olay = null }) {
  const byHandle = new Map(residents.map((r, i) => [r.handle, i]));
  $("cta").href = TIKTOK_URL;
  // İskelede bekleyenler: takip etmiş, sıradaki taşınmayı bekleyenler. Dokununca iskeleye uçar.
  if (waiting > 0 && world.ferryPier) {
    const btn = $("waiting");
    btn.hidden = false;
    btn.innerHTML = svg("valiz");
    btn.append(`${num(waiting)} ${waiting === 1 ? "wartet" : "warten"} am Fähranleger · Einzug ${einzugUm()}`);
    btn.addEventListener("click", () => {
      const P0 = world.ferryPier;
      flyTo((P0.x0 + P0.x1) / 2, P0.top, P0.z0 + 14, 45);
    });
  }
  // Belediye başkanlığı seçimi (açıkken): kalan süre ve önde giden; dokununca belediyeye gider, kart adayları gösterir.
  const belediye = () => Object.values(world.workplaces.belediye ?? []).find(Boolean)?.building;
  if (secim?.durum === "acik") {
    const btn = $("secim");
    const kalan = Math.max(0, secim.bitis - Date.now() / 1000);
    const sure = kalan > 86400 ? `noch ${plural(Math.ceil(kalan / 86400), "Tag", "Tage")}` : kalan > 3600 ? `noch ${plural(Math.ceil(kalan / 3600), "Stunde", "Stunden")}` : "letzte Stunde";
    const lider = secim.adaylar?.find(([h]) => h);
    btn.hidden = false;
    btn.innerHTML = svg("sandik");
    btn.append(`Bürgermeisterwahl · ${sure}` + (lider ? ` · @${lider[0]} vorn` : " · kandidieren: „Ich kandidiere“ kommentieren"));
    btn.addEventListener("click", () => { const b = belediye(); if (b) openBuilding(b); });
  }

  // Sıradaki gelişim adımı: kaç sakin daha gelince ne açılacak; çubuk bir önceki adımdan bu yana ilerleme.
  // Dokununca yerine (şantiyeye) uçar.
  const ns = world.nextStage;
  if (ns) {
    const btn = $("next");
    // Eşik nüfusa değil gelişim düzeyine (en büyük sıra numarası) göre: ayrılanın (left_day) sırası yeniden verilmez,
    // yeni gelen en büyük sıranın ardına yerleşir; yer düzey eşiğe varınca açılır (7 Kasım, Mercanada'yla aynı düzeltme).
    const duzey = Math.max(residents.length, Number.isFinite(sim.townLevel()) ? sim.townLevel() : 0);
    const need = Math.max(1, ns.nufus - duzey);
    const prev = Math.max(0, ...sim.cat().gelisim.map((g) => g.nufus).filter((n) => n < ns.nufus));
    btn.hidden = false;
    $("next-name").textContent = ns.name;
    $("next-need").textContent = waiting >= need ? `beim Einzug ${einzugUm()}` : `noch ${plural(need, "Einwohner", "Einwohner")}`;
    // Adımın başında da çubuk görünsün (en az %4).
    $("next-bar").style.width = `${Math.round(Math.min(1, Math.max(0.04, (duzey - prev) / (ns.nufus - prev))) * 100)}%`;
    if (ns.at) btn.addEventListener("click", () => flyTo(ns.at[0], world.groundY(ns.at[0], ns.at[1]), ns.at[1], 110));
  }
  let selected = null;
  let mode = null; // "sakin" | "bina" | "arac"
  let vehicle = null; // seçili aracın kaydı
  let tab = "simdi";
  for (const btn of document.querySelectorAll("#card-tabs button")) {
    btn.addEventListener("click", () => {
      tab = btn.dataset.tab;
      for (const b of document.querySelectorAll("#card-tabs button")) b.classList.toggle("on", b === btn);
      render();
    });
  }

  for (const btn of document.querySelectorAll("#speed button")) {
    btn.classList.toggle("on", Number(btn.dataset.speed) === speed);
    btn.addEventListener("click", () => {
      setSpeed(Number(btn.dataset.speed));
      for (const b of document.querySelectorAll("#speed button")) b.classList.toggle("on", b === btn);
    });
  }

  function placeLabel(i, yer) {
    if (yer === "ev") return "Zuhause";
    if (yer === "is") return people.works[i].loc.name;
    if (yer.startsWith("mahalle:")) return sim.isOpen(`cay:${yer.slice(8)}`) ? "Eisdiele im Viertel" : "Im Viertel";
    const key = yer.replace("hobi:", "");
    if (key === "iskele" && !world.places.iskele) return "Am Ufer"; // balık iskelesi açılana kadar kıyıdan balık tutulur
    if (PLACE_NAMES[key] && !world.places[key]) return PLACE_NAMES.meydan; // yeri henüz açılmamış hobi meydanda geçer
    if (key === "kahvehane" || key === "saha" || key === "fener" || key === "plaj") return yerAdi(key, PLACE_NAMES[key]);
    return PLACE_NAMES[key] ?? EXTRA_PLACES[key] ?? yer;
  }

  /** Yolculuğun gerçek varış yeri: "meydan" planı saate göre farklı yerlere dağılır. */
  function destOf(i, seg) {
    if (seg.nereye !== "meydan" && !seg.nereye.startsWith("hobi:")) return seg.nereye;
    const k = people.plans[i].findIndex((q) => q.bas === seg.son);
    return k >= 0 ? people._placeOf(i, k) ?? "meydan" : "meydan";
  }

  function nowText(i) {
    const seg = people.activities[i];
    if (!seg) return "";
    switch (seg.ne) {
      case "uyku":
      case "ev": {
        const act = homeActivity(residents[i].seed, seg, minute(), today(), people.hobbies[i].id, people.homeWork?.[i]);
        return (seg.ne === "ev" ? "Zu Hause · " : "") + HOME_LABELS[act];
      }
      case "is": {
        const j = people.works[i].job;
        if (j === "ogrenci") return "Auf dem Festland, im Studium";
        if (j === "anakara") return "Auf dem Festland, bei der Arbeit";
        if (j === "zeplin_pilotu") return zeplin?.pose.visible ? "Am Steuer des Zeppelins" : "Auf dem Festland, am Zeppelinhangar";
        return `Bei der Arbeit · ${people.works[i].loc.name}`;
      }
      case "yol": {
        const d = destOf(i, seg);
        // Yolculuk varışa yetişecek saatte başlar; o ana kadar evinde bekler (görünmez).
        const leg = people.travelCache[i]?.legs.find((l) => minute() < l.t1);
        if (!people.visible[i] && leg?.kind === "before" && seg.nereden === "ev") return `Noch zu Hause, gleich unterwegs → ${placeLabel(i, d)}`;
        if (d === "is" && (people.works[i].wp.kind === "anakara" || people.works[i].wp.kind === "zeplin")) return seg.nereden === "ev" ? "Auf dem Weg zur Fähre" : "Von der Fähre auf dem Heimweg";
        return d === "ev" ? "Auf dem Heimweg" : `Unterwegs → ${placeLabel(i, d)}`;
      }
      case "hobi":
      case "meydan": {
        // Günün etkinliği (etkinlik.js): kartta ne yaptığı; sosyal etkinlikte yanında kimin olduğu.
        const act = people.currentAct[i];
        if (act && ETKINLIK[act]) {
          const near = company(i);
          const e = ETKINLIK[act];
          if (!e.sosyal) return e.ad;
          return `${e.ad}, ${near.length === 0 ? "allein" : near.length === 1 ? `mit ${at(residents[near[0]])}` : act === "kapi_onu" ? "mit der Nachbarschaft" : "mit Freunden"}`;
        }
        if (seg.ne === "hobi") return `${people.hobbies[i].ad} · ${placeLabel(i, seg.yer)}`;
        const pl = people.currentPlace[i] ?? "meydan";
        const yer = pl.startsWith("mahalle:") ? (sim.isOpen(`cay:${pl.slice(8)}`) ? "In der Eisdiele im Viertel" : "Unterwegs im Viertel")
          : OUT_LABELS[pl] ?? "In der Strandstraße";
        // Yalnız gerçekten yanında biri varsa "arkadaşlarıyla" (12 m içinde dışarıda vakit geçiren sakinler).
        const near = company(i);
        const kim = pl.startsWith("mahalle:") ? "mit der Nachbarschaft" : "mit Freunden";
        return `${yer}, ${near.length === 0 ? "allein" : near.length === 1 ? `mit ${at(residents[near[0]])}` : kim}`;
      }
      case "olay": {
        const it = seg.olay ?? {};
        if (it.gorevli === "polis") return it.rol === "trafik" ? "Im Einsatz · regelt den Verkehr an der Unfallstelle" : "Im Einsatz · nimmt den Unfall auf";
        if (it.gorevli === "itfaiyeci") return "Im Einsatz · löscht den Brand";
        const ad = OLAY_AD[olay?.plan?.tur] ?? "das Geschehen";
        return it.tavir === "cek" ? `Schaut sich ${ad} an und filmt mit dem Handy` : `Schaut sich ${ad} an`;
      }
      default: return seg.ne;
    }
  }

  /** i'nin yakınında (12 m) dışarıda vakit geçiren diğer sakinler. */
  function company(i) {
    const P = people.positions, out = [];
    for (let j = 0; j < residents.length; j++) {
      if (j === i || !people.visible[j] || !["meydan", "hobi"].includes(people.activities[j]?.ne)) continue;
      if (Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 2] - P[i * 3 + 2]) < 12) out.push(j);
    }
    return out;
  }

  function facts(rows) {
    $("card-facts").replaceChildren(...rows.flatMap(([k, v, onClick]) => {
      const dt = document.createElement("dt"); dt.textContent = k;
      const dd = document.createElement("dd"); dd.textContent = v;
      if (onClick) { dd.classList.add("link"); dd.addEventListener("click", onClick); }
      return [dt, dd];
    }));
  }

  const link = (j) => [at(residents[j]), () => select(j)];

  /** Kişinin kendisi için: yorumla seçtikleri ve henüz seçebilecekleri (istekler sonraki taşınmada işlenir). */
  function senMisin(r, unvan) {
    const o = r.overrides ?? {};
    const secti = [o.meslek && `deinen Beruf (${unvan})`, o.hobi && "dein Hobby", o.evcil && "dein Haustier"].filter(Boolean);
    const oneri = [!o.meslek && "„Beruf: Fischerei“", !o.hobi && "„Hobby: Skat“", !o.evcil && "„Haustier: Katze“"].filter(Boolean);
    const bas = secti.length ? `Du hast ${secti.join(", ").replace(/, ([^,]*)$/, " und $1")} selbst gewählt. ` : "";
    const ne = oneri.length ? `Schreib ${oneri.join(", ")} oder „Name verstecken“ unter eines unserer Videos` : "Zum Ändern einfach noch einmal unter ein Video schreiben (z. B. „Beruf: Bäckerei“) oder „Name verstecken“";
    return `${bas}${ne}. Das gilt ab dem nächsten Einzug.`;
  }

  function renderPerson() {
    const r = residents[selected];
    const day = today();
    const t = sim.tenure(r, day);
    $("card-handle").textContent = at(r);
    icon(r.hidden ? "?" : r.handle[0].toUpperCase(), `hsl(${r.seed % 360} 62% 58%)`);
    // İş yerinin adı yalnızca gerçek bir iş yeri varsa (emekli ve evden çalışanlarda yok).
    const wk = people.works[selected];
    // Asıl mesleğinin iş yeri adada henüz yoksa mesleğini anakarada yapar (vapurla gidip gelir).
    const dream = sim.dreamJob(r);
    // Asıl mesleğin adı: kişi bir biçim seçtiyse unvan, yoksa iş alanı (sim.jobTitle; cinsiyet tahmin edilmez).
    const dreamTitle = sim.jobTitle(dream, sim.rank(r, day), r.overrides?.form);
    $("card-title").textContent = wk.wp.kind === "ev" ? (wk.job === "emekli" ? "Im Ruhestand" : `${sim.title(r, day)} · arbeitet von zu Hause`)
      : dream.id !== wk.job ? `${dreamTitle} · arbeitet auf dem Festland, pendelt mit der Fähre`
      : wk.job === "ogrenci" ? `${sim.title(r, day)} · pendelt mit der Fähre zum Studium`
      : wk.wp.kind === "anakara" ? `${sim.title(r, day)} · arbeitet auf dem Festland, pendelt mit der Fähre` : `${sim.title(r, day)} · ${wk.loc.name}`;
    $("card-dream").hidden = dream.id === wk.job;
    if (dream.id !== wk.job) {
      const opens = sim.cat().isyerleri[dream.yer].map((name, k) => [sim.stageOf(`${dream.yer}:${k}`), name]).sort((a, b) => a[0] - b[0])[0];
      $("card-dream").innerHTML = svg("vinc");
      $("card-dream").append(dream.yer === "zeplin" ? `Fliegt den ${opens[1]}, sobald er kommt (ab ${plural(opens[0], "Einwohner", "Einwohnern")})`
        : `Neuer Arbeitsplatz auf der Insel: ${opens[1]}, eröffnet ab ${plural(opens[0], "Einwohner", "Einwohnern")}`);
    }
    $("card-now").textContent = nowText(selected);
    $("card-tabs").hidden = false;
    $("card-traits").replaceChildren();
    const f = follow.get();
    followActions(f?.kind === "sakin" && f.i === selected ? f.view : null, { kind: "sakin", i: selected }, ["goz", "Über die Schulter"]);
    // Kendini bulan için davet: "Das bin ich" doğrulamaya (Mein Zuhause) adı dolu götürür; doğrulanmışsa "Mein Zuhause einrichten".
    if (!r.hidden && claim?.open) action(["ev", claim.me?.() === r.handle ? "Mein Zuhause einrichten" : "Das bin ich"], () => claim.open(r.handle));
    // Paylaş en sonda: Mein Zuhause'daki "Meine Karte teilen" son düğmeye basar.
    if (!r.hidden && capture) action(["paylas", "Teilen"], () => shareResident(selected));
    if (tab === "bugun") {
      const homeLabel = (k) => {
        const seg = people.plans[selected][k];
        const act = homeActivity(r.seed, seg, seg.bas + 1, day, people.hobbies[selected].id, people.homeWork?.[selected]);
        return "Zu Hause · " + HOME_LABELS[act];
      };
      const placeName = (yer) => placeLabel(selected, yer);
      facts(stories.today(selected, placeName, homeLabel));
      return;
    }
    if (tab === "hikaye") {
      $("card-traits").replaceChildren(...stories.traits(selected).map((x) => {
        const span = document.createElement("span");
        span.textContent = x;
        return span;
      }));
      const rows = [];
      const f = stories.friend[selected];
      if (f >= 0) rows.push(["Beste Freundschaft", ...link(f)]);
      const pet = stories.petName(selected);
      if (pet) rows.push(["Haustier", `${pet.kind} · ${pet.name}`]);
      const nb = stories.neighbors(selected).slice(0, 3);
      nb.forEach((j, n) => rows.push([n === 0 ? "Nachbarschaft" : "", ...link(j)]));
      const cw = stories.coworkers(selected).slice(0, 3);
      cw.forEach((j, n) => rows.push([n === 0 ? "Kollegium" : "", ...link(j)]));
      for (const e of stories.timeline(selected).slice(0, 8)) rows.push([e.date, e.text]);
      facts(rows);
      return;
    }
    const pet = sim.pet(r, day);
    facts([
      ["Adresse", sim.addressText(r.slot)],
      ["Hobby", people.hobbies[selected].ad],
      ["Haustier", pet || "Noch keins"],
      ["Auf der Insel", onIsland(t)],
      ["Unterwegs", (people.hasCar[selected] ? "Eigenes Auto" : world.vehicles ? "Inselbus und zu Fuß" : "Zu Fuß (noch keine Autos auf der Insel)") + (["anakara", "zeplin"].includes(people.works[selected].wp.kind) ? " · mit der Fähre zur Arbeit" : "")],
      // İstekler videolarımızın yorumlarından okunur (sunucuda istekler.py; biçim orada).
      ...(!r.hidden ? [["Bist du das?", senMisin(r, dreamTitle)]] : []),
    ]);
  }

  function renderBuilding() {
    $("card-dream").hidden = true; // sakin kartından kalan "açılınca adada çalışacak" satırı binada/araçta görünmesin
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const b = dollhouse.building;
    if (!b.daireler) {
      icon(svg(BINA_SIMGE[b.kind] ?? "bina"), null, true);
      $("card-handle").textContent = dollhouse.workName ?? b.isim ?? (/Fener|Gull Point|Westkopf|Wärterhaus/.test(b.address ?? "") ? "Leuchtturmwärterhaus" : BUILDING_NAMES[b.kind] ?? "Laden");
      $("card-title").textContent = `${b.address ?? ""} · ${floorText(dollhouse.floor)}`;
      // Yalnızca şu an bu katta çalışanlar (izinli, yolda ya da evde olanlar listelenmez).
      const rows = [];
      let total = 0;
      for (const [i] of dollhouse.workSpots) {
        total++;
        if (people.activities[i]?.ne !== "is") continue;
        rows.push([sim.title(residents[i], today()), at(residents[i]), () => select(i)]);
      }
      $("card-now").textContent = rows.length ? `${plural(rows.length, "Person", "Personen")} gerade bei der Arbeit (${plural(total, "Arbeitsplatz", "Arbeitsplätze")} auf dieser Etage)` : total ? `Gerade arbeitet hier niemand (${plural(total, "Arbeitsplatz", "Arbeitsplätze")})`
        : b.kind === "muhtarlik" ? "Der Ortsvorstand ist noch frei. Wer zuerst fragt, bekommt den Posten: Schreib „Beruf: Ortsvorstand“ unter eines unserer Videos." : "Auf dieser Etage arbeitet niemand";
      if (b.kind === "belediye" && secim) {
        // Seçim: açıkken adaylar ve oyları, bittiyse başkan. Adını gizleyenler "Name verborgen".
        const ad = (h) => (h ? "@" + h : "Name verborgen");
        const sec = secim.durum === "acik"
          ? [["Wahl", "Kandidieren: „Ich kandidiere“ unter eines unserer Videos schreiben. Abstimmen: „Stimme: @name“ (nur für Einwohner der Insel)"],
             ...(secim.adaylar ?? []).map(([h, n], k) => [k === 0 ? "Kandidaturen" : "", `${ad(h)} · ${plural(n, "Stimme", "Stimmen")}`])]
          : [["Bürgermeisteramt", secim.kazanan ? "@" + secim.kazanan : "Name verborgen"]];
        facts([...sec, ...rows.slice(0, 10)]);
        return;
      }
      facts(rows.slice(0, 12));
      if (rows.length > 12) facts([...rows.slice(0, 12), ["", `und ${num(rows.length - 12)} weitere`]]);
      return;
    }
    icon(svg("ev"), null, true);
    const p = sim.addressParts(b.slot0), house = sim.houseOf(b.slot0);
    $("card-handle").textContent = `${sim.sokakName(p.mahalle, p.sokak)} ${house.ev + 1}`;
    $("card-title").textContent = `${sim.mahalleName(p.mahalle)}, ${sim.adaName(p.ada)} · ${HOUSE_TYPES[house.tip] ?? "Wohnhaus"}`;
    $("card-now").textContent = floorText(dollhouse.floor);
    const rows = [];
    for (let c = 0; c < b.perFloor; c++) {
      const k = dollhouse.floor * b.perFloor + c;
      if (k >= b.daireler) continue;
      const i = people.slotToIndex.get(b.slot0 + k);
      const h = sim.houseOf(b.slot0 + k), unit = h.apt ? `Whg. ${h.apt}` : `Nr. ${h.ev + 1}`;
      if (i == null) rows.push([unit, "Leer, wartet auf neue Einwohner"]);
      else rows.push([unit, `${at(residents[i])} · ${nowText(i)}`, () => select(i)]);
    }
    facts(rows);
  }

  function render() {
    $("floorbar").hidden = !dollhouse.isOpen();
    if (dollhouse.isOpen()) $("floor-label").textContent = floorText(dollhouse.floor);
    pending = [];
    if (mode === "sakin" && selected != null) renderPerson();
    else if (mode === "bina" && dollhouse.isOpen()) renderBuilding();
    else if (mode === "arac" && vehicle) renderVehicle();
    flushActions();
  }

  const KIND_NAMES = { car: "Auto", taxi: "Taxi", bus: "Inselbus", ambulans: "Rettungswagen", itfaiye: "Löschfahrzeug", cop: "Müllwagen", zeplin: "Zeppelin" };

  // Kart birkaç karede bir yeniden çizilir; düğmeler değişmediyse yerinde kalır (yoksa basılırken
  // DOM'dan kopar ve dokunuş boşa gider). Yalnızca tıklama işlevleri tazelenir.
  let pending = [];
  function action(label, onClick, primary = false) {
    pending.push({ label, onClick, primary });
  }

  function flushActions() {
    const box = $("card-actions");
    const sig = pending.map((a) => String(a.label) + (a.primary ? "*" : "")).join("|");
    if (box.dataset.sig === sig) {
      [...box.children].forEach((b, n) => { b._onClick = pending[n].onClick; });
      return;
    }
    box.dataset.sig = sig;
    box.replaceChildren(...pending.map((a) => {
      const b = document.createElement("button");
      // Etiket: düz metin ya da [simge, metin].
      if (Array.isArray(a.label)) { b.innerHTML = svg(a.label[0]); b.append(a.label[1]); } else b.textContent = a.label;
      if (a.primary) b.classList.add("primary");
      b._onClick = a.onClick;
      b.addEventListener("click", () => b._onClick());
      return b;
    }));
  }

  function renderVehicle() {
    $("card-dream").hidden = true; // sakin kartından kalan "açılınca adada çalışacak" satırı binada/araçta görünmesin
    $("card-tabs").hidden = true;
    $("card-traits").replaceChildren();
    const r = vehicle;
    const live = r.key ? traffic.active.get(r.key) : null;
    $("card-handle").textContent = KIND_NAMES[r.kind] ?? "Fahrzeug";
    icon(svg(ARAC_SIMGE[r.kind] ?? "araba"), null, true);
    const rows = [];
    if (r.kind === "zeplin") {
      const z = zeplin.pose;
      $("card-title").textContent = yerAdi("zeplin", "Wattenoog-Zeppelin");
      const m = minute();
      $("card-now").textContent = z.visible
        ? { gelis: "Kommt vom Festland herüber", tur: "Kreist über der Insel", donus: "Fliegt zurück zum Festland" }[z.phase]
        : m < 540 ? `Auf dem Festland, kommt um ${hourText(9)}` : `Auf dem Festland, morgen wieder um ${hourText(9)}`;
      if (z.visible) rows.push(["Tempo", kmh(z.speed)], ["Höhe", meter(z.y)]);
      rows.push(["Flüge", `Täglich von 9 bis ${hourText(22)}`]);
      // Pilotlar: mesleği zeplin pilotu olan sakinler (kartından açılır). Etiket cinsiyetsiz ("Am Steuer").
      for (let i = 0; i < residents.length; i++) if (sim.dreamJob(residents[i]).id === "zeplin_pilotu") rows.push(["Am Steuer", at(residents[i]), () => select(i)]);
      // Reklam her zaman "Anzeige" etiketli (UWG/MStV, DEVIR §4.6).
      if (ZEPLIN_REKLAM.ad) rows.push(["Anzeige", ZEPLIN_REKLAM.ad]);
      facts(rows);
      const f = follow.get();
      if (z.visible) followActions(f?.kind === "zeplin" ? f.view : null, { kind: "zeplin" }, ["kamera", "Nebenher fliegen"]);
      return;
    }
    if (r.kind === "bus") {
      const line = traffic.lines[r.line];
      $("card-title").textContent = `${line.name} · Fahrt ${r.dep + 1}`;
      const n = live ? people.busSeat.get(live) ?? 0 : 0;
      $("card-now").textContent = live ? (live.v < 0.3 ? "Wartet an einer Haltestelle oder Ampel" : kmh(live.v)) : "Fahrt beendet";
      rows.push(["Fahrgäste", plural(n, "Person", "Personen")], ["Haltestellen", `${plural(line.stops.length, "Haltestelle", "Haltestellen")}, alle ${line.headway} Minuten`]);
    } else if (r.kind === "car" || r.kind === "taxi") {
      const owner = r.owner != null ? residents[r.owner] : null;
      $("card-title").textContent = r.kind === "taxi" ? "Inseltaxi Wattenoog" : owner ? `Auto von ${at(owner)}` : "Auto";
      const done = r.key && !live; // yolculuk bitti, araç park yerinde
      $("card-now").textContent = r.parked ? "Geparkt" : live ? (live.parked ? "Gerade geparkt" : live.v < 0.3 ? "Wartet" : kmh(live.v)) : done ? (r.kind === "taxi" ? "Hat gerade jemanden abgesetzt" : "Gerade geparkt") : "Wartet auf Fahrgäste";
      if (owner) rows.push([r.kind === "taxi" ? "Fahrgast" : "Gehört", at(owner), () => select(r.owner)]);
    } else {
      $("card-title").textContent = { ambulans: yerAdi("saglik", "Inselklinik Wattenoog"), itfaiye: yerAdi("itfaiye", "Freiwillige Feuerwehr Wattenoog"), cop: yerAdi("garaj", "Bauhof Wattenoog") }[r.kind] ?? "";
      $("card-now").textContent = live ? ({ out: "Auf dem Weg zum Einsatz", wait: "Im Einsatz", back: "Auf dem Rückweg" }[live.phase] ?? (live.v < 0.3 ? "Leert eine Tonne" : "Auf Sammeltour")) : "Gerade nicht unterwegs";
    }
    facts(rows);
    const f = follow.get();
    const on = f?.kind === "arac" && f.key === r.key;
    if (live && (!live.parked || on)) followActions(on ? f.view : null, { kind: "arac", key: r.key }, ["kamera", "Hinterherfahren"]);
  }

  /** Dokununca takip kendiliğinden başlar; kartta yalnız bakış açısı seçilir (haritadan ya da gözünden). */
  function followActions(view, target, shoulderLabel) {
    if (view === "omuz") action(["harita", "Zurück zur Karte"], () => { follow.set(target, "harita"); render(); });
    else action(shoulderLabel, () => { follow.set(target, "omuz"); render(); });
  }

  /** Kart başlığındaki yuvarlak simge: harf (sakin) ya da çizgi simge (html: true). */
  function icon(text, color = null, html = false) {
    const el = $("card-icon");
    if (html) el.innerHTML = text; else el.textContent = text;
    el.style.background = color ?? "";
  }

  /** Araca dokununca: yoldaysa takip edilir, park halindeyse ona odaklanılır. */
  function selectVehicle(record) {
    if (!record) return;
    selected = null;
    mode = "arac";
    vehicle = record;
    dollhouse.close();
    const live = record.key ? traffic.active.get(record.key) : null;
    if (record.kind === "zeplin") follow.set({ kind: "zeplin" }, "harita");
    else if (live && !live.parked) follow.set({ kind: "arac", key: record.key }, "harita");
    else {
      follow.set(null);
      const at = record.slot != null ? traffic.slots[record.slot] : live?.route.position(live.s);
      if (at) flyTo(at.x, world.groundY(at.x, at.z), at.z, 45);
    }
    showCard();
  }

  $("olaybtn")?.addEventListener("click", () => { if (olay?.odak) { close(); olay.git?.(); } });
  $("gunun").addEventListener("click", () => {
    const th = people.theme;
    if (!th) return;
    const at = th.yer === "cami" ? world.workplaces.cami?.find(Boolean)?.door
      : th.id === "sinema" && people.cinema ? people.cinema.spot : world.placeOf(th.yer).anchors[0];
    if (at) { close(); flyTo(at[0], Math.max(0, world.height(at[0], at[1])), at[1], th.id === "sinema" ? 45 : 90); }
  });

  /** Kısa bildirim. */
  let toastTimer = null;
  function toast(text, ms = 3200) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  /** Sakin kartını görsel olarak paylaşır: sahnede kendisi (evdeyse evi), altında kartı. */
  async function shareResident(i) {
    const r = residents[i];
    const day = today();
    // Kadraj: sakin görünüyorsa yakından (masada oturuyorsa tentenin altından, alçak açıyla); görünmüyorsa
    // bulunduğu yer (evdeyse evi, değilse iş yeri/durak çevresi).
    let frame = null;
    const ne = people.activities[i]?.ne;
    if (people.visible[i]) {
      const role = people.roles[i]?.[people.plans[i].findIndex((q) => q === people.activities[i] || (q.bas === people.activities[i]?.bas && q.ne === ne))];
      const table = role?.item?.table;
      frame = { target: [people.positions[i * 3], people.positions[i * 3 + 1] + 1.0, people.positions[i * 3 + 2]], dist: table ? 8 : 12, up: table ? 0.14 : 0.55, inside: !!people.poses[i].indoor };
    } else if (ne === "ev" || ne === "uyku" || (ne === "yol" && people.activities[i].nereden === "ev" && people.travelCache[i]?.legs.find((l) => minute() < l.t1)?.kind === "before")) {
      const b = homeOf(i);
      if (b) frame = { target: [b.x, b.floors * 3.2 * 0.45, b.z], dist: Math.max(b.w, b.d, b.floors * 3.2) * 3.2, up: 0.45 };
    } else {
      const [x, z] = people.focusPoint(i);
      frame = { target: [x, world.groundY(x, z) + 2, z], dist: 45, up: 0.7 };
    }
    const shot = capture(frame);
    const pet = stories.petName(i);
    const t = sim.tenure(r, day);
    const card = residentCard(shot, {
      handle: at(r), letter: r.handle[0].toUpperCase(), color: `hsl(${r.seed % 360} 62% 58%)`,
      title: $("card-title").textContent, now: nowText(i),
      rows: [
        ["Zuhause", sim.streetAddress(r.slot)],
        ["Viertel", sim.mahalleName(sim.addressParts(r.slot).mahalle)],
        ["Hobby", people.hobbies[i].ad],
        ["Haustier", pet ? `${pet.kind} · ${pet.name}` : "Noch keins"],
        ["Auf der Insel", onIsland(t)],
      ],
      link: `https://wattenoog.rumpuskit.com/?bul=${encodeURIComponent(r.handle)}`,
    });
    const res = await shareCanvas(card, { name: `wattenoog-${r.handle}`, text: `Ich wohne auf Wattenoog: ${$("card-title").textContent}.`, url: `https://wattenoog.rumpuskit.com/?bul=${encodeURIComponent(r.handle)}` });
    if (res === "indirildi-kopyalandi") toast("Karte heruntergeladen, Link kopiert");
    else if (res === "indirildi") toast("Karte heruntergeladen");
  }

  function showCard() {
    $("card").hidden = false;
    document.body.classList.add("kart-acik");
    render();
  }

  function flyToFloor() {
    const { target, front } = dollhouse.focus();
    const dir = front.clone().multiplyScalar(0.72).setY(0.7).normalize();
    const size = Math.max(dollhouse.building.w, dollhouse.building.d);
    flyTo(target.x, target.y, target.z, Math.max(innerWidth < innerHeight ? 34 : 19, size * (innerWidth < innerHeight ? 2.0 : 1.15)), dir);
  }

  function homeOf(i) {
    const slot = residents[i].slot;
    return world.buildings.find((b) => b.daireler && slot >= b.slot0 && slot < b.slot0 + b.daireler);
  }

  /** Sakini seçer; evdeyse evinin içini açar. */
  /** Sakini seçer ve takip eder (takip: false, takipteki kişi bir binaya girip çıkınca yalnız kartı tazelemek için). */
  function select(i, fly = true, takip = true) {
    selected = i;
    mode = "sakin";
    // Evdeyse ya da işteyse iç mekâna uçulur (takip yine sürer, yaklaşma uçuştan gelir); dışarıdaysa takip kamerayı getirir.
    if (takip) follow.set({ kind: "sakin", i }, "harita", { yaklas: false });
    const seg = people.activities[i];
    const atHome = seg && (seg.ne === "ev" || seg.ne === "uyku");
    const home = homeOf(i);
    const workB = seg?.ne === "is" && !people.works[i].loc.outdoor ? people.works[i].loc.building : null;
    if (workB && !["liman", "tersane"].includes(workB.kind)) {
      const floor = sim.roll(residents[i].seed, "kat") % workB.floors;
      if (dollhouse.building !== workB || dollhouse.floor !== floor) dollhouse.open(workB, floor);
      if (fly) flyToFloor();
    } else if (atHome && home) {
      const floor = Math.floor((residents[i].slot - home.slot0) / home.perFloor);
      if (dollhouse.building !== home || dollhouse.floor !== floor) dollhouse.open(home, floor);
      if (fly) flyToFloor();
    } else {
      dollhouse.close();
      if (takip) follow.set({ kind: "sakin", i }, "harita");
      else if (fly) {
        const [x, z] = people.focusPoint(i);
        flyTo(x, world.groundY(x, z), z, innerWidth < innerHeight ? 30 : 18);
      }
    }
    showCard();
  }

  /** Bir binaya dokununca: içini aç (her binanın iç mekânı var: konut, iş yeri, kamu binası). Takip biter. */
  function openBuilding(b) {
    if (!b) return;
    follow.set(null);
    selected = null;
    mode = "bina";
    dollhouse.open(b, dollhouse.building === b ? dollhouse.floor : 0);
    flyToFloor();
    showCard();
  }

  function changeFloor(delta) {
    if (!dollhouse.isOpen()) return;
    dollhouse.setFloor(dollhouse.floor + delta);
    mode = "bina";
    selected = null;
    flyToFloor();
    showCard();
  }

  function find(text) {
    const handle = sim.normalizeHandle(text);
    if (!handle) return;
    const i = byHandle.get(handle);
    if (i == null) {
      selected = null;
      mode = null;
      dollhouse.close();
      $("card").hidden = false;
      $("floorbar").hidden = true;
      $("card-handle").textContent = "@" + handle;
      $("card-title").textContent = "Dieser Name wohnt noch nicht auf der Insel.";
      $("card-now").textContent = `Neue Follower von @${TIKTOK} warten am Fähranleger und ziehen beim nächsten Einzug ein (${einzugUm()}). ` +
        "Du folgst schon länger? Schreib „einziehen“ unter ein Video, dann bekommst du ein Haus. " +
        "(TikTok lässt manche Konten, etwa private, aus der Follower-Liste weg; die können nicht einziehen.)";
      $("card-facts").replaceChildren();
      $("card-tabs").hidden = true;
      $("card-traits").replaceChildren();
      return;
    }
    select(i);
  }

  function close() {
    selected = null;
    mode = null;
    vehicle = null;
    follow.set(null);
    dollhouse.close();
    $("card").hidden = true;
    document.body.classList.remove("kart-acik");
    $("floorbar").hidden = true;
  }

  // Telefon / uygulama içi tarayıcı (15 Kasım): üst panel kapalıyken bilgi satırları tek satırda 6 sn'de bir sırayla
  // döner; ok düğmesi hepsini açar. Video kaydı (kaydet.mjs saatini önceden kurar) eski, açık düzeni görür.
  const kayit = typeof globalThis.__manual === "function";
  // Saat kutusunun sığma ölçümü yazı tipi yüklenince ve boyut değişince yeniden yapılır (yedek yazı tipiyle ölçülüp kesiliyordu).
  const saatTazele = () => { $("clock").dataset.text = ""; };
  document.fonts?.ready.then(saatTazele);
  addEventListener("resize", saatTazele);
  if (kayit) document.body.classList.add("kayit", "hud-acik");
  const hudAc = $("hud-ac");
  hudAc?.addEventListener("click", () => {
    const on = document.body.classList.toggle("hud-acik");
    hudAc.setAttribute("aria-expanded", String(on));
    hudAc.setAttribute("aria-label", on ? "Details ausblenden" : "Details anzeigen");
  });
  const SIRA = ["olaybtn", "secim", "next", null, "waiting", "gunun", "online"].map((id) => (id ? $(id) : document.querySelector("#hud .links")));
  let siradaki = null;
  function dondur() {
    const vis = SIRA.filter((el) => el && !el.hidden);
    const yeni = vis[(vis.indexOf(siradaki) + 1) % vis.length] ?? null;
    if (yeni === siradaki) return;
    siradaki?.classList.remove("tk-on");
    siradaki = yeni;
    siradaki?.classList.add("tk-on");
  }
  dondur();
  setInterval(() => { if (!document.body.classList.contains("hud-acik") && $("card").hidden) dondur(); }, 6000);

  $("card-close").addEventListener("click", close);
  $("floor-up").addEventListener("click", () => changeFloor(1));
  $("floor-down").addEventListener("click", () => changeFloor(-1));
  $("floor-exit").addEventListener("click", close);

  return {
    select,
    find,
    toast,
    openBuilding,
    selectVehicle,
    close,
    selected: () => (mode === "sakin" ? selected : null),
    selectedVehicle: () => (mode === "arac" && !$("card").hidden ? vehicle : null),
    tick(unix, minuteNow, day, times) {
      // Gün doğumu/batımı sığarsa (uzun gün adlarında ve telefonda gizlenir; tam metin ipucunda).
      const sunText = times?.rise != null ? ` · ${clockText(times.rise)}–${clockText(times.set)}` : "";
      const clock = $("clock"), text = `${clockText(minuteNow)} · ${DAYS[sim.weekday(day)]}`;
      if (clock.dataset.text !== text + sunText) {
        clock.dataset.text = text + sunText;
        clock.title = text + sunText;
        clock.innerHTML = `${text}<span class="sun">${sunText ? " · " + svg("gunes") + sunText.slice(3) : ""}</span>`;
        clock.classList.remove("dar");
        if (clock.scrollWidth > clock.clientWidth + 1) clock.classList.add("dar");
        // Hâlâ sığmıyorsa (dar telefon, kapalı üst panel) gün kısaltılır.
        if (clock.scrollWidth > clock.clientWidth) clock.textContent = `${clockText(minuteNow)} · ${DAYS_SHORT[sim.weekday(day)]}`;
      }
      // Döküm benzetimden: işte, evde (uyuyanlar dahil) ve dışarıda (yolda, çarşıda, hobisinde).
      let work = 0, home = 0;
      for (const seg of people.activities) {
        if (!seg) continue;
        if (seg.ne === "is") work++;
        else if (seg.ne === "ev" || seg.ne === "uyku") home++;
      }
      const out = residents.length - work - home;
      // Toplam, dar ekranda gizlenir (satır kesilmesin).
      if (!residents.length) {
        $("stats").innerHTML = `<span class="bos"></span>`;
        $("stats").firstChild.textContent = listError === "none" ? "Die Einwohnerliste ist gerade nicht erreichbar" : "Die Insel wartet auf ihre ersten Einwohner";
      } else {
        const chip = (ic, n, t, cls = "") => `<span class="chip ${cls}"><b>${svg(ic)}${num(n)}</b><small>${t}</small></span>`;
        $("stats").innerHTML = chip("sakinler", residents.length, "Einwohner", "ana") + chip("is", work, "bei der Arbeit") + chip("ev", home, "zu Hause") + chip("yurur", out, "unterwegs");
      }
      // Günün olayı (etkinlik.js): üst panelde tek satır; dokununca kamera olayın yerine gider.
      const th = people.theme, gun = $("gunun");
      gun.hidden = !th || !residents.length;
      if (th) {
        const key = `${th.id}|${th.ad}`;
        if (gun.dataset.key !== key) {
          gun.dataset.key = key;
          const ic = {
            kilise: "cami", konser: "nota", feuerwehr: "kamyon", sinema: "kamera", sonntag: "yurur", silvester: "yildizli", neujahr: "yildizli",
            heiligabend: "agac", weihnachten: "agac", nikolaus: "ev", martin: "ampul", reformation: "kabak", einheit: "kamu", biike: "gunes",
            karfreitag: "cami", osterfeuer: "gunes", ostern: "yurur", maitanz: "nota", maifeiertag: "agac", himmelfahrt: "yurur", pfingsten: "fener",
            wattwanderung: "dalga", bosseln: "top", kutter: "balik", klonschnack: "fincan", gunbatimi: "gunes", yildiz: "ampul", ucurtma: "dag",
            temizlik: "dalga", sandburg: "semsiye", komsuluk: "mahalle", mac: "top",
          }[th.id] ?? "gunes";
          gun.innerHTML = svg(ic);
          gun.append(`Heute: ${th.ad}${th.bas != null ? ` · ${clockText(th.bas)} Uhr` : ""}`);
          gun.title = gun.textContent;
        }
      }
      // Günün olayı (olay.js): üst panelde ilk satır; dokununca olay yerine uçar.
      const ob = $("olaybtn"), oy = olay?.yazi?.(minuteNow);
      if (ob) {
        ob.hidden = !oy;
        if (oy && ob.dataset.t !== oy.kisa) {
          ob.dataset.t = oy.kisa;
          ob.innerHTML = svg(olay.plan?.tur === "firtina" ? "dalga" : olay.plan?.tur === "balina" || olay.plan?.tur === "yunus" ? "balik" : "uyari");
          ob.append(oy.kisa);
          ob.title = oy.uzun;
        }
      }
      if (!siradaki || siradaki.hidden) dondur();
      if (!$("card").hidden) render();
    },
  };
}

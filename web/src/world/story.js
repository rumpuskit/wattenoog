// Sakinlerin hikâyeleri: kişilik özellikleri, ilişkiler (en yakın arkadaş, komşular, iş arkadaşları),
// adaya gelişten bugüne olaylar ve günün akışı. Hepsi simülasyondan ve tohumdan türetilir; aynı kişiye
// bakan herkes aynı hikâyeyi okur.
import { ETKINLIK } from "./etkinlik.js";
import { prefOf } from "../tercih.js";
import * as sim from "../sim.js";
import { clockText, dateText } from "../fmt.js";

// Anahtarlar katalogdaki evcil türleri (evcil_hayvanlar). Görünen metinler Almanca; özellikler ve olaylar
// cinsiyetsiz (sıfat ya da zamirsiz cümle; DEVIR §4.2).
const PET_NAMES = {
  Katze: ["Mila", "Minka", "Socke", "Luna", "Felix", "Tiger", "Smilla", "Momo"],
  Hund: ["Bruno", "Paul", "Frieda", "Balu", "Lotte", "Kalle", "Hein", "Emma"],
  Kaninchen: ["Krümel", "Hoppel", "Flocke", "Wuschel", "Pünktchen", "Möhre"],
  Wellensittich: ["Pieps", "Hansi", "Kiwi", "Fiete"],
};

const HOBBY_TRAIT = {
  balik: "Geduldig", kitap: "Leseratte", satranc: "Kartenprofi", schach: "Denkt drei Züge voraus", resim: "Kreativ",
  bisiklet: "Sportlich", yuzme: "Wasserratte", ucurtma: "Jung geblieben", gitar: "Singt gern", fotograf: "Gutes Auge",
  kosu: "Sportlich", bosseln: "Ehrgeizig", yoga: "Ruhepol", mangal: "Grillprofi", watt: "Kennt die Gezeiten", kite: "Abenteuerlustig",
};
const JOB_TRAIT = {
  doktor: "Hilfsbereit", hemsire: "Fürsorglich", ogretmen: "Erklärt gern", yazilimci: "Technikfan",
  tasarimci: "Blick fürs Detail", avukat: "Schlagfertig", mimar: "Plant gern", barista: "Freundlich", garson: "Freundlich",
  asci: "Isst gern gut", firinci: "Steht früh auf", balikci: "Steht früh auf", cankurtaran: "Mutig", rehber: "Gesprächig",
  fener_bekcisi: "Mag die Ruhe", bahcivan: "Naturverbunden", ciftci: "Bodenständig", kutuphaneci: "Leseratte",
  seramikci: "Geschickt", marangoz: "Geschickt", yelkenci: "Geschickt", ressam: "Kreativ", muhasebeci: "Genau", memur: "Ordentlich",
  liman_iscisi: "Packt an", gemi_ustasi: "Handwerklich begabt", kasiyer: "Pünktlich", resepsiyonist: "Höflich",
  kahveci: "Steht früh auf", lunapark: "Gesellig", polis: "Gerecht", futbolcu: "Teamgeist",
  anakara: "Pendelt täglich", ogrenci: "Wissbegierig", uzaktan: "Unabhängig", emekli: "Hat schon alles gesehen",
  deichschaefer: "Naturverbunden", strandkorbmacher: "Geschickt", bernstein: "Geduldig", lokfuehrer: "Pünktlich",
  seenotretter: "Mutig", itfaiyeci: "Mutig", sofor: "Pünktlich", hakem: "Gerecht", pazarci: "Gesprächig", eczaci: "Hilfsbereit",
  berber: "Gesprächig", sahil_guvenlik: "Wachsam", veteriner: "Tierlieb", hakim: "Gerecht", savci: "Hartnäckig",
  muhtar: "Kennt alle", okul_muduru: "Organisiert", belediye_baskani: "Kennt alle", zeplin_pilotu: "Schwindelfrei",
};
const EXTRA_TRAITS = ["Lustig", "Gesellig", "Gelassen", "Nostalgisch", "Neugierig", "Pünktlich", "Verträumt", "Großzügig", "Ostfriesentee-Fan", "Kaffee-Fan"];

const dateOf = dateText;
// Adını gizleyen sakin hikâyelerde de "Name verborgen" olarak geçer.
const atOf = (r) => (r.hidden ? "Name verborgen" : "@" + r.handle);

export class Stories {
  constructor(people) {
    this.people = people;
    const res = people.residents;
    // En yakın arkadaş: aynı hobiyi paylaşanlar sıra numarasına göre ikişer eşleşir (karşılıklı).
    this.friend = new Int32Array(res.length).fill(-1);
    const byHobby = new Map();
    res.forEach((r, i) => {
      const h = people.hobbies[i].id;
      if (!byHobby.has(h)) byHobby.set(h, []);
      byHobby.get(h).push(i);
    });
    for (const list of byHobby.values()) {
      list.sort((a, b) => res[a].slot - res[b].slot);
      for (let k = 0; k + 1 < list.length; k += 2) {
        this.friend[list[k]] = list[k + 1];
        this.friend[list[k + 1]] = list[k];
      }
    }
    // İş arkadaşları: aynı iş yeri.
    this.workmates = new Map();
    res.forEach((r, i) => {
      // Evde olanların (emekli, evden çalışan) ve anakaraya gidenlerin ortak iş yeri yok.
      if (["ev", "anakara", "zeplin"].includes(people.works[i].wp.kind)) return;
      const key = people.works[i].wp.kind + ":" + people.works[i].wp.index;
      if (!this.workmates.has(key)) this.workmates.set(key, []);
      this.workmates.get(key).push(i);
    });
  }

  traits(i) {
    const p = this.people;
    const r = p.residents[i];
    const out = [];
    const add = (t) => { if (t && !out.includes(t)) out.push(t); };
    add(HOBBY_TRAIT[p.hobbies[i].id]);
    add(JOB_TRAIT[p.works[i].job]);
    const day = p.day;
    if (sim.pet(r, day)) add("Tierlieb");
    const plan = p.plans?.[i];
    if (plan) {
      // Erkenci: sabah erken uyanan (gece vardiyasından dönenler sayılmaz).
      const wake = plan[0]?.ne === "uyku" ? plan[0].son : 420;
      if (wake < 390) add("Steht früh auf");
      if (plan[0]?.ne === "is") add("Nachteule");
      const sleep = plan.findLast((s) => s.ne === "uyku")?.bas ?? 1380;
      if (sleep > 1400) add("Nachteule");
    }
    add(EXTRA_TRAITS[sim.roll(r.seed, "huy") % EXTRA_TRAITS.length]);
    return out.slice(0, 4);
  }

  petName(i) {
    const r = this.people.residents[i];
    const kind = sim.pet(r, this.people.day);
    if (!kind) return null;
    const names = PET_NAMES[kind] ?? ["Krümel"];
    // Doğrulanmış sakin evcilinin adını seçebilir (tercih.js).
    return { kind, name: prefOf(r.handle)?.evcil_ad ?? names[sim.roll(r.seed, "evcilAd") % names.length] };
  }

  neighbors(i) {
    const p = this.people;
    const slot = p.residents[i].slot;
    const per = sim.cap("daire_per_bina");
    const base = slot - (slot % per);
    const out = [];
    for (let s = base; s < base + per; s++) {
      const j = p.slotToIndex.get(s);
      if (j != null && j !== i) out.push(j);
    }
    return out;
  }

  coworkers(i) {
    const p = this.people;
    const key = p.works[i].wp.kind + ":" + p.works[i].wp.index;
    return (this.workmates.get(key) ?? []).filter((j) => j !== i);
  }

  /** Adaya gelişten bugüne olaylar (en yeniden eskiye). */
  timeline(i) {
    const p = this.people;
    const r = p.residents[i];
    const today = p.day;
    const events = [];
    events.push({ day: r.arrived_day, text: `Mit der Fähre gekommen und eingezogen: ${sim.streetAddress(r.slot)}.` });
    const job = sim.job(r);
    const startText = { emekli: "Genießt seitdem den Ruhestand auf der Insel.", uzaktan: "Eine Ecke der Wohnung ist jetzt Büro: Homeoffice mit Inselblick.", anakara: "Pendelt seitdem mit der Fähre zur Arbeit aufs Festland.", ogrenci: "Pendelt seitdem mit der Fähre zum Studium aufs Festland." }[job.id] ?? `Erster Arbeitstag: ${p.works[i].loc.name}.`;
    events.push({ day: r.arrived_day + 1, text: startText });
    // Terfiler: kıdem eşikleri (emeklilerde yok).
    for (let day = r.arrived_day + 1; !job.calismaz && day <= today; day++) {
      const before = sim.rank(r, day - 1), now = sim.rank(r, day);
      // Unvan sim.title ile: kişi biçim seçmediyse iş alanı + kademe ("Krabbenfischerei (Leitung)"), cinsiyet tahmini yok.
      if (now > before) events.push({ day, text: `Befördert, jetzt: ${sim.title(r, day)}.` });
    }
    const pet = this.petName(i);
    if (pet) {
      const adopt = r.arrived_day + 5 + (sim.roll(r.seed, "evcil_gun") % 25);
      if (adopt <= today) events.push({ day: adopt, text: `Neues Haustier: ${pet.kind} ${pet.name}.` });
    }
    const f = this.friend[i];
    if (f >= 0) {
      const met = Math.max(r.arrived_day, p.residents[f].arrived_day) + 1 + (sim.roll(r.seed ^ p.residents[f].seed, "tanisma") % 9);
      if (met <= today) events.push({ day: met, text: `${atOf(p.residents[f])} beim ${p.hobbies[i].ad} kennengelernt; seitdem unzertrennlich.` });
    }
    const first = r.arrived_day + 2 + (sim.roll(r.seed, "ilkHobi") % 5);
    if (first <= today) events.push({ day: first, text: `Zum ersten Mal auf der Insel: ${p.hobbies[i].ad}.` });
    return events.filter((e) => e.day <= today).sort((a, b) => b.day - a.day).map((e) => ({ ...e, date: dateOf(e.day) }));
  }

  /** Günün akışı: plan parçaları insan diliyle. */
  today(i, placeLabel, homeLabel) {
    const p = this.people;
    const plan = p.plans[i];
    const out = [];
    const f = this.friend[i];
    plan.forEach((seg, k) => {
      const at = clockText(seg.bas);
      if (seg.ne === "uyku") { if (k > 0) out.push([at, "Schlafen"]); return; }
      if (seg.ne === "ev") { out.push([at, homeLabel(k)]); return; }
      if (seg.ne === "yol") {
        const trip = p.tripStore?.[i]?.get(k) ?? p._trip(i, seg, k);
        const how = { araba: "mit dem Auto", otobus: "mit dem Bus", taksi: "mit dem Taxi", yaya: "zu Fuß" }[trip?.mode];
        // Dışarı çıkışta gidilen gerçek yer (etkinliğin yeri), plandaki genel "meydan" değil.
        const to = seg.nereye === "meydan" || seg.nereye.startsWith("hobi:") ? p._placeOf(i, k + 1) ?? seg.nereye : seg.nereye;
        const dest = to === "ev" ? "Nach Hause" : `Unterwegs → ${placeLabel(to)}`;
        out.push([at, how ? `${dest} · ${how}` : dest]);
        return;
      }
      if (seg.ne === "is") { out.push([at, `Bei der Arbeit · ${p.works[i].loc.name}`]); return; }
      const withFriend = f >= 0 && p.plans[f]?.some((q) => q.yer === seg.yer && q.bas < seg.son && q.son > seg.bas) ? ` (mit ${atOf(p.residents[f])})` : "";
      const act = p.acts?.[i]?.get(k);
      if (act && ETKINLIK[act]) out.push([at, `${ETKINLIK[act].ad}${withFriend}`]);
      else if (seg.ne === "hobi") out.push([at, `${p.hobbies[i].ad} · ${placeLabel(seg.yer)}${withFriend}`]);
      else if (seg.ne === "meydan") out.push([at, `Draußen · ${placeLabel(p._placeOf(i, k) ?? "meydan")}${withFriend}`]);
    });
    return out;
  }
}

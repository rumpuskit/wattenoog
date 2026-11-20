// "Benim evim": yorumla doğrulama ve doğrulanmış sakinin seçimleri. TikTok girişi yok: site 4 haneli kod verir,
// kişi kodu videolarımızdan birine yorum olarak yazar; yorumlar saatte bir okunur, kod o ada bağlanınca bu cihaz
// o sakin olarak seçim yapabilir. Serbest metin yok: her seçim hazır listeden.
import { api } from "./api.js";
import { TIKTOK } from "./config.js";
import { ETKINLIK } from "./world/etkinlik.js";
import { CICEK_AD, SECENEK, dateKey, setPrefs } from "./tercih.js";
import * as sim from "./sim.js";

export function createBen({ sayfa, residents, people, ui, today, onPrefs, secim, prefsData }) {
  let state = null, poll = null, busy = false, prefill = "", degistir = false;
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const button = (text, cls, onClick) => { const b = el("button", text, cls); b.addEventListener("click", onClick); return b; };
  const idxOf = (h) => residents.findIndex((r) => r.handle === h);

  async function refresh() {
    try { state = await api.ben(); } catch (e) { state = { hata: e.message }; }
    render();
  }

  function render() {
    if (!sayfa.isOpen) return;
    clearInterval(poll); poll = null;
    if (!state) return sayfa.set(el("p", "Lädt …", "muted"));
    if (state.hata) return sayfa.set([el("p", `Gerade keine Verbindung (${state.hata}). Versuch es gleich noch einmal.`, "muted"), button("Nochmal versuchen", "ana", refresh)]);
    if (state.handle) return sayfa.set(verified());
    if (state.bekleyen && !degistir) {
      poll = setInterval(refresh, 60000); // yorumlar saatte bir okunur; açık kaldıkça dakikada bir bakılır
      return sayfa.set(pending());
    }
    return sayfa.set(start());
  }

  function start() {
    const out = [];
    // Süresi dolan kod (7 gün içinde yorumu göremedik): kişi neden başa döndüğünü bilsin, aynı adla tek dokunuşla yeniden alsın.
    const eski = state?.suresi_doldu;
    if (eski && !degistir) {
      out.push(el("p", `Dein Code für @${eski} ist abgelaufen; deinen Kommentar haben wir nicht gesehen. Hol dir einfach mit demselben Namen einen neuen Code und poste ihn noch einmal.`));
      if (!prefill) prefill = eski;
    }
    out.push(el("p", "Ist das dein Zuhause auf der Insel? Bestätige, dass du es bist. Dann wählst du Wandfarbe, Sofa, Blumen am Fenster und den Namen deines Haustiers und entscheidest, was du heute machst und wen du triffst."));
    out.push(el("p", `So geht's: Gib deinen Benutzernamen ein, dann bekommst du einen 4-stelligen Code. Den schreibst du als Kommentar unter ein aktuelles Video von @${TIKTOK}. Kein Passwort, kein Login.`, "muted"));
    const input = el("input");
    Object.assign(input, { type: "text", placeholder: "@benutzername", autocomplete: "off", spellcheck: false, inputMode: "text", value: prefill ? "@" + prefill : "" });
    input.className = "ben-input";
    input.style.cssText = "width:100%;box-sizing:border-box;padding:11px 12px;border-radius:12px;border:1px solid var(--line);background:var(--glass-2);color:var(--ink);font:800 15px Nunito,system-ui,sans-serif;margin:8px 0";
    const msg = el("p", "", "muted");
    const go = button("Code holen", "ana", async () => {
      const h = input.value.trim().replace(/^@/, "").toLowerCase();
      if (!/^[a-z0-9._]{2,24}$/.test(h)) { msg.textContent = "Gib deinen Benutzernamen genau wie auf TikTok ein (Buchstaben, Ziffern, Punkte, Unterstriche)."; return; }
      if (busy) return;
      busy = true;
      try { await api.baslat(h); degistir = false; prefill = ""; await refresh(); } catch (e) { msg.textContent = e.message; } finally { busy = false; }
    });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go.click(); });
    out.push(input, go, msg);
    if (degistir && state?.bekleyen) out.push(button("Zurück zu meinem Code", "secim", () => { degistir = false; render(); }));
    return out;
  }

  function pending() {
    const { kod, handle, gorulen, kalan_gun } = state.bekleyen;
    const out = [];
    out.push(el("p", `Dein Code für @${handle}:`));
    out.push(el("p", kod, "kod"));
    out.push(el("p", `Schreib ihn als @${handle} unter irgendein Video von @${TIKTOK}. Der Code muss nur im Kommentar stehen: „Code ${kod}“ oder einfach „${kod}“.`));
    // Kod başka bir hesaptan yazılmış görüldüyse kişi neden eşleşmediğini bilsin.
    if (gorulen) out.push(el("p", `Wir haben deinen Code bei @${gorulen} gesehen, er gehört aber zu @${handle}. Poste ihn als @${handle} oder korrigiere den Benutzernamen.`));
    const gun = kalan_gun ?? 7;
    out.push(el("p", `Wir lesen die Kommentare jede Stunde, aber TikTok zeigt sie uns manchmal mit Verspätung: Meist klappt es innerhalb weniger Stunden. Dann öffnet sich diese Seite von selbst (dieses Gerät merkt es sich, auch wenn du die Seite schließt). Der Code gilt noch ${gun === 1 ? "1 Tag" : `${gun} Tage`}; du brauchst keinen neuen.`, "muted"));
    out.push(el("p", "Schreib ihn als neuen Kommentar unter das Video, nicht als Antwort auf einen anderen Kommentar; die sehen wir schneller.", "muted"));
    if (idxOf(handle) < 0) out.push(el("p", "Dieser Name wohnt gerade nicht auf der Insel. Folg uns zuerst auf TikTok (du folgst schon länger? Dann schreib „einziehen“ unter ein Video); beim nächsten Einzug ist dein Zuhause fertig.", "muted"));
    out.push(button("Jetzt prüfen", "secim", refresh), button("Benutzernamen ändern", "secim", () => { degistir = true; prefill = handle; render(); }));
    return out;
  }

  /** Seçim düğmeleri: değeri kaydeder, hemen uygular. */
  async function save(patch, note) {
    try {
      const r = await api.tercih(patch);
      state.tercih = r.tercih;
      prefsData[state.handle] = r.tercih;
      setPrefs(prefsData, residents);
      onPrefs(patch);
      if (note) ui.toast(note);
    } catch (e) { ui.toast(e.message); }
    render();
  }

  function swatches(key, title) {
    const box = el("div", null, "renkler");
    for (const c of SECENEK[key]) {
      const b = el("button", null, "renk" + (state.tercih[key] === c ? " on" : ""));
      b.style.background = c;
      b.setAttribute("aria-label", `${title} ${c}`);
      b.addEventListener("click", () => save({ [key]: state.tercih[key] === c ? null : c }, "Gespeichert"));
      box.append(b);
    }
    return [el("h3", title), box];
  }

  function chips(list, current, label, onPick) {
    const box = el("div");
    for (const v of list) box.append(button(label(v), "secim" + (current === v ? " on" : ""), () => onPick(current === v ? null : v)));
    return box;
  }

  function verified() {
    const h = state.handle, i = idxOf(h), t = state.tercih ?? {};
    const out = [];
    out.push(el("p", `Bestätigt: Du bist @${h}.`));
    if (i < 0) { out.push(el("p", "Du hast noch kein Zuhause auf der Insel. Folg uns auf TikTok (oder schreib „einziehen“ unter ein Video, wenn du schon länger folgst); nach dem nächsten Einzug siehst du deine Auswahl in deinem Zuhause.", "muted")); }
    else {
      const go = button("Zu meinem Zuhause", "ana", () => { sayfa.close(); ui.select(i); });
      const share = button("Meine Karte teilen", "secim", () => { sayfa.close(); ui.select(i); setTimeout(() => document.querySelector("#card-actions button:last-child")?.click(), 1200); });
      out.push(go, share);
    }
    out.push(...swatches("duvar", "Wandfarbe"), ...swatches("koltuk", "Sofa"), ...swatches("perde", "Gardinen"));
    out.push(el("h3", "Blumen am Fenster"), chips(SECENEK.cicek.filter((c) => c !== "yok"), t.cicek, (c) => CICEK_AD[c], (c) => save({ cicek: c }, c ? "Die Blumen stehen am Fenster" : "Blumen entfernt")));
    const pet = i >= 0 ? sim.pet(residents[i], today()) : null;
    if (pet) {
      out.push(el("h3", `Name für dein Haustier (${pet})`));
      out.push(chips(SECENEK.evcil_ad, t.evcil_ad, (n) => n, (n) => save({ evcil_ad: n }, n ? `Dein Haustier heißt jetzt ${n}` : null)));
    } else out.push(el("p", "Du hast kein Haustier. Schreib „Haustier: Katze“ unter eines unserer Videos, dann kommt es beim nächsten Einzug; danach suchst du hier den Namen aus.", "muted"));

    // Bugün: etkinlik ve buluşma (yalnız bugüne geçerli).
    const g = t.gun?.tarih === dateKey(today()) ? t.gun : {};
    out.push(el("h3", "Was mache ich heute?"));
    out.push(el("p", "Deine Figur macht das, wenn es in die Zeit passt, in der sie draußen ist (Sternegucken zum Beispiel nur nachts).", "muted"));
    const setGun = (patch) => save({ gun: { tarih: dateKey(today()), etkinlik: g.etkinlik ?? null, bulusma: g.bulusma ?? null, ...patch } }, "Plan für heute gespeichert");
    out.push(chips(SECENEK.etkinlik, g.etkinlik, (id) => ETKINLIK[id]?.ad.replace(/,.*$/, "") ?? id, (id) => setGun({ etkinlik: id })));
    out.push(el("h3", "Wen treffe ich?"));
    out.push(el("p", "Wenn ihr euch gegenseitig auswählt, seid ihr zur selben Zeit am selben Ort.", "muted"));
    const friends = residents.filter((r) => r.handle && r.handle !== h).map((r) => r.handle).sort();
    const sel = el("select");
    sel.style.cssText = "width:100%;padding:10px;border-radius:12px;border:1px solid var(--line);background:var(--glass-2);color:var(--ink);font:800 14px Nunito,system-ui,sans-serif";
    sel.append(new Option("Niemanden", ""), ...friends.map((f) => new Option("@" + f, f, false, g.bulusma === f)));
    sel.addEventListener("change", () => setGun({ bulusma: sel.value || null }));
    out.push(sel);
    if (g.bulusma) {
      const other = people.residents.findIndex((r) => r.handle === g.bulusma);
      const mutual = other >= 0 && people.meet?.[i] === other;
      out.push(el("p", mutual ? `@${g.bulusma} hat dich auch gewählt: Ihr trefft euch heute.` : `Ihr trefft euch, wenn @${g.bulusma} dich auch wählt. Sag Bescheid.`, "muted"));
    }

    // Seçim (açıksa): adaylık ve oy siteden de verilir; sunucu yorumdakiyle aynı kuralı uygular.
    const s = secim?.();
    if (s?.durum === "acik") {
      out.push(el("h3", "Bürgermeisterwahl"));
      out.push(button("Ich kandidiere", "secim", async () => { try { await api.secim({ aday: true }); ui.toast("Kandidatur eingetragen; nach der nächsten Auszählung stehst du auf der Liste"); } catch (e) { ui.toast(e.message); } }));
      for (const [ad] of (s.adaylar ?? []).filter(([a]) => a)) out.push(button(`Stimme für @${ad}`, "secim", async () => { try { await api.secim({ oy: ad }); ui.toast("Stimme gespeichert; sie zählt bei der nächsten Auszählung"); } catch (e) { ui.toast(e.message); } }));
    }
    out.push(el("p", " "));
    out.push(button("Auf diesem Gerät abmelden", "secim", async () => { await api.cikis(); state = null; refresh(); }));
    return out;
  }

  return {
    /** handle: karttaki "Das bin ich" ile gelindiyse ad kutusu dolu gelir. */
    open(handle = "") {
      prefill = handle;
      sayfa.open("Mein Zuhause", el("p", "Lädt …", "muted"));
      refresh();
    },
    /** Sayfa yüklenince: doğrulanmışsa sessizce durumu al (kart ve menü için). */
    async peek() { if (api.hasToken()) { try { state = await api.ben(); } catch {} } return state; },
    get handle() { return state?.handle ?? null; },
  };
}

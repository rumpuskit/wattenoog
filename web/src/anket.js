// Anketler: yarının günün olayı (sabit günler hariç: takvim günleri, cuma Shanty-Chor, cumartesi pazar ve plaj sineması,
// pazar kilisesi/yürüyüşü) ve cumartesi sinemasının film türü (haftalık). Cihaz başına bir oy (değiştirilebilir); sonuçlar
// herkese açık. Kazanan olay ertesi gün adada gerçekten olur (etkinlik.js dayTheme), film türü perdede oynar.
import { api } from "./api.js";
import { FILM_AD, FILM_SECENEK, TEMA_AD, TEMA_SECENEK, dateKey, setVotes, weekKey } from "./tercih.js";
import * as sim from "./sim.js";
import { DAYS, num, plural } from "./fmt.js";
import { fixedTheme, themeOptions } from "./world/etkinlik.js";

export function createAnket({ sayfa, today, world, toast, onVote }) {
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

  /** Yarın sabit bir gün mü (oylama yok)? etkinlik.js dayTheme ile aynı kural (fixedTheme). */
  function fixedTomorrow() {
    const th = fixedTheme(today() + 1, world);
    return th ? th.ad : null;
  }

  function poll(id, title, note, options, labels, data) {
    const out = [el("h3", title)];
    if (note) out.push(el("p", note, "muted"));
    const counts = data?.sonuc ?? {}, mine = data?.benim ?? null;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const o of options) {
      const n = counts[o] ?? 0;
      const b = el("button", `${labels[o]}${n ? ` · ${num(n)}` : ""}`, "secim" + (mine === o ? " on" : ""));
      b.addEventListener("click", async () => {
        try { await api.oy(id, o); onVote?.(id, o); toast("Stimme gespeichert"); await open(true); } catch (e) { toast(e.message); }
      });
      out.push(b);
      if (total) { const bar = el("div", null, "cubuk"); const fill = el("i"); fill.style.width = `${Math.round((n / total) * 100)}%`; bar.append(fill); out.push(bar); }
    }
    out.push(el("p", total ? `Bisher ${plural(total, "Stimme", "Stimmen")}.` : "Noch keine Stimmen. Fang du an.", "muted"));
    return out;
  }

  async function open(keep = false) {
    if (!keep) sayfa.open("Umfrage", el("p", "Lädt …", "muted"));
    const t = today(), tema = `tema:${dateKey(t + 1)}`, film = `film:${weekKey(t)}`;
    let res = {};
    try { res = await api.anket([tema, film, `tema:${dateKey(t)}`]); setVotes(res); } catch (e) { return sayfa.set([el("p", `Gerade keine Verbindung (${e.message}).`, "muted")]); }
    const out = [];
    const fixed = fixedTomorrow();
    if (fixed) out.push(el("h3", `Morgen (${DAYS[sim.weekday(t + 1)]})`), el("p", `${fixed}. Abgestimmt wird über die Tage von Montag bis Donnerstag.`, "muted"));
    else {
      // Yalnız yarın adada gerçekten olabilecekler (yeri açılmamış ya da mevsimi olmayan seçenek gösterilmez).
      const olur = new Set(themeOptions(t + 1, world).map((x) => x.id));
      out.push(...poll(tema, `Was soll morgen (${DAYS[sim.weekday(t + 1)]}) auf der Insel passieren?`, "Abstimmen bis Mitternacht; was gewinnt, passiert morgen auf der Insel.", TEMA_SECENEK.filter((id) => olur.has(id)), TEMA_AD, res[tema]));
    }
    out.push(...poll(film, "Was läuft am Samstag im Strandkino?", "Abstimmung dieser Woche; der Film läuft Samstagabend auf der Leinwand am Strand.", FILM_SECENEK, FILM_AD, res[film]));
    sayfa.set(out);
  }

  return { open: () => open(false) };
}

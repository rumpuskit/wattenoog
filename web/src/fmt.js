// Görünen biçimler (Almanca, de-DE): 24 saatlik saat ("21:30"), "31. Okt." tarih, Pazartesi'den başlayan gün adları,
// nokta ayraçlı sayılar ("3.000"), metrik birimler. Telefonun dili ne olursa olsun aynı çıktı için Intl kullanılmaz.
// Arayüzde elle biçimlendirme yerine bunlar kullanılır; iç birimler (dakika, gün numarası, metre, m/s) değişmez.

/** Pazartesi'den başlar (sim.weekday: 0 = Pazartesi). */
export const DAYS = ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"];
export const DAYS_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const MON = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

/** 3000 → "3.000", -1234 → "-1.234"; ondalıklı sayı virgülle (2,5). */
export function num(n) {
  const neg = n < 0, s = String(Math.abs(n)).split(".");
  const int = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + int + (s[1] ? "," + s[1] : "");
}

/** Günün dakikası → "21:30" (24:00 ve sonrası ertesi güne sarar). */
export function clockText(minute) {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Saat (0-23) → "9 Uhr". */
export const hourText = (h) => `${h} Uhr`;

/** Gün numarası (1970'ten beri, sim.dayOf) → "31. Okt.". */
export function dateText(day) {
  const d = new Date(day * 86400000);
  return `${d.getUTCDate()}. ${MON[d.getUTCMonth()]}`;
}

/** Gün numarası → "Sonntag, 1. November 2026". */
export function longDateText(day) {
  const d = new Date(day * 86400000);
  return `${DAYS[(d.getUTCDay() + 6) % 7]}, ${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Metre → "62 m" (1 km üstü "1,4 km"). */
export const meter = (m) => (m >= 1000 ? `${num(Math.round(m / 100) / 10)} km` : `${num(Math.round(m))} m`);
/** m/s → "43 km/h". */
export const kmh = (ms) => `${num(Math.round(ms * 3.6))} km/h`;

/** "1 Einwohner", "3 Einwohner"; Almanca çoğul düzensiz: çoğul biçim ayrıca verilir (yoksa tekil). */
export const plural = (n, one, many = one) => `${num(n)} ${n === 1 ? one : many}`;

/** 1 → "1.", 22 → "22." (Almanca sıra sayısı). */
export const ordinal = (n) => `${num(n)}.`;

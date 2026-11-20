// Gelgit (Ebbe und Flut): Wattenmeer'de su günde iki kez yükselir ve alçalır. Seviye yalnız zamandan deterministik
// hesaplanır (site, video ve olaylar aynı suyu görür): yarı günlük ay gelgiti (M2, 12 sa 25 dk 14 sn) ve bahar/ölü
// gelgit zarfı (yarım sinodik ay, ~14,77 gün; dolunay ve yeni aydan ~2 gün sonra en büyük). Ortalama su 0 m; bahar
// gelgitinde ±0,95 m, ölü gelgitte ±0,62 m. Gerçek bir iskelenin tablosu değildir (ada hayalî), ama ritim gerçektir:
// yüksek su her gün ~50 dk gecikir.
//   Watt düzlüğü −0,5 m (island.js WATT_Y): alçak suda ~2–3 saat kurur; tuzlu bataklık +0,72: yalnız bahar gelgitinin
//   yüksek suyunda kenarından ıslanır; kumsalda su çizgisi ~35 m oynar.
const M2 = 44714.16; // saniye
const T0 = Date.UTC(2026, 0, 1, 3, 10) / 1000; // referans yüksek su
const HALF_SYNODIC = 29.530589 * 86400 / 2;
const SPRING0 = Date.UTC(2026, 0, 5, 10, 0) / 1000; // 3 Ocak 2026 dolunayından ~2 gün sonra: bahar gelgiti

/** Unix zamanında su seviyesi (metre, ortalama 0). */
export function tideLevel(unix) {
  const amp = 0.785 + 0.165 * Math.cos((2 * Math.PI * (unix - SPRING0)) / HALF_SYNODIC);
  // Hafif asimetri: yükselme alçalmadan biraz hızlı (Wattenmeer'de gerçek): ikinci harmonik küçük pay.
  const ph = (2 * Math.PI * (unix - T0)) / M2;
  return amp * (Math.cos(ph) + 0.08 * Math.cos(2 * ph - 0.6)) / 1.04;
}

/** Bir sonraki yüksek ve alçak suyun zamanı (unix) ve seviyesi: gazete ve kartlar için ("Hochwasser 14:32"). */
export function nextTides(unix, count = 4) {
  const out = [];
  const step = 60;
  let prev = tideLevel(unix - step), cur = tideLevel(unix);
  for (let t = unix; t < unix + 86400 * 2 && out.length < count; t += step) {
    const next = tideLevel(t + step);
    if (cur > prev && cur >= next) out.push({ t, level: cur, high: true });
    else if (cur < prev && cur <= next) out.push({ t, level: cur, high: false });
    prev = cur; cur = next;
  }
  return out;
}

// O anki seviye (main.js her karede yazar; çizim modülleri okur).
let level = 0;
export const setTide = (v) => { level = v; };
export const tide = () => level;

// Senaryonun seslendirmesini ElevenLabs'te üretir; cümle cümle zamanlamayı (altyazı için) ses.json'a yazar.
// Metin, ses ya da ayar değişmedikçe yeniden üretmez (kredi harcamaz).
//
//   ELEVENLABS_API_KEY=... node seslendir.mjs senaryolar/acilis.mjs
//
// Senaryoda: seslendirme: [{ ses: "Für die Bäckerei fehlen noch drei.", yazi: "Für die Bäckerei fehlen noch 3." }, ...]
//   ses:  okunacak metin, Almanca (sayılar yazıyla, kullanıcı adı ve @ yok)
//   yazi: altyazı (yoksa ses metni); "\n" satır kırar. Satır başına ~28 karakter, en fazla 2 satır.
// Çıktı: cikti/<ad>/ses.mp3 (ham) ve ses.json { anahtar, sure, cumleler: [{ yazi, bas, son, kelimeler }] }
// (kelimeler: [[kelime, başlangıç sn], ...]; çekim geçişlerini kelimeye oturtmak için).
// Ses ve ayarlar anlatım standardından (video/cikti/ANLATIM-STANDARDI.md, bölüm 7): değişirse orada da değişir.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// TODO(ses seçimi, DEVIR §9.2/§13): "Inselchronist" anlatıcısının ElevenLabs ses kimliği. Almanca anadil, kuru, sakin,
// hafif Kuzey Alman tınısı (radyo sesi değil); 3–4 aday aynı iki cümleyle örneklenir, kullanıcı dinleyip seçer. Seçilince
// yalnız buraya yazılır (ve ANLATIM-STANDARDI.md §7'ye). Boşken sentez hata verir: kredi harcanmaz, yanlış sesle video çıkmaz.
export const ANLATICI_SESI = "tLPh1ULk9PH3P3AuK6rm"; // ElevenLabs kütüphanesi: "Julian" (genç, rahat seslendirme; kullanıcı 20 Kasım'da 4 adaydan seçti)

export const SES = {
  voice: ANLATICI_SESI,
  model_id: "eleven_v4",
  language_code: "de",
  // Mercanada/Driftwood ayarlarıyla başlanır (DEVIR §9.2); ses seçilince gerekirse ayarlanır.
  voice_settings: { stability: 0.7, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 1.05 },
};

export async function seslendir(S) {
  const out = resolve("cikti", S.ad);
  mkdirSync(out, { recursive: true });
  const parts = S.seslendirme.map((c) => c.ses.trim());
  const text = parts.join(" ");
  // SES_YEREL=1: kredisiz deneme sesi (macOS `say`, Almanca "Reed"). Anahtarı ayrı: gerçek üretim bu sesi asla kullanmaz.
  const yerel = process.env.SES_YEREL === "1";
  const anahtar = createHash("sha256").update(JSON.stringify({ text, ...SES, ...(yerel ? { yerel: "say-reed" } : {}) })).digest("hex").slice(0, 16);
  const jsonPath = `${out}/ses.json`;
  if (existsSync(jsonPath) && existsSync(`${out}/ses.mp3`)) {
    const eski = JSON.parse(readFileSync(jsonPath, "utf8"));
    // Anahtar yalnız sesi kapsar; altyazı (yazi) değişince ses yeniden üretilmez ama altyazı güncel metinden gelir
    // (7 Kasım: --cekim-dene'de yalnız yazi değişince eski altyazı görünüyordu).
    if (eski.anahtar === anahtar) {
      eski.cumleler.forEach((c, k) => { c.yazi = S.seslendirme[k].yazi ?? parts[k]; });
      return eski;
    }
  }
  if (yerel) return yerelSes(S, out, parts, anahtar, jsonPath);
  if (!SES.voice) throw new Error("anlatıcı sesi seçilmedi: seslendir.mjs ANLATICI_SESI boş (TODO; kullanıcı ElevenLabs'ten Almanca ses seçecek). Seslendirme yapılmadı, kredi harcanmadı.");
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("ELEVENLABS_API_KEY yok (seslendirme değişti, yeniden üretilmeli)");
  const { voice, ...body } = SES;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_192`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, ...body }),
  });
  if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  writeFileSync(`${out}/ses.mp3`, Buffer.from(data.audio_base64, "base64"));

  // Cümlelerin karakter aralığı → ilk karakterin başı, son karakterin sonu.
  const al = data.alignment;
  const chars = al.characters.join("");
  if (chars !== text) throw new Error("hizalama metni seslendirme metniyle aynı değil");
  let pos = 0;
  const cumleler = parts.map((p, k) => {
    const a = pos, b = pos + p.length - 1;
    pos += p.length + 1;
    const kelimeler = [];
    for (const m of p.matchAll(/[^\s]+/g)) kelimeler.push([m[0], al.character_start_times_seconds[a + m.index]]);
    return { yazi: S.seslendirme[k].yazi ?? p, bas: al.character_start_times_seconds[a], son: al.character_end_times_seconds[b], kelimeler };
  });
  const sure = al.character_end_times_seconds.at(-1);
  const result = { anahtar, sure, cumleler };
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  return result;
}

// Kredisiz deneme sesi: her cümle `say` ile ayrı üretilir, aralarına 0,25 sn sessizlik; kelime zamanları cümle içinde
// karakter oranıyla. Yalnız altyapı denemesi için (ses kalitesi önemsiz, zamanlama gerçeğe yakın).
function yerelSes(S, out, parts, anahtar, jsonPath) {
  const tmp = `${out}/yerel-ses`;
  mkdirSync(tmp, { recursive: true });
  const ARA = 0.25, liste = [];
  let t = 0;
  const cumleler = parts.map((p, k) => {
    const f = `${tmp}/c${k}.aiff`;
    execFileSync("say", ["-v", "Reed", "-r", "190", "-o", f, p]);
    const d = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());
    const bas = t, son = t + d;
    const kelimeler = [...p.matchAll(/[^\s]+/g)].map((m) => [m[0], +(bas + (d * m.index) / p.length).toFixed(3)]);
    liste.push(`file '${f}'`, `file '${tmp}/ara.aiff'`);
    t = son + ARA;
    return { yazi: S.seslendirme[k].yazi ?? p, bas, son, kelimeler };
  });
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "anullsrc=r=22050:cl=mono", "-t", String(ARA), `${tmp}/ara.aiff`]);
  writeFileSync(`${tmp}/liste.txt`, liste.join("\n"));
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", `${tmp}/liste.txt`, "-ar", "44100", "-ac", "1", "-b:a", "192k", `${out}/ses.mp3`]);
  const result = { anahtar, sure: cumleler.at(-1).son, cumleler, yerel: true };
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log("UYARI: SES_YEREL=1, deneme sesi (macOS say), ElevenLabs kullanılmadı");
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const S = (await import(resolve(process.argv[2]))).default;
  const r = await seslendir(S);
  for (const c of r.cumleler) {
    console.log(`${c.bas.toFixed(2).padStart(6)}–${c.son.toFixed(2).padEnd(6)} ${c.yazi.replace(/\n/g, " / ")}`);
    console.log("         " + c.kelimeler.map(([w, t]) => `${w}@${t.toFixed(2)}`).join(" "));
  }
  console.log(`süre ${r.sure.toFixed(2)} sn`);
}

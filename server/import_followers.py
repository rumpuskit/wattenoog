#!/usr/bin/env python3
"""Takipçi listesini şehre işler: yeni gelenler taşınır, takibi bırakanlar adadan ayrılır.

Kullanım:
    python3 import_followers.py liste.json [--day N] [--force] [--dry-run]
    python3 import_followers.py --taban [--zorla] liste.json     # eski takipçileri tabana yaz (bir kez; taşımaz)

Asıl kaynak, Mac'teki tik.ninja takibinin günde 3 kez ssh ile yolladığı listedir (tasinma.py bu
modülün aktar() işlevini çağırır). Elle verilen dosya da okunur: aynı biçimdeki liste
({"kaynak": "tikninja", "liste": [[ad, takip zamanı, sıra], ...]}), TikTok "Verilerini indir" çıktısı
(zip ya da içindeki user_data*.json / Follower*.txt).
Kurallar:
  - Takibi bırakan bu aktarımda ayrılır; evi 7 gün tutulur, bu sürede dönerse aynı evine döner.
  - 7 günü geçen ayrılanın kaydı silinir (DSGVO: gerekenden uzun tutulmaz), evi boşa çıkar.
  - Yeni gelenler takip sırasına göre önce boş evlere, sonra adanın ucundaki yeni evlere yerleşir.
    Böylece mahalleler delik deşik kalmaz, tek kişilik görevler (fener bekçisi) de boş kalmaz.
    tik.ninja takip zamanını sayfa başına verir; aynı sayfadakileri listedeki sıra ayırır.
  - Çıkma isteyenler (cikanlar) bir daha taşınmaz.
  - Taban (DEVIR §4.7): hesabın ilk canlı taramadaki takipçileri (yalnız tuzlu özetleri, `taban`) taşınmaz; yorumda
    katılım yazanlar (`katilim`) katılım sırasıyla gelir. Tabanda olmayan yeni takipçiler eskisi gibi taşınır.
  - Dışa aktarım aktif nüfusun %80'inden azını içeriyorsa yarım dosya olabilir; --force olmadan işlenmez. Oran
    taşınabilecekler (katılmamış eski takipçiler hariç) ile sakinler arasında.
"""

import argparse
import hashlib
import json
import re
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from wattenoog_sim import sim
import ortak
from ortak import DB, ISTEK_GUN, RETURN_WINDOW_DAYS, key_of, opt_out_hash, psql, publish

HANDLE_RE = re.compile(r"^[a-z0-9._]{1,30}$")
MIN_RATIO = 0.8
NAME_KEYS = ("username", "user_name", "uniqueid", "unique_id")


class AktarimHatasi(Exception):
    pass


# --- tik.ninja (Mac'teki takip aracı) ---

def _tikninja_json(data: dict) -> dict[str, tuple[int, int]]:
    """{"kaynak": "tikninja", "liste": [[ad, takip zamanı, sıra], ...]}: sıra, aynı takip zamanını
    paylaşanlar (aynı sayfa) arasında eskiden yeniye artar."""
    out: dict[str, tuple[int, int]] = {}
    for item in data.get("liste") or []:
        if isinstance(item, list) and item and isinstance(item[0], str):
            ts = int(item[1]) if len(item) > 1 and isinstance(item[1], (int, float)) else 0
            sira = int(item[2]) if len(item) > 2 and isinstance(item[2], (int, float)) else 0
            _add(out, item[0], ts, sira)
    return out


# --- TikTok ---

def _tiktok_json(blob: bytes) -> dict[str, tuple[int, int]]:
    """user_data.json içinde takipçi listesini arar. Biçim yıllar içinde değişti
    (Activity → "Follower List" → FansList, ya da "Follower" → FansList); bu yüzden ağaçta
    adı 'fan'/'follower' geçen ama 'following' geçmeyen bir yolun altındaki kişi listeleri toplanır."""
    out: dict[str, tuple[int, int]] = {}

    def walk(node, path: str) -> None:
        if isinstance(node, dict):
            for k, v in node.items():
                walk(v, path + "/" + str(k).lower())
        elif isinstance(node, list):
            if "following" in path or not ("fan" in path or "follower" in path):
                for v in node:
                    walk(v, path)
                return
            for item in node:
                if not isinstance(item, dict):
                    continue
                low = {str(k).lower().replace(" ", "_"): v for k, v in item.items()}
                name = next((low[k] for k in NAME_KEYS if k in low), None)
                if name:
                    _add(out, str(name), _tiktok_date(low.get("date")))

    data = json.loads(blob)
    if isinstance(data, dict) and data.get("kaynak") == "tikninja":
        return _tikninja_json(data)
    walk(data, "")
    return out


def _tiktok_txt(text: str) -> dict[str, tuple[int, int]]:
    """TXT biçimi: 'Date: 2026-10-28 10:12:03' ve 'Username: ali.veli' satırları."""
    out: dict[str, tuple[int, int]] = {}
    date = None
    for line in text.splitlines():
        k, _, v = line.partition(":")
        k = k.strip().lower()
        if k == "date":
            date = v.strip()
        elif k in ("username", "user name"):
            _add(out, v.strip(), _tiktok_date(date))
            date = None
    return out


def _tiktok_date(value) -> int:
    if not value:
        return 0
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return int(datetime.strptime(str(value).strip(), fmt).replace(tzinfo=timezone.utc).timestamp())
        except ValueError:
            pass
    return 0


def _add(out: dict[str, tuple[int, int]], handle: str, ts: int, sira: int = 0) -> None:
    h = sim.normalize_handle(handle)
    if HANDLE_RE.match(h):
        _merge(out, h, (ts, sira))


def _merge(out: dict[str, tuple[int, int]], h: str, v: tuple[int, int]) -> None:
    """Aynı kişi iki kez geçerse bilinen en eski takip zamanı kalır (0 = bilinmiyor)."""
    old = out.get(h)
    if old is None or (v[0] and (not old[0] or v < old)):
        out[h] = v


def read_export(paths: list[Path]) -> tuple[dict[str, tuple[int, int]], str]:
    """{handle: (takip zaman damgası (UTC, saniye), sıra)} ve okunan dosyaların sha256 özeti."""
    wanted = re.compile(r"(user_data[^/]*\.json|follower[^/]*\.txt)$", re.I)
    blobs: list[tuple[str, bytes]] = []
    for path in paths:
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as z:
                blobs += [(n, z.read(n)) for n in sorted(z.namelist()) if wanted.search(n) and "following" not in n.lower()]
        else:
            blobs.append((path.name, path.read_bytes()))
    if not blobs:
        raise AktarimHatasi("dışa aktarımda takipçi dosyası bulunamadı")

    followers: dict[str, tuple[int, int]] = {}
    for name, blob in blobs:
        if name.lower().endswith(".txt"):
            part = _tiktok_txt(blob.decode("utf-8", "replace"))
        else:
            part = _tiktok_json(blob)
        for h, v in part.items():
            _merge(followers, h, v)
    return followers, hashlib.sha256(b"".join(b for _, b in blobs)).hexdigest()


IMPORT_SQL = """
BEGIN;
CREATE TEMP TABLE gelenler (handle text PRIMARY KEY, seed bigint NOT NULL, ts bigint NOT NULL, sira bigint NOT NULL) ON COMMIT DROP;
COPY gelenler FROM STDIN;
{rows}\\.

-- 7 günden uzun süredir ayrı olanların kaydı silinir, evleri boşa çıkar. Ayrılmadan önce yazılmış katılım kaydı da
-- (eski takipçi geri dönerse taban özeti durduğu için yeniden katılım yazmalı; ayrıldıktan sonra yazdıysa kalır).
WITH d AS (
    DELETE FROM sakinler WHERE left_day IS NOT NULL AND :day - left_day > {window} RETURNING handle, left_day
), k AS (
    DELETE FROM katilim kt USING d WHERE kt.handle = d.handle AND kt.gun <= d.left_day RETURNING 1
) SELECT count(*) AS silinen FROM d \\gset

-- 7 gün içinde dönenler eski evine döner.
WITH d AS (
    UPDATE sakinler s SET left_day = NULL
    FROM gelenler g
    WHERE s.platform = :'pf' AND s.handle = g.handle AND s.left_day IS NOT NULL
    RETURNING 1
) SELECT count(*) AS donen FROM d \\gset

-- Takibi bırakanlar ayrılır (evleri 7 gün tutulur).
WITH d AS (
    UPDATE sakinler s SET left_day = :day
    WHERE s.platform = :'pf' AND s.left_day IS NULL
      AND NOT EXISTS (SELECT 1 FROM gelenler g WHERE g.handle = s.handle)
    RETURNING 1
) SELECT count(*) AS ayrilan FROM d \\gset

-- Yeniler takip sırasına göre önce boş evlere, sonra adanın ucuna yerleşir.
WITH yeni AS (
    SELECT g.handle, g.seed, row_number() OVER (ORDER BY g.ts, g.sira, g.handle) AS rn
    FROM gelenler g
    WHERE NOT EXISTS (SELECT 1 FROM sakinler s WHERE s.platform = :'pf' AND s.handle = g.handle)
), bos AS (
    SELECT n AS slot, row_number() OVER (ORDER BY n) AS rn
    FROM generate_series(0, (SELECT coalesce(max(slot), -1) FROM sakinler) + (SELECT count(*) FROM yeni)) AS n
    WHERE NOT EXISTS (SELECT 1 FROM sakinler s WHERE s.slot = n)
), d AS (
    INSERT INTO sakinler (platform, handle, seed, slot, arrived_day)
    SELECT :'pf', y.handle, y.seed, b.slot, :day FROM yeni y JOIN bos b USING (rn)
    RETURNING 1
) SELECT count(*) AS gelen FROM d \\gset

-- 30 gün içinde taşınmamış katılımlar (listede hiç görünmedi: takibi bırakmış) silinir.
DELETE FROM katilim k WHERE k.eklendi < now() - make_interval(days => {istek_gun})
    AND NOT EXISTS (SELECT 1 FROM sakinler s WHERE s.platform = :'pf' AND s.handle = k.handle);

INSERT INTO aktarimlar (platform, day, dosya_sha256, takipci, gelen, donen, ayrilan, silinen)
VALUES (:'pf', :day, :'sha', :takipci, :gelen, :donen, :ayrilan, :silinen);

SELECT json_build_object(
    'gelen', :gelen, 'donen', :donen, 'ayrilan', :ayrilan, 'silinen', :silinen,
    'nufus', (SELECT count(*) FROM sakinler WHERE left_day IS NULL),
    'en_buyuk', (SELECT coalesce(max(slot) + 1, 0) FROM sakinler WHERE left_day IS NULL));
{end};
"""


def taban_suz(followers: dict[str, tuple[int, int]], day: int, platform: str = "tt",
              db: str = DB) -> tuple[dict[str, tuple[int, int]], int, list[str]]:
    """Taban (eski takipçiler) süzgeci: (taşınabilecekler, katılmamış eski takipçi sayısı, listedeki katılanlar).
    Tabandaki biri yalnız katılım kaydı varsa geçer, sıra anahtarı katılım zamanı olur (katılım sırasıyla yerleşir).
    Kaydı olan (adada ya da 7 günlük dönüş süresinde) her zaman geçer. Bu taşınmada silinecek kayıt (7 günü geçmiş)
    ve onunla silinecek katılım sayılmaz: 8. gün dönen eski takipçi yeniden katılım yazmalı. Taban alınmamışsa liste
    olduğu gibi döner."""
    taban = ortak.taban_ozetleri(db)
    if not taban:
        return followers, 0, []
    tuz = ortak.taban_tuz()
    gecerli = f"left_day IS NULL OR {int(day)} - left_day <= {RETURN_WINDOW_DAYS}"
    # Katılım, bu taşınmada silinecek kayıtla birlikte silinecekse (ayrılmadan önce yazılmış) sayılmaz.
    katilim = json.loads(psql(f"""SELECT coalesce(json_object_agg(k.handle, extract(epoch FROM k.eklendi)::bigint), '{{}}')
                                  FROM katilim k LEFT JOIN sakinler s ON s.platform = '{platform}' AND s.handle = k.handle
                                  WHERE s.handle IS NULL OR ({gecerli.replace("left_day", "s.left_day")})
                                     OR k.gun > s.left_day""", db))
    kayitli = set(json.loads(psql(f"SELECT coalesce(json_agg(handle), '[]') FROM sakinler WHERE platform = '{platform}' AND ({gecerli})", db)))
    out: dict[str, tuple[int, int]] = {}
    disarida = 0
    for h, v in followers.items():
        if h in kayitli:
            out[h] = v
        elif h in katilim:
            out[h] = (int(katilim[h]), 0)
        elif ortak.taban_ozet(h, tuz, platform) in taban:
            disarida += 1
        else:
            out[h] = v
    return out, disarida, [h for h in out if h in katilim]


def taban_al(followers: dict[str, tuple[int, int]], takipci: int | None = None, zorla: bool = False,
             platform: str = "tt", db: str = DB) -> dict:
    """Tabanı bir kez alır: listedeki herkesin (o an adada oturanlar hariç) yalnız tuzlu özetini `taban`a yazar,
    kullanıcı adlarını yazmaz. Taban zaten varsa --zorla olmadan reddeder (taban büyümez). İskelede bekleyen
    görünmesinler diye 'disarida' = profil sayısı − nüfus olarak yazılır (ilk taşınma onu yeniden hesaplar)."""
    if not followers:
        raise AktarimHatasi("listede geçerli kullanıcı adı yok")
    var = int(psql("SELECT count(*) FROM taban", db))
    if var and not zorla:
        raise AktarimHatasi(f"taban zaten alınmış ({var} özet); taban bir kez alınır ve büyümez. "
                            "Yeniden almak için --zorla (eski özetler silinir).")
    tuz = ortak.taban_tuz(olustur=True)
    sakin = set(json.loads(psql(f"SELECT coalesce(json_agg(handle), '[]') FROM sakinler WHERE platform = '{platform}' AND left_day IS NULL", db)))
    ozetler = sorted({ortak.taban_ozet(h, tuz, platform) for h in followers if h not in sakin})
    takipci = takipci if isinstance(takipci, int) and takipci >= len(followers) else len(followers)
    rows = "".join(o + "\n" for o in ozetler)
    psql(f"""BEGIN;
DELETE FROM taban;
COPY taban (ozet) FROM STDIN;
{rows}\\.
INSERT INTO durum (anahtar, deger) VALUES ('disarida', jsonb_build_object('sayi', greatest(0, {takipci} - {len(sakin)})))
ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, updated_at = now();
COMMIT;""", db)
    return {"taban": len(ozetler), "adada_atlanan": len(followers) - len(ozetler), "silinen_eski": var}


def aktar(followers: dict[str, tuple[int, int]], sha: str, platform: str = "tt", day: int | None = None,
          db: str = DB, force: bool = False, dry_run: bool = False, yayinla: bool = True) -> dict:
    """Listeyi şehre işler ve (deneme değilse) yayınlar. Aynı liste daha önce işlendiyse
    {"atlandi": True} döner; boş ya da yarım görünen liste AktarimHatasi verir."""
    day = sim.day_of(time.time()) if day is None else day
    if not followers:
        raise AktarimHatasi("listede geçerli kullanıcı adı yok")
    opted_out = set(psql("SELECT ozet FROM cikanlar", db).split())
    followers = {h: v for h, v in followers.items() if opt_out_hash(platform, h) not in opted_out}
    followers, taban_bekleyen, katilan = taban_suz(followers, day, platform, db)
    if katilan:
        # Katılım listeyi değiştirmeden de taşınma gerektirir: aynı liste, yeni katılımla yeniden işlenir.
        sha = hashlib.sha256(f"{sha}|katilim:{','.join(sorted(katilan))}".encode()).hexdigest()
    if psql(f"SELECT 1 FROM aktarimlar WHERE dosya_sha256 = '{sha}'", db):
        return {"atlandi": True}
    active = int(psql(f"SELECT count(*) FROM sakinler WHERE left_day IS NULL AND platform = '{platform}'", db))
    if len(followers) < MIN_RATIO * active and not force:
        raise AktarimHatasi(f"listede {len(followers)} kişi var, şehirde {active}. "
                            "Yarım liste olabilir; eminsen --force ile çalıştır.")

    rows = "".join(f"{h}\t{sim.seed_of(key_of(platform, h))}\t{ts}\t{sira}\n" for h, (ts, sira) in followers.items())
    sql = IMPORT_SQL.format(rows=rows, window=RETURN_WINDOW_DAYS, istek_gun=ISTEK_GUN, end="ROLLBACK" if dry_run else "COMMIT")
    variables = ["-v", f"day={day}", "-v", f"sha={sha}", "-v", f"takipci={len(followers)}", "-v", f"pf={platform}"]
    eski = psql("SELECT deger FROM durum WHERE anahtar = 'zirve'", db)
    eski = json.loads(eski)["sayi"] if eski else 0
    result = json.loads(psql(sql, db, variables))
    if taban_bekleyen:
        result["taban_bekleyen"] = taban_bekleyen  # listede olup katılım yazmamış eski takipçiler (taşınmadı)
    # Bu taşınmayla adada açılanlar (gelişim tablosundan): taşınma videosunun malzemesi.
    yeni = max(eski, result.pop("en_buyuk"))
    result["acilan"] = [st["ad"] for st in sim.catalog()["gelisim"] if eski < st["nufus"] <= yeni]
    sira = [st for st in sim.catalog()["gelisim"] if st["nufus"] > yeni]
    result["siradaki"] = f"{sira[0]['ad']} ({sira[0]['nufus']}. sakinde)" if sira else None
    if yayinla and not dry_run:
        result["yayin"] = publish(db)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("exports", nargs="+", type=Path)
    parser.add_argument("--day", type=int, default=sim.day_of(time.time()), help="ada günü, Berlin saati (varsayılan: bugün)")
    parser.add_argument("--taban", action="store_true", help="taşıma yapma: listedekileri tabana (eski takipçiler) yaz")
    parser.add_argument("--zorla", action="store_true", help="--taban ile: var olan tabanı silip yeniden al")
    parser.add_argument("--db", default=DB)
    parser.add_argument("--force", action="store_true", help="nüfus düşüşü kontrolünü atla")
    parser.add_argument("--dry-run", action="store_true", help="hesapla ama kaydetme")
    args = parser.parse_args()

    try:
        followers, sha = read_export(args.exports)
        if args.taban:
            print(json.dumps(taban_al(followers, None, args.zorla, "tt", args.db), ensure_ascii=False))
            return
        result = aktar(followers, sha, "tt", args.day, args.db, args.force, args.dry_run)
    except AktarimHatasi as e:
        sys.exit(f"HATA: {e}")
    if result.get("atlandi"):
        sys.exit("Bu liste daha önce işlenmiş, atlandı.")
    print(("[DENEME] " if args.dry_run else "") + json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

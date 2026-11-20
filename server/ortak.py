"""Sunucu betiklerinin ortak parçaları: yollar, psql çağrısı, sakin listesinin yayını."""

import hashlib
import hmac
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from wattenoog_sim import sim

ROOT = Path(os.environ.get("WATTENOOG_ROOT", "/opt/wattenoog"))
PUBLIC = ROOT / "public"            # yayınlanan listenin yerel kopyası
SECRETS = ROOT / "secrets"          # yalnız wattenoog kullanıcısı okur (chmod 700)
DB = os.environ.get("WATTENOOG_DB", "wattenoog")

RETURN_WINDOW_DAYS = 7   # takibi bırakanın evi bu kadar tutulur
ISTEK_GUN = 30           # yorum isteği bu kadar bekler (yorumlar da son 30 günden okunur); sonra silinir


def psql(sql: str, db: str = DB, extra: list[str] | None = None) -> str:
    result = subprocess.run(
        ["psql", "-X", "-q", "-tA", "-v", "ON_ERROR_STOP=1", "-d", db, *(extra or []), "-f", "-"],
        input=sql, capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit("HATA (psql): " + result.stderr.strip())
    return result.stdout.strip()


def key_of(platform: str, handle: str) -> str:
    """Sakinin kalıcı kimliği: tohum değeri ve çıkma listesi bundan türetilir."""
    return f"{platform}:{sim.normalize_handle(handle)}"


def opt_out_hash(platform: str, handle: str) -> str:
    return hashlib.sha256(key_of(platform, handle).encode()).hexdigest()


# --- Taban (DEVIR §4.7): hesabın eski takipçileri yalnız yorumda isterse taşınır ---
# İlk canlı taramadaki takipçilerin kullanıcı adı saklanmaz; yalnız tuzlu SHA-256 özeti (HMAC-SHA256, anahtar = tuz)
# `taban` tablosunda durur. Tuz secrets/taban.json'da ({"tuz": "..."}); testler WATTENOOG_TABAN_TUZ verir.
# Tuz kaybolursa özetler eşleşmez ve bütün eski takipçiler taşınır: tuz yedeklenmeli (secret gibi).
TABAN_TUZ_DOSYA = SECRETS / "taban.json"


def taban_tuz(olustur: bool = False) -> str:
    """Taban tuzu. olustur=True yalnız taban ilk kez alınırken: dosya yoksa rastgele tuz yazılır (600)."""
    if t := os.environ.get("WATTENOOG_TABAN_TUZ"):
        return t
    try:
        tuz = json.loads(TABAN_TUZ_DOSYA.read_text())["tuz"]
    except FileNotFoundError:
        if not olustur:
            sys.exit(f"HATA: {TABAN_TUZ_DOSYA} yok; taban özetleri hesaplanamaz (eski takipçiler taşınmasın diye durdu)")
        import secrets
        tuz = secrets.token_hex(32)
        TABAN_TUZ_DOSYA.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(TABAN_TUZ_DOSYA, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            json.dump({"tuz": tuz}, f)
    except (KeyError, ValueError):
        sys.exit(f'HATA: {TABAN_TUZ_DOSYA} bozuk ({{"tuz": "..."}} bekleniyor)')
    if not isinstance(tuz, str) or len(tuz) < 16:
        sys.exit(f"HATA: {TABAN_TUZ_DOSYA} içindeki tuz çok kısa (en az 16 karakter)")
    return tuz


def taban_ozet(handle: str, tuz: str | None = None, platform: str = "tt") -> str:
    return hmac.new((tuz or taban_tuz()).encode(), key_of(platform, handle).encode(), hashlib.sha256).hexdigest()


def taban_ozetleri(db: str = DB) -> set[str]:
    """Kayıtlı taban özetleri (boşsa taban alınmamış: herkes eskisi gibi taşınır)."""
    return set(psql("SELECT ozet FROM taban", db).split())


def publish(db: str = DB) -> dict:
    """Aktif sakinleri ve iskelede bekleyen sayısını public/sakinler.json'a yazar (atomik) ve
    Cloudflare Worker'ına yollar; site listeyi oradan okur (sunucuya ziyaretçi trafiği gelmez)."""
    rows = psql("""
        SELECT coalesce(json_agg(json_build_array(
                   CASE WHEN hidden THEN NULL ELSE handle END, seed, slot, arrived_day,
                   CASE WHEN overrides = '{}'::jsonb THEN NULL ELSE overrides END) ORDER BY slot), '[]')
        FROM sakinler WHERE left_day IS NULL;
    """, db)
    sakinler = json.loads(rows or "[]")
    takipci = psql("SELECT deger FROM durum WHERE anahtar = 'tt_takipci'", db)
    takipci = json.loads(takipci)["sayi"] if takipci else None
    # Listede hiç görünmeyecek takipçiler (TikTok'un listede göstermediği hesaplar, çıkanlar): son
    # taşınmada profil sayısı ile nüfus farkı. Bunlar iskelede "bekleyen" sayılmaz.
    disarida = psql("SELECT deger FROM durum WHERE anahtar = 'disarida'", db)
    disarida = json.loads(disarida)["sayi"] if disarida else 0
    # Taban: katılmamış eski takipçiler listede olup taşınmadıkları için disarida'nın içindedir (disarida = son
    # taşınmada profil sayısı − nüfus; taban alınırken de yazılır), iskelede bekleyen görünmezler. Ayrı sayı tutulmaz.
    # Son taşınmadan sonra katılım yazan eski takipçi ise sonraki taşınmada gelir: iskelede bekler. Taşınmada adaya
    # gelmemiş katılımların sayısı 'katilim_disarida'ya yazılır (listede değiller); bekleyen, bu sayının üstündeki artıştır.
    katilim = int(psql("""SELECT count(*) FROM katilim k WHERE NOT EXISTS
                          (SELECT 1 FROM sakinler s WHERE s.platform = 'tt' AND s.handle = k.handle)""", db) or 0)
    katilim_disarida = psql("SELECT deger FROM durum WHERE anahtar = 'katilim_disarida'", db)
    katilim_bekleyen = max(0, katilim - (json.loads(katilim_disarida)["sayi"] if katilim_disarida else 0))
    son = psql("SELECT coalesce(max(extract(epoch FROM imported_at))::bigint, 0) FROM aktarimlar", db)
    # Gelişim düzeyi: adanın ulaştığı en yüksek nüfus (en büyük sıra + 1). Ayrılanlar yüzünden düşmez;
    # site neyin açık olduğunu (iş yerleri, yollar, parklar) buna göre kurar.
    nufus = max((s[2] for s in sakinler), default=-1) + 1
    eski = psql("SELECT deger FROM durum WHERE anahtar = 'zirve'", db)
    zirve = max(nufus, json.loads(eski)["sayi"] if eski else 0)
    if not eski or zirve != json.loads(eski)["sayi"]:
        psql(f"""INSERT INTO durum (anahtar, deger) VALUES ('zirve', '{{"sayi": {zirve}}}')
                 ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, updated_at = now();""", db)
    data = {
        "v": 1,
        "guncel": int(time.time()),
        "son_aktarim": int(son or 0),
        "takipci": takipci,
        # Takip etmiş ama henüz aktarımla taşınmamış olanlar: iskelede valizleriyle bekler.
        "bekleyen": (max(0, takipci - disarida - len(sakinler)) if takipci is not None else 0) + katilim_bekleyen,
        "zirve": zirve,
        # [handle | null (adı gizli), seed, slot, arrived_day, overrides | null]
        "sakinler": sakinler,
    }
    # Belediye başkanlığı seçimi (açıksa adaylar ve oyları, bittiyse sonuç); döngüsel içe aktarma olmasın diye burada.
    import secim
    if s := secim.yayin(db):
        data["secim"] = s
    PUBLIC.mkdir(parents=True, exist_ok=True)
    tmp = PUBLIC / "sakinler.json.tmp"
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    tmp.replace(PUBLIC / "sakinler.json")
    return {"sakin": len(sakinler), "bekleyen": data["bekleyen"], "zirve": zirve, "worker": push((PUBLIC / "sakinler.json").read_bytes())}


def kayit(method: str, path: str, body: dict | None = None) -> dict | None:
    """Worker'daki kayıt API'si (yayın anahtarıyla): yorumla doğrulama onayı, siteden seçim oyları.
    Adres yayin.json'daki liste adresinin kökü. Ulaşılamazsa None (taşınmayı durdurmaz)."""
    try:
        conf = json.loads((SECRETS / "yayin.json").read_text())
    except FileNotFoundError:
        return None
    root = conf["url"].split("/sakinler.json")[0]
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(root + path, data=data, method=method, headers={
        "Authorization": f"Bearer {conf['anahtar']}", "Content-Type": "application/json", "User-Agent": "wattenoog-sunucu/1"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except (urllib.error.URLError, ValueError):
        return None


def push(body: bytes) -> str:
    try:
        conf = json.loads((SECRETS / "yayin.json").read_text())
    except FileNotFoundError:
        return "atlandı (secrets/yayin.json yok)"
    req = urllib.request.Request(conf["url"], data=body, method="PUT", headers={
        "Authorization": f"Bearer {conf['anahtar']}", "Content-Type": "application/json",
        "User-Agent": "wattenoog-sunucu/1"})  # Cloudflare varsayılan Python istemcisini engelliyor
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return "ok" if r.status == 200 else f"HTTP {r.status}"
    except urllib.error.HTTPError as e:
        sys.exit(f"HATA: liste Worker'a yollanamadı (HTTP {e.code}); yerel kopya yazıldı, tekrar dene: python3 -c 'import ortak; ortak.publish()'")
    except urllib.error.URLError as e:
        sys.exit(f"HATA: liste Worker'a yollanamadı ({e.reason}); yerel kopya yazıldı, tekrar dene")

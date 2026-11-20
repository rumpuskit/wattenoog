#!/usr/bin/env python3
"""Sakinlerin istekleri: videolarımızın altına yazılan yorumlardan (tik.ninja üzerinden, tasinma.py)
ya da elle (DM, canlı yayın) gelir ve sakinin overrides alanına işlenir.

Yorumdaki biçim (Almanca; büyük/küçük harf, noktalama ve umlaut yazımı fark etmez: "Bäcker" = "Baecker" = "Backer",
"Fußballer" = "Fussballer"; birkaçı aynı yorumda olabilir):
    Beruf: Fischerin      Job: Bäcker               Arbeit: Polizei           Beruf: Fischerei (iş alanı)
    ich will Fischer werden    ich möchte Bäckerin sein    ich wär gern Polizist    mach mich zur Kapitänin
    kann ich Ärztin werden?    darf ich Lehrer sein        Fischer bitte            Fischerin pls
    Hobby: Skat           Haustier: Katze           Tier: Hund
    Name verstecken / versteck meinen Namen / Namen ausblenden      Name zeigen / zeig meinen Namen
    einziehen / ich will einziehen / zieh mich ein / ich will auf die Insel / nehmt mich mit   (katılım, DEVIR §4.7)
    zieh mich aus / ich will ausziehen / lösch mich   (çıkma isteği: yalnız kaydedilir, operatör cikar.py ile çıkarır)
Meslek: unvan dişil biçimdeyse ("Fischerin", katalogda kademeler_w) sakinin overrides'ına form "w", eril biçimdeyse
("Fischer", kademeler) form "m" de yazılır (kartta unvan o biçimde görünür); iş alanıyla ("Beruf: Fischerei") ya da
biçimsiz eş anlamlıyla ("Cop", "Doktor") biçim değişmez. Cinsiyet addan tahmin edilmez (DEVIR §4.2).
Yalnız katalogdaki seçenekler geçer (kadrolu işler, ör. Rettungsschwimmer, istenemez; "istenebilir" olanlar, ör. Polizei
ve Leuchtturmwärter, hariç; Bürgermeister seçimle gelir: secim.py). Genel unvanlar (Chef, Leiter, Praktikant, Azubi …)
tek başına meslek değildir. Olumsuz ("ich will KEIN Fischer werden", "nicht", "nie") istek değildir.
İstek yalnız yorumu yazanın kendisi için ve yalnız adada oturuyorsa uygulanır; henüz taşınmamışsa 30 gün bekler
(ISTEK_GUN). Aynı konuda birden çok istek varsa en son yazılan geçer.

Taban (eski takipçiler, DEVIR §4.7): tabandaki biri katılım ifadesi ya da meslek/hobi/evcil isteği yazınca `katilim`
kaydı açılır ve sonraki taşınmada adaya gelir. "cool", "bin dabei", emoji, "hallo" katılım değildir.

Yorum metni saklanmaz: yalnız ayrıştırılmış istek (kullanıcı adı, tür, değer, yorum kimliği) tutulur
ve 30 gün sonra silinir; isteğin etkisi sakinin kaydında kalır.

Kullanım (sunucuda, wattenoog kullanıcısıyla):
    python3 istekler.py dene "mach mich zur Fischerin bitte"  # ayrıştırmayı dene, kaydetme
    python3 istekler.py ekle kullaniciadi meslek Fischerin    # DM ya da canlı yayından gelen istek (kimlik ya da ad)
    python3 istekler.py ekle kullaniciadi katilim             # DM'de "einziehen" diyen eski takipçi
    python3 istekler.py liste [--gun 30] [--tur cikis]        # son isteklerin dökümü (haftalık video, çıkma istekleri)
"""

import argparse
import json
import re
import sys
import time
import unicodedata
from functools import cache

from wattenoog_sim import sim
import ortak  # noqa: E402
from ortak import DB, ISTEK_GUN, psql, publish

# Sakinin kaydına işlenen türler (gizle ayrıca hidden sütununa); katilim ve cikis yalnız kayıt.
OVERRIDE_TURLERI = ("meslek", "form", "hobi", "evcil")
UYGULANAN_TURLER = OVERRIDE_TURLERI + ("gizle",)
TURLER = UYGULANAN_TURLER + ("katilim", "cikis")
# Tabandaki (eski) takipçi için katılım sayılan türler: açık katılım ya da bir istek.
KATILIM_TURLERI = {"katilim", "meslek", "hobi", "evcil"}
MAX_METIN = 300

# Katalogda unvan olarak geçmeyen ama sık yazılacak karşılıklar: (meslek, biçim). Biçim None: unvan biçimi
# değişmez (argo, cinsiyetsiz ya da her iki cins için kullanılan sözcük). Yazım doğal Almanca; katla() ile eşlenir.
EK_MESLEK = {
    "Polizist": ("polis", "m"), "Polizistin": ("polis", "w"), "Polizeibeamter": ("polis", "m"),
    "Polizeibeamtin": ("polis", "w"), "Bulle": ("polis", None), "Cop": ("polis", None), "Kommissar": ("polis", "m"),
    "Kommissarin": ("polis", "w"),
    "Doktor": ("doktor", None), "Doktorin": ("doktor", "w"), "Doc": ("doktor", None), "Hausarzt": ("doktor", "m"),
    "Hausärztin": ("doktor", "w"),
    "Krankenschwester": ("hemsire", "w"), "Krankenpfleger": ("hemsire", "m"), "Krankenpflegerin": ("hemsire", "w"),
    "Pfleger": ("hemsire", "m"), "Pflegerin": ("hemsire", "w"),
    "Programmierer": ("yazilimci", "m"), "Programmiererin": ("yazilimci", "w"), "Entwickler": ("yazilimci", "m"),
    "Entwicklerin": ("yazilimci", "w"), "Software-Entwickler": ("yazilimci", "m"),
    "Software-Entwicklerin": ("yazilimci", "w"), "Coder": ("yazilimci", None), "Informatiker": ("yazilimci", "m"),
    "Informatikerin": ("yazilimci", "w"),
    "Bauer": ("ciftci", "m"), "Bäuerin": ("ciftci", "w"),
    "Chefkoch": ("asci", "m"), "Chefköchin": ("asci", "w"),
    "Fußballer": ("futbolcu", "m"), "Fußballerin": ("futbolcu", "w"), "Kicker": ("futbolcu", "m"),
    "Kickerin": ("futbolcu", "w"),
    "Pilot": ("zeplin_pilotu", "m"), "Pilotin": ("zeplin_pilotu", "w"),
    "Wärter": ("fener_bekcisi", "m"), "Wärterin": ("fener_bekcisi", "w"),
    "Frisör": ("berber", "m"), "Frisörin": ("berber", "w"), "Friseuse": ("berber", "w"),
    "Schäfer": ("deichschaefer", "m"), "Schäferin": ("deichschaefer", "w"),
    "Anwalt": ("avukat", "m"), "Anwältin": ("avukat", "w"),
    "Verkäufer": ("kasiyer", "m"), "Verkäuferin": ("kasiyer", "w"),
    "Schreiner": ("marangoz", "m"), "Schreinerin": ("marangoz", "w"),
    "Künstler": ("ressam", "m"), "Künstlerin": ("ressam", "w"),
    "Beamter": ("memur", "m"), "Beamtin": ("memur", "w"),
    "Rektor": ("okul_muduru", "m"), "Rektorin": ("okul_muduru", "w"),
    "Bedienung": ("garson", None), "Zugführer": ("lokfuehrer", "m"), "Zugführerin": ("lokfuehrer", "w"),
}
# İş alanı gibi davranan ek adlar: "Beruf: Fußball" ve "ich will zum Fußball" istektir, tek başına "Fußball ⚽" değil.
EK_ALAN = {
    "Fußball": "futbolcu", "Fischerei": "balikci", "Bäckerei": "firinci", "Schule": "ogretmen", "Werft": "gemi_ustasi",
    "Bauernhof": "ciftci", "Verwaltung": "memur", "Rathaus": "memur", "Bücherei": "kutuphaneci", "Bibliothek": "kutuphaneci",
    "Küche": "asci", "Restaurant": "garson", "Hotel": "resepsiyonist", "Software": "yazilimci", "IT": "yazilimci",
    "Gericht": "hakim", "Supermarkt": "kasiyer", "Laden": "kasiyer",
}
# Birden çok mesleğin basamağı olabilecek genel unvanlar tek başına meslek adı sayılmaz (katalogda tek bir mesleğin
# basamağı olsalar da: "Abteilungsleiter" yalnız Einzelhandel'de ama genel bir unvan).
GENEL = {
    "Chef", "Chefin", "Boss", "Leiter", "Leiterin", "Manager", "Managerin", "Praktikant", "Praktikantin", "Azubi",
    "Aushilfe", "Inhaber", "Inhaberin", "Besitzer", "Besitzerin", "Meister", "Meisterin", "Angestellter", "Angestellte",
    "Mitarbeiter", "Mitarbeiterin", "Abteilungsleiter", "Abteilungsleiterin", "Teamleiter", "Teamleiterin",
    "Projektleiter", "Projektleiterin", "Schichtleiter", "Schichtleiterin", "Filialleiter", "Filialleiterin",
    "Stationsleiter", "Stationsleiterin", "Direktor", "Direktorin", "Assistent", "Assistentin", "Lehrling",
    "Auszubildender", "Auszubildende", "Trainee", "Junior", "Senior", "Werkstudent", "Werkstudentin", "Anwärter",
    "Anwärterin", "Gehilfe", "Gehilfin", "Helfer", "Helferin", "Praxisinhaber", "Praxisinhaberin",
}
EK_HOBI = {
    "Fischen": "balik", "Bücher": "kitap", "Buch": "kitap", "Zeichnen": "resim", "Malerei": "resim",
    "Fahrrad": "bisiklet", "Fahrradfahren": "bisiklet", "Fahrrad fahren": "bisiklet", "Rad fahren": "bisiklet",
    "Radeln": "bisiklet", "Schwimmen": "yuzme", "Drachen": "ucurtma", "Drachen steigen lassen": "ucurtma",
    "Shanty": "gitar", "Shantys": "gitar", "Shantychor": "gitar", "Chor": "gitar", "Singen": "gitar",
    "Fotos": "fotograf", "Fotografie": "fotograf", "Laufen": "kosu", "Yoga": "yoga", "Wattwanderung": "watt",
    "Kiten": "kite", "Kite": "kite", "Kartenspielen": "satranc", "Karten spielen": "satranc",
}
EK_EVCIL = {
    "Hunde": "Hund", "Hündchen": "Hund", "Welpe": "Hund", "Hundi": "Hund", "Katzen": "Katze", "Kätzchen": "Katze",
    "Kater": "Katze", "Mieze": "Katze", "Miezekatze": "Katze", "Hase": "Kaninchen", "Hasen": "Kaninchen",
    "Häschen": "Kaninchen", "Wellensittiche": "Wellensittich", "Sittich": "Wellensittich", "Vogel": "Wellensittich",
}

_UMLAUT = str.maketrans({"ä": "ae", "ö": "oe", "ü": "ue"})
_SADE = str.maketrans({"ä": "a", "ö": "o", "ü": "u"})


def katla(text: str, sade: bool = False) -> str:
    """Karşılaştırma biçimi: casefold (ß → ss; Türkçe I/ı kuralı uygulanmaz), ä/ö/ü → ae/oe/ue (sade=True: a/o/u),
    diğer aksanlar Latin, kesme işareti silinir ("wär's" → "waers"), diğer noktalama boşluk."""
    t = unicodedata.normalize("NFC", text.replace("’", "'").replace("‘", "'").replace("`", "'")).casefold()
    t = unicodedata.normalize("NFKD", t.translate(_SADE if sade else _UMLAUT)).encode("ascii", "ignore").decode()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", t.replace("'", "")).split())


def _yazimlar(ad: str) -> list[str]:
    """Bir adın eşlenen yazımları: umlaut ae/oe/ue (yorum metni de böyle katlanır) ve umlautsuz a/o/u ("Backer")."""
    return list(dict.fromkeys([katla(ad), katla(ad, sade=True)]))


def _tablo(kayitlar) -> dict[str, tuple]:
    """kayitlar: (ad, değer, biçim, kaynak). → {katlanmış ad: (değer, biçim, kaynak)}.
    Birden çok değere giden belirsiz adlar çıkarılır. Asıl yazım (ae/oe/ue) umlautsuz yazımdan önce gelir: umlautsuz
    yazım yalnız başka bir adın asıl yazımıyla çakışmıyorsa eklenir. Aynı değere farklı biçimle giden ad biçimsizdir
    ("Barista" iki cinste aynı); unvan ya da eş anlamlı olan ad, iş alanı sayılmaz."""
    katmanlar: list[dict[str, list]] = [{}, {}]
    for ad, deger, bicim, kaynak in kayitlar:
        for n, yazim in enumerate(_yazimlar(ad)):
            if yazim:
                katmanlar[n].setdefault(yazim, []).append((deger, bicim, kaynak))
    out: dict[str, tuple] = {}
    for n, katman in enumerate(katmanlar):
        for yazim, liste in katman.items():
            if n and yazim in katmanlar[0]:
                continue
            if len({d for d, _, _ in liste}) != 1:
                continue
            unvan = [x for x in liste if x[2] != "alan"]
            bicimler = {b for _, b, _ in unvan or liste}
            kaynak = "unvan" if unvan else "alan"
            out[yazim] = (liste[0][0], bicimler.pop() if len(bicimler) == 1 else None, kaynak)
    return out


@cache
def _tablolar() -> dict[str, dict[str, tuple]]:
    c = sim.catalog()
    genel = {y for g in GENEL for y in _yazimlar(g)}
    # Seçimle gelen makamlar (Bürgermeister) istenemez: secim.py.
    meslekler = [j for j in c["meslekler"] if (not j.get("kadro") or j.get("istenebilir")) and not j.get("secimle")
                 and j["id"] != c["kilitli_meslek"]]
    meslek = []
    for j in meslekler:
        eril, disil = set(j["kademeler"]), set(j.get("kademeler_w") or [])
        for ad in eril | disil:
            meslek.append((ad, j["id"], "m" if ad not in disil else "w" if ad not in eril else None, "unvan"))
        meslek.append((j["alan"], j["id"], None, "alan"))
    meslek += [(ad, mid, bicim, "ek") for ad, (mid, bicim) in EK_MESLEK.items()]
    meslek += [(ad, mid, None, "alan") for ad, mid in EK_ALAN.items()]
    meslek = _tablo(meslek)
    meslek = {a: v for a, v in meslek.items() if a not in genel}
    hobi = _tablo([(h["ad"], h["id"], None, "ad") for h in c["hobiler"]] + [(a, v, None, "ek") for a, v in EK_HOBI.items()])
    evcil = _tablo([(p, p, None, "ad") for p in c["evcil_hayvanlar"]] + [(a, v, None, "ek") for a, v in EK_EVCIL.items()])
    return {"meslek": meslek, "hobi": hobi, "evcil": evcil}


@cache
def secenekler() -> dict[str, list[tuple[str, str]]]:
    """{tür: [(katlanmış ad, değer), ...]}: uzun ad önce ("krabbenfischer" "fischer"den önce)."""
    return {tur: sorted(((a, v[0]) for a, v in t.items()), key=lambda x: -len(x[0])) for tur, t in _tablolar().items()}


# Sitedeki yorumla doğrulama kodu: "Code 1234", "Code: 1234", "mein Code ist 1234", "code is 1234".
KOD = re.compile(r"\b(?:code|kode)\s*(?:(?:ist|is|lautet)\s*)?(\d{4})\b")
# Yorumun tamamı koddan ibaret ("8538"): Worker yalnız o kullanıcı adına verilmiş kodu bağlar, yanlış eşleşme olmaz.
KOD_TEK = re.compile(r"^(\d{4})$")
# Sabit biçim yok (Driftwood, 8 Kasım): yorumdaki her 4 haneli sayı aday koddur ("4521 das bin ich", "1234 ist mein
# Code"). Worker yalnız o kullanıcı adına verilmiş bekleyen kodu bağlar; yıl gibi sayılar düşer.
KOD_HER = re.compile(r"(?<!\d)(\d{4})(?!\d)")


def kodlar_bul(text: str) -> list[tuple[str, bool]]:
    """[(kod, kesin)]: kesin = yorum açıkça kod diyor ("Code" sözcüğü geçiyor ya da yorumun tamamı "1234").
    Kesin olmayan sayılar Worker'da yalnız kod tam o kullanıcı adına verildiyse bağlanır (yazım hatası toleransı ve
    "başka hesaptan görüldü" notu yalnız kesinlerde)."""
    t = katla(text[:200])
    kesin = bool(re.search(r"\b(?:code|kode)", t) or KOD_TEK.match(t))
    return [(k, kesin) for k in dict.fromkeys(KOD_HER.findall(t))][:3]


# @etiketler ayrıştırmadan önce silinir: "@baecker.hans" bir meslek isteği değildir (oylar secim.py'de ham metinden).
ETIKET = re.compile(r"@[\w.]+")
# Konu sözcüğü + değer: "Beruf: Fischerin", "Job, Bäcker", "Arbeit: Polizei", "mein Hobby ist Angeln", "Haustier: Katze".
TETIK = re.compile(r"\b(?:(?P<meslek>arbeite(?:n)? als|(?:traum)?berufe?|jobs?|arbeit|taetigkeit)"
                   r"|(?P<hobi>(?:lieblings)?hobb(?:y|ys|ies))|(?P<evcil>(?:haus|lieblings)?tier(?:e|chen)?))\b")
# Konu sözcüğünden önce bunlar varsa istek değil, övgü ya da başkasının işi: "gute Arbeit", "die Arbeit der Fischer",
# "nice job", "das Tier ist eine Katze".
TETIK_ONCE_DEGIL = {
    "gute", "guter", "gutes", "tolle", "toller", "super", "starke", "starker", "klasse", "geile", "geiler", "saubere",
    "coole", "cooler", "schoene", "schone", "krasse", "krasser", "mega", "top", "beste", "harte", "viel", "echt",
    "nice", "good", "great", "die", "der", "das", "dem", "den", "deine", "dein", "eure", "euer", "ihre", "ihr", "seine",
    "sein", "diese", "dieser", "dieses", "welche", "welcher", "welches", "was", "fuer", "fur", "von",
}
TETIK_KELIME = {"meslek": 3, "hobi": 4, "evcil": 4}  # değer, konu sözcüğünden sonraki ilk N kelimede başlamalı
_ICH = r"(?:\bich |^)(?:will|w(?:oe|o)llte|m(?:oe|o)chte|m(?:oe|o)cht|wuerde|wurde gerne?|waere|ware|waer|werde)"
# "ich will Fischer werden", "ich möchte Bäckerin sein", "ich wär gern Polizist", "mach mich zum Kapitän",
# "kann ich Ärztin werden?", "darf ich Lehrerin sein" … (Driftwood'da "may I be a doctor" kaçmıştı.)
ISTEK = re.compile(r"(?:" + _ICH + r"|\bmach(?:t|e|st)? (?:du |ihr )?mich (?:zum|zur|zu|als)"
                   r"|\b(?:kann|darf|k(?:oe|o)nnte|d(?:ue|u)rfte) ich|\bk(?:oe|o)nnt ihr mich (?:zum|zur|zu|als)"
                   r"|\bmein traum(?:beruf)? (?:ist|waere|ware)|\bich w(?:ue|u)nsche mir"
                   r"|\b(?:setz|trag)t? mich (?:als|zum|zur|ein als)|\bich bewerbe mich als|\bich melde mich als)"
                   r" (?P<x>(?:[a-z0-9]+ ){0,4}[a-z0-9]+)")
# "Fischer bitte", "Bäckerin pls", "ein Koch bitte": rica sözcüğünden önce yalnız unvan (dolgu sözcükleri hariç).
# "den Fischer bitte nochmal zeigen" videodaki kişiden söz eder, istek değil.
LUTFEN = re.compile(r"\b((?:[a-z0-9]+ ){0,3}[a-z0-9]+) (?:bitte+|pls|plz|please|bidde)\b")
LUTFEN_DOLGU = {"als", "ich", "auch", "mal", "einmal", "ein", "eine", "einen", "werde", "waere", "ware", "waer"}
OLUMSUZ = re.compile(r"\b(?:nicht|nich|net|kein|keine|keinen|keiner|keinem|nie|niemals|nimmer|garnicht|not|never|dont)\b")
GIZLE = re.compile(
    r"\b(?P<v1>versteck(?:e|t|en)?|verberg(?:e|t|en)?|verbirg|zeig(?:e|t|en)?) (?:(?:bitte|mal|doch) )?"
    r"(?:mein(?:en)? )?(?:user ?|benutzer|nutzer)?namen?\b"
    r"|\b(?:mein(?:en)? )?(?:user ?|benutzer|nutzer)?namen? (?:(?:bitte|lieber) )?(?P<nicht>nicht )?"
    r"(?P<v2>verstecken|versteckt|verbergen|ausblenden|unsichtbar|anonym|zeigen|anzeigen|einblenden|sichtbar)\b"
    r"|\bblende? (?:bitte )?mein(?:en)? (?:user ?)?namen? (?P<v3>aus|ein)\b"
    r"|\bmach(?:t)? mich (?P<v4>anonym|unsichtbar)\b")
_GIZLE_ACIK = ("zeig", "anzeig", "einblend", "sichtbar", "ein")
# Katılım (eski takipçi, DEVIR §4.7). Açık ifade ister; "cool", "bin dabei", "hallo", emoji katılım değil.
_DOLGU = (r"(?: (?:auch|gern|gerne|jetzt|sofort|direkt|bald|hier|da|dort|mal|mit|unbedingt|bitte|ja|morgen|heute|noch|wieder"
          r"|schon|dann|endlich|bei euch|auf (?:die|eure|der|eurer|diese) insel|nach wattenoog|in wattenoog|auf wattenoog))*")
KATILIM = re.compile(
    r"\bich (?:will|w(?:oe|o)llte|m(?:oe|o)chte|m(?:oe|o)cht|wuerde|wurde gerne?|werde)" + _DOLGU + r" einziehen\b"
    r"|\b(?:kann|darf|k(?:oe|o)nnte|d(?:ue|u)rfte) ich" + _DOLGU + r" einziehen\b"
    r"|\blass(?:t)? mich" + _DOLGU + r" einziehen\b"
    r"|\bich zieh(?:e)?" + _DOLGU + r" ein\b"
    r"|\bzieh(?:t)? mich" + _DOLGU + r" ein\b"
    r"|\bich (?:will|m(?:oe|o)chte|m(?:oe|o)cht|wuerde|wurde gerne?)(?: (?:auch|gern|gerne|unbedingt|jetzt|sofort|mal|bitte))*"
    r" (?:auf (?:die|eure|diese) insel|nach wattenoog|auf wattenoog)\b"
    r"|\b(?:nehmt|nimm) mich(?: (?:auch|bitte|doch|mal))* mit\b"
    r"|^(?:(?:ich|will|m(?:oe|o)chte|auch|bitte|ja|hallo|hi|hey|moin)\s+)*einziehen\b")  # "Einziehen! Beruf: …"
# Yorumun tamamı "einziehen" (+ dolgu): "einziehen", "einziehen bitte 🙏", "will auch einziehen".
KATILIM_TAM = re.compile(r"(?:(?:ich|will|m(?:oe|o)chte|auch|bitte|gern|gerne|jetzt|sofort|direkt|mal|ja|hier|einfach)\s+)*"
                         r"einziehen(?:\s+(?:bitte+|pls|plz|auch|jetzt|sofort|ja|gerne?))*")
# Çıkma isteği: yalnız kaydedilir, operatör bakar (cikar.py). Otomatik silme yok.
CIKIS = re.compile(
    r"\bzieh(?:t)? mich(?: (?:bitte|wieder|doch|hier))* aus\b"
    r"|\bich (?:will|w(?:oe|o)llte|m(?:oe|o)chte|m(?:oe|o)cht|wuerde|wurde gerne?)(?: (?:wieder|hier|bitte|lieber|jetzt|gern|gerne))*"
    r" (?:ausziehen|austreten|raus aus der insel|von der insel)\b"
    r"|\bich zieh(?:e)? (?:wieder |hier )?aus(?:$| (?:der|von der) insel\b)"
    r"|\bl(?:oe|o)sch(?:t|e|en)? mich\b|\bl(?:oe|o)sch(?:t|e)? mein(?:e|en)? (?:namen|account|daten|eintrag)\b"
    r"|\bentfern(?:t|e)? mich\b|\bnehmt mich (?:wieder )?(?:von der insel )?raus\b|\btrag(?:t)? mich aus\b")


def _olumsuz(t: str, bas: int, son: int) -> bool:
    return bool(OLUMSUZ.search(t[max(0, bas):son]))


def _ara(tur: str, parca: str, kelime: int | None = None) -> tuple[int, str, str | None, str] | None:
    """Parçada ilk geçen seçenek: (konum, değer, biçim, kaynak). Tam kelime ("fischer" "fischerei"de ve
    "krabbenfischer"de eşleşmez); aynı yerde uzun ad önce. kelime: değer ilk N kelimeden birinde başlamalı."""
    sinir = len(parca)
    if kelime is not None:
        baslar = [m.start() for m in re.finditer(r"\S+", parca)]
        sinir = baslar[kelime] if len(baslar) > kelime else len(parca)
    tablo = _tablolar()[tur]
    best = None
    for ad, deger in secenekler()[tur]:
        m = re.search(r"\b" + re.escape(ad) + r"\b", parca)
        if m and m.start() < sinir and (best is None or m.start() < best[0]):
            best = (m.start(), deger, tablo[ad][1], tablo[ad][2])
    return best


def _meslek_yaz(out: dict, bulunan: tuple) -> None:
    out["meslek"] = bulunan[1]
    if bulunan[2]:
        out["form"] = bulunan[2]


def cozumle(text: str) -> dict[str, str]:
    """Yorumdaki istekler: {tür: değer}. Değerler katalog kimliği (evcil: hayvanın adı; form: "m"/"w";
    gizle: "1"/"0"; katilim, cikis: "1")."""
    t = katla(ETIKET.sub(" ", text[:MAX_METIN]))
    out: dict[str, str] = {}
    if any(not _olumsuz(t, m.start() - 12, m.end() + 10) for m in CIKIS.finditer(t)):
        out["cikis"] = "1"
    elif KATILIM_TAM.fullmatch(t) or any(not _olumsuz(t, m.start() - 12, m.end()) for m in KATILIM.finditer(t)):
        out["katilim"] = "1"

    tetikler = list(TETIK.finditer(t))
    for n, m in enumerate(tetikler):
        tur = m.lastgroup
        once = t[:m.start()].split()[-1:]
        if tur in out or (once and once[0] in TETIK_ONCE_DEGIL):
            continue
        if tur == "evcil" and m.group().startswith("tier") and once and once[0] not in ("mein", "meine", "als"):
            continue  # "Tier" yalnız başta ya da "mein Tier: …"; "Haustier" her yerde
        son = tetikler[n + 1].start() if n + 1 < len(tetikler) else len(t)
        bulunan = _ara(tur, t[m.end():son], TETIK_KELIME[tur])
        if bulunan and not _olumsuz(t, m.start(), m.end() + bulunan[0]):
            if tur == "meslek":
                _meslek_yaz(out, bulunan)
            else:
                out[tur] = bulunan[1]
    if "meslek" not in out:
        for m in ISTEK.finditer(t):
            bulunan = _ara("meslek", m.group("x"))
            if not bulunan:
                continue
            konum = m.start("x") + bulunan[0]
            # İş alanı yalnız "zur Polizei", "in die Backstube", "zum Fußball" gibi: "ich will Recht haben" istek değil.
            if bulunan[3] == "alan" and t[:konum].split()[-1:] not in (["zur"], ["zum"], ["ins"], ["in"], ["im"],
                                                                      ["bei"], ["beim"], ["die"], ["der"]):
                continue
            # "ich will KEIN Fischer werden", "ich möchte nie Polizistin sein" istek değil.
            if not _olumsuz(t, m.start() - 6, konum):
                _meslek_yaz(out, bulunan)
                break
    if "meslek" not in out:
        tablo = _tablolar()["meslek"]
        for m in LUTFEN.finditer(t):
            kelimeler = m.group(1).split()
            while kelimeler and kelimeler[0] in LUTFEN_DOLGU:
                kelimeler.pop(0)
            ad = " ".join(kelimeler)
            if ad in tablo and tablo[ad][2] != "alan" and not _olumsuz(t, m.start() - 12, m.end()):
                _meslek_yaz(out, (0, *tablo[ad]))
                break
    if not out.keys() & {"meslek", "hobi", "evcil"}:
        # Yorumun tamamı bir unvansa ("Polizistin", "Leuchtturmwärter 🙋") o da istektir; cümle içinde geçen ad
        # ("der Fischer sieht süß aus") ve tek başına iş alanı ("Polizei", "Café") istek sayılmaz.
        tam = _tablolar()["meslek"].get(t)
        if tam and tam[2] != "alan":
            _meslek_yaz(out, (0, *tam))
    g = GIZLE.search(t)
    if g:
        v = next(x for x in g.group("v1", "v2", "v3", "v4") if x)
        acik = v.startswith(_GIZLE_ACIK) != bool(g.group("nicht"))  # "Namen nicht zeigen" = gizle
        out["gizle"] = "0" if acik else "1"
    return out


KAYDET_SQL = """
INSERT INTO istekler (handle, tur, deger, kaynak, kaynak_id, created_at)
SELECT x->>0, x->>1, x->>2, :'kaynak', x->>3, to_timestamp((x->>4)::bigint)
FROM json_array_elements(:'veri'::json) AS x
ON CONFLICT (kaynak, kaynak_id) DO NOTHING;
"""

# Her (kullanıcı, tür) için en son yazılan istek geçer: o henüz uygulanmadıysa ve kişi adada oturuyorsa
# uygulanır; ondan eski bekleyenler eskir (geç okunan eski bir yorum yeni isteği ezmez).
# katilim ve cikis burada uygulanmaz (katilim tablosu / operatör).
UYGULA_SQL = """
BEGIN;
CREATE TEMP TABLE son ON COMMIT DROP AS
SELECT DISTINCT ON (i.handle, i.tur) i.id, i.handle, i.tur, i.deger, i.durum, i.created_at, {koltuk_a} AS koltuk
FROM istekler i
JOIN sakinler s ON s.platform = 'tt' AND s.handle = i.handle AND s.left_day IS NULL
WHERE i.durum IN ('bekliyor', 'uygulandi') AND i.tur IN ({turler})
ORDER BY i.handle, i.tur, i.created_at DESC, i.id DESC;

-- Tek koltuklu meslekler (Ortsvorsteher, Schulleitung, Leuchtturm): adadan ayrılan koltuğu bırakır; koltuk doluysa
-- ya da aynı mahallede daha önce isteyen varsa istek 'dolu' olur (kişinin eski mesleği sürer; biçim isteği geçer).
UPDATE sakinler SET overrides = overrides - 'meslek'
WHERE platform = 'tt' AND left_day IS NOT NULL AND overrides->>'meslek' IN ({tek});
CREATE TEMP TABLE dolu ON COMMIT DROP AS
SELECT a.id, a.handle, a.tur FROM son a
WHERE a.durum = 'bekliyor' AND a.tur = 'meslek' AND a.deger IN ({tek}) AND (
  EXISTS (SELECT 1 FROM sakinler o WHERE o.platform = 'tt' AND o.left_day IS NULL AND o.handle <> a.handle
          AND o.overrides->>'meslek' = a.deger AND {koltuk_o} = a.koltuk)
  OR EXISTS (SELECT 1 FROM son b WHERE b.durum = 'bekliyor' AND b.tur = 'meslek' AND b.deger = a.deger
             AND b.koltuk = a.koltuk AND b.handle <> a.handle AND (b.created_at, b.id) < (a.created_at, a.id)));
UPDATE istekler i SET durum = CASE WHEN i.id = d.id THEN 'dolu' ELSE 'eskidi' END
FROM dolu d WHERE i.handle = d.handle AND i.tur = d.tur AND i.durum = 'bekliyor';
DELETE FROM son WHERE id IN (SELECT id FROM dolu);

-- Kişi başına tek güncelleme (UPDATE ... FROM aynı satırı birden çok eşleşmeyle yalnız bir kez günceller).
UPDATE sakinler s SET overrides = s.overrides || o.yeni
FROM (SELECT handle, jsonb_object_agg(tur, deger) AS yeni FROM son
      WHERE durum = 'bekliyor' AND tur <> 'gizle' GROUP BY handle) o
WHERE s.platform = 'tt' AND s.handle = o.handle;
UPDATE sakinler s SET hidden = (son.deger = '1')
FROM son WHERE son.durum = 'bekliyor' AND son.tur = 'gizle' AND s.platform = 'tt' AND s.handle = son.handle;

UPDATE istekler i SET durum = CASE WHEN i.id = son.id THEN 'uygulandi' ELSE 'eskidi' END
FROM son WHERE i.handle = son.handle AND i.tur = son.tur AND i.durum = 'bekliyor';

DELETE FROM istekler WHERE created_at < now() - make_interval(days => {gun});
SELECT coalesce(json_agg(json_build_array(handle, tur, deger) ORDER BY handle, tur), '[]')
FROM son WHERE durum = 'bekliyor';
COMMIT;
"""


def kaydet(satirlar: list, kaynak: str, db: str = DB) -> int:
    """[[kullanıcı adı, tür, değer, kaynak kimliği, unix zaman], ...] → yeni eklenen sayısı."""
    if not satirlar:
        return 0
    once = int(psql("SELECT count(*) FROM istekler", db))
    psql(KAYDET_SQL, db, ["-v", f"kaynak={kaynak}", "-v", "veri=" + json.dumps(satirlar, ensure_ascii=False)])
    return int(psql("SELECT count(*) FROM istekler", db)) - once


def uygula(db: str = DB) -> list:
    """Bekleyen istekleri adada oturanlara uygular, 30 günden eski kayıtları siler (yayın yapmaz)."""
    c = sim.catalog()
    # Tek koltuklu meslekler (Ortsvorsteher, Schulleitung, Leuchtturm): koltuk, mahallenin şubesidir (sim.workplace ile
    # aynı: mahalle % şube sayısı; okul sayısı mahalleden azsa iki mahalle aynı okulu paylaşır; tek fener: adada bir koltuk).
    tekler = [j for j in c["meslekler"] if j.get("tek") == "mahalle"]
    tek = ", ".join(f"'{j['id']}'" for j in tekler) or "NULL"
    mahalle = sim.cap("daire_per_bina") * sim.cap("bina_per_sokak") * sim.cap("sokak_per_mahalle")
    koltuk = "CASE {} ELSE 0 END".format(" ".join(f"WHEN '{j['id']}' THEN {{s}}.slot / {mahalle} % {len(c['isyerleri'][j['yer']])}" for j in tekler)) if tekler else "0"
    sql = UYGULA_SQL.format(gun=ISTEK_GUN, tek=tek, turler=", ".join(f"'{x}'" for x in UYGULANAN_TURLER),
                            koltuk_a=koltuk.replace("{s}", "s").replace("CASE", "CASE i.deger"),
                            koltuk_o=koltuk.replace("{s}", "o").replace("CASE", "CASE a.deger"))
    return json.loads(psql(sql, db) or "[]")


def katilim_kaydet(adaylar: list, db: str = DB) -> list[str]:
    """[[kullanıcı adı, unix zaman], ...]: katılım ifadesi ya da istek yazanlar. Tabandaki (eski takipçi) ve henüz
    adada kaydı olmayanlar için `katilim` kaydı açar; sonraki taşınmada katılım sırasıyla (en eski yorum) gelirler.
    Yeni katılanların adları döner. Taban alınmamışsa ya da kimse tabanda değilse hiçbir şey yapmaz."""
    if not adaylar or psql("SELECT count(*) FROM taban", db) in ("", "0"):
        return []
    taban, tuz = ortak.taban_ozetleri(db), ortak.taban_tuz()
    ilk: dict[str, int] = {}
    for handle, ts in adaylar:
        if ortak.taban_ozet(handle, tuz) in taban:
            ilk[handle] = min(ts, ilk.get(handle, ts))
    if not ilk:
        return []
    veri = json.dumps([[h, ts, sim.day_of(ts)] for h, ts in sorted(ilk.items())])
    adlar = ["-v", "veri=" + veri]
    once = json.loads(psql("""SELECT coalesce(json_object_agg(k.handle, k.gun), '{}') FROM katilim k
                              JOIN json_array_elements(:'veri'::json) x ON x->>0 = k.handle""", db, adlar))
    # Adada oturan katılmaz (gerek yok). Takibi bırakmış eski sakinin katılımı, ayrılmadan önce yazılmışsa (gun ≤
    # left_day) eskimiştir: yenisiyle değişir (7 günü geçen kaydı taşınmada silinirken yeni katılım kalır).
    # Aynı kişinin birkaç katılım yorumunda ilki geçer (katılım sırası).
    out = psql("""
        INSERT INTO katilim (handle, gun, eklendi)
        SELECT x->>0, (x->>2)::int, to_timestamp((x->>1)::bigint) FROM json_array_elements(:'veri'::json) AS x
        WHERE NOT EXISTS (SELECT 1 FROM sakinler s WHERE s.platform = 'tt' AND s.handle = x->>0 AND s.left_day IS NULL)
        ON CONFLICT (handle) DO UPDATE SET
            eklendi = CASE WHEN katilim.gun <= (SELECT s.left_day FROM sakinler s WHERE s.platform = 'tt' AND s.handle = katilim.handle)
                           THEN EXCLUDED.eklendi ELSE least(katilim.eklendi, EXCLUDED.eklendi) END,
            gun = CASE WHEN katilim.gun <= (SELECT s.left_day FROM sakinler s WHERE s.platform = 'tt' AND s.handle = katilim.handle)
                       THEN EXCLUDED.gun ELSE least(katilim.gun, EXCLUDED.gun) END
        RETURNING json_build_array(handle, gun);
    """, db, adlar)
    sonra = [json.loads(r) for r in out.splitlines() if r.strip()]
    return sorted(h for h, gun in sonra if once.get(h) != gun)


def yorumlar(items: list, hesap: str | None = None, db: str = DB) -> dict:
    """tasinma.py'den: [[yorum kimliği, kullanıcı adı, unix zaman, metin], ...]. Metinler ayrıştırılıp
    atılır; kendi hesabımızın yorumları ve bozuk satırlar geçilir."""
    satirlar, kodlar, katilim_aday = [], [], []
    for it in items:
        if not (isinstance(it, list) and len(it) == 4 and isinstance(it[3], str) and isinstance(it[2], int)):
            continue
        cid, handle = str(it[0])[:40], sim.normalize_handle(str(it[1]))
        if not cid or not handle or handle == hesap:
            continue
        for kod, kesin in kodlar_bul(it[3]):
            kodlar.append([kod, handle, kesin])
        istek = cozumle(it[3])
        for tur, deger in istek.items():
            # Aynı yorumda birden çok istek: kaynak kimliği türle ayrılır.
            satirlar.append([handle, tur, deger, f"{cid}:{tur}", it[2]])
        if istek.keys() & KATILIM_TURLERI:
            katilim_aday.append([handle, it[2]])
    # Sitedeki yorumla doğrulama: yorumdaki kod Worker'da o kullanıcı adına verildiyse bağlanır (kesin kodda küçük yazım
    # farkı da tolere edilir, bkz. sayac/src/kayit.js /api/onayla).
    onay = (ortak.kayit("POST", "/api/onayla", {"ciftler": kodlar}) or {}).get("onaylanan", []) if kodlar else []
    son_id = int(psql("SELECT coalesce(max(id), 0) FROM istekler", db) or 0)
    yeni = kaydet(satirlar, "yorum", db)
    katilan = katilim_kaydet(katilim_aday, db)
    dolu = "SELECT coalesce(json_agg(json_build_array(handle, deger) ORDER BY id), '[]') FROM istekler WHERE durum = 'dolu'"
    once = json.loads(psql(dolu, db))
    uygulanan = uygula(db)
    turler = ", ".join(f"'{x}'" for x in UYGULANAN_TURLER)
    bekleyen = int(psql(f"SELECT count(*) FROM istekler WHERE durum = 'bekliyor' AND tur IN ({turler})", db))
    # Koltuğu dolu olduğu için geçmeyen istekler (Ortsvorsteher): yorumu yazana cevapta söylemek için.
    reddedilen = [d for d in json.loads(psql(dolu, db)) if d not in once]
    # Yeni çıkma istekleri: operatöre (cikar.py ile elle çıkarılır).
    cikis = json.loads(psql(f"""SELECT coalesce(json_agg(DISTINCT handle), '[]') FROM istekler
                                WHERE tur = 'cikis' AND id > {son_id}""", db))
    return {"yorum": len(items), "istek": yeni, "uygulanan": uygulanan, "bekleyen_istek": bekleyen,
            **({"dolu": reddedilen} if reddedilen else {}), **({"dogrulanan": onay} if onay else {}),
            **({"katilim": katilan} if katilan else {}), **({"cikis": cikis} if cikis else {})}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="komut", required=True)
    p = sub.add_parser("dene", help="metni ayrıştır, kaydetme")
    p.add_argument("metin")
    p = sub.add_parser("ekle", help="elle istek (DM, canlı yayın)")
    p.add_argument("handle")
    p.add_argument("tur", choices=[t for t in TURLER if t != "cikis"])
    p.add_argument("deger", nargs="?", default="",
                   help="katalog kimliği ya da Almanca adı (Fischerin; form: m/w; gizle: ja/nein; katilim: boş)")
    p.add_argument("--kaynak", default="dm", choices=["dm", "canli"])
    p = sub.add_parser("liste", help="son isteklerin dökümü")
    p.add_argument("--gun", type=int, default=ISTEK_GUN)
    p.add_argument("--tur", choices=TURLER)
    parser.add_argument("--db", default=DB)
    args = parser.parse_args()

    if args.komut == "dene":
        print(json.dumps(cozumle(args.metin), ensure_ascii=False))
        return
    if args.komut == "ekle":
        istek: dict[str, str] = {}
        if args.tur == "gizle":
            deger = {"ja": "1", "nein": "0", "evet": "1", "hayir": "0", "yes": "1", "no": "0", "1": "1", "0": "0"}.get(katla(args.deger))
        elif args.tur == "form":
            deger = katla(args.deger) if katla(args.deger) in ("m", "w") else None
        elif args.tur == "katilim":
            deger = "1"
        elif args.tur == "meslek" and args.deger in {j["id"] for j in sim.catalog()["meslekler"]}:
            deger = args.deger
        else:
            b = _ara(args.tur, katla(args.deger))
            deger = b[1] if b else None
            if b and args.tur == "meslek" and b[2]:
                istek["form"] = b[2]
        if deger is None:
            sys.exit(f"HATA: '{args.deger}' geçerli bir {args.tur} değil")
        istek = {args.tur: deger, **istek}
        handle = sim.normalize_handle(args.handle)
        now = int(time.time())
        kaydet([[handle, t, d, f"{args.kaynak}:{handle}:{t}:{now}", now] for t, d in istek.items()], args.kaynak, args.db)
        katilan = katilim_kaydet([[handle, now]], args.db) if istek.keys() & KATILIM_TURLERI else []
        uygulanan = uygula(args.db)
        if any(u[0] == handle for u in uygulanan):
            durum = "uygulandı"
        elif args.tur == "katilim":
            durum = "katıldı, sonraki taşınmada gelir" if katilan else "tabanda değil ya da zaten adada/katılmış (gerek yok)"
        else:
            durum = f"adada değil, taşınınca uygulanacak ({ISTEK_GUN} gün)" + ("; eski takipçi: katıldı" if katilan else "")
        print(json.dumps({"istek": [handle, istek], "durum": durum,
                          "yayin": publish(args.db) if uygulanan or katilan else None}, ensure_ascii=False))
        return
    tur = f"AND tur = '{args.tur}'" if args.tur else ""
    rows = psql(f"""SELECT coalesce(json_agg(json_build_array(handle, tur, deger, kaynak, durum,
                        to_char(created_at AT TIME ZONE 'Europe/Berlin', 'DD.MM. HH24:MI')) ORDER BY created_at), '[]')
                    FROM istekler WHERE created_at > now() - make_interval(days => {int(args.gun)}) {tur}""", args.db)
    for r in json.loads(rows):
        print("\t".join(map(str, r)))


if __name__ == "__main__":
    main()

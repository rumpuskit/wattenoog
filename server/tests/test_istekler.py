"""Yorumdan istek ayrıştırma (veritabanı gerektirmez, CI'da çalışır)."""

import unittest

from istekler import _yazimlar, cozumle, katla, secenekler

M, W = "m", "w"


def meslek(mid, form=None):
    return {"meslek": mid, **({"form": form} if form else {})}


class CozumleTest(unittest.TestCase):
    def test_gecerli(self):
        cases = {
            # Konu sözcüğüyle; iki biçim, iş alanı biçimsiz.
            "Beruf: Fischer": meslek("balikci", M),
            "Beruf, Fischerin": meslek("balikci", W),
            "BERUF FISCHERIN": meslek("balikci", W),
            "Job: Bäcker": meslek("firinci", M),
            "job: bäckerin": meslek("firinci", W),
            "Arbeit: Polizei": meslek("polis"),
            "Beruf: Fischerei": meslek("balikci"),
            "Beruf: Krabbenfischerei": meslek("balikci"),
            "Beruf: Krabbenfischerin": meslek("balikci", W),
            "mein Traumberuf ist Lehrerin": meslek("ogretmen", W),
            "ich arbeite als Tischler": meslek("marangoz", M),
            "meine Arbeit wäre Gärtnerin": meslek("bahcivan", W),
            # Cümleyle (fiil sonda).
            "ich will Fischer werden": meslek("balikci", M),
            "Ich möchte Bäckerin sein": meslek("firinci", W),
            "ich möchte Bäckerin werden 🥨": meslek("firinci", W),
            "ich wäre gern Polizist": meslek("polis", M),
            "ich wär gern Polizistin": meslek("polis", W),
            "Ich wär's gern: Polizistin": {},  # konu sözcüğü ya da istek kalıbı yok
            "ich würde gerne Kapitänin werden": meslek("balikci", W),
            "mach mich zum Kapitän": meslek("balikci", M),
            "macht mich zur Kapitänin!!": meslek("balikci", W),
            "kann ich Ärztin werden?": meslek("doktor", W),
            "kann ich Arzt werden": meslek("doktor", M),
            "darf ich Lehrer sein?": meslek("ogretmen", M),
            "darf ich auch Lehrerin sein": meslek("ogretmen", W),
            "ich will zur Polizei": meslek("polis"),
            "ich will in die Bäckerei": meslek("firinci"),
            "will auch Fischerin werden": meslek("balikci", W),
            # Rica.
            "Fischer bitte": meslek("balikci", M),
            "Fischerin pls": meslek("balikci", W),
            "ein Koch bitte 🙏": meslek("asci", M),
            "Leuchtturmwärterin bitte": meslek("fener_bekcisi", W),
            # Yorumun tamamı unvan.
            "Polizistin 👮‍♀️": meslek("polis", W),
            "Leuchtturmwärter": meslek("fener_bekcisi", M),
            "Krankenschwester": meslek("hemsire", W),
            # Umlaut yazımları: ä/ae/a, ö/oe/o, ü/ue/u, ß/ss.
            "Beruf: Baecker": meslek("firinci", M),
            "Beruf: Backerin": meslek("firinci", W),
            "Beruf: Köchin": meslek("asci", W),
            "Beruf: Koechin": meslek("asci", W),
            "Beruf: Kochin": meslek("asci", W),
            "Beruf: Fußballer": meslek("futbolcu", M),
            "Beruf: Fussballerin": meslek("futbolcu", W),
            "Beruf: FUẞBALLER": meslek("futbolcu", M),
            "Beruf: Lokfuehrerin": meslek("lokfuehrer", W),
            "Beruf: Lokfuhrer": meslek("lokfuehrer", M),
            "Beruf: Tieraerztin": meslek("veteriner", W),
            "kann ich Aerztin werden": meslek("doktor", W),
            # Eş anlamlılar.
            "Beruf: Polizist": meslek("polis", M),
            "Beruf: Bulle": meslek("polis"),
            "ich will Cop werden": meslek("polis"),
            "Beruf: Doktor": meslek("doktor"),
            "Beruf: Doc": meslek("doktor"),
            "Beruf: Pfleger": meslek("hemsire", M),
            "Beruf: Pflegerin": meslek("hemsire", W),
            "Beruf: Programmiererin": meslek("yazilimci", W),
            "Beruf: Entwickler": meslek("yazilimci", M),
            "Beruf: Coder": meslek("yazilimci"),
            "Beruf: Informatikerin": meslek("yazilimci", W),
            "Beruf: Bauer": meslek("ciftci", M),
            "Beruf: Bäuerin": meslek("ciftci", W),
            "Beruf: Landwirtin": meslek("ciftci", W),
            "Beruf: Koch": meslek("asci", M),
            "Beruf: Kicker": meslek("futbolcu", M),
            "Beruf: Kickerin": meslek("futbolcu", W),
            "Beruf: Fußball": meslek("futbolcu"),
            "Beruf: Pilotin": meslek("zeplin_pilotu", W),
            "Beruf: Wärter": meslek("fener_bekcisi", M),
            "Beruf: Feuerwehrfrau": meslek("itfaiyeci", W),
            "Beruf: Feuerwehrmann": meslek("itfaiyeci", M),
            "Beruf: Busfahrerin": meslek("sofor", W),
            "Beruf: Frisörin": meslek("berber", W),
            "Beruf: Friseur": meslek("berber", M),
            "Beruf: Apothekerin": meslek("eczaci", W),
            "Beruf: Tierarzt": meslek("veteriner", M),
            "Beruf: Schäferin": meslek("deichschaefer", W),
            "Beruf: Fischbrötchenverkäuferin": meslek("kahveci", W),
            "Beruf: Ranger": meslek("rehber", M),
            "Beruf: Wattführerin": meslek("rehber", W),
            "Beruf: Barista": meslek("barista"),  # iki cinste aynı: biçim yok
            "Beruf: Ortsvorsteherin": meslek("muhtar", W),
            "Beruf: Schulleiter": meslek("okul_muduru", M),
            "Beruf: Rentnerin": meslek("emekli", W),
            "Beruf: Studentin": meslek("ogrenci", W),
            "Beruf: Richterin": meslek("hakim", W),
            "Beruf: Staatsanwalt": meslek("savci", M),
            "Beruf: Polizeimeisterin": meslek("polis", W),
            # Birkaçı bir arada.
            "Beruf Fischerin, Hobby Skat, Haustier Katze": {**meslek("balikci", W), "hobi": "satranc", "evcil": "Katze"},
            "Hobby: Skat": {"hobi": "satranc"},
            "Hobbys: Schach": {"hobi": "schach"},
            "mein Hobby ist Angeln": {"hobi": "balik"},
            "Hobby: Drachen steigen lassen": {"hobi": "ucurtma"},
            "Hobby: Boßeln": {"hobi": "bosseln"},
            "Hobby: Bosseln": {"hobi": "bosseln"},
            "Hobby: Kitesurfen": {"hobi": "kite"},
            "Haustier: Katze": {"evcil": "Katze"},
            "Tier: Hund": {"evcil": "Hund"},
            "mein Haustier ist ein Wellensittich": {"evcil": "Wellensittich"},
            "Haustier: Kätzchen": {"evcil": "Katze"},
            "Haustier: Hase": {"evcil": "Kaninchen"},
            # Ad gizleme / gösterme.
            "Name verstecken": {"gizle": "1"},
            "versteck meinen Namen": {"gizle": "1"},
            "Namen ausblenden bitte": {"gizle": "1"},
            "blende meinen Namen aus": {"gizle": "1"},
            "Namen nicht zeigen": {"gizle": "1"},
            "mach mich anonym": {"gizle": "1"},
            "Name zeigen": {"gizle": "0"},
            "zeig meinen Namen": {"gizle": "0"},
            "Benutzernamen anzeigen": {"gizle": "0"},
            # Katılım (eski takipçi) ve çıkma.
            "einziehen": {"katilim": "1"},
            "Einziehen bitte 🙏": {"katilim": "1"},
            "ich will einziehen": {"katilim": "1"},
            "ich will auch einziehen!": {"katilim": "1"},
            "Ich möchte gerne einziehen": {"katilim": "1"},
            "ich ziehe ein": {"katilim": "1"},
            "ich zieh auch ein 😍": {"katilim": "1"},
            "zieh mich ein": {"katilim": "1"},
            "ich will auf die Insel": {"katilim": "1"},
            "nehmt mich mit": {"katilim": "1"},
            "kann ich auch einziehen?": {"katilim": "1"},
            "ich will wieder einziehen": {"katilim": "1"},
            "einziehen, Beruf: Fischerin": {"katilim": "1", **meslek("balikci", W)},
            "zieh mich aus": {"cikis": "1"},
            "ich will ausziehen": {"cikis": "1"},
            "lösch mich": {"cikis": "1"},
            "Loescht meine Daten": {"cikis": "1"},
        }
        for text, want in cases.items():
            self.assertEqual(cozumle(text), want, text)

    def test_istek_degil(self):
        for text in (
            "das ist so süß", "der Fischer sieht süß aus", "gute Arbeit, Fischer!", "die Arbeit der Fischer ist hart",
            "Nice job", "den Fischer bitte nochmal zeigen", "ich mag Fischer", "Ich war Fischer",
            # Olumsuz.
            "ich will kein Fischer werden", "ich will keine Fischerin sein", "ich möchte nie Polizistin sein",
            "ich will niemals Bäcker werden", "ich will nicht Lehrerin werden", "Beruf: kein Koch",
            # Genel unvanlar tek başına meslek değil.
            "Beruf: Chef", "Beruf: Chefin", "Beruf: Leiter", "Beruf: Leiterin", "Beruf: Manager", "Beruf: Praktikant",
            "Beruf: Praktikantin", "Beruf: Azubi", "Beruf: Aushilfe", "Beruf: Inhaber", "Beruf: Inhaberin",
            "Beruf: Meister", "Beruf: Abteilungsleiter", "Beruf: Teamleiterin", "Beruf: Stationsleiter",
            "ich will Chef werden", "Manager bitte",
            # Kadrolu (Rettungsschwimmer), anakara ve seçimle gelen makam istenemez.
            "Beruf: Rettungsschwimmer", "Beruf: Angestellter", "Beruf: Bürgermeister", "Beruf: Bürgermeisterin",
            "ich will Bürgermeisterin werden", "ich will Bürgermeister werden",
            # Tek başına iş alanı ya da alan sözcüğü cümlede istek değil.
            "Polizei", "Café ☕", "ich will Recht haben", "Fußball ⚽",
            # Belirsiz: katılım değil.
            "cool", "bin dabei", "hallo", "😍😍😍", "ich will auch!", "wann kann man einziehen", "ich will nicht einziehen",
            "die sollen einziehen", "ich zieh mir ein Eis rein", "ich zieh aus Berlin hierher",
            # Etiket meslek değil.
            "@baecker.hans 😂", "ich wähle @fischerin_anna",
            "Code 1234", "das Tier ist eine Katze",
        ):
            self.assertEqual(cozumle(text), {}, text)

    def test_katla(self):
        self.assertEqual(katla("  Ich wär’s, die BÄCKERIN!! "), "ich waers die baeckerin")
        self.assertEqual(katla("Fußballerin"), katla("FUSSBALLERIN"))
        self.assertEqual(katla("Straße ẞ"), "strasse ss")
        self.assertEqual(katla("Ärztin", sade=True), "arztin")
        # Türkçe I/ı kuralı uygulanmaz: "I" → "i", "İ" → "i".
        self.assertEqual(katla("ICH WILL İNSEL"), "ich will insel")
        self.assertEqual(katla("Bäckerin"), "baeckerin")  # ayrışık umlaut (NFD)
        self.assertEqual(_yazimlar("Köchin"), ["koechin", "kochin"])

    def test_belirsiz_ad_yok(self):
        # Her takma ad tek bir değere gider; katalog değişip iki mesleğe aynı unvan eklenirse çıkarılır.
        for tur, pairs in secenekler().items():
            aliases = [a for a, _ in pairs]
            self.assertEqual(len(aliases), len(set(aliases)), tur)

    def test_her_meslek_istenebilir(self):
        # İstenebilen her meslek ana unvanının iki biçimiyle ("Fischer"/"Fischerin") ve iş alanıyla tanınır; dişil
        # biçim eril biçimlerin hiçbiriyle aynı değilse form "w", eril biçim de dişillerle aynı değilse form "m".
        from wattenoog_sim import sim
        c = sim.catalog()
        n = 0
        for j in c["meslekler"]:
            if (j.get("kadro") and not j.get("istenebilir")) or j.get("secimle") or j["id"] == c["kilitli_meslek"]:
                continue
            i = 1 if len(j["kademeler"]) > 1 else 0
            ad_m, ad_w = j["kademeler"][i], j["kademeler_w"][i]
            want_m = M if ad_m not in j["kademeler_w"] else None
            want_w = W if ad_w not in j["kademeler"] else None
            self.assertEqual(cozumle(f"Beruf: {ad_m}"), meslek(j["id"], want_m), ad_m)
            self.assertEqual(cozumle(f"Beruf: {ad_w}"), meslek(j["id"], want_w), ad_w)
            self.assertEqual(cozumle(f"ich will {ad_w} werden"), meslek(j["id"], want_w), ad_w)
            self.assertEqual(cozumle(f"Beruf: {j['alan']}"), meslek(j["id"]), j["alan"])
            n += 1
        self.assertGreater(n, 40)

    def test_istenemeyen_meslekler(self):
        # Kadrolu (istenebilir değil), seçimle gelen ve anakara: hiçbir unvanı istek değildir.
        from wattenoog_sim import sim
        c = sim.catalog()
        for j in c["meslekler"]:
            if (j.get("kadro") and not j.get("istenebilir")) or j.get("secimle") or j["id"] == c["kilitli_meslek"]:
                for ad in j["kademeler"] + j["kademeler_w"]:
                    self.assertNotEqual(cozumle(f"Beruf: {ad}").get("meslek"), j["id"], ad)


class SecimCozumleTest(unittest.TestCase):
    def test_aday_ve_oy(self):
        import secim
        cases = {
            "ich kandidiere": {"aday": True}, "Ich trete an!": {"aday": True},
            "ich will Bürgermeister werden": {"aday": True}, "ich will Bürgermeisterin werden": {"aday": True},
            "Ich möchte Buergermeisterin werden": {"aday": True}, "wählt mich 🙏": {"aday": True},
            "wahlt mich": {"aday": True},
            "Stimme: @k001": {"oy": "k001"}, "ich wähle @K002": {"oy": "k002"}, "Stimme für @k003.": {"oy": "k003"},
            "vote @k004": {"oy": "k004"}, "meine Stimme geht an @k005": {"oy": "k005"}, "ich waehle @k006": {"oy": "k006"},
            "tolle Stimme @k007": {}, "super Video @k008": {}, "hallo @k001": {}, "ich wähle Fischer": {},
            "ich will kein Bürgermeister werden": {}, "Beruf: Fischerin": {},
        }
        for text, want in cases.items():
            self.assertEqual(secim.cozumle(text), want, text)


class DogrulamaKoduTest(unittest.TestCase):
    """Sitedeki yorumla doğrulama: yorumdaki kod Worker'a [kod, kullanıcı adı] olarak gider, istek sayılmaz."""

    def test_kod(self):
        from istekler import KOD
        for text, want in {"Code 4821": "4821", "Code: 4821 das bin ich": "4821", "mein Code ist 1234": "1234",
                           "my code is 1234": "1234", "code4821": "4821", "CODE 12345": None, "Codes sind cool": None}.items():
            m = KOD.search(katla(text))
            self.assertEqual(m and m.group(1), want, text)
        self.assertEqual(cozumle("Code 4821"), {})
        from istekler import kodlar_bul
        for text, want in [("Code 1234", [("1234", True)]), ("mein Code ist 3674", [("3674", True)]), ("8538", [("8538", True)]),
                           ("4521 das bin ich!", [("4521", False)]), ("1234 ist mein Code 🏠", [("1234", True)]),
                           ("Hab meinen CODE gepostet: 9087 ✨", [("9087", True)]), ("ruf an 015112345678", []),
                           ("ich will Polizist werden", [])]:
            self.assertEqual(kodlar_bul(text), want, text)

    def test_worker_cagrisi(self):
        import istekler
        import ortak
        gelen = []
        eski_kayit, eski_kaydet, eski_psql, eski_uygula = ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula
        ortak.kayit = lambda method, path, body=None: (gelen.append((method, path, body)), {"onaylanan": ["ali"]})[1]
        istekler.kaydet = lambda satirlar, kaynak, db=None: 0
        istekler.psql = lambda sql, db=None, extra=None: "[]" if "json_agg" in sql else "0"
        istekler.uygula = lambda db=None: []
        try:
            out = istekler.yorumlar([["c1", "Ali", 1, "Code 4821"], ["c2", "veli", 2, "Beruf: Fischerin"], ["c3", "biz", 3, "Code 1111"]], hesap="biz")
        finally:
            ortak.kayit, istekler.kaydet, istekler.psql, istekler.uygula = eski_kayit, eski_kaydet, eski_psql, eski_uygula
        self.assertEqual(gelen, [("POST", "/api/onayla", {"ciftler": [["4821", "ali", True]]})])
        self.assertEqual(out["dogrulanan"], ["ali"])


if __name__ == "__main__":
    unittest.main()

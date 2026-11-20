"""tasinma.py uçtan uca: saatlik sayı, günde 3 taşınma, sıralama, bekleyenler, korumalar.

Gerçek bir Postgres ister; yalnız WATTENOOG_TEST_DB verilince çalışır (CI'da atlanır). Veritabanı her
testte sıfırdan kurulur, bu yüzden asıl veritabanının adı verilmemeli. Liste Worker'a yollanmaz
(geçici WATTENOOG_ROOT'ta secrets/yayin.json yok).

    docker run -d --rm --name wattenoog-deneme -e POSTGRES_HOST_AUTH_METHOD=trust -p 127.0.0.1:54392:5432 postgres:17-alpine
    PGHOST=127.0.0.1 PGPORT=54392 PGUSER=postgres WATTENOOG_TEST_DB=wattenoog_deneme python3 -m unittest tests.test_tasinma
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

SERVER = Path(__file__).resolve().parents[1]
DB = os.environ.get("WATTENOOG_TEST_DB")


def sh(*cmd, **kw):
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw).stdout


@unittest.skipUnless(DB, "WATTENOOG_TEST_DB verilmedi")
class TasinmaTest(unittest.TestCase):
    def setUp(self):
        self.assertNotEqual(DB, "wattenoog", "asıl veritabanında test çalıştırılmaz")
        sh("dropdb", "--if-exists", DB)
        sh("createdb", DB)
        sh("psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", DB, "-f", str(SERVER / "schema.sql"))
        self.root = tempfile.mkdtemp()
        self.env = dict(os.environ, WATTENOOG_DB=DB, WATTENOOG_ROOT=self.root)

    def send(self, msg) -> tuple[int, dict]:
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py")], input=json.dumps(msg),
                           capture_output=True, text=True, env=self.env)
        if not p.stdout.strip():
            raise AssertionError(p.stderr[-2000:])
        return p.returncode, json.loads(p.stdout.strip().splitlines()[-1])

    def q(self, sql) -> str:
        return sh("psql", "-X", "-tA", "-d", DB, "-c", sql).strip()

    def published(self) -> dict:
        return json.loads((Path(self.root) / "public" / "sakinler.json").read_text())

    def test_bos_ada(self):
        # Yeni hesap: 0 takipçi, boş liste. Hata değil; iskelede kimse beklemez.
        code, out = self.send({"tur": "liste", "takipci": 0, "liste": []})
        self.assertEqual((code, out["nufus"], out["gelen"]), (0, 0, 0), out)
        # Profilde 1 takipçi ama listede yok (gizli hesap): beklemez, hata da değil.
        code, out = self.send({"tur": "liste", "takipci": 1, "liste": []})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.published()["bekleyen"], 0)

    def test_tasinma_akisi(self):
        # Saatlik sayı: henüz kimse taşınmadı, hepsi iskelede bekliyor.
        code, out = self.send({"tur": "sayi", "takipci": 10})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.published()["bekleyen"], 10)
        code, out = self.send({"tur": "sayi", "takipci": 10})
        self.assertEqual(out, {"takipci": 10, "degisiklik": False})

        # İlk taşınma: 12 kişi; b0..b3 aynı sayfada (aynı takip zamanı), sırayı 'sıra' belirler.
        liste = [["ilk", 100, 0], ["b3", 200, 3], ["b0", 200, 0], ["b2", 200, 2], ["b1", 200, 1]]
        liste += [[f"k{i:02d}", 300 + i, 0] for i in range(7)]
        code, out = self.send({"tur": "liste", "takipci": 13, "liste": liste})
        self.assertEqual(code, 0, out)
        self.assertEqual((out["gelen"], out["nufus"], out["ayrilan"]), (12, 12, 0))
        self.assertIn("Fischbude am Kutterhafen", out["acilan"])
        order = self.q("SELECT string_agg(handle, ',' ORDER BY slot) FROM sakinler").split(",")
        self.assertEqual(order[:5], ["ilk", "b0", "b1", "b2", "b3"])
        # Profilde 13, listede 12: biri listede hiç görünmüyor (gizli hesap), iskelede beklemez.
        self.assertEqual((self.published()["bekleyen"], self.published()["zirve"]), (0, 12))

        # Aynı liste ikinci kez işlenmez.
        code, out = self.send({"tur": "liste", "takipci": 13, "liste": liste})
        self.assertEqual((code, out.get("atlandi")), (0, True))

        # Aradaki saatlerde 2 yeni takipçi: iskelede 2 kişi.
        self.send({"tur": "sayi", "takipci": 15})
        self.assertEqual(self.published()["bekleyen"], 2)

        # İkinci taşınma: 2 kişi bıraktı, 3 kişi geldi. Ayrılanların evi 7 gün tutulur.
        liste2 = [x for x in liste if x[0] not in ("k00", "k01")] + [["y0", 400, 0], ["y1", 401, 0], ["y2", 402, 0]]
        code, out = self.send({"tur": "liste", "takipci": 14, "liste": liste2})
        self.assertEqual((out["gelen"], out["ayrilan"], out["nufus"]), (3, 2, 13))
        self.assertEqual(self.q("SELECT min(slot) FROM sakinler WHERE handle LIKE 'y%'"), "12")
        self.assertEqual(self.published()["zirve"], 15)

        # Çıkan biri listede olsa da taşınmaz.
        sh(sys.executable, str(SERVER / "cikar.py"), "y2", env=self.env, cwd=SERVER)
        code, out = self.send({"tur": "liste", "takipci": 14, "liste": liste2 + [["z0", 500, 0]]})
        self.assertEqual(code, 0, out)
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE handle = 'y2'"), "0")

    def test_yorum_istekleri(self):
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(4)] + [["ali", 400, 0], ["ayse", 401, 0]]
        self.assertEqual(self.send({"tur": "liste", "takipci": 6, "liste": liste})[0], 0)
        t = int(time.time()) - 3600
        yorumlar = [
            ["c1", "Ali", t, "Beruf: Fischerin"],                # meslek + biçim (w)
            ["c2", "ayse", t, "Name verstecken bitte"],
            ["c3", "yeni", t, "Hobby: Boßeln"],                  # henüz adada değil: bekler
            ["c4", "wattenoog", t, "Beruf: Ärztin"],             # kendi yorumumuz
            ["c5", "ali", t - 600, "Beruf: Arzt"],               # daha eski: Fischerin'i (meslek ve biçim) ezmez
            ["c6", "k00", t, "so schön geworden"],
            ["c7", "k01", t, None],
        ]
        msg = {"tur": "yorumlar", "hesap": "wattenoog", "yorumlar": yorumlar}
        code, out = self.send(msg)
        self.assertEqual(code, 0, out)
        self.assertEqual((out["istek"], out["bekleyen_istek"]), (6, 1), out)
        self.assertEqual(sorted(out["uygulanan"]), [["ali", "form", "w"], ["ali", "meslek", "balikci"], ["ayse", "gizle", "1"]])
        pub = {s[2]: s for s in self.published()["sakinler"]}
        self.assertEqual(pub[4][4], {"meslek": "balikci", "form": "w"})
        self.assertIsNone(pub[5][0])  # adı gizli
        # Aynı yorumlar ikinci kez gelirse yeni istek yok.
        code, out = self.send(msg)
        self.assertEqual((out["istek"], out["uygulanan"]), (0, []))

        # Sonradan yazılan istek geçer; geç okunan daha eski yorum ezmez.
        self.send({"tur": "yorumlar", "yorumlar": [["c8", "ali", t + 60, "Hobby Skat, Beruf Koch"]]})
        self.send({"tur": "yorumlar", "yorumlar": [["c9", "ali", t - 60, "Beruf: Architektin"]]})
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'ali'")),
                         {"hobi": "satranc", "meslek": "asci", "form": "m"})
        # İş alanıyla istek biçimi değiştirmez.
        self.send({"tur": "yorumlar", "yorumlar": [["c11", "ali", t + 90, "Beruf: Polizei"]]})
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'ali'")),
                         {"hobi": "satranc", "meslek": "polis", "form": "m"})
        self.send({"tur": "yorumlar", "yorumlar": [["c10", "ayse", t + 60, "Name zeigen"]]})
        self.assertEqual(self.q("SELECT hidden FROM sakinler WHERE handle = 'ayse'"), "f")

        # "yeni" taşınınca bekleyen isteği uygulanır.
        code, out = self.send({"tur": "liste", "takipci": 7, "liste": liste + [["yeni", 500, 0]]})
        self.assertEqual(out["istek_uygulanan"], [["yeni", "hobi", "bosseln"]])
        # İstek kaydı 30 gün tutulur (8 günlük durur), sonra silinir (etkisi sakinde kalır); çıkanın istekleri hemen silinir.
        self.q("UPDATE istekler SET created_at = now() - interval '8 days' WHERE handle = 'yeni'")
        self.send({"tur": "yorumlar", "yorumlar": []})
        self.assertEqual(self.q("SELECT count(*) FROM istekler WHERE handle = 'yeni'"), "1")
        self.q("UPDATE istekler SET created_at = now() - interval '31 days' WHERE handle = 'yeni'")
        self.send({"tur": "yorumlar", "yorumlar": []})
        self.assertEqual(self.q("SELECT count(*) FROM istekler WHERE handle = 'yeni'"), "0")
        self.assertEqual(self.q("SELECT overrides->>'hobi' FROM sakinler WHERE handle = 'yeni'"), "bosseln")
        sh(sys.executable, str(SERVER / "cikar.py"), "ali", env=self.env, cwd=SERVER)
        self.assertEqual(self.q("SELECT count(*) FROM istekler WHERE handle = 'ali'"), "0")
        # Bozuk yorum listesi hata değil, bozuk satırlar geçilir; liste değilse hata.
        self.assertEqual(self.send({"tur": "yorumlar", "yorumlar": [["x"], 5, ["c", "b", "t", "m"]]})[1]["istek"], 0)
        self.assertEqual(self.send({"tur": "yorumlar", "yorumlar": "x"})[0], 1)

    def test_muhtar_koltugu(self):
        # Muhtar mahalle başına tek: önce isteyen olur, sonrakiler "dolu"; muhtar ayrılınca koltuk boşalır.
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(10)]
        self.assertEqual(self.send({"tur": "liste", "takipci": 10, "liste": liste})[0], 0)
        t = int(time.time()) - 3600
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["m1", "k01", t + 60, "Beruf: Ortsvorstand"], ["m2", "k00", t, "Beruf:Ortsvorsteher"], ["m3", "k02", t, "Beruf: Polizei"]]})
        self.assertEqual(code, 0, out)
        self.assertEqual(sorted(out["uygulanan"]), [["k00", "form", "m"], ["k00", "meslek", "muhtar"], ["k02", "meslek", "polis"]])
        self.assertEqual(out["dolu"], [["k01", "muhtar"]])
        # Koltuk dolu: meslek geçmez, seçilen biçim (Ortsvorsteherin → w) yine kaydedilir.
        code, out = self.send({"tur": "yorumlar", "yorumlar": [["m4", "k03", t + 120, "ich will Ortsvorsteherin werden"]]})
        self.assertEqual((out["uygulanan"], out["dolu"]), ([["k03", "form", "w"]], [["k03", "muhtar"]]))
        # Muhtar takibi bırakır: koltuk boşalır, yeni istek geçer.
        self.assertEqual(self.send({"tur": "liste", "takipci": 9, "liste": liste[1:]})[0], 0)
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'k00'")), {"form": "m"})
        code, out = self.send({"tur": "yorumlar", "yorumlar": [["m5", "k03", t + 180, "Beruf: Ortsvorstand"]]})
        self.assertEqual(out["uygulanan"], [["k03", "meslek", "muhtar"]])
        self.assertNotIn("dolu", out)
        # Okul müdürü de tek koltuk; muhtarlıktan bağımsız.
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["m6", "k04", t, "Beruf: Schulleitung"], ["m7", "k05", t + 5, "Job: Schulleitung"]]})
        self.assertEqual((out["uygulanan"], out["dolu"]), ([["k04", "meslek", "okul_muduru"]], [["k05", "okul_muduru"]]))
        # Fener bekçisi: adada tek koltuk (8. sakinin kadrosu, isteyen olursa isteyen alır).
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["m8", "k06", t, "Beruf: Leuchtturm"], ["m9", "k08", t + 5, "Arbeit: Leuchtturm"]]})
        self.assertEqual((out["uygulanan"], out["dolu"]), ([["k06", "meslek", "fener_bekcisi"]], [["k08", "fener_bekcisi"]]))

    def test_belediye_secimi(self):
        # Belediye 100. sakinde açılır: ilk taşınmada seçim başlar.
        liste = [[f"k{i:03d}", 300 + i, 0] for i in range(100)]
        code, out = self.send({"tur": "liste", "takipci": 100, "liste": liste})
        self.assertEqual((code, out.get("secim")), (0, {"secim": "basladi"}), out)
        self.assertEqual(self.published()["secim"]["durum"], "acik")
        t = int(time.time()) + 60  # seçim açıldıktan sonra yazılan yorumlar (öncekiler sayılmaz)
        code, out = self.send({"tur": "yorumlar", "yorumlar": [
            ["s0", "k002", t - 30, "Beruf: Polizei"], ["s9", "k007", t - 3600, "ich kandidiere"],
            ["s1", "k001", t - 20, "Ich trete an!"], ["s2", "k002", t - 10, "Ich will Bürgermeisterin werden!"],
            ["s3", "k003", t, "Stimme: @k001"], ["s4", "k004", t, "ich wähle @K002"],
            ["s5", "k005", t - 5, "Stimme @k001"], ["s6", "k005", t, "Stimme für @k002."],  # son oy geçer
            ["s7", "yabanci", t, "Stimme: @k001"],                                         # adada değil
            ["s8", "k006", t, "gerade eingezogen, tolles Spiel @k001"]]})                # ne aday ne oy
        self.assertEqual((code, out["secim"]), (0, {"aday": 2, "oy": 3}), out)
        self.assertEqual(self.published()["secim"]["adaylar"], [["k002", 2], ["k001", 1]])
        # Süre dolar: sonraki taşınmada sonuç. Kazanan başkan olur, eski mesleği saklanır.
        self.q("UPDATE secimler SET son = now() - interval '1 second'")
        code, out = self.send({"tur": "liste", "takipci": 100, "liste": liste})
        self.assertEqual(out["secim"]["kazanan"], "k002", out)
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'k002'")),
                         {"meslek": "belediye_baskani", "eski_meslek": "polis"})
        self.assertEqual(self.published()["secim"]["kazanan"], "k002")
        self.assertEqual(self.q("SELECT count(*) FROM secim_oylar"), "0")  # oylar silinir
        # Başkan adadan ayrılır: makam boşalır, önceki mesleği geri gelir.
        code, out = self.send({"tur": "liste", "takipci": 99, "liste": [x for x in liste if x[0] != "k002"]})
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'k002'")), {"meslek": "polis"})

    def send_taban(self, msg, *args) -> tuple[int, dict]:
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py"), "taban", *args], input=json.dumps(msg),
                           capture_output=True, text=True, env=self.env)
        if not p.stdout.strip():
            raise AssertionError(p.stderr[-2000:])
        return p.returncode, json.loads(p.stdout.strip().splitlines()[-1])

    def sakinler(self) -> list[str]:
        return self.q("SELECT coalesce(string_agg(handle, ',' ORDER BY slot), '') FROM sakinler WHERE left_day IS NULL").split(",")

    def test_taban(self):
        # Eski hesap (DEVIR §4.7): ilk canlı taramadaki takipçiler yalnız katılım yazınca taşınır.
        self.env["WATTENOOG_TABAN_TUZ"] = "deneme-tuzu-0123456789abcdef"
        eski = [[f"e{i:02d}", 100 + i, 0] for i in range(6)]
        code, out = self.send_taban({"tur": "liste", "takipci": 7, "liste": eski})  # profilde 7: biri listede görünmüyor
        self.assertEqual((code, out["taban"]), (0, 6), out)
        # Veritabanında yalnız 64 haneli özetler; kullanıcı adı yok.
        self.assertEqual(self.q("SELECT count(*) FROM taban WHERE ozet ~ '^[0-9a-f]{64}$'"), "6")
        self.assertEqual(self.q("SELECT count(*) FROM taban WHERE ozet LIKE '%e0%' AND length(ozet) <> 64"), "0")
        self.assertEqual(self.published()["bekleyen"], 0)
        # Taban bir kez alınır ve büyümez.
        code, out = self.send_taban({"tur": "liste", "takipci": 8, "liste": eski + [["x", 1, 0]]})
        self.assertEqual(code, 1)
        self.assertIn("zaten alınmış", out["hata"])
        self.assertEqual(self.q("SELECT count(*) FROM taban"), "6")
        # Saatlik sayı: eski takipçiler iskelede beklemez.
        self.send({"tur": "sayi", "takipci": 7})
        self.assertEqual(self.published()["bekleyen"], 0)
        self.send({"tur": "sayi", "takipci": 9})
        self.assertEqual(self.published()["bekleyen"], 2)

        # İlk taşınma: yalnız yeni takipçiler gelir.
        liste = eski + [["n0", 500, 0], ["n1", 501, 0]]
        code, out = self.send({"tur": "liste", "takipci": 9, "liste": liste})
        self.assertEqual((code, out["gelen"], out["nufus"], out.get("taban_bekleyen")), (0, 2, 2, 6), out)
        self.assertEqual(self.sakinler(), ["n0", "n1"])
        self.assertEqual(self.published()["bekleyen"], 0)
        self.assertEqual(len(self.published()["sakinler"]), 2)

        t = int(time.time()) - 600
        code, out = self.send({"tur": "yorumlar", "hesap": "wattenoog", "yorumlar": [
            ["k1", "e00", t, "cool"], ["k2", "e01", t, "bin dabei 😍"], ["k3", "e02", t, "einziehen"],
            ["k4", "e03", t - 60, "Beruf: Fischerin"],            # istek katılım sayılır; e02'den önce yazdı
            ["k5", "e04", t, "ich will nicht einziehen"], ["k6", "n0", t, "einziehen"],  # n0 zaten adada
            ["k7", "e05", t, "hallo"], ["k8", "yabanci", t, "einziehen"]]})              # tabanda değil
        self.assertEqual((code, out.get("katilim")), (0, ["e02", "e03"]), out)
        self.assertEqual(self.q("SELECT string_agg(handle, ',' ORDER BY eklendi) FROM katilim"), "e03,e02")
        # Katılanlar sonraki taşınmaya dek iskelede bekler.
        self.assertEqual(self.published()["bekleyen"], 2)
        # Aynı yorumlar yeniden gelirse yeni katılım yok.
        self.assertNotIn("katilim", self.send({"tur": "yorumlar", "yorumlar": [["k3", "e02", t, "einziehen"]]})[1])

        # Liste değişmese de katılanlar taşınır: katılım sırasıyla (e03, sonra e02), bekleyen isteği uygulanır.
        code, out = self.send({"tur": "liste", "takipci": 9, "liste": liste})
        self.assertEqual((code, out["gelen"], out["nufus"], out["taban_bekleyen"]), (0, 2, 4, 4), out)
        self.assertEqual(self.sakinler(), ["n0", "n1", "e03", "e02"])
        self.assertEqual(sorted(out["istek_uygulanan"]), [["e03", "form", "w"], ["e03", "meslek", "balikci"]])
        self.assertEqual(json.loads(self.q("SELECT overrides FROM sakinler WHERE handle = 'e03'")), {"meslek": "balikci", "form": "w"})
        self.assertEqual(self.published()["bekleyen"], 0)
        # Belirsiz yorum yazan, olumsuz yazan ve hiç yazmayan eski takipçinin adı hiçbir tabloda yok.
        for h in ("e00", "e01", "e04", "e05"):
            self.assertEqual(self.q(f"""SELECT (SELECT count(*) FROM sakinler WHERE handle = '{h}')
                                         + (SELECT count(*) FROM katilim WHERE handle = '{h}')
                                         + (SELECT count(*) FROM istekler WHERE handle = '{h}')"""), "0", h)

        # Yeni takipçi doğrudan taşınır.
        liste2 = liste + [["n2", 600, 0]]
        code, out = self.send({"tur": "liste", "takipci": 10, "liste": liste2})
        self.assertEqual((out["gelen"], self.sakinler()[-1]), (1, "n2"), out)
        # Yarım liste koruması sakinler üzerinden: yalnız eski takipçiler gelirse (sakinlerin çoğu yok) işlenmez.
        code, out = self.send({"tur": "liste", "takipci": 10, "liste": eski})
        self.assertEqual(code, 1)
        self.assertIn("Yarım liste", out["hata"])

        # Katılmış eski takipçi bırakır: 7 gün içinde dönerse evine döner (yeniden katılım gerekmez).
        # (Takibi bırakıp yeniden takip edenin takip zamanı değişir; aynı liste ikinci kez işlenmez.)
        liste3 = [x for x in liste2 if x[0] != "e02"]
        self.assertEqual(self.send({"tur": "liste", "takipci": 9, "liste": liste3})[1]["ayrilan"], 1)
        code, out = self.send({"tur": "liste", "takipci": 10, "liste": liste3 + [["e02", 800, 0]]})
        self.assertEqual((out["donen"], out["gelen"]), (1, 0), out)
        # 7 günü geçerse kaydı ve katılımı silinir; geri gelince taban özeti durduğu için taşınmaz.
        liste4 = liste3 + [["n3", 700, 0]]
        self.assertEqual(self.send({"tur": "liste", "takipci": 10, "liste": liste4})[1]["ayrilan"], 1)
        self.q("UPDATE sakinler SET left_day = left_day - 8 WHERE handle = 'e02'")
        self.q("UPDATE katilim SET gun = gun - 9 WHERE handle = 'e02'")  # katılım, ayrılmadan önce yazılmıştı
        # 8. gün aynı taşınmada geri gelir: eski kaydı ve katılımı silinir, yeni sakin olarak da taşınmaz.
        liste5 = liste4 + [["n4", 710, 0], ["e02", 900, 0]]
        code, out = self.send({"tur": "liste", "takipci": 12, "liste": liste5})
        self.assertEqual((code, out["silinen"], out["gelen"], out["taban_bekleyen"]), (0, 1, 1, 5), out)
        self.assertEqual(self.q("SELECT count(*) FROM katilim WHERE handle = 'e02'"), "0")
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE handle = 'e02'"), "0")
        self.assertEqual(self.published()["bekleyen"], 0)
        # Yeniden katılım yazarsa yine gelir (katılım sırasının sonunda); aynı liste katılımla yeniden işlenir.
        self.send({"tur": "yorumlar", "yorumlar": [["k9", "e02", int(time.time()), "ich will auch einziehen"]]})
        self.assertEqual(self.published()["bekleyen"], 1)
        code, out = self.send({"tur": "liste", "takipci": 12, "liste": liste5})
        self.assertEqual((out["gelen"], self.sakinler()[-1]), (1, "e02"), out)
        # DM'den katılım ve çıkarma: cikar.py katılım kaydını da siler.
        out = json.loads(sh(sys.executable, str(SERVER / "istekler.py"), "ekle", "E05", "katilim", env=self.env, cwd=SERVER))
        self.assertIn("katıldı", out["durum"])
        self.assertEqual(self.q("SELECT count(*) FROM katilim WHERE handle = 'e05'"), "1")
        sh(sys.executable, str(SERVER / "cikar.py"), "e05", env=self.env, cwd=SERVER)
        self.assertEqual(self.q("SELECT count(*) FROM katilim WHERE handle = 'e05'"), "0")
        # --zorla tabanı yeniden alır; o an adada oturanlar tabana yazılmaz.
        code, out = self.send_taban({"tur": "liste", "takipci": 3, "liste": [["n0", 1, 0], ["e00", 1, 0], ["z9", 1, 0]]}, "--zorla")
        self.assertEqual((code, out["taban"], out["adada_atlanan"], out["silinen_eski"]), (0, 2, 1, 6), out)

    def test_taban_yeniden_katilim(self):
        # Katılmış eski takipçi bırakır; kaydı 7 günü geçmiş ama taşınmada henüz silinmemişken yeniden katılım yazar:
        # eski kayıt silinir, yeni katılım kalır ve aynı taşınmada yeni sakin olarak gelir.
        self.env["WATTENOOG_TABAN_TUZ"] = "deneme-tuzu-0123456789abcdef"
        self.assertEqual(self.send_taban({"tur": "liste", "takipci": 2, "liste": [["e0", 1, 0], ["e1", 2, 0]]})[0], 0)
        liste = [["e0", 1, 0], ["e1", 2, 0], ["n0", 3, 0]]
        self.assertEqual(self.send({"tur": "liste", "takipci": 3, "liste": liste})[1]["gelen"], 1)
        t = int(time.time()) - 60
        self.assertEqual(self.send({"tur": "yorumlar", "yorumlar": [["a", "e0", t, "einziehen"]]})[1]["katilim"], ["e0"])
        self.assertEqual(self.send({"tur": "liste", "takipci": 3, "liste": liste})[1]["gelen"], 1)
        liste2 = [["e1", 2, 0], ["n0", 3, 0], ["n1", 4, 0]]
        self.assertEqual(self.send({"tur": "liste", "takipci": 3, "liste": liste2})[1]["ayrilan"], 1)
        self.q("UPDATE sakinler SET left_day = left_day - 8 WHERE handle = 'e0'")
        self.q("UPDATE katilim SET gun = gun - 9 WHERE handle = 'e0'")  # katılım ayrılmadan önce
        code, out = self.send({"tur": "yorumlar", "yorumlar": [["b", "e0", int(time.time()), "ich will wieder einziehen"]]})
        self.assertEqual((code, out.get("katilim")), (0, ["e0"]), out)
        code, out = self.send({"tur": "liste", "takipci": 5, "liste": liste2 + [["n2", 5, 0], ["e0", 9, 0]]})
        self.assertEqual((code, out["silinen"], out["gelen"]), (0, 1, 2), out)
        self.assertIn("e0", self.sakinler())
        self.assertEqual(self.q("SELECT count(*) FROM katilim WHERE handle = 'e0'"), "1")

    def test_taban_tuz(self):
        # Tuz ilk taban alınırken secrets/taban.json'a (600) yazılır; sonra kaybolursa taşınma durur (eski takipçiler
        # yanlışlıkla taşınmasın).
        code, out = self.send_taban({"tur": "liste", "takipci": 2, "liste": [["e0", 1, 0], ["e1", 2, 0]]})
        self.assertEqual(code, 0, out)
        dosya = Path(self.root) / "secrets" / "taban.json"
        self.assertEqual(dosya.stat().st_mode & 0o777, 0o600)
        self.assertGreaterEqual(len(json.loads(dosya.read_text())["tuz"]), 32)
        code, out = self.send({"tur": "liste", "takipci": 3, "liste": [["e0", 1, 0], ["e1", 2, 0], ["n0", 3, 0]]})
        self.assertEqual((code, out["gelen"], out["taban_bekleyen"]), (0, 1, 2), out)
        dosya.unlink()
        code, out = self.send({"tur": "liste", "takipci": 4, "liste": [["e0", 1, 0], ["e1", 2, 0], ["n0", 3, 0], ["n1", 4, 0]]})
        self.assertEqual(code, 1)
        self.assertIn("taban.json", out["hata"])
        self.assertEqual(self.sakinler(), ["n0"])
        # Taban yokken eskisi gibi: herkes taşınır (test_tasinma_akisi), yorumdaki katılım bir şey yapmaz.
        self.q("DELETE FROM taban")
        code, out = self.send({"tur": "yorumlar", "yorumlar": [["y1", "e0", int(time.time()), "einziehen"]]})
        self.assertEqual((code, out.get("katilim")), (0, None), out)

    def test_korumalar(self):
        liste = [[f"k{i:02d}", 300 + i, 0] for i in range(10)]
        self.assertEqual(self.send({"tur": "liste", "takipci": 10, "liste": liste})[0], 0)
        # Yarım liste (aktif nüfusun %80'inden az) işlenmez: ada boşalmaz.
        code, out = self.send({"tur": "liste", "takipci": 10, "liste": liste[:5]})
        self.assertEqual(code, 1)
        self.assertIn("Yarım liste", out["hata"])
        self.assertEqual(self.q("SELECT count(*) FROM sakinler WHERE left_day IS NULL"), "10")
        for bad in ({"tur": "liste", "takipci": 10, "liste": []}, {"tur": "x", "takipci": 1}, {"tur": "sayi"}):
            code, out = self.send(bad)
            self.assertEqual(code, 1, bad)
            self.assertIn("hata", out)
        p = subprocess.run([sys.executable, str(SERVER / "tasinma.py")], input="bozuk", capture_output=True,
                           text=True, env=self.env)
        self.assertEqual(p.returncode, 1)
        self.assertIn("hata", json.loads(p.stdout))


if __name__ == "__main__":
    unittest.main()

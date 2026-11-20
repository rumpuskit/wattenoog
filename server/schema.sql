-- Wattenoog veri şeması. Simülasyon deterministik olduğu için sunucu sakinlerin hayatını değil,
-- sadece kimliğini, sırasını (adres buradan hesaplanır) ve isteklerini tutar.
-- Sakinler TikTok takipçilerinden gelir (platform 'tt'); başka platform eklenirse aynı kullanıcı adı
-- ayrı bir sakin olur (tohum değeri platform önekiyle hesaplanır).

CREATE TABLE IF NOT EXISTS sakinler (
    platform     text    NOT NULL DEFAULT 'tt',
    handle       text    NOT NULL,
    seed         bigint  NOT NULL,          -- sim.seed_of('<platform>:<handle>'): ad aynıysa karakter aynı
    slot         bigint  NOT NULL UNIQUE,   -- ada → mahalle → sokak → bina → daire
    arrived_day  integer NOT NULL,          -- Berlin saatine (AB yaz saatli) göre gün numarası (1970'ten beri)
    left_day     integer,                   -- takibi bıraktığı gün; 7 gün içinde dönerse aynı evine döner,
                                            -- sonra kayıt silinir ve ev yeni gelene verilir
    hidden       boolean NOT NULL DEFAULT false,
    overrides    jsonb   NOT NULL DEFAULT '{}'::jsonb,
    PRIMARY KEY (platform, handle)
);
CREATE INDEX IF NOT EXISTS sakinler_aktif ON sakinler (arrived_day) WHERE left_day IS NULL;

-- Adadan çıkmak isteyenler (DSGVO): kullanıcı adının kendisi değil, sha256 özeti tutulur;
-- sonraki aktarımlarda bu kişiler taşınmaz.
CREATE TABLE IF NOT EXISTS cikanlar (
    ozet  text    PRIMARY KEY,
    day   integer NOT NULL
);

CREATE TABLE IF NOT EXISTS aktarimlar (
    id           bigserial   PRIMARY KEY,
    platform     text        NOT NULL DEFAULT 'tt',
    day          integer     NOT NULL,
    dosya_sha256 text        NOT NULL UNIQUE,
    takipci      integer     NOT NULL,
    gelen        integer     NOT NULL,
    donen        integer     NOT NULL,
    ayrilan      integer     NOT NULL,
    silinen      integer     NOT NULL DEFAULT 0,
    imported_at  timestamptz NOT NULL DEFAULT now()
);

-- Anahtar/değer durum: 'tt_takipci' (saatlik takipçi sayısı), 'disarida' (taşınmamış takipçiler: listede görünmeyenler
-- ve katılmamış eski takipçiler), 'katilim_disarida' (katılmış ama listede olmayan eski takipçiler), 'zirve'.
CREATE TABLE IF NOT EXISTS durum (
    anahtar     text        PRIMARY KEY,
    deger       jsonb       NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS istekler (
    id          bigserial   PRIMARY KEY,
    handle      text        NOT NULL,
    tur         text        NOT NULL,   -- meslek, form (m/w), hobi, evcil, gizle; katilim, cikis (yalnız kayıt)
    deger       text        NOT NULL,
    kaynak      text        NOT NULL,   -- yorum, dm, canli
    kaynak_id   text,                   -- yorum/mesaj kimliği; aynı yorum iki kez işlenmez
    durum       text        NOT NULL DEFAULT 'bekliyor',
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (kaynak, kaynak_id)
);

-- Taban (DEVIR §4.7): hesabın ilk canlı taramadaki takipçileri. Kullanıcı adı DEĞİL, yalnız tuzlu özet
-- (ortak.taban_ozet; tuz secrets/taban.json). Bir kez alınır (tasinma.py taban), büyümez. Tabandaki takipçi,
-- `katilim`da kaydı yoksa taşınmaz, nüfusa ve iskelede bekleyenlere sayılmaz.
CREATE TABLE IF NOT EXISTS taban (
    ozet     text        PRIMARY KEY,
    eklendi  timestamptz NOT NULL DEFAULT now()
);

-- Yorumda katılım yazan (einziehen, ya da Beruf/Hobby/Haustier isteği) eski takipçiler. Sonraki taşınmada katılım
-- sırasıyla (eklendi = yorum zamanı) adaya gelir. Kayıt, sakin kaydıyla birlikte (ayrıldıktan 7 gün sonra) silinir;
-- 30 gün içinde taşınmayanınki de silinir.
CREATE TABLE IF NOT EXISTS katilim (
    handle   text        PRIMARY KEY,
    gun      integer     NOT NULL,          -- katılım yazdığı ada günü (Berlin)
    eklendi  timestamptz NOT NULL DEFAULT now()
);

-- Belediye başkanlığı seçimi (secim.py; tablolar oradan da kurulur).
CREATE TABLE IF NOT EXISTS secimler (
    id        bigserial   PRIMARY KEY,
    makam     text        NOT NULL,
    bas       timestamptz NOT NULL,
    son       timestamptz NOT NULL,
    durum     text        NOT NULL DEFAULT 'acik',   -- acik, bitti
    kazanan   text,
    sonuc     jsonb                                  -- [[aday, oy], ...]
);
CREATE TABLE IF NOT EXISTS secim_adaylar (
    secim_id  bigint      NOT NULL,
    handle    text        NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (secim_id, handle)
);
CREATE TABLE IF NOT EXISTS secim_oylar (
    secim_id  bigint      NOT NULL,
    secmen    text        NOT NULL,
    aday      text        NOT NULL,
    created_at timestamptz NOT NULL,
    PRIMARY KEY (secim_id, secmen)
);

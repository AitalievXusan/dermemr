-- DermEMR — схема PostgreSQL 16+ (SPEC §2.1). Миграция 0001.
-- Таблицы patients / staff принадлежат ядру МИС и здесь заданы минимально для FK.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS patients (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name               VARCHAR(255) NOT NULL,
  birth_date              DATE NOT NULL,
  sex                     CHAR(1) NOT NULL CHECK (sex IN ('F', 'M')),
  card_number             VARCHAR(32) UNIQUE NOT NULL,
  phone_e164              VARCHAR(16),
  telegram_chat_id        BIGINT,
  communication_consent   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   VARCHAR(255) NOT NULL,
  specialty   VARCHAR(128) NOT NULL,
  category    VARCHAR(64)
);

-- Визиты / приемы
CREATE TABLE IF NOT EXISTS encounters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id),
  doctor_id         UUID NOT NULL REFERENCES staff(id),
  appointment_type  VARCHAR(32) NOT NULL CHECK (appointment_type IN ('PRIMARY', 'FOLLOW_UP', 'TELEMEDICINE')),
  status            VARCHAR(32) NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'SIGNED')),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  draft_version     INTEGER NOT NULL DEFAULT 1,          -- optimistic locking (If-Match)
  soap_data         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- структура SPEC §2.2
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS encounters_patient_idx ON encounters (patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS encounters_icd_idx ON encounters ((soap_data -> 'assessment' -> 'primary_diagnosis' ->> 'icd10_code'));

-- Маркеры очагов на карте тела
CREATE TABLE IF NOT EXISTS body_map_markers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id   UUID NOT NULL REFERENCES encounters(id) ON DELETE CASCADE,
  marker_number  INTEGER NOT NULL,
  projection     VARCHAR(32) NOT NULL CHECK (projection IN ('FRONT', 'BACK', 'HEAD_FACE', 'HANDS_FEET', 'NAILS')),
  coord_x        NUMERIC(6,2) NOT NULL CHECK (coord_x BETWEEN 0 AND 1000),
  coord_y        NUMERIC(6,2) NOT NULL CHECK (coord_y BETWEEN 0 AND 1000),
  anatomy_code   VARCHAR(64) NOT NULL,
  anatomy_label  VARCHAR(255) NOT NULL,
  lesion_type    VARCHAR(64) NOT NULL,
  UNIQUE (encounter_id, marker_number)
);

-- Фотоархив и дерматоскопия
CREATE TABLE IF NOT EXISTS encounter_media (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id       UUID NOT NULL REFERENCES encounters(id),
  patient_id         UUID NOT NULL REFERENCES patients(id),
  marker_id          UUID REFERENCES body_map_markers(id) ON DELETE SET NULL,
  media_type         VARCHAR(32) NOT NULL CHECK (media_type IN ('MACRO_PHOTO', 'DERMATOSCOPY', 'TRICHOSCOPY')),
  s3_key_original    TEXT NOT NULL,
  s3_key_thumb       TEXT NOT NULL,
  dermatoscopy_tags  JSONB,
  include_in_pdf     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS media_patient_marker_idx ON encounter_media (patient_id, created_at); -- история «До / После»

-- Корзина услуг визита
CREATE TABLE IF NOT EXISTS billing_carts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id             UUID NOT NULL UNIQUE REFERENCES encounters(id),
  status                   VARCHAR(32) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SENT_TO_CASHIER', 'PAID', 'UPDATED_AFTER_SEND')),
  payer_type               VARCHAR(16) NOT NULL DEFAULT 'CASH' CHECK (payer_type IN ('CASH', 'DMS', 'CORPORATE')),
  total_rendered_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_prescribed_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  synced_at                TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS billing_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id           UUID NOT NULL REFERENCES billing_carts(id) ON DELETE CASCADE,
  service_code      VARCHAR(32) NOT NULL,
  service_name      VARCHAR(255) NOT NULL,
  category          VARCHAR(16) NOT NULL CHECK (category IN ('RENDERED', 'PRESCRIBED')),
  quantity          INTEGER NOT NULL CHECK (quantity > 0),
  unit_price        NUMERIC(10,2) NOT NULL,
  discount_percent  NUMERIC(5,2) NOT NULL DEFAULT 0,
  final_price       NUMERIC(10,2) NOT NULL,
  source            VARCHAR(16) NOT NULL CHECK (source IN ('AUTO_FROM_SOAP', 'MANUAL'))
);

-- Документы на выход и доставка
CREATE TABLE IF NOT EXISTS output_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id       UUID NOT NULL REFERENCES encounters(id),
  doc_type           VARCHAR(32) NOT NULL CHECK (doc_type IN ('SUMMARY_DESKTOP_A4', 'SUMMARY_MOBILE', 'PRESCRIPTION_107', 'EXTEMPORAL_RX', 'PATIENT_MEMO', 'ESTIMATE')),
  s3_key             TEXT NOT NULL,
  verification_hash  VARCHAR(64) NOT NULL,
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id         UUID NOT NULL REFERENCES encounters(id),
  channel              VARCHAR(16) NOT NULL CHECK (channel IN ('PATIENT_PORTAL', 'TELEGRAM', 'WHATSAPP', 'MAX')),
  recipient_contact    VARCHAR(64) NOT NULL,
  consent_verified     BOOLEAN NOT NULL,
  status               VARCHAR(16) NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED')),
  external_message_id  VARCHAR(128),
  error_message        TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS delivery_encounter_idx ON delivery_logs (encounter_id);

-- Неизменяемый журнал аудита (SPEC §7.2)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL,
  action      VARCHAR(64) NOT NULL,       -- OPEN_CARD | DOWNLOAD_PDF | DISPATCH | ...
  entity_id   UUID,
  ip_address  INET,
  timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_logs is append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();

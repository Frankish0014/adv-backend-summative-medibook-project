-- MediBook schema (MySQL 8.0.16+ : CHECK constraints are enforced, generated columns supported)
-- Runs cleanly on a fresh server:  mysql -u root -p < database/schema.sql

CREATE DATABASE IF NOT EXISTS medibook
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE medibook;

DROP TABLE IF EXISTS appointments;
DROP TABLE IF EXISTS doctors;
DROP TABLE IF EXISTS patients;

-- ---------------------------------------------------------------------------
-- patients: people who book appointments.
-- 3NF: patient facts depend only on the patient key (they were repeated per
-- appointment row in the spreadsheet).
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  full_name   VARCHAR(100)  NOT NULL,
  email       VARCHAR(255)  NOT NULL,
  phone       VARCHAR(20)   NOT NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_patients PRIMARY KEY (id),
  CONSTRAINT uq_patients_email UNIQUE (email),
  CONSTRAINT ck_patients_name  CHECK (CHAR_LENGTH(TRIM(full_name)) >= 2)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- doctors: specialty, consultation fee and room depend only on the doctor.
-- ---------------------------------------------------------------------------
CREATE TABLE doctors (
  id               INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  full_name        VARCHAR(100)   NOT NULL,
  specialty        VARCHAR(100)   NOT NULL,
  consultation_fee DECIMAL(10,2)  NOT NULL,
  room             VARCHAR(10)    NOT NULL,
  created_at       TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_doctors PRIMARY KEY (id),
  CONSTRAINT ck_doctors_fee  CHECK (consultation_fee >= 0),
  CONSTRAINT ck_doctors_name CHECK (CHAR_LENGTH(TRIM(full_name)) >= 2)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------------
-- appointments: one row per booking. Links patients (N:1) and doctors (N:1).
--
-- Cancellation: the row is KEPT (status = 'cancelled') together with its
-- refund_amount and cancelled_at, so refund history survives and no extra
-- table is needed.
--
-- "A doctor cannot have two appointments at the same date/time" is enforced by
-- UNIQUE (doctor_id, active_slot). active_slot is a STORED generated column
-- equal to appt_datetime while the appointment is 'booked' and NULL once it is
-- 'cancelled'. MySQL allows many NULLs in a UNIQUE index, so a cancelled slot
-- can be re-booked while the cancelled row stays for history.
-- ---------------------------------------------------------------------------
CREATE TABLE appointments (
  id             INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  patient_id     INT UNSIGNED   NOT NULL,
  doctor_id      INT UNSIGNED   NOT NULL,
  appt_datetime  DATETIME       NOT NULL,
  status         ENUM('booked','cancelled') NOT NULL DEFAULT 'booked',
  amount_paid    DECIMAL(10,2)  NOT NULL,
  refund_amount  DECIMAL(10,2)  NULL,
  cancelled_at   DATETIME       NULL,
  booked_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  active_slot    DATETIME
    GENERATED ALWAYS AS (IF(status = 'booked', appt_datetime, NULL)) STORED,

  CONSTRAINT pk_appointments PRIMARY KEY (id),
  CONSTRAINT fk_appt_patient FOREIGN KEY (patient_id) REFERENCES patients (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_appt_doctor  FOREIGN KEY (doctor_id)  REFERENCES doctors (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,

  -- Business rule: no double-booking of a doctor slot (race-proof, DB level).
  CONSTRAINT uq_doctor_active_slot UNIQUE (doctor_id, active_slot),

  -- Working hours 09:00-17:00 on 30-minute boundaries (last slot starts 16:30).
  CONSTRAINT ck_appt_slot CHECK (
    HOUR(appt_datetime) BETWEEN 9 AND 16
    AND MINUTE(appt_datetime) IN (0, 30)
    AND SECOND(appt_datetime) = 0
  ),
  CONSTRAINT ck_appt_amount CHECK (amount_paid >= 0),
  CONSTRAINT ck_appt_refund CHECK (
    refund_amount IS NULL OR (refund_amount >= 0 AND refund_amount <= amount_paid)
  ),
  -- A cancelled row must carry its cancellation data; a booked row must not.
  CONSTRAINT ck_appt_cancel_consistency CHECK (
    (status = 'booked'    AND cancelled_at IS NULL     AND refund_amount IS NULL) OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL AND refund_amount IS NOT NULL)
  ),

  INDEX idx_appt_doctor_time (doctor_id, appt_datetime),
  INDEX idx_appt_patient (patient_id)
) ENGINE=InnoDB;

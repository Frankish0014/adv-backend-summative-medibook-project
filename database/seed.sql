-- Sample data. Dates are relative to the day the script runs so that the
-- appointments are always in the future. Run AFTER schema.sql.
USE medibook;

INSERT INTO patients (full_name, email, phone) VALUES
  ('Ama Mensah',   'ama@mail.com',   '0244-111-222'),
  ('Kojo Owusu',   'kojo@mail.com',  '0555-333-444'),
  ('Esi Danquah',  'esi@mail.com',   '0201-555-666'),
  ('Yaw Asante',   'yaw@mail.com',   '0277-777-888'),
  ('Abena Osei',   'abena@mail.com', '0244-999-000');

INSERT INTO doctors (full_name, specialty, consultation_fee, room) VALUES
  ('Dr. Boateng', 'Dermatology', 150.00, 'R-12'),
  ('Dr. Adjei',   'Paediatrics', 100.00, 'R-03'),
  ('Dr. Quaye',   'Cardiology',  200.00, 'R-07');   -- no appointments (report must still list this doctor)

-- Dr. Boateng (id 1): fully booked-out day, 12 slots 09:00..14:30 on day +3 (hits the daily cap)
INSERT INTO appointments (patient_id, doctor_id, appt_datetime, amount_paid)
WITH RECURSIVE slots (n) AS (
  SELECT 0 UNION ALL SELECT n + 1 FROM slots WHERE n < 11
)
SELECT 1 + (n MOD 4), 1,
       TIMESTAMP(CURDATE() + INTERVAL 3 DAY, '09:00:00') + INTERVAL (n * 30) MINUTE,
       150.00
FROM slots;

-- A few more, on other days / doctors
INSERT INTO appointments (patient_id, doctor_id, appt_datetime, amount_paid) VALUES
  (1, 2, TIMESTAMP(CURDATE() + INTERVAL 5 DAY, '10:00:00'), 100.00),
  (2, 1, TIMESTAMP(CURDATE() + INTERVAL 1 DAY, '09:30:00'), 120.00),   -- discounted fee
  (3, 2, TIMESTAMP(CURDATE() + INTERVAL 2 DAY, '11:00:00'), 100.00);

-- One already-cancelled appointment (refund history kept, slot free again)
INSERT INTO appointments (patient_id, doctor_id, appt_datetime, status, amount_paid, refund_amount, cancelled_at)
VALUES (4, 2, TIMESTAMP(CURDATE() + INTERVAL 4 DAY, '14:00:00'), 'cancelled', 100.00, 100.00, NOW());

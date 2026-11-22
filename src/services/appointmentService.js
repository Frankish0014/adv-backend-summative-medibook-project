// Business logic for booking, cancelling, waitlisting and promoting.
// No SQL here: everything goes through the model functions.
const { pool, withTransaction } = require('../config/db');
const { MAX_APPOINTMENTS_PER_DAY } = require('../config/constants');
const AppError = require('../utils/AppError');
const { validateSlot, parseDateTime } = require('../utils/slot');
const { calculateRefund } = require('../utils/refund');
const patientModel = require('../models/patientModel');
const doctorModel = require('../models/doctorModel');
const appointmentModel = require('../models/appointmentModel');
const { audit } = require('../lib/auditLogger');
const queue = require('../lib/queue');

const cap = MAX_APPOINTMENTS_PER_DAY;

function waitlistOffer(code, doctorId, datetime) {
  return {
    waitlist: {
      available: true,
      reason: code,
      howToJoin: 'POST /api/waitlist',
      body: { patientId: '<patient id>', doctorId, datetime },
    },
  };
}

/** Best-effort side effects after a DB commit: they must never fail the user's request. */
async function enqueueConfirmation(appointment, patient, doctor) {
  try {
    await queue.enqueueJob('notify.confirmation', {
      appointmentId: appointment.id,
      channel: 'email',
      to: patient.email,
      patientName: patient.full_name,
      doctorName: doctor.full_name,
      datetime: appointment.appt_datetime,
    });
  } catch (err) {
    console.error('[queue] could not enqueue confirmation:', err.message);
    await audit('notification.enqueue_failed', { appointmentId: appointment.id, error: err.message });
  }
}

/**
 * Books a slot. Guarantees (even under concurrency):
 *  - slot is future, within hours, on a 30-minute boundary         (validateSlot)
 *  - doctor never exceeds 12 bookings/day   -> doctor row is locked with SELECT ... FOR UPDATE, so
 *                                              concurrent bookings for one doctor run one at a time
 *  - a doctor slot is never held twice      -> UNIQUE (doctor_id, active_slot) is the final guard
 */
async function createBooking({ patientId, doctorId, datetime }, { now = new Date(), source = 'api' } = {}) {
  const check = validateSlot(datetime, now);
  if (!check.valid) {
    throw new AppError(check.code === 'MALFORMED' ? 400 : 422, check.message, `INVALID_SLOT_${check.code}`);
  }
  const { sql: slotSql, day } = check.parsed;

  let result;
  try {
    result = await withTransaction(async (conn) => {
      const doctor = await doctorModel.findByIdForUpdate(conn, doctorId);
      if (!doctor) throw new AppError(404, `Doctor ${doctorId} not found`, 'DOCTOR_NOT_FOUND');
      const patient = await patientModel.findById(patientId, conn);
      if (!patient) throw new AppError(404, `Patient ${patientId} not found`, 'PATIENT_NOT_FOUND');

      if (await appointmentModel.isSlotBooked(conn, doctorId, slotSql)) {
        throw new AppError(409, 'This slot is already booked', 'SLOT_TAKEN', waitlistOffer('SLOT_TAKEN', doctorId, slotSql));
      }
      const booked = await appointmentModel.countBookedForDoctorDay(conn, doctorId, day);
      if (booked >= cap) {
        throw new AppError(409, `Doctor is fully booked on ${day} (${cap} appointments)`, 'DAY_FULL',
          waitlistOffer('DAY_FULL', doctorId, slotSql));
      }
      const id = await appointmentModel.insert(conn, {
        patientId, doctorId, datetimeSql: slotSql, amountPaid: doctor.consultation_fee,
      });
      return { appointment: await appointmentModel.findById(id, conn), patient, doctor };
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') { // last line of defence: unique index fired
      throw new AppError(409, 'This slot is already booked', 'SLOT_TAKEN', waitlistOffer('SLOT_TAKEN', doctorId, slotSql));
    }
    throw err;
  }

  const { appointment, patient, doctor } = result;
  await audit('appointment.booked', {
    appointmentId: appointment.id, patientId, doctorId, datetime: appointment.appt_datetime,
    amountPaid: appointment.amount_paid, source,
  });
  await enqueueConfirmation(appointment, patient, doctor);
  return appointment;
}

/**
 * Cancels an appointment. The status change and the refund record are one UPDATE inside a
 * transaction, so they succeed or fail together. The row is kept (refund history) and the slot
 * becomes bookable again because active_slot turns NULL.
 */
async function cancelAppointment(id, { now = new Date() } = {}) {
  const result = await withTransaction(async (conn) => {
    const appt = await appointmentModel.findByIdForUpdate(conn, id);
    if (!appt) throw new AppError(404, `Appointment ${id} not found`, 'APPOINTMENT_NOT_FOUND');
    if (appt.status === 'cancelled') throw new AppError(409, 'Appointment is already cancelled', 'ALREADY_CANCELLED');

    const apptDate = parseDateTime(appt.appt_datetime).date;
    if (apptDate.getTime() <= now.getTime()) {
      throw new AppError(422, 'Past appointments cannot be cancelled', 'APPOINTMENT_IN_PAST');
    }
    const refund = calculateRefund(apptDate, now, appt.amount_paid);
    const pad = (n) => String(n).padStart(2, '0');
    const cancelledAt = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
      `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const ok = await appointmentModel.markCancelled(conn, id, refund.refundAmount, cancelledAt);
    if (!ok) throw new AppError(409, 'Appointment is already cancelled', 'ALREADY_CANCELLED');
    return { appointment: await appointmentModel.findById(id, conn), refund };
  });

  const { appointment, refund } = result;
  await audit('appointment.cancelled', {
    appointmentId: appointment.id, patientId: appointment.patient_id, doctorId: appointment.doctor_id,
    datetime: appointment.appt_datetime, refundPercentage: refund.percentage, refundAmount: refund.refundAmount,
  });
  // Tell the worker a slot was freed so it can promote the first waitlisted patient.
  try {
    await queue.enqueueJob('waitlist.promote', {
      doctorId: appointment.doctor_id, datetime: appointment.appt_datetime,
    });
  } catch (err) {
    console.error('[queue] could not enqueue waitlist promotion:', err.message);
    await audit('waitlist.enqueue_failed', { appointmentId: appointment.id, error: err.message });
  }

  return {
    appointment,
    refund: {
      percentage: refund.percentage,
      amount: refund.refundAmount,
      hoursNotice: Math.round(refund.hoursNotice * 100) / 100,
    },
  };
}

/** Puts a patient on the waitlist - only allowed when the slot (or the doctor's day) is really full. */
async function joinWaitlist({ patientId, doctorId, datetime }, { now = new Date() } = {}) {
  const check = validateSlot(datetime, now);
  if (!check.valid) {
    throw new AppError(check.code === 'MALFORMED' ? 400 : 422, check.message, `INVALID_SLOT_${check.code}`);
  }
  const { sql: slotSql, day } = check.parsed;

  const doctor = await doctorModel.findById(doctorId);
  if (!doctor) throw new AppError(404, `Doctor ${doctorId} not found`, 'DOCTOR_NOT_FOUND');
  const patient = await patientModel.findById(patientId);
  if (!patient) throw new AppError(404, `Patient ${patientId} not found`, 'PATIENT_NOT_FOUND');

  const slotTaken = await appointmentModel.isSlotBooked(pool, doctorId, slotSql);
  const dayFull = (await appointmentModel.countBookedForDoctorDay(pool, doctorId, day)) >= cap;
  if (!slotTaken && !dayFull) {
    throw new AppError(409, 'That slot is still available - book it directly', 'SLOT_AVAILABLE');
  }

  try {
    if (await queue.waitlistPosition(doctorId, day, patientId, slotSql)) {
      throw new AppError(409, 'Patient is already on the waitlist for this slot', 'ALREADY_WAITLISTED');
    }
    const position = await queue.joinWaitlist({
      patientId, doctorId, datetime: slotSql,
      // day full -> any slot freed that day will do; slot taken -> only that exact slot
      flexible: !slotTaken && dayFull,
      joinedAt: new Date().toISOString(),
    });
    await audit('waitlist.joined', { patientId, doctorId, datetime: slotSql, position });
    return { patientId, doctorId, datetime: slotSql, position };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(503, 'Waitlist is temporarily unavailable', 'QUEUE_UNAVAILABLE');
  }
}

/**
 * Worker side: a slot (doctorId, datetime) was freed. Offer it to the first matching waitlisted
 * patient. Safety rule: an entry is removed from Redis ONLY AFTER its outcome is durable
 *   - booked in MySQL            -> removed from the waitlist
 *   - permanently unbookable     -> copied to `waitlist:failed`, THEN removed
 *   - transient failure (DB/Redis down) -> error is thrown, the entry stays queued, the job is retried
 * so a patient can never disappear from both the queue and the appointments table.
 */
async function promoteWaitlist({ doctorId, datetime }, { now = new Date() } = {}) {
  const parsed = parseDateTime(datetime);
  if (!parsed) return { promoted: null, reason: 'BAD_SLOT' };
  const key = queue.waitlistKey(doctorId, parsed.day);
  const { redis } = require('../lib/redis');
  await queue.connectIfNeeded();

  const entries = await queue.waitlistEntries(doctorId, parsed.day);
  for (const { raw, entry } of entries) {
    if (!entry.flexible && entry.datetime !== parsed.sql) continue;

    try {
      const appt = await createBooking(
        { patientId: entry.patientId, doctorId, datetime: parsed.sql }, { now, source: 'waitlist' }
      );
      await redis.lrem(key, 1, raw);
      await audit('waitlist.promoted', { patientId: entry.patientId, doctorId, appointmentId: appt.id, datetime: appt.appt_datetime });
      return { promoted: entry, appointmentId: appt.id };
    } catch (err) {
      if (!(err instanceof AppError)) throw err; // transient -> retry the whole job, entry still queued

      if (err.code === 'SLOT_TAKEN' &&
          await appointmentModel.isSlotHeldByPatient(pool, doctorId, entry.patientId, parsed.sql)) {
        // A previous attempt booked this patient but crashed before removing the entry.
        await redis.lrem(key, 1, raw);
        await audit('waitlist.promoted', { patientId: entry.patientId, doctorId, datetime: parsed.sql, recovered: true });
        return { promoted: entry, recovered: true };
      }
      if (['SLOT_TAKEN', 'DAY_FULL', 'INVALID_SLOT_PAST'].includes(err.code)) {
        // Someone else got the slot first (or time ran out). Patient keeps their place in the queue.
        await audit('waitlist.promotion_skipped', { patientId: entry.patientId, doctorId, datetime: parsed.sql, reason: err.code });
        return { promoted: null, reason: err.code };
      }
      // Permanent problem with THIS entry (e.g. patient deleted): park it, then try the next one.
      await redis.rpush(queue.KEYS.failedWaitlist, JSON.stringify({ entry, reason: err.code, at: new Date().toISOString() }));
      await redis.lrem(key, 1, raw);
      await audit('waitlist.promotion_failed', { patientId: entry.patientId, doctorId, datetime: parsed.sql, reason: err.code });
    }
  }
  return { promoted: null, reason: 'NO_MATCHING_ENTRY' };
}

module.exports = { createBooking, cancelAppointment, joinWaitlist, promoteWaitlist };

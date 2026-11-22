const AppError = require('../utils/AppError');
const { parseId } = require('../utils/validators');
const appointmentModel = require('../models/appointmentModel');
const service = require('../services/appointmentService');

exports.book = async (req, res) => {
  const { patientId, doctorId, datetime } = req.body || {};
  const errors = [];
  const pid = parseId(patientId);
  const did = parseId(doctorId);
  if (!pid) errors.push('patientId must be a positive integer');
  if (!did) errors.push('doctorId must be a positive integer');
  if (typeof datetime !== 'string' || !datetime.trim()) errors.push('datetime is required, e.g. "2026-12-01 09:30"');
  if (errors.length) throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', errors);

  const appointment = await service.createBooking({ patientId: pid, doctorId: did, datetime });
  res.status(201).location(`/api/appointments/${appointment.id}`).json(appointment);
};

exports.get = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(400, 'id must be a positive integer', 'INVALID_ID');
  const appt = await appointmentModel.findById(id);
  if (!appt) throw new AppError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  res.json(appt);
};

// DELETE /api/appointments/:id  -> cancels (soft: the row is kept) and reports the refund.
exports.cancel = async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(400, 'id must be a positive integer', 'INVALID_ID');
  res.json(await service.cancelAppointment(id));
};

exports.joinWaitlist = async (req, res) => {
  const { patientId, doctorId, datetime } = req.body || {};
  const pid = parseId(patientId);
  const did = parseId(doctorId);
  const errors = [];
  if (!pid) errors.push('patientId must be a positive integer');
  if (!did) errors.push('doctorId must be a positive integer');
  if (typeof datetime !== 'string' || !datetime.trim()) errors.push('datetime is required');
  if (errors.length) throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', errors);

  const entry = await service.joinWaitlist({ patientId: pid, doctorId: did, datetime });
  res.status(201).json({ message: 'Added to the waitlist', ...entry });
};

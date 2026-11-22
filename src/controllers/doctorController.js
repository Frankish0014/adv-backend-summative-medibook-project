const doctorModel = require('../models/doctorModel');
const appointmentModel = require('../models/appointmentModel');
const AppError = require('../utils/AppError');
const { validateDoctor, parseId } = require('../utils/validators');
const { MAX_APPOINTMENTS_PER_DAY, STATS_WINDOW_DAYS } = require('../config/constants');

function idOr400(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(400, 'id must be a positive integer', 'INVALID_ID');
  return id;
}

exports.list = async (req, res) => res.json(await doctorModel.findAll());

exports.get = async (req, res) => {
  const doctor = await doctorModel.findById(idOr400(req));
  if (!doctor) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  res.json(doctor);
};

exports.create = async (req, res) => {
  const { errors, value } = validateDoctor(req.body);
  if (errors.length) throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', errors);
  const doctor = await doctorModel.create(value);
  res.status(201).location(`/api/doctors/${doctor.id}`).json(doctor);
};

const updater = (partial) => async (req, res) => {
  const id = idOr400(req);
  const { errors, value } = validateDoctor(req.body, { partial });
  if (errors.length) throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', errors);
  const doctor = await doctorModel.update(id, value);
  if (!doctor) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  res.json(doctor);
};
exports.replace = updater(false);
exports.patch = updater(true);

exports.remove = async (req, res) => {
  const removed = await doctorModel.remove(idOr400(req));
  if (!removed) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  res.status(204).end();
};

// Operation 4 - GET /api/doctors/:id/statistics
exports.statistics = async (req, res) => {
  const id = idOr400(req);
  const doctor = await doctorModel.findById(id);
  if (!doctor) throw new AppError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');

  const pad = (n) => String(n).padStart(2, '0');
  const n = new Date();
  const nowSql = `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())} ${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`;

  const [totals, daily] = await Promise.all([
    appointmentModel.doctorTotals(id, nowSql, STATS_WINDOW_DAYS, MAX_APPOINTMENTS_PER_DAY),
    appointmentModel.doctorDailyLoad(id, nowSql, STATS_WINDOW_DAYS, MAX_APPOINTMENTS_PER_DAY),
  ]);
  res.json({
    doctorId: id,
    doctorName: doctor.full_name,
    revenueCollected: totals.revenue_collected,
    upcomingAppointments: totals.upcoming_appointments,
    dailyCap: MAX_APPOINTMENTS_PER_DAY,
    next7Days: daily.map((d) => ({ date: d.date, appointments: d.appointments, utilizationPct: d.utilization_pct })),
    next7DaysUtilizationPct: totals.window_utilization_pct,
  });
};

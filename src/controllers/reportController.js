const appointmentModel = require('../models/appointmentModel');
const { MAX_APPOINTMENTS_PER_DAY, BUSY_DAY_THRESHOLD_PCT } = require('../config/constants');

exports.doctors = async (req, res) => res.json(await appointmentModel.doctorsReport());

exports.busyDays = async (req, res) => {
  const rows = await appointmentModel.busyDays(MAX_APPOINTMENTS_PER_DAY, BUSY_DAY_THRESHOLD_PCT);
  res.json({ dailyCap: MAX_APPOINTMENTS_PER_DAY, thresholdPct: BUSY_DAY_THRESHOLD_PCT, busyDays: rows });
};

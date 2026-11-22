const patientModel = require('../models/patientModel');
const AppError = require('../utils/AppError');
const { validatePatient, parseId } = require('../utils/validators');

function idOr404(req) {
  const id = parseId(req.params.id);
  if (!id) throw new AppError(400, 'id must be a positive integer', 'INVALID_ID');
  return id;
}

exports.list = async (req, res) => res.json(await patientModel.findAll());

exports.get = async (req, res) => {
  const patient = await patientModel.findById(idOr404(req));
  if (!patient) throw new AppError(404, 'Patient not found', 'PATIENT_NOT_FOUND');
  res.json(patient);
};

exports.create = async (req, res) => {
  const { errors, value } = validatePatient(req.body);
  if (errors.length) throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', errors);
  const patient = await patientModel.create(value);
  res.status(201).location(`/api/patients/${patient.id}`).json(patient);
};

const updater = (partial) => async (req, res) => {
  const id = idOr404(req);
  const { errors, value } = validatePatient(req.body, { partial });
  if (errors.length) throw new AppError(400, 'Validation failed', 'VALIDATION_ERROR', errors);
  const patient = await patientModel.update(id, value);
  if (!patient) throw new AppError(404, 'Patient not found', 'PATIENT_NOT_FOUND');
  res.json(patient);
};
exports.replace = updater(false); // PUT   - full representation required
exports.patch = updater(true);    // PATCH - any subset of fields

exports.remove = async (req, res) => {
  const removed = await patientModel.remove(idOr404(req));
  if (!removed) throw new AppError(404, 'Patient not found', 'PATIENT_NOT_FOUND');
  res.status(204).end();
};

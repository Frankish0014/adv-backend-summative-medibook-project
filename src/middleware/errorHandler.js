const AppError = require('../utils/AppError');

function notFound(req, res, next) {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`, 'ROUTE_NOT_FOUND'));
}

// Central error-handling middleware: every error in the app ends up here.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';
  let details;

  if (err instanceof AppError) {
    ({ status, message, code, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Request body is not valid JSON'; code = 'INVALID_JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'Request body too large'; code = 'PAYLOAD_TOO_LARGE';
  } else if (err.code === 'ER_DUP_ENTRY') {
    status = 409; message = 'A record with the same unique value already exists'; code = 'DUPLICATE';
    if (/email/i.test(err.sqlMessage || '')) message = 'A patient with this email already exists';
  } else if (err.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409; message = 'Cannot delete: this record still has appointments'; code = 'HAS_APPOINTMENTS';
  } else if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') {
    status = 422; message = 'Value violates a database constraint'; code = 'CONSTRAINT_VIOLATION';
  }

  if (status >= 500) console.error('[error]', err);
  const body = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };

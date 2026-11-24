// Refund policy (pure function).
//
//   notice  > REFUND_FULL_HOURS            -> REFUND_FULL_PCT
//   HALF <= notice <= FULL                 -> REFUND_HALF_PCT  (exact boundaries included)
//   notice  < REFUND_HALF_HOURS            -> REFUND_NONE_PCT
//
// "More than 48 hours -> 100%" and "less than 24 hours -> 0%" are strict, so the two boundary
// instants themselves fall into the 24-48 h (50 %) band, which the brief describes as "24-48 hours".

const {
  REFUND_FULL_HOURS,
  REFUND_HALF_HOURS,
  REFUND_FULL_PCT,
  REFUND_HALF_PCT,
  REFUND_NONE_PCT,
} = require('../config/constants');

const HOUR_MS = 60 * 60 * 1000;

function refundPercentage(hoursNotice) {
  if (hoursNotice > REFUND_FULL_HOURS) return REFUND_FULL_PCT;
  if (hoursNotice >= REFUND_HALF_HOURS) return REFUND_HALF_PCT;
  return REFUND_NONE_PCT;
}

/**
 * @param {Date} apptDate  appointment start
 * @param {Date} now       cancellation time
 * @param {number} amountPaid
 * @returns {{hoursNotice:number, percentage:number, refundAmount:number}}
 */
function calculateRefund(apptDate, now, amountPaid) {
  const hoursNotice = (apptDate.getTime() - now.getTime()) / HOUR_MS;
  const percentage = refundPercentage(hoursNotice);
  // integer cents avoid floating-point drift (e.g. 50% of 0.05)
  const refundAmount = Math.round((Math.round(Number(amountPaid) * 100) * percentage) / 100) / 100;
  return { hoursNotice, percentage, refundAmount };
}

module.exports = { calculateRefund, refundPercentage };

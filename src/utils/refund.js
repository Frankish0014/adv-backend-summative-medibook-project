// Refund policy (pure function).
//
//   notice  > 48 h            -> 100 %
//   24 h <= notice <= 48 h    ->  50 %   (exactly 48 h and exactly 24 h are in the 50 % tier)
//   notice  < 24 h            ->   0 %
//
// "More than 48 hours -> 100%" and "less than 24 hours -> 0%" are strict, so the two boundary
// instants themselves fall into the 24-48 h (50 %) band, which the brief describes as "24-48 hours".

const HOUR_MS = 60 * 60 * 1000;

function refundPercentage(hoursNotice) {
  if (hoursNotice > 48) return 100;
  if (hoursNotice >= 24) return 50;
  return 0;
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

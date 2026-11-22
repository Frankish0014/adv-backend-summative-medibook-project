const { calculateRefund, refundPercentage } = require('../src/utils/refund');

const HOUR = 60 * 60 * 1000;
const now = new Date(2026, 7, 1, 10, 0, 0);
const apptIn = (hours) => new Date(now.getTime() + hours * HOUR);

describe('refund calculator', () => {
  test('more than 48 hours notice -> 100% refund', () => {
    const r = calculateRefund(apptIn(72), now, 150);
    expect(r.percentage).toBe(100);
    expect(r.refundAmount).toBe(150);
  });

  test('between 24 and 48 hours notice -> 50% refund', () => {
    const r = calculateRefund(apptIn(36), now, 150);
    expect(r.percentage).toBe(50);
    expect(r.refundAmount).toBe(75);
  });

  test('less than 24 hours notice -> 0% refund', () => {
    const r = calculateRefund(apptIn(5), now, 150);
    expect(r.percentage).toBe(0);
    expect(r.refundAmount).toBe(0);
  });

  test('boundary: exactly 48 hours is NOT "more than 48" -> 50%', () => {
    expect(calculateRefund(apptIn(48), now, 100).percentage).toBe(50);
  });

  test('boundary: just over 48 hours -> 100%', () => {
    expect(calculateRefund(new Date(apptIn(48).getTime() + 1000), now, 100).percentage).toBe(100);
  });

  test('boundary: exactly 24 hours is inside the 24-48h band -> 50%', () => {
    expect(calculateRefund(apptIn(24), now, 100).percentage).toBe(50);
  });

  test('boundary: one second under 24 hours -> 0%', () => {
    expect(calculateRefund(new Date(apptIn(24).getTime() - 1000), now, 100).percentage).toBe(0);
  });

  test('rounds to cents without floating-point drift', () => {
    expect(calculateRefund(apptIn(30), now, 0.05).refundAmount).toBe(0.03); // 50% of 0.05 -> 0.025 -> 0.03
    expect(calculateRefund(apptIn(30), now, 99.99).refundAmount).toBe(50);  // 49.995 -> 50.00
  });

  test('refundPercentage is a pure tier lookup', () => {
    expect([100, 48.01, 48, 30, 24, 23.99, 0].map(refundPercentage)).toEqual([100, 100, 50, 50, 50, 0, 0]);
  });
});

const { validatePatient, validateDoctor, parseId } = require('../src/utils/validators');

describe('patient / doctor validators', () => {
  test('valid patient passes and is trimmed', () => {
    const { errors, value } = validatePatient({ full_name: '  Ama Mensah ', email: 'ama@mail.com', phone: '0244-111-222' });
    expect(errors).toEqual([]);
    expect(value.full_name).toBe('Ama Mensah');
  });

  test('patient with bad email and missing phone reports each problem', () => {
    const { errors } = validatePatient({ full_name: 'Ama', email: 'nope' });
    expect(errors).toEqual(expect.arrayContaining(['email must be a valid email address', 'phone is required']));
  });

  test('partial validation requires at least one valid field', () => {
    expect(validatePatient({}, { partial: true }).errors).toHaveLength(1);
    expect(validatePatient({ phone: '0244111222' }, { partial: true }).errors).toEqual([]);
  });

  test('doctor fee must be a non-negative number (not a string)', () => {
    const base = { full_name: 'Dr. X', specialty: 'ENT', room: 'R-1' };
    expect(validateDoctor({ ...base, consultation_fee: 120 }).errors).toEqual([]);
    expect(validateDoctor({ ...base, consultation_fee: -1 }).errors).toHaveLength(1);
    expect(validateDoctor({ ...base, consultation_fee: '120' }).errors).toHaveLength(1);
  });

  test('non-object bodies do not crash', () => {
    expect(validatePatient(null).errors.length).toBeGreaterThan(0);
    expect(validateDoctor([]).errors.length).toBeGreaterThan(0);
  });

  test('parseId accepts positive integers only', () => {
    expect([parseId('5'), parseId(7), parseId('0'), parseId('-1'), parseId('1.5'), parseId('abc'), parseId(null)])
      .toEqual([5, 7, null, null, null, null, null]);
  });
});

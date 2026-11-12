import { describe, expect, it } from 'vitest';
import { readAccount } from './account';
import { normaliseEmail, signInProblem, signUpProblem } from './credentials';

// A fictional password of exactly ten characters, the shortest the service accepts
const TEN = 'abcdefghij';

describe('email', () => {
  it('is trimmed and lower-cased like the service stores it', () => {
    expect(normaliseEmail('  Fictional.Person@Example.ORG ')).toBe('fictional.person@example.org');
  });

  it.each(['', '   '])('asks for an address when given %j', (email) => {
    expect(signInProblem(email, TEN)).toEqual({ field: 'email', message: 'Enter your email address.' });
  });

  it.each(['person', 'person@', '@example.org', 'person@example', 'per son@example.org', 'a@b@example.org'])('refuses the shape of %j', (email) => {
    expect(signUpProblem(email, TEN, TEN)).toMatchObject({ field: 'email', message: 'Enter an email address like name@example.com.' });
  });

  it('accepts 254 characters and refuses 255', () => {
    const domain = '@example.org';
    expect(signUpProblem('a'.repeat(254 - domain.length) + domain, TEN, TEN)).toBeNull();
    expect(signUpProblem('a'.repeat(255 - domain.length) + domain, TEN, TEN)).toMatchObject({ field: 'email', message: expect.stringContaining('at most 254') });
  });
});

describe('sign-up password', () => {
  it('accepts 10 and 128 characters', () => {
    expect(signUpProblem('person@example.org', TEN, TEN)).toBeNull();
    expect(signUpProblem('person@example.org', 'a'.repeat(128), 'a'.repeat(128))).toBeNull();
  });

  it('refuses 9 characters with the minimum in the sentence', () => {
    expect(signUpProblem('person@example.org', 'abcdefghi', 'abcdefghi')).toEqual({ field: 'password', message: 'Use at least 10 characters for the password.' });
  });

  it('refuses 129 characters', () => {
    expect(signUpProblem('person@example.org', 'a'.repeat(129), 'a'.repeat(129))).toEqual({ field: 'password', message: 'Use at most 128 characters for the password.' });
  });

  it('counts an emoji as one character', () => {
    // Eight letters and one emoji are nine characters, although JavaScript stores the emoji as two units
    const nine = 'abcdefgh\u{1F600}';
    expect(signUpProblem('person@example.org', nine, nine)).toMatchObject({ field: 'password' });
  });

  it('needs both passwords to match exactly', () => {
    expect(signUpProblem('person@example.org', TEN, `${TEN} `)).toMatchObject({ field: 'confirm', message: expect.stringContaining('do not match') });
  });
});

describe('sign-in', () => {
  it('only needs the password to be there, leaving a wrong one to the service', () => {
    expect(signInProblem('person@example.org', 'short')).toBeNull();
    expect(signInProblem('person@example.org', '')).toEqual({ field: 'password', message: 'Enter your password.' });
  });
});

describe('account shape', () => {
  it('keeps only the id and email', () => {
    expect(readAccount({ id: 'u1', email: 'person@example.org', token: 'fictional' })).toEqual({ id: 'u1', email: 'person@example.org' });
  });

  it.each([null, 'u1', [], {}, { id: '', email: 'person@example.org' }, { id: 'u1', email: '' }, { id: 7, email: 'person@example.org' }, { id: 'u1' }])('refuses %j', (value) => {
    expect(readAccount(value)).toBeNull();
  });
});

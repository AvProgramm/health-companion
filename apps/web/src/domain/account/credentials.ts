/**
 * The sign-in form's own checks, matching what the sign-in service accepts.
 *
 * Checking here first gives the person a specific sentence beside the field, and saves
 * a request that the service would refuse anyway.
 */

// The longest email address the service stores
const EMAIL_MAX_LENGTH = 254;
// The shortest and longest password the service accepts, in characters
const PASSWORD_MIN_LENGTH = 10;
const PASSWORD_MAX_LENGTH = 128;
// Something before the @, something after it, and a dot in the domain: a typo check, not proof the address exists
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Which field a problem belongs to, so the form can show the sentence beside it. */
export type CredentialField = 'email' | 'password' | 'confirm';

/** One thing to fix before the form can be sent. */
export interface CredentialProblem {
  field: CredentialField;
  message: string;
}

/**
 * Return the email as the service stores it: trimmed and in lower case.
 */
export function normaliseEmail(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Return the first problem with a sign-in form, or null when it can be sent.
 *
 * The password is only checked for being there: a wrong one is for the service to refuse.
 */
export function signInProblem(email: string, password: string): CredentialProblem | null {
  const problem = emailProblem(normaliseEmail(email));
  if (problem !== null) {
    return problem;
  }
  return password === '' ? { field: 'password', message: 'Enter your password.' } : null;
}

/**
 * Return the first problem with a sign-up form, or null when it can be sent.
 */
export function signUpProblem(email: string, password: string, confirmPassword: string): CredentialProblem | null {
  const problem = emailProblem(normaliseEmail(email)) ?? passwordProblem(password);
  if (problem !== null) {
    return problem;
  }

  // Ask for the password twice, because a typo here would lock the person out of a new account
  if (password !== confirmPassword) {
    return { field: 'confirm', message: 'The two passwords do not match. Type the same password in both boxes.' };
  }
  return null;
}

/**
 * Return what is wrong with a normalised email, or null.
 */
function emailProblem(email: string): CredentialProblem | null {
  if (email === '') {
    return { field: 'email', message: 'Enter your email address.' };
  }
  if (email.length > EMAIL_MAX_LENGTH) {
    return { field: 'email', message: `Use an email address of at most ${EMAIL_MAX_LENGTH} characters.` };
  }
  if (!EMAIL_SHAPE.test(email)) {
    return { field: 'email', message: 'Enter an email address like name@example.com.' };
  }
  return null;
}

/**
 * Return what is wrong with a new password, or null.
 */
function passwordProblem(password: string): CredentialProblem | null {
  // Count whole characters, as the service does, so an emoji is one character and not two
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return { field: 'password', message: `Use at least ${PASSWORD_MIN_LENGTH} characters for the password.` };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return { field: 'password', message: `Use at most ${PASSWORD_MAX_LENGTH} characters for the password.` };
  }
  return null;
}

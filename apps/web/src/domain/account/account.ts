/** The signed-in person as the sign-in service names them: never a password or a session token. */
export interface Account {
  id: string;
  email: string;
}

/**
 * Return the account in a service reply or a remembered record, or null when the shape is wrong.
 *
 * Both come from outside the app, so nothing is trusted until the id and email are real text.
 */
export function readAccount(value: unknown): Account | null {
  // Ignore anything that is not an object because it cannot hold an account
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  // Keep only the two known fields, so nothing else in the reply travels with the account
  const { id, email } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id === '' || typeof email !== 'string' || email === '') {
    return null;
  }
  return { id, email };
}

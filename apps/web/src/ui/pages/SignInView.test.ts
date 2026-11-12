// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceError } from '../../data/api/post';
import { SignInView } from './SignInView';

// A fictional password long enough for a new account
const PASSWORD = 'fictional-password';

let root: Root;
let container: HTMLDivElement;
const onSignIn = vi.fn();
const onSignUp = vi.fn();
const onRetry = vi.fn();

/** Render the screen, optionally with the reason the service could not be asked. */
async function render(serviceProblem: string | null = null) {
  await act(async () => root.render(createElement(SignInView, { serviceProblem, onRetry, onSignIn, onSignUp })));
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  onSignIn.mockResolvedValue(undefined);
  onSignUp.mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

/** Return the input with this id. */
function field(id: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(`#${id}`)!;
}

/** Type into one input the way React hears it. */
async function type(id: string, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(field(id), text);
    field(id).dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Press the button with exactly this label. */
async function press(label: string) {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  expect(button, `a button labelled ${label}`).toBeDefined();
  await act(async () => button!.click());
}

/** Submit the form, as Enter in a field does, and let the request settle. */
async function submit() {
  await act(async () => container.querySelector('form')!.requestSubmit());
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Return every error sentence on screen. */
function alerts(): string[] {
  return [...container.querySelectorAll('[role="alert"]')].map((line) => line.textContent ?? '');
}

describe('sign-in screen', () => {
  it('opens on sign in, with labelled fields a password manager can fill', () => {
    expect(container.querySelector('h1')!.textContent).toBe('Sign in');
    expect(field('signin-email').autocomplete).toBe('email');
    expect(field('signin-email').closest('label')!.textContent).toContain('Email');
    expect(field('signin-password').autocomplete).toBe('current-password');
    expect(field('signin-password').type).toBe('password');
    expect(field('signin-confirm')).toBeNull();
    expect(container.textContent).toContain('Your diary stays on this device');
  });

  it('toggles to create account and back, keeping the email', async () => {
    await type('signin-email', 'person@example.org');
    await press('Create account');
    expect(container.querySelector('h1')!.textContent).toBe('Create your account');
    expect(field('signin-password').autocomplete).toBe('new-password');
    expect(field('signin-confirm').autocomplete).toBe('new-password');
    expect(field('signin-confirm').type).toBe('password');
    expect(container.querySelector('[aria-pressed="true"]')!.textContent).toBe('Create account');
    await press('Sign in');
    expect(field('signin-confirm')).toBeNull();
    expect(field('signin-email').value).toBe('person@example.org');
  });

  it('never shows a password as text until Show password is pressed', async () => {
    await press('Create account');
    await type('signin-password', PASSWORD);
    await type('signin-confirm', PASSWORD);
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(2);
    expect(container.textContent).not.toContain(PASSWORD);
    await press('Show password');
    expect(field('signin-password').type).toBe('text');
    expect(field('signin-confirm').type).toBe('text');
    await press('Hide password');
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(2);
  });

  it('blocks a sign-in with a mistyped email, saying so beside the field', async () => {
    await type('signin-email', 'person@example');
    await type('signin-password', PASSWORD);
    await submit();
    expect(onSignIn).not.toHaveBeenCalled();
    expect(alerts()).toEqual(['Enter an email address like name@example.com.']);
    expect(field('signin-email').getAttribute('aria-invalid')).toBe('true');
  });

  it.each([
    ['abcdefghi', 'abcdefghi', 'Use at least 10 characters for the password.'],
    [PASSWORD, 'fictional-passwork', 'The two passwords do not match. Type the same password in both boxes.'],
  ])('blocks a sign-up with password %j and confirmation %j', async (password, confirmPassword, message) => {
    await press('Create account');
    await type('signin-email', 'person@example.org');
    await type('signin-password', password);
    await type('signin-confirm', confirmPassword);
    await submit();
    expect(onSignUp).not.toHaveBeenCalled();
    expect(alerts()).toEqual([message]);
  });

  it('signs in with the normalised email and the password as typed', async () => {
    await type('signin-email', '  Person@Example.org ');
    await type('signin-password', ' short ');
    await submit();
    expect(onSignIn).toHaveBeenCalledExactlyOnceWith('person@example.org', ' short ');
    expect(onSignUp).not.toHaveBeenCalled();
    expect(alerts()).toEqual([]);
  });

  it('creates an account once both passwords match', async () => {
    await press('Create account');
    await type('signin-email', 'person@example.org');
    await type('signin-password', PASSWORD);
    await type('signin-confirm', PASSWORD);
    await submit();
    expect(onSignUp).toHaveBeenCalledExactlyOnceWith('person@example.org', PASSWORD);
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('disables the form while the request is running', async () => {
    let finish = () => {};
    onSignIn.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    await type('signin-email', 'person@example.org');
    await type('signin-password', PASSWORD);
    await act(async () => container.querySelector('form')!.requestSubmit());
    const submitButton = container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toBe('Signing in…');
    expect(field('signin-email').disabled).toBe(true);
    await act(async () => finish());
    expect(submitButton.disabled).toBe(false);
  });

  it.each([
    [401, 'Email or password is incorrect.'],
    [429, 'Too many attempts. Wait a few minutes and try again.'],
  ])('shows the service refusal for status %i and keeps what was typed', async (status, message) => {
    onSignIn.mockRejectedValue(new ServiceError(message, status));
    await type('signin-email', 'person@example.org');
    await type('signin-password', PASSWORD);
    await submit();
    expect(alerts()).toEqual([message]);
    expect(field('signin-email').value).toBe('person@example.org');
    expect(field('signin-password').value).toBe(PASSWORD);
    expect(container.textContent).not.toContain('Sign in with this email');
  });

  it('offers to sign in with the same email when the account already exists', async () => {
    onSignUp.mockRejectedValue(new ServiceError('An account with this email already exists. Sign in instead.', 409));
    await press('Create account');
    await type('signin-email', 'person@example.org');
    await type('signin-password', PASSWORD);
    await type('signin-confirm', PASSWORD);
    await submit();
    expect(alerts()).toEqual(['An account with this email already exists. Sign in instead.']);
    await press('Sign in with this email');
    expect(container.querySelector('h1')!.textContent).toBe('Sign in');
    expect(field('signin-email').value).toBe('person@example.org');
    expect(alerts()).toEqual([]);
    await submit();
    expect(onSignIn).toHaveBeenCalledExactlyOnceWith('person@example.org', PASSWORD);
  });

  it('says when the service could not be reached, with a way to ask again', async () => {
    await render('Could not reach the sign-in service. Check the connection, then try again.');
    expect(alerts()).toEqual(['Could not reach the sign-in service. Check the connection, then try again.']);
    await press('Try again');
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

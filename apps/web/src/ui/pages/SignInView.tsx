import { useState, type FormEvent } from 'react';
import { Leaf } from '@phosphor-icons/react';
import { ServiceError } from '../../data/api/post';
import { normaliseEmail, signInProblem, signUpProblem, type CredentialField, type CredentialProblem } from '../../domain/account/credentials';
import { Field } from '../components/shared/Field';
import { ErrorLine } from '../components/shared/NoticeLine';
import { useBusy } from '../hooks/useBusy';

type Mode = 'signIn' | 'signUp';

// The words that change between signing in and creating an account
const MODE_TEXT: Readonly<Record<Mode, { title: string; intro: string; submit: string; busy: string }>> = {
  signIn: { title: 'Sign in', intro: 'Sign in to open your diary on this device.', submit: 'Sign in', busy: 'Signing in…' },
  signUp: { title: 'Create your account', intro: 'An email and a password are all it takes. Your height and weight come next.', submit: 'Create account', busy: 'Creating account…' },
};

interface SignInViewProps {
  // Why the service could not be asked who is signed in, when that is why this screen shows
  serviceProblem: string | null;
  onRetry: () => void;
  onSignIn: (email: string, password: string) => Promise<void>;
  onSignUp: (email: string, password: string) => Promise<void>;
}

/**
 * The screen before the diary: sign in, or create an account, with an email and a password.
 *
 * The fields are checked here first, so a typo gets a sentence beside its box and no
 * request. The password is only ever handed to the sign-in call, never stored.
 */
export function SignInView({ serviceProblem, onRetry, onSignIn, onSignUp }: SignInViewProps) {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldProblem, setFieldProblem] = useState<CredentialProblem | null>(null);
  // Set when the service says this email already has an account, to offer signing in instead
  const [duplicate, setDuplicate] = useState(false);
  const { busy, error, setError, run } = useBusy();
  const text = MODE_TEXT[mode];

  /** Switch between signing in and creating an account, keeping the email that was typed. */
  function switchMode(next: Mode) {
    setMode(next);
    setConfirmPassword('');
    setFieldProblem(null);
    setDuplicate(false);
    setError(null);
  }

  /** Check the fields, then ask the service; a refusal stays on this screen as a sentence. */
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setDuplicate(false);

    // Ignore a form with a problem because the service would only refuse it
    const problem = mode === 'signIn' ? signInProblem(email, password) : signUpProblem(email, password, confirmPassword);
    setFieldProblem(problem);
    if (problem !== null) {
      setError(null);
      return;
    }

    run(async () => {
      try {
        await (mode === 'signIn' ? onSignIn : onSignUp)(normaliseEmail(email), password);
      } catch (refusal) {
        // Offer the way out of a duplicate email, and let the sentence show like any other
        setDuplicate(mode === 'signUp' && refusal instanceof ServiceError && refusal.status === 409);
        throw refusal;
      }
    });
  }

  /** Return the attributes and the sentence that mark one field as needing a fix. */
  function problemFor(field: CredentialField) {
    const message = fieldProblem?.field === field ? fieldProblem.message : null;
    return { invalid: message !== null, line: message !== null && <span className="field-error" role="alert">{message}</span> };
  }

  const emailProblem = problemFor('email');
  const passwordProblem = problemFor('password');
  const confirmProblem = problemFor('confirm');
  const passwordType = showPassword ? 'text' : 'password';

  return (
    <main className="signup-page">
      <section className="signup-card" aria-labelledby="signin-heading">
        <div className="signup-brand"><span className="brand-mark"><Leaf size={24} weight="bold" /></span><span className="brand-name">Health Companion</span><span className="signup-tagline">A little balance, every day.</span></div>

        <div className="signup-actions" role="group" aria-label="Sign in or create an account">
          <button type="button" className={`button ${mode === 'signIn' ? 'button-secondary' : 'button-quiet'}`} aria-pressed={mode === 'signIn'} disabled={busy} onClick={() => switchMode('signIn')}>Sign in</button>
          <button type="button" className={`button ${mode === 'signUp' ? 'button-secondary' : 'button-quiet'}`} aria-pressed={mode === 'signUp'} disabled={busy} onClick={() => switchMode('signUp')}>Create account</button>
        </div>

        <h1 id="signin-heading" className="signup-title">{text.title}</h1>
        <p className="signup-intro">{text.intro}</p>

        {serviceProblem !== null && error === null && (
          <>
            <ErrorLine error={serviceProblem} />
            <button type="button" className="button button-quiet" disabled={busy} onClick={onRetry}>Try again</button>
          </>
        )}

        <form className="signup-form" onSubmit={handleSubmit} noValidate>
          <Field label="Email">
            <input id="signin-email" className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required
              value={email} disabled={busy} aria-invalid={emailProblem.invalid} onChange={(event) => setEmail(event.target.value)} />
            {emailProblem.line}
          </Field>
          <Field label="Password" hint={mode === 'signUp' ? 'Use 10 to 128 characters.' : undefined}>
            <input id="signin-password" className="input" type={passwordType} autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} required
              value={password} disabled={busy} aria-invalid={passwordProblem.invalid} onChange={(event) => setPassword(event.target.value)} />
            {passwordProblem.line}
          </Field>
          {mode === 'signUp' && (
            <Field label="Confirm password">
              <input id="signin-confirm" className="input" type={passwordType} autoComplete="new-password" required
                value={confirmPassword} disabled={busy} aria-invalid={confirmProblem.invalid} onChange={(event) => setConfirmPassword(event.target.value)} />
              {confirmProblem.line}
            </Field>
          )}
          <button type="button" className="button button-quiet" aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>{showPassword ? 'Hide password' : 'Show password'}</button>

          <ErrorLine error={error} />
          {duplicate && <button type="button" className="signup-pill signup-pill-secondary" onClick={() => switchMode('signIn')}>Sign in with this email</button>}

          <button type="submit" className="signup-pill signup-pill-primary" disabled={busy}>{busy ? text.busy : text.submit}</button>
        </form>

        <p className="hint">The account only identifies you. Your diary stays on this device, and signing in does not upload it.</p>
      </section>
    </main>
  );
}

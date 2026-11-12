import { App } from './App';
import { useAccount } from './hooks/useAccount';
import { SignInView } from './pages/SignInView';

/**
 * Decide what opens: a placeholder while asking who is signed in, the sign-in screen, or the app.
 *
 * The app is keyed by the account, so a different person signing in starts from a
 * fresh shell with their own diary instead of inheriting the last one's open screens.
 */
export function AccountGate() {
  const { state, retry, signIn, signUp, signOut } = useAccount();

  if (state.status === 'loading') {
    return (
      <main className="page" aria-busy="true">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-card" />
      </main>
    );
  }

  if (state.status === 'signedOut') {
    return <SignInView serviceProblem={state.problem} onRetry={retry} onSignIn={signIn} onSignUp={signUp} />;
  }

  return <App key={state.account.id} diaryName={state.diaryName} accountEmail={state.account.email} accountOffline={state.offline} onSignOut={signOut} />;
}

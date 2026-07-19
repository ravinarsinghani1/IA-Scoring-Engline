// Route gate. Redirects unauthenticated users to Sign In, and authenticated-
// but-role-unconfirmed users to the Role Picker. An authenticated user with NO
// app profile (e.g. their email domain failed the bootstrap domain-lock) is
// shown a blocked state — NOT the workspace. We render that inline rather than
// redirecting to /signin, because SignIn redirects authed users back to "/",
// which would loop.

import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export default function RequireAuth({ children }) {
  const { loading, isAuthed, needsRolePicker, profile, error, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-[var(--color-ink-muted)]">
        Loading…
      </div>
    );
  }
  if (!isAuthed) return <Navigate to="/signin" replace />;

  // Authenticated but no profile row: bootstrap did not create one (most often
  // the school-domain lock rejected this email). Do not render the workspace.
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--color-canvas)] px-6 text-center">
        <p className="max-w-sm text-sm text-[var(--color-ink-muted)]">
          {error ||
            "Your account isn't linked to a registered school on Saaryavi. Contact your coordinator, or sign in with your school Google Workspace account."}
        </p>
        <button type="button" onClick={signOut} className="btn-primary">
          Sign out
        </button>
      </div>
    );
  }

  if (needsRolePicker) return <Navigate to="/role" replace />;
  return children;
}

// App shell: auth provider + routing. The authenticated Scoring/Validation tool
// lives in <Workspace/>, gated by <RequireAuth/>. Public routes are the auth
// screens. Phase 1 replaces Workspace's header with the sidebar shell.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import SignIn from './pages/SignIn.jsx';
import SignUp from './pages/SignUp.jsx';
import RolePicker from './pages/RolePicker.jsx';
import Workspace from './workspace/Workspace.jsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/signin" element={<SignIn />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/role" element={<RolePicker />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Workspace />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

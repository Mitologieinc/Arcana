import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage, SignupPage, SetupPage, InvitePage } from "./pages/AuthScreens";
import { WorkspaceApp } from "./pages/WorkspaceApp";
import { SharePage } from "./pages/SharePage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/share/:token" element={<SharePage />} />
      <Route path="/page/:pageId" element={<WorkspaceApp />} />
      <Route path="/" element={<WorkspaceApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Routes, Route, Navigate } from "react-router-dom";
import ContactsPage from "../pages/ContactsPage";
import SessionDetailPage from "../sessions/SessionDetailPage";
import TestingPage from "../testing/TestingPage";
import EvaluationsPage from "../evaluations/EvaluationsPage";
import SettingsPage from "../settings/SettingsPage";
import EvaluationSettingsPage from "../settings/EvaluationSettingsPage";
import PermissionsPage from "../settings/PermissionsPage";
import NotFoundPage from "../pages/NotFoundPage";

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/contacts" replace />} />
      <Route path="/oauth/callback" element={<Navigate to="/contacts" replace />} />
      <Route path="/contacts" element={<ContactsPage />} />
      <Route path="/testing" element={<TestingPage />} />
      <Route path="/evaluations" element={<EvaluationsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/evaluations" element={<EvaluationSettingsPage />} />
      <Route path="/settings/permissions" element={<PermissionsPage />} />
      <Route path="/sessions/:id" element={<SessionDetailPage />} />
      <Route path="/sessions" element={<Navigate to="/contacts" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

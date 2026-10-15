import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { Toaster } from '@/components/ui/toaster';
import PortariaLoginPage from '@/pages/PortariaLoginPage';
import PortariaResetPasswordPage from '@/pages/PortariaResetPasswordPage';
import PortariaGuardPage from '@/pages/PortariaGuardPage';
import TicketScannerPage from '@/pages/TicketScannerPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/login" element={<PortariaLoginPage />} />
          <Route path="/redefinir-senha" element={<PortariaResetPasswordPage />} />
          <Route path="/app" element={<PortariaGuardPage />} />
          <Route path="/:slug/scanner" element={<TicketScannerPage />} />
          {/* Fallback to /app */}
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AuthProvider>
  );
}

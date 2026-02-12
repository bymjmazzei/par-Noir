import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import { DemoPage } from '@/pages/DemoPage';
import { DemoLayout } from '@/layouts/DemoLayout';
import { UnsubscribePage } from '@/pages/UnsubscribePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/demo" element={<DemoLayout />}>
          <Route path=":slug" element={<DemoPage />} />
        </Route>
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

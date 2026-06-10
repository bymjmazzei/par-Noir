import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { PortalProvider } from './context/PortalContext';
import { DevLayout } from './components/DevLayout';
import { HomePage } from './pages/HomePage';
import { CredentialsPage } from './pages/CredentialsPage';
import { DataPointsPage } from './pages/DataPointsPage';
import { DocsPage } from './pages/DocsPage';
import { IntegratePage } from './pages/IntegratePage';
import { ApiReferencePage } from './pages/ApiReferencePage';
import { ProposalsPage } from './pages/ProposalsPage';
import { PlatformOperatorGate } from './pages/platform/PlatformOperatorGate';
import { PlatformOverviewPage } from './pages/platform/PlatformOverviewPage';
import { PlatformApplicationsPage } from './pages/platform/PlatformApplicationsPage';
import { PlatformLicensesPage } from './pages/platform/PlatformLicensesPage';
import { PlatformClientsPage } from './pages/platform/PlatformClientsPage';

export function App() {
  return (
    <PortalProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<DevLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/credentials" element={<CredentialsPage />} />
            <Route path="/data-points" element={<DataPointsPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/integrate" element={<IntegratePage />} />
            <Route path="/api-reference" element={<ApiReferencePage />} />
            <Route path="/proposals" element={<ProposalsPage />} />
            <Route element={<PlatformOperatorGate />}>
              <Route path="/platform" element={<PlatformOverviewPage />} />
              <Route path="/platform/applications" element={<PlatformApplicationsPage />} />
              <Route path="/platform/licenses" element={<PlatformLicensesPage />} />
              <Route path="/platform/clients" element={<PlatformClientsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </PortalProvider>
  );
}

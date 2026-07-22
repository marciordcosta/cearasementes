import { Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { UploadsPage } from './pages/UploadsPage';
import { PricingPage } from './pages/PricingPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/uploads" element={<UploadsPage />} />
      <Route path="/precificacao" element={<PricingPage />} />
    </Routes>
  );
}

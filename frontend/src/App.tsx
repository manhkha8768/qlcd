import { Routes, Route } from 'react-router-dom';
import HealthPage from './pages/HealthPage';
import NotFoundPage from './pages/NotFoundPage';

/**
 * QLCD Frontend - React App Shell
 * M0A Foundation: Routes and basic structure
 * M1+: Full authentication and dashboard
 */
function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        {/* M0A Foundation routes */}
        <Route path="/health" element={<HealthPage />} />

        {/* Catch all */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </div>
  );
}

export default App;

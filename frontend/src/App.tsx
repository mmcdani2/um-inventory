import { Routes, Route, Navigate } from 'react-router-dom'
import WeeklyCountPage from './pages/WeeklyCountPage'
import OrderRecommendationPage from './pages/OrderRecommendationPage'

export default function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Navigate to="/count" replace />} />
        <Route path="/count" element={<WeeklyCountPage />} />
        <Route path="/order/:snapshotId" element={<OrderRecommendationPage />} />
        <Route path="*" element={<Navigate to="/count" replace />} />
      </Routes>
    </div>
  )
}

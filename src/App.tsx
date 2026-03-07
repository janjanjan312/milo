/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/layout/Layout';
import MobileViewport from './components/layout/MobileViewport';
import Onboarding from './pages/Onboarding';
import Chat from './pages/Chat';
import Record from './pages/Record';
import Profile from './pages/Profile';

function PersistentTabs() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <Layout>
      <div className={path === '/chat' ? 'h-full' : 'hidden'}>
        <Chat />
      </div>
      <div className={path === '/record' ? 'h-full' : 'hidden'}>
        <Record />
      </div>
      <div className={path === '/me' ? 'h-full' : 'hidden'}>
        <Profile />
      </div>
    </Layout>
  );
}

function AppRoutes() {
  const { user } = useApp();
  const showOnboarding = !user || !user.onboardingComplete;

  return (
    <Routes>
      <Route path="/onboarding" element={
        !showOnboarding ? <Navigate to="/chat" replace /> : <Onboarding />
      } />
      <Route path="/" element={
        showOnboarding ? <Navigate to="/onboarding" replace /> : <Navigate to="/chat" replace />
      } />
      <Route path="*" element={
        showOnboarding ? <Navigate to="/onboarding" replace /> : <PersistentTabs />
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MobileViewport>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </MobileViewport>
    </AppProvider>
  );
}

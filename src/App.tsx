import { useEffect } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './routes/Home';
import Account from './routes/Account';
import Race from './routes/Race';
import Quick from './routes/Quick';
import PaymentResult from './routes/PaymentResult';
import { SiteSelector } from './components/SiteSelector';
import { DebugPanel } from './components/DebugPanel';
import { useSiteStore } from './stores/siteStore';
import { useAuthStore } from './stores/authStore';
import { useUiStore } from './stores/uiStore';
import { applyBootAutoLoginPolicy } from './lib/auth/applyBootAutoLogin';

export default function App() {
  const loc = useLocation();
  const isHome = loc.pathname === '/';
  const { hydrate: hydrateSite } = useSiteStore();
  const { hydrate: hydrateAuth } = useAuthStore();

  // Hydrate stores once; delegate auto-login policy to helper.
  // startKeepAlive is managed inside applyBootAutoLoginPolicy — do NOT call it here.
  useEffect(() => {
    hydrateSite();
    hydrateAuth();
    applyBootAutoLoginPolicy(useUiStore.getState().bootAutoLogin);
    return () => { useAuthStore.getState().stopKeepAlive(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-dvh bg-bg text-slate-100 flex flex-col">
      <header className="px-4 pt-[env(safe-area-inset-top)] pb-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <Link to="/" className="font-bold text-lg tracking-tight shrink-0">
          🎾 Booking Tennis
        </Link>
        <div className="flex items-center gap-3">
          <SiteSelector disabled={!isHome} />
          {!isHome && (
            <Link to="/" className="text-sm text-slate-400 hover:text-slate-200 shrink-0">
              홈
            </Link>
          )}
        </div>
      </header>
      <main className="flex-1 px-4 py-6 max-w-xl w-full mx-auto">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/account" element={<Account />} />
          <Route path="/race" element={<Race />} />
          <Route path="/quick" element={<Quick />} />
          <Route path="/payment-result" element={<PaymentResult />} />
        </Routes>
      </main>
      <footer className="px-4 py-3 text-center text-xs text-slate-500 border-t border-slate-800">
        gytennis · pjtennis unofficial client · v0.2.0
        <br />
        made by hyun-seo
      </footer>
      <DebugPanel />
    </div>
  );
}

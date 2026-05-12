import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Home from './routes/Home';
import Account from './routes/Account';
import Race from './routes/Race';
import Quick from './routes/Quick';
import PaymentResult from './routes/PaymentResult';

export default function App() {
  const loc = useLocation();
  const isHome = loc.pathname === '/';

  return (
    <div className="min-h-dvh bg-bg text-slate-100 flex flex-col">
      <header className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <Link to="/" className="font-bold text-lg tracking-tight">
          🎾 Booking Tennis
        </Link>
        {!isHome && (
          <Link to="/" className="text-sm text-slate-400 hover:text-slate-200">
            홈
          </Link>
        )}
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
        gytennis.or.kr unofficial client · v0.1.0
      </footer>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useSiteStore } from '@/stores/siteStore';
import { isRegistered, getSite } from '@/lib/sites/registry';
import { LoginBadge } from '@/components/LoginBadge';

export default function Home() {
  const { activeSiteId } = useSiteStore();
  const siteName = isRegistered(activeSiteId)
    ? getSite(activeSiteId).config.name
    : activeSiteId === 'pj' ? '파주시' : '고양시';

  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-base font-semibold mb-3">로그인 상태</h2>
        <div className="space-y-2">
          <LoginBadge siteId="gy" />
          <LoginBadge siteId="pj" />
        </div>
      </section>

      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-base font-semibold mb-1">계정</h2>
        <p className="text-sm text-slate-400 mb-3">{siteName} 로그인 정보 관리</p>
        <Link
          to="/account"
          className="inline-block w-full text-center px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-medium"
        >
          계정 설정
        </Link>
      </section>

      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-base font-semibold mb-1">🚀 오픈일 예약</h2>
        <p className="text-sm text-slate-400 mb-3">예약 오픈 정각에 자동 예약</p>
        <Link
          to="/race"
          className="inline-block w-full text-center px-4 py-3 rounded-xl bg-accent text-bg font-semibold"
        >
          시작
        </Link>
      </section>

      <section className="rounded-2xl bg-panel p-5">
        <h2 className="text-base font-semibold mb-1">⚡ 간편 예약</h2>
        <p className="text-sm text-slate-400 mb-3">즐겨찾기 코트 현황 + 즉시 예약</p>
        <Link
          to="/quick"
          className="inline-block w-full text-center px-4 py-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-sm font-medium"
        >
          열기
        </Link>
      </section>
    </div>
  );
}

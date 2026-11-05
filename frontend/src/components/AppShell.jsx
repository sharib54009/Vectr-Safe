const linkStyle = 'rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300'

export default function AppShell({ user, active, onNavigate, onLogout, children, guardian = false }) {
  const links = guardian
    ? [['/guardian/journeys', 'Guardian view'], ['/app/home', 'Rider home']]
    : [['/app/home', 'Home'], ['/app/journeys', 'History'], ['/app/trusted-contacts', 'Trusted contacts'], ['/guardian/journeys', 'Guardian view']]
  return <div className="min-h-screen bg-[#f4f6f5] text-slate-950">
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#142a32] text-white shadow-sm">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <button onClick={() => onNavigate(guardian ? '/guardian/journeys' : '/app/home')} className="flex items-center gap-3 rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300" aria-label="VectrSafe home">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500 font-black text-[#102a32]" aria-hidden="true">V</span>
          <span><b className="block text-lg leading-5">VectrSafe</b><span className="text-xs text-slate-300">Journey safety</span></span>
        </button>
        <nav aria-label="Main navigation" className="order-3 flex w-full flex-wrap items-center gap-1 border-t border-white/10 pt-2 sm:order-2 sm:w-auto sm:border-0 sm:pt-0">
          {links.map(([path, label]) => <button key={path} onClick={() => onNavigate(path)} aria-current={active === path ? 'page' : undefined} className={`${linkStyle} ${active === path ? 'bg-white/10 text-teal-200' : 'text-slate-100'}`}>{label}</button>)}
        </nav>
        <div className="flex items-center gap-2 sm:order-3">
          <span className="hidden max-w-32 truncate text-sm text-slate-200 md:inline">{user?.first_name || user?.username}</span>
          <button onClick={onLogout} className="min-h-10 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-300">Sign out</button>
        </div>
      </div>
    </header>
    {children}
  </div>
}

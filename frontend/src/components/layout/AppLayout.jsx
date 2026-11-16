import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Bell } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';

export default function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="flex min-h-screen bg-surface-50">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      <div className="page-wrapper flex-1 flex flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-white border-b border-surface-200 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="btn btn-ghost btn-sm"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2 text-sm font-bold text-surface-900">
            AI Tutor
          </div>
          <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-300 flex items-center justify-center text-primary-700 text-sm font-bold">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <div className="page-content animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

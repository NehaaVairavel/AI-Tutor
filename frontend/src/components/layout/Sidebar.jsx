import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Brain, BarChart2, Target,
  AlertCircle, User, Settings, LogOut,
  ChevronLeft, Menu, Shield, Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const studentNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/practice', icon: BookOpen, label: 'Practice' },
  { to: '/ai-tutor', icon: Brain, label: 'AI Tutor' },
  { to: '/analytics', icon: BarChart2, label: 'Analytics' },
  { to: '/study-plan', icon: Target, label: 'Study Plan' },
  { to: '/mistakes', icon: AlertCircle, label: 'My Mistakes' },
];

const adminNav = [
  { to: '/admin',           icon: Shield,      label: 'Admin Dashboard', end: true },
  { to: '/admin/users',     icon: User,        label: 'Users' },
  { to: '/admin/exams',     icon: Zap,         label: 'Exams' },
  { to: '/admin/questions', icon: BookOpen,    label: 'Questions' },
];

export default function Sidebar({ mobileOpen, onClose }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = isAdmin ? adminNav : studentNav;

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-surface-200">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
            <Brain size={18} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-surface-900 leading-tight">AI Tutor</div>
            <div className="text-xs text-surface-500">Exam Prep Platform</div>
          </div>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-surface-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-primary-700 text-sm font-bold flex-shrink-0">
              {user?.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-surface-800 truncate">{user?.name || 'User'}</div>
              <div className="text-xs text-surface-500 truncate">
                {isAdmin ? 'Administrator' : (user?.targetExam?.shortName || 'No exam selected')}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          <div className="px-3 mb-1">
            <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider px-1">
              {isAdmin ? 'Admin' : 'Menu'}
            </span>
          </div>
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : ''}`
              }
              onClick={onClose}
            >
              <Icon size={17} className="nav-icon flex-shrink-0" />
              <span>{label}</span>
            </NavLink>
          ))}

          {!isAdmin && (
            <>
              <div className="divider mx-4 my-2" />
              <div className="px-3 mb-1">
                <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider px-1">Account</span>
              </div>
              <NavLink to="/profile" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <User size={17} className="nav-icon flex-shrink-0" />
                <span>Profile</span>
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `sidebar-nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                <Settings size={17} className="nav-icon flex-shrink-0" />
                <span>Settings</span>
              </NavLink>
            </>
          )}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-surface-200">
          <button onClick={handleLogout} className="sidebar-nav-item text-red-500 hover:text-red-600 hover:bg-red-50 w-full">
            <LogOut size={17} className="flex-shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}

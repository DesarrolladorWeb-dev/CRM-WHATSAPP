import React from 'react';
import {
  MessageSquare, LayoutDashboard, Target, Megaphone, Zap, TrendingUp, Plug, X,
  Smartphone, Rocket, Sparkles, Leaf
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  unreadTotal: number;
  isOpen: boolean;
  onClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  unreadTotal,
  isOpen,
  onClose
}) => {
  const menuItems = [
    {
      id: 'inbox',
      label: 'Inbox WhatsApp & Chat',
      icon: MessageSquare,
      badge: unreadTotal > 0 ? unreadTotal : null,
      badgeColor: 'bg-emerald-500 text-white font-bold animate-pulse'
    },
    {
      id: 'contacts',
      label: 'CRM Kanban & Clientes',
      icon: LayoutDashboard,
      badge: <><Rocket className="w-2.5 h-2.5 inline mr-0.5" />Ventas</>,
      badgeColor: 'bg-emerald-950/80 text-emerald-400 font-bold border border-emerald-700/60'
    },
    {
      id: 'segments',
      label: 'Segmentos de Leads',
      icon: Target,
      badge: null
    },
    {
      id: 'campaigns',
      label: 'Difusión Masiva & IA',
      icon: Megaphone,
      badge: <><Sparkles className="w-2.5 h-2.5 inline mr-0.5" />Gemini</>,
      badgeColor: 'bg-indigo-950/80 text-indigo-300 font-bold border border-indigo-700/60'
    },
    {
      id: 'automation',
      label: 'Flujos & Automatizaciones',
      icon: Zap,
      badge: null
    },
    {
      id: 'analytics',
      label: 'Analítica & Reportes',
      icon: TrendingUp,
      badge: null
    },
    /*
    {
      id: 'api-github',
      label: 'API, Webhooks & MongoDB',
      icon: Plug,
      badge: <><Leaf className="w-2.5 h-2.5 inline mr-0.5" />DB</>,
      badgeColor: 'bg-teal-950/80 text-teal-300 font-bold border border-teal-700/60'
    }
    */
  ];

  return (
    <>
      {/* Overlay Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] lg:w-64 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } bg-slate-950 text-slate-300 flex flex-col shrink-0 select-none border-r border-slate-800/80 shadow-2xl`}
      >
      {/* XIO Brand Header */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0 ring-2 ring-emerald-500/30">
            <MessageSquare className="w-4.5 h-4.5" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <div className="font-black text-white text-lg tracking-tight flex items-center gap-1.5">
              <span>XIO</span>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/40 rounded-full font-black shadow-xs">
                CRM
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-semibold flex items-center gap-1 truncate">
              <Smartphone className="w-2.5 h-2.5 shrink-0" />
              <span>WhatsApp Web & Redes</span>
            </p>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800/80 rounded-xl transition-colors cursor-pointer shrink-0"
          aria-label="Cerrar menú"
        >
          <X className="w-4.5 h-4.5" />
        </button>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto scrollbar-thin">
        <div className="flex items-center justify-between px-3 mb-2">
          <p className="text-[10px] uppercase font-extrabold tracking-wider text-slate-500 flex items-center gap-1">
            <Rocket className="w-2.5 h-2.5" />
            <span>Plataforma Multiagente</span>
          </p>
          <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-extrabold rounded-full flex items-center gap-1 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
            Online
          </span>
        </div>

        {menuItems.map((item) => {
          const isActive = activeTab === item.id;
          const Icon = item.icon;

          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectTab(item.id);
                onClose();
              }}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-semibold text-xs transition-all cursor-pointer group ${
                isActive
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/40 font-bold scale-[1.02]'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/80 hover:translate-x-0.5'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'scale-110' : ''}`} />
                <span className="tracking-tight">{item.label}</span>
              </div>

              {item.badge !== null && item.badge !== undefined && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] ${item.badgeColor || 'bg-slate-800 text-slate-300'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      </aside>
    </>
  );
};

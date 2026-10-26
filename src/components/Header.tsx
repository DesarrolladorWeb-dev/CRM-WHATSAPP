import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Bell, Search, Github, Menu, X, Moon, Sun,
  MessageCircle, LayoutGrid, Target, Megaphone, Zap, TrendingUp, Plug, Rocket,
  LogOut,
  User,
  MessageSquare,
  Instagram,
  Twitter,
  ChevronRight,
  Mail
} from 'lucide-react';
import { Conversation } from '@/types';
import { applyTheme, readTheme, THEME_EVENT, type Theme } from '@/lib/theme';
import { ConfirmDialog } from './ui';
import {
  WhatsAppIcon,
  XBrandIcon,
  MessengerIcon
} from '@/components/Icons/ChannelIcons';
type WhatsAppStatusType = 'active-session' | 'active-no-session' | 'inactive';

const getAvatarColor = (name?: string | null): string => {
  const colors = [
    "bg-teal-700",
    "bg-purple-600",
    "bg-blue-600",
    "bg-orange-600",
    "bg-pink-600",
    "bg-indigo-600",
    "bg-rose-600",
    "bg-emerald-700",
  ];

  const hash = Array.from(name || "Desconocido")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  return colors[hash % colors.length];
};

// El tema vive en el <html> (lo aplica el script de layout.tsx); React se suscribe a ese estado externo.
function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
}

// En el servidor no hay DOM; el script del cliente corrige antes del pintado.
function getThemeServerSnapshot(): Theme {
  return 'light';
}

interface HeaderProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenGithubModal: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onToggleSidebar: () => void;
  onLogout: () => void
  conversations: Conversation[],
  whatsappStatus: WhatsAppStatusType;
  /** Numero del WhatsApp logueado (ya formateado). Vacio si no hay sesion. */
  sessionPhone?: string;
  /** Nombre del perfil vinculado, si el servicio lo publica. */
  sessionName?: string;
  onConnectWhatsapp: () => void;
  onSelectConversationByContactId: (contactId: string) => void;
}

const getInitials = (name?: string | null): string => {
  const words = (name || "Desconocido").trim().split(/\s+/);

  return words
    .slice(0, 2)
    .map(word => word.charAt(0).toUpperCase())
    .join("");
};

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onOpenGithubModal,
  searchQuery,
  setSearchQuery,
  onToggleSidebar,
  onLogout,
  conversations,
  whatsappStatus,
  sessionPhone,
  sessionName,
  onConnectWhatsapp,
  onSelectConversationByContactId
}) => {
  const getTabInfo = (tab: string) => {
    switch (tab) {
      case 'inbox':
        return {
          icon: MessageCircle,
          title: 'Inbox Omnicanal - XIO',
          subtitle: 'WhatsApp Web Multiagente, Instagram & Chat IA'
        };
      case 'contacts':
        return {
          icon: LayoutGrid,
          title: 'CRM Kanban de Ventas & Funnel',
          subtitle: 'Pipeline interactivo y seguimiento de prospectos en tiempo real'
        };
      case 'segments':
        return {
          icon: Target,
          title: 'Segmentos & Audiencias IA',
          subtitle: 'Filtros avanzados por canal, score y etiquetas'
        };
      case 'campaigns':
        return {
          icon: Megaphone,
          title: 'Difusión Masiva & Copywriter IA',
          subtitle: 'Campañas de marketing automatizadas con Google Gemini'
        };
      case 'automation':
        return {
          icon: Zap,
          title: 'Automatizaciones & Flujos',
          subtitle: 'Disparadores inteligentes y auto-respondedores 24/7'
        };
      case 'analytics':
        return {
          icon: TrendingUp,
          title: 'Métricas, Analítica & Rendimiento',
          subtitle: 'Cuadros de mando, conversiones y tiempos de respuesta'
        };
      case 'api-github':
        return {
          icon: Plug,
          title: 'API REST, Webhooks & MongoDB',
          subtitle: 'Playground interactivo y gestión de bases de datos'
        };
      default:
        return {
          icon: Rocket,
          title: 'XIO',
          subtitle: 'Plataforma Omnicanal de Ventas'
        };
    }
  };

  const currentTab = getTabInfo(activeTab);

  // Busqueda en viewports <lg: el campo del Header esta oculto, asi que un
  // icono despliega una barra de busqueda a pantalla completa sobre el Header.
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showUserOptions, setShowUserOptions] = useState(false);
  // Cerrar sesion es reversible, pero un clic accidental en este boton se
  // lleva por delante lo que el agente hubiera escrito en el Inbox sin enviar.
  // Por eso pide confirmacion antes de llamar a onLogout.
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false)
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, getThemeServerSnapshot);

  const toggleTheme = () => {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
  };
  const notificationsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showNotifications) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotifications]);
  const [loadItems, setLoadItems] = useState(2)
  const unread = conversations.filter(c => c.unreadCount > 0)
  const mobileSearchRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    if (showMobileSearch) mobileSearchRef.current?.focus();
  }, [showMobileSearch]);

  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-3 md:px-6 flex items-center justify-between gap-2 sticky top-0 z-30 shadow-xs dark:bg-slate-900/95 dark:border-slate-700/80">
      {/* Title & Connection Badges */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {/* Sidebar Toggle */}
        <button
          onClick={onToggleSidebar}
          className="p-2 -ml-1 text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-sm md:text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2 truncate">
            <currentTab.icon className="w-4 h-4 md:w-4.5 md:h-4.5 text-emerald-600 shrink-0" />
            <span className="truncate">{currentTab.title}</span>
          </h1>
          <div className="flex items-center gap-2.5 text-[11px] text  -slate-500 mt-0.5">
            <button
              type="button"
              onClick={onConnectWhatsapp}
              className={`hidden sm:inline-flex items-center gap-1.5 font-bold px-2 py-0.5 rounded-full border transition-colors ${whatsappStatus === 'active-session'
                  ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/60 dark:border-emerald-800'
                  : whatsappStatus === 'active-no-session'
                    ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200/60 dark:border-amber-800'
                    : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border-red-200/60 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-950/70'
                }`}

            >
              <span className={`w-2 h-2 rounded-full ${whatsappStatus === 'active-session'
                  ? 'bg-emerald-500'
                  : whatsappStatus === 'active-no-session'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-red-500'
                }`}></span>
              {whatsappStatus === 'active-session'
                ? sessionPhone
                  ? `WhatsApp: ${sessionPhone}`
                  : 'WhatsApp Activo: Con sesión'
                : whatsappStatus === 'active-no-session'
                  ? 'WhatsApp Activo: Sin sesión'
                  : 'Servicio de WhatsApp inactivo'}
            </button>
            {/* Quien es el dueño de la sesion abierta: el numero manda (identifica
                la linea sin ambiguedad) y el nombre del perfil acompaña si llega. */}
            {whatsappStatus === 'active-session' && sessionName && (
              <span
                className="hidden lg:inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800 max-w-[12rem] truncate"
                title={sessionPhone ? `${sessionName} · ${sessionPhone}` : sessionName}
              >
                <User className="w-3 h-3 shrink-0" />
                <span className="truncate">{sessionName}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Global Actions.
          min-w-0 + overflow-x-auto: red de seguridad -- si en algun ancho
          este grupo no cabe (varios botones con texto visibles a la vez),
          se vuelve desplazable en vez de quedar recortado en silencio por
          el overflow-x:hidden del body (que era justo lo que pasaba con
          el boton "GitHub Studio" en anchos tipo tablet, ~768px). */}
      <div className="flex items-center gap-1 md:gap-3 min-w-0">
        {/* Search Bar (>= lg) */}
        <div className="relative hidden lg:block w-60 shrink-0">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar contacto, tag, teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:bg-slate-800 dark:hover:bg-slate-700 dark:focus:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
          />
        </div>

        {/* Search Toggle (< lg) */}
        <button
          type="button"
          onClick={() => setShowMobileSearch(true)}
          className="lg:hidden p-2 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"          aria-label="Buscar"
          aria-expanded={showMobileSearch}
        >
          <Search className="w-4 h-4" />
        </button>

        {/* GitHub Export / Download Button.
            El texto aparece recien en lg para no competir por espacio justo en
            el rango de anchos mas apretado (tablets, ~768-1023px).
        <button
          onClick={onOpenGithubModal}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer hover:border-slate-300 shrink-0"
          title="Exportar proyecto para GitHub"
          aria-label="Exportar proyecto para GitHub"
        >
          <Github className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">GitHub Studio</span>
        </button>
        */}
        {/* Botón de conexión WhatsApp, solo visible en móvil (en desktop ya está el badge de arriba) */}
        <button
          type="button"
          onClick={onConnectWhatsapp}
          title={
            whatsappStatus === 'active-session' && sessionPhone
              ? `Sesión de ${sessionName ? `${sessionName} · ` : ''}${sessionPhone}`
              : undefined
          }
          aria-label={
            whatsappStatus === 'active-session'
              ? sessionPhone
                ? `WhatsApp activo con la sesión de ${sessionPhone}`
                : 'WhatsApp activo con sesión'
              : whatsappStatus === 'active-no-session'
                ? 'WhatsApp activo sin sesión'
                : 'Conectar WhatsApp'
          }
          className={`sm:hidden flex items-center justify-center w-9 h-9 rounded-xl transition-colors cursor-pointer shrink-0 ${whatsappStatus === 'active-session'
              ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
              : whatsappStatus === 'active-no-session'
                ? 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40'
                : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70'
            }`}
        >
          <MessageSquare className="w-4 h-4" />
        </button>

        {/* Alternar modo claro y oscuro */}
        <button
          type="button"
          onClick={toggleTheme}
          className="
            flex items-center justify-center
            w-9 h-9 rounded-xl
            text-slate-600 hover:text-slate-900
            hover:bg-slate-100
            dark:text-slate-300 dark:hover:text-white
            dark:hover:bg-slate-800
            transition-colors cursor-pointer shrink-0
          "
          title={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
          aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'}
          aria-pressed={theme === 'dark'}
        >
          {theme === 'dark' ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        {/* Notifications */}
        <div ref={notificationsRef} className='relative flex justify-center'>
          <button aria-label="Ver notificaciones" onClick={() => {
            setShowNotifications(!showNotifications)
            setShowUserOptions(false)
          }} className="p-2 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors relative cursor-pointer shrink-0">
            <Bell className="w-4 h-4" />
            {unread.length > 0 && (
              <span className="w-2 h-2 bg-emerald-500 rounded-full absolute top-1.5 right-1.5 ring-2 ring-white dark:ring-slate-900"></span>            )}
          </button>

          {showNotifications && (
            <div className="hidden md:flex md:flex-col absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl z-50">

              {unread.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <MessageSquare className="w-6 h-6 mx-auto mb-1" />
                  Bandeja de notificaciones vacia
                </div>
              ) : (
                unread.slice(0, loadItems).map(conv => {
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => {
                        onSelectConversationByContactId(conv.contactId)
                        setShowNotifications(false)
                      }}
                      className='w-full text-left bg-white dark:bg-slate-800 p-2 border-b border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-200 cursor-pointer hover:bg-slate-50/90 dark:hover:bg-slate-700 flex gap-2'
                    >
                      <div className="relative shrink-0">
                        <div className={`relative w-10 h-10 rounded-2xl ${getAvatarColor(conv.contact.name)} flex items-center justify-center text-white font-bold text-xl mx-auto mb-2 border-2 border-emerald-300 shadow-md overflow-hidden`}>
                          {getInitials(conv.contact.name)}
                          {conv.contact.avatar && (
                            <img
                              src={conv.contact.avatar}
                              alt={conv.contact.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-2xs border border-slate-100 dark:border-slate-700">                          {conv.channel === 'whatsapp' ? (
                            <WhatsAppIcon className="w-2.5 h-2.5 text-emerald-600" />
                          ) : conv.channel === 'instagram' ? (
                            <Instagram className="w-2.5 h-2.5 text-pink-600" />
                          ) : conv.channel === 'twitter' ? (
                            <XBrandIcon className="w-2.5 h-2.5 text-slate-900" />
                          ) : conv.channel === 'messenger' ? (
                            <MessengerIcon className="w-2.5 h-2.5 text-blue-600" />
                          ) : (
                            <Mail className="w-2.5 h-2.5 text-slate-600" />
                          )}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <h4 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                            {conv.contact.name}
                          </h4>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                            {conv.lastMessageTime}
                          </span>
                        </div>

                        <p className="text-xs text-slate-600 dark:text-slate-400 truncate mb-1.5 font-medium">
                          {conv.lastMessage}
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
              <button
                type="button"
                onClick={() => {
                  setLoadItems((prev) => prev + 2)
                }}
                className={`${loadItems >= unread.length ? 'hidden' : 'flex'} cursor-pointer font-bold items-center justify-center gap-2 w-full p-3 text-slate-600 dark:text-slate-300 text-xs shrink-0 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors`}
                aria-label="Cargar más notificaciones"
              >
                Cargar más mensajes <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>

        <div className='group relative flex justify-center items-center'>
          <button
            type="button"
            onClick={() => setShowUserOptions(!showUserOptions)}
            className="p-2 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"            aria-label="Opciones de usuario"
            aria-expanded={showUserOptions}
          >
            <User className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setShowUserOptions(false)
              setShowLogoutConfirm(true)
            }}
            aria-label="Cerrar sesión" className={`z-25
              absolute ml-1 p-2
              bg-white dark:bg-slate-800
              border border-slate-200 dark:border-slate-700
              text-slate-600 dark:text-slate-300
              hover:text-slate-800 dark:hover:text-white
              hover:bg-slate-100 dark:hover:bg-slate-700
              rounded-xl transition-colors cursor-pointer shrink-0
              top-full mt-1 md:top-auto md:mt-0
              ${showUserOptions ? 'block' : 'hidden'}
              md:hidden md:group-hover:block
            `}>
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <ConfirmDialog
          isOpen={showLogoutConfirm}
          onClose={() => setShowLogoutConfirm(false)}
          onConfirm={onLogout}
          title="¿Cerrar sesión?"
          message="Se cerrará tu sesión en este navegador. Tendrás que volver a entrar para ver tus conversaciones y campañas."
          confirmLabel="Cerrar sesión"
          cancelLabel="Cancelar"
          tone="danger"
        />

      </div>


      {/* Expanded Search Bar (< lg) */}
      {showMobileSearch && (
        <div className="absolute inset-0 z-20 flex items-center gap-2 bg-white dark:bg-slate-900 px-3 lg:hidden">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={mobileSearchRef}
              type="text"
              placeholder="Buscar contacto, tag, teléfono..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setShowMobileSearch(false); }}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 focus:bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium dark:bg-slate-800 dark:hover:bg-slate-700 dark:focus:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowMobileSearch(false)}
            className="p-2 text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"            aria-label="Cerrar búsqueda"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showNotifications && (
        <div className="absolute h-screen inset-x-0 top-0 z-20 flex flex-col bg-white dark:bg-slate-900 md:hidden">
          <button
            type="button"
            onClick={() => {
              setLoadItems(2)
              setShowNotifications(false)
            }}
            className="mb-4 font-bold flex gap-2 items-center w-full p-4 text-slate-500 dark:text-slate-200 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 rounded-b-xl shrink-0 shadow-lg"
            aria-label="Cerrar búsqueda"
          >
            <X className="w-4 h-4" /> Notificaciones
          </button>

          {unread.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              <MessageSquare className="w-6 h-6 mx-auto mb-1" />
              Bandeja de notificaciones vacia
            </div>
          ) : (
            unread.slice(0, loadItems).map(conv => {
              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelectConversationByContactId(conv.contactId)
                    setShowNotifications(false)
                  }}
                  className='w-full text-left bg-white dark:bg-slate-900 p-2 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer'
                >
                  <div className="relative shrink-0">
                    <div className={`relative w-10 h-10 rounded-2xl ${getAvatarColor(conv.contact.name)} flex items-center justify-center text-white font-bold text-xl mx-auto mb-2 border-2 border-emerald-300 shadow-md overflow-hidden`}>
                          {getInitials(conv.contact.name)}
                          {conv.contact.avatar && (
                            <img
                              src={conv.contact.avatar}
                              alt={conv.contact.name}
                              className="absolute inset-0 w-full h-full object-cover"
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                    <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center shadow-2xs border border-slate-100 dark:border-slate-700">
                      {conv.channel === 'whatsapp' ? (
                        <WhatsAppIcon className="w-2.5 h-2.5 text-emerald-600" />
                      ) : conv.channel === 'instagram' ? (
                        <Instagram className="w-2.5 h-2.5 text-pink-600" />
                      ) : conv.channel === 'twitter' ? (
                        <XBrandIcon className="w-2.5 h-2.5 text-slate-900 dark:text-slate-100" />
                      ) : conv.channel === 'messenger' ? (
                        <MessengerIcon className="w-2.5 h-2.5 text-blue-600" />
                      ) : (
                        <Mail className="w-2.5 h-2.5 text-slate-600" />
                      )}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <h4 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 truncate">
                        {conv.contact.name}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-semibold shrink-0">
                        {conv.lastMessageTime}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate mb-1.5 font-medium">
                      {conv.lastMessage}
                    </p>
                  </div>
                </button>
              );
            })
          )}

          <button
            type="button"
            onClick={() => {
              setLoadItems((prev) => prev + 2)
            }}
            className={`${loadItems >= unread.length ? 'hidden' : 'flex'} mt-4 font-bold gap-2 items-center justify-center w-full p-4 text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border-t border-slate-200 dark:border-slate-700 rounded-t-xl shrink-0 cursor-pointer transition-colors`}
            aria-label="Cerrar búsqueda"
          >
            Cargar más mensajes <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
};
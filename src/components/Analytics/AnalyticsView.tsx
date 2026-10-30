import React from 'react';
import { AnalyticsData } from '../../types';
import { 
  BarChart3, TrendingUp, Clock, Users, Zap, DollarSign, Sparkles,
  MessageCircle, Rocket, Target, PartyPopper, Flame, Instagram
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, 
  XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar 
} from 'recharts';
import { WhatsAppIcon, XBrandIcon, MessengerIcon } from '@/components/Icons/ChannelIcons';
interface AnalyticsViewProps {
  data: AnalyticsData;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ data }) => {
  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans [--chart-grid:#cbd5e1] dark:[--chart-grid:#475569] [--chart-axis:#64748b] dark:[--chart-axis:#cbd5e1]">
      {/* Top Bar Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" />
            <span>Analítica en Tiempo Real & Toma de Decisiones</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium flex items-center gap-1">
            <BarChart3 className="w-3.5 h-3.5" /> Métricas clave de volumen omnicanal, eficiencia de agentes, tasa de conversión y ROI de marketing.
          </p>
        </div>
      </div>

      {/* Main Charts & KPI Canvas */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {/* KPI CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-5 shadow-xs hover:shadow-md dark:hover:shadow-black/30 transition-all space-y-2 hover:scale-[1.01] dark:hover:border-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><MessageCircle className="w-3 h-3" /> Conversaciones</span>
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-400 rounded-2xl shadow-2xs">
                <Users className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.totalConversations.toLocaleString()}</div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
              <Rocket className="w-3 h-3" />
              <span>+18.4% este mes</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-5 shadow-xs hover:shadow-md dark:hover:shadow-black/30 transition-all space-y-2 hover:scale-[1.01] dark:hover:border-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><Zap className="w-3 h-3" /> Tiempo SLA</span>
              <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 rounded-2xl shadow-2xs">
                <Clock className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.avgResponseTimeMin} min</div>
            <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              <span>Optimizado con IA Gemini</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-5 shadow-xs hover:shadow-md dark:hover:shadow-black/30 transition-all space-y-2 hover:scale-[1.01] dark:hover:border-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><Target className="w-3 h-3" /> Conversión</span>
              <div className="p-2.5 bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-400 rounded-2xl shadow-2xs">
                <TrendingUp className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.leadConversionRate}%</div>
            <div className="text-[11px] text-indigo-700 font-extrabold flex items-center gap-1"><PartyPopper className="w-3 h-3" /> 380 Ventas Ganadas</div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-5 shadow-xs hover:shadow-md dark:hover:shadow-black/30 transition-all space-y-2 hover:scale-[1.01] dark:hover:border-slate-600">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><DollarSign className="w-3 h-3" /> ROI Marketing</span>
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 rounded-2xl shadow-2xs">
                <DollarSign className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-slate-900 dark:text-slate-100">{data.campaignRoi}%</div>
           <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1"><Flame className="w-3 h-3" /> 4.1x Retorno Inversión</div>
          </div>
        </div>

        {/* CHARTS ROW 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Growth Area Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Evolución Mensual de Conversiones de Leads</span>
              </h3>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyConversions}>
                  <defs>
                    <linearGradient id="colorClosed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="var(--chart-grid)"
                    strokeWidth={1.2}
                  />
                  <XAxis dataKey="month" stroke="var(--chart-axis)" strokeWidth={1.5} fontSize={11} />
                  <YAxis stroke="var(--chart-axis)" strokeWidth={1.5} fontSize={11} />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                    contentStyle={{
                      borderRadius: '16px',
                      fontSize: '12px',
                      backgroundColor: 'var(--chart-tip-bg)',
                      border: '1px solid var(--chart-tip-border)',
                      color: 'var(--chart-tip-text)',
                    }}
                    labelStyle={{ color: 'var(--chart-tip-text)' }}
                    itemStyle={{ color: 'var(--chart-tip-text)' }}
                  />
                  <Area type="monotone" dataKey="closed" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorClosed)" name="Ventas Cerradas" />
                  <Area type="monotone" dataKey="leads" stroke="#cbd5e1" strokeWidth={2} fillOpacity={0.1} fill="#cbd5e1" name="Leads Totales" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Channel Distribution Donut Chart */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-6 shadow-xs space-y-4">
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-emerald-600" />
              <span>Distribución de Mensajes por Canal Social</span>
            </h3>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.channelBreakdown}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="channel"
                  >
                    {data.channelBreakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '16px',
                      fontSize: '12px',
                      backgroundColor: 'var(--chart-tip-bg)',
                      border: '1px solid var(--chart-tip-border)',
                      color: 'var(--chart-tip-text)',
                    }}
                    labelStyle={{ color: 'var(--chart-tip-text)' }}
                    itemStyle={{ color: 'var(--chart-tip-text)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap justify-center gap-4 text-xs font-bold pt-2">
              {data.channelBreakdown.map(item => (
                <div key={item.channel} className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="capitalize text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    {item.channel === 'whatsapp' ? <WhatsAppIcon className="w-3.5 h-3.5" /> : item.channel === 'instagram' ? <Instagram className="w-3.5 h-3.5" /> : item.channel === 'twitter' ? <XBrandIcon className="w-3.5 h-3.5" /> : <MessengerIcon className="w-3.5 h-3.5" />}
                    {item.channel === 'whatsapp' ? 'WhatsApp' : item.channel === 'instagram' ? 'Instagram' : item.channel === 'twitter' ? 'X / Twitter' : 'Messenger'}: {item.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CHARTS ROW 2: Sentiment Bar Chart */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 rounded-3xl p-6 shadow-xs space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            <span>Análisis de Sentimiento de Clientes por Inteligencia Artificial</span>
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.sentimentBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
                <XAxis dataKey="sentiment" stroke="var(--chart-axis)" fontSize={11} />
                <YAxis stroke="var(--chart-axis)" fontSize={11} />
                <Tooltip
                  cursor={{ fill: 'rgba(148, 163, 184, 0.10)' }}
                  contentStyle={{
                    borderRadius: '16px',
                    fontSize: '12px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#e2e8f0',
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                />
                <Bar dataKey="count" radius={[12, 12, 0, 0]}>
                  {data.sentimentBreakdown.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

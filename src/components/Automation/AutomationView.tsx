import React, { useState } from 'react';
import { AutomationRule } from '../../types';
import {
  Zap, Play, CheckCircle2, Sparkles, ArrowRight, Activity, Trash2,
  Bot, Mail, Sprout, Tag, BarChart3, Plug, User, Pause, BarChart2
} from 'lucide-react';
import { Button, Modal } from '../ui';

interface AutomationViewProps {
  automations: AutomationRule[];
  onToggleRule: (ruleId: string) => void;
  onSimulateRuleTrigger: (ruleId: string) => void;
  onDeleteAutomation: (ruleId: string) => void;
}

export const AutomationView: React.FC<AutomationViewProps> = ({
  automations,
  onToggleRule,
  onSimulateRuleTrigger,
  onDeleteAutomation
}) => {
  const [testNotification, setTestNotification] = useState<string | null>(null);
  const [ruleToDelete, setRuleToDelete] = useState<AutomationRule | null>(null);

  const handleTestTrigger = (rule: AutomationRule) => {
    onSimulateRuleTrigger(rule.id);
    setTestNotification(`Regla "${rule.name}" probada con éxito. Ejecutadas ${rule.actions.length} acciones.`);
    setTimeout(() => setTestNotification(null), 4000);
  };

  const getTriggerEmoji = (trigger: string) => {
    switch (trigger) {
      case 'message_received': return <><Mail className="w-3 h-3" /> Mensaje Entrante</>;
      case 'lead_created': return <><Sprout className="w-3 h-3" /> Lead Creado</>;
      case 'tag_added': return <><Tag className="w-3 h-3" /> Etiqueta Asignada</>;
      case 'stage_changed': return <><BarChart3 className="w-3 h-3" /> Cambio de Etapa Funnel</>;
      default: return <><Zap className="w-3 h-3" /> Disparador</>;
    }
  };

  const getActionBadge = (action: { type: string; targetValue: string }) => {
    switch (action.type) {
      case 'send_ai_reply':
        return <span className="px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"><Sparkles className="w-3 h-3" /> Enviar Respuesta IA: {action.targetValue}</span>;
      case 'add_tag':
        return <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"><Tag className="w-3 h-3" /> Añadir Tag: {action.targetValue}</span>;
      case 'change_stage':
        return <span className="px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"><BarChart2 className="w-3 h-3" /> Mover Etapa: {action.targetValue}</span>;
      case 'call_webhook':
        return <span className="px-2.5 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"><Plug className="w-3 h-3" /> Disparar Webhook</span>;
      case 'assign_agent':
        return <span className="px-2.5 py-1 bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 rounded-xl text-xs font-bold shadow-2xs flex items-center gap-1"><User className="w-3 h-3" /> Asignar Asesor: {action.targetValue}</span>;
      default:
        return <span className="px-2.5 py-1 bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold">{action.type}</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">      
    {/* Top Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between shadow-2xs">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" />
            <span>Automatizaciones, Flujos & Reglas IA</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" /> Automatiza respuestas fuera de horario, etiquetado de leads, asignación de agentes y disparos de Webhooks API.
          </p>
        </div>
      </div>

      {/* Notification Toast */}
      {testNotification && (
        <div className="m-6 mb-0 p-3.5 bg-emerald-100 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 rounded-2xl text-xs font-extrabold flex items-center gap-2 shadow-sm animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{testNotification}</span>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN DE AUTOMATIZACION */}
      <Modal
        isOpen={ruleToDelete != null}
        onClose={() => setRuleToDelete(null)}
        title="🗑️ Eliminar regla"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRuleToDelete(null)}
            >
              Cancelar
            </Button>

            <Button
              variant="danger"
              onClick={() => {
                if (ruleToDelete) {
                  onDeleteAutomation(ruleToDelete.id);
                  setRuleToDelete(null);
                }
              }}
            >
              Eliminar automatizacion
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-md text-black dark:text-slate-200">
            ¿Estás seguro de que deseas eliminar la regla?
          </p>

          {ruleToDelete && (
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl">
              <p className="text-md font-extrabold text-red-800 dark:text-red-300">
                {ruleToDelete.name}
              </p>
            </div>
          )}

          <p className="text-md text-black dark:text-slate-300">
            Esta acción no se puede deshacer.
          </p>
        </div>
      </Modal>

      {/* Rules List */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        <div className="grid grid-cols-1 gap-4">
          { (!automations || automations.length <= 0) && (
            <div className='flex items-center justify-center w-screen'>
              <p className='pt-32 text-2xl'>Sin contenido que mostrar</p>
            </div>)
          }
          {automations.map(rule => (
            <div
              key={rule.id}
              className={`bg-white dark:bg-slate-900 border rounded-3xl p-5 shadow-xs transition-all space-y-4 ${
                rule.enabled
                  ? 'border-indigo-200/80 dark:border-indigo-800/60 bg-white dark:bg-slate-900'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/60 opacity-80'
              }`}
            >
              {/* En movil la cabecera se apila: los tres botones no entran al lado del
                  titulo y quedaban fuera de pantalla. */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shadow-2xs ${
                    rule.enabled
                      ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                      <span>{rule.name}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-black rounded-full border flex items-center gap-1 ${
                        rule.enabled
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600'
                      }`}>
                        {rule.enabled ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Activa</> : <><span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Pausada</>}
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold mt-0.5 flex items-center gap-1">
                      <BarChart3 className="w-3 h-3" /> Ejecutada {rule.triggerCount} veces • Último disparo: {rule.lastTriggered || 'Recientemente'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() => {setRuleToDelete(rule)}}
                    title="Eliminar regla"
                    aria-label="Eliminar regla"
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                  <button
                    onClick={() => handleTestTrigger(rule)}
                    className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-extrabold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Probar Disparador</span>
                  </button>

                  <button
                    onClick={() => onToggleRule(rule.id)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                      rule.enabled
                        ? 'bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : 'bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    {rule.enabled ? <><Pause className="w-3.5 h-3.5" /> Pausar</> : <><Play className="w-3.5 h-3.5" /> Activar</>}
                  </button>
                </div>
              </div>

              {/* Trigger & Actions Diagram */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">CUANDO:</span>
                  <span className="px-2.5 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl font-bold text-slate-800 dark:text-slate-100 shadow-2xs flex items-center gap-1">
                    {getTriggerEmoji(rule.triggerEvent)}
                  </span>
                </div>

                <ArrowRight className="w-4 h-4 text-slate-400 hidden md:block" />

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">ENTONCES EJECUTAR:</span>
                  {rule.actions.map((act, i) => (
                    <span key={i}>{getActionBadge(act)}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

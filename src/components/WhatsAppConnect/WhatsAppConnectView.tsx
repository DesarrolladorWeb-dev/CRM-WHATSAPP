'use client';

import React, { useState, useEffect, useEffectEvent } from 'react';

/**
 * Tiempo que se muestra cada QR antes de pedir uno nuevo al servicio.
 *
 * El servicio de WhatsApp (puerto 3001) es quien genera el QR; el CRM solo
 * controla cada cuanto lo renueva. Al agotarse este plazo se solicita un QR
 * nuevo automaticamente, sin que el usuario tenga que pulsar el boton. Si el
 * servicio emite un QR nuevo antes (qr-update), el plazo vuelve a empezar.
 */
const QR_REFRESH_SECONDS = 40;

interface QrData {
  image: string;
  expiresAt: number;
  createdAt: string;
}

interface WhatsAppConnectViewProps {
  connectionStatus?: 'connected' | 'qr-ready' | 'disconnected';
  qrData?: QrData | null;
  onRequestQr?: () => void;
  /** Cierra la sesion actual en el servicio para poder vincular otra cuenta. */
  onDisconnect?: () => Promise<void> | void;
}

export function WhatsAppConnectView({
  connectionStatus = 'disconnected',
  qrData = null,
  onRequestQr,
  onDisconnect,
}: WhatsAppConnectViewProps) {
  // Plazo del QR que se esta mostrando. `key` identifica el QR para ignorar
  // el temporizador de uno anterior mientras llega el primer tick del nuevo.
  const [qrTimer, setQrTimer] = useState<{ key: string; deadline: number; now: number } | null>(null);
  // Dos pasos a proposito: desvincular tumba el canal real del CRM, no es un
  // boton que convenga disparar de un solo clic accidental.
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const isConnected = connectionStatus === 'connected';
  const isQrReady = connectionStatus === 'qr-ready' && !!qrData?.image;
  const qrKey = isQrReady && qrData ? `${qrData.createdAt}|${qrData.expiresAt}` : null;

  // Se lee siempre la version mas reciente de onRequestQr sin reiniciar el
  // temporizador cada vez que el padre re-renderiza.
  const requestNewQr = useEffectEvent(() => {
    onRequestQr?.();
  });

  useEffect(() => {
    if (!qrKey || isConnected) return;

    const deadline = Date.now() + QR_REFRESH_SECONDS * 1000;
    let refreshed = false;

    const tick = () => {
      const current = Date.now();
      setQrTimer({ key: qrKey, deadline, now: current });
      if (current >= deadline && !refreshed) {
        // Una sola peticion por QR: si falla, queda el boton manual.
        refreshed = true;
        clearInterval(interval);
        requestNewQr();
      }
    };
    // Primer tick inmediato (asíncrono) para mostrar la cuenta atrás completa
    // en cuanto llega un QR nuevo.
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 1000);

    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [qrKey, isConnected]);

  const timeLeft = qrTimer && qrTimer.key === qrKey
    ? Math.max(0, Math.ceil((qrTimer.deadline - qrTimer.now) / 1000))
    : QR_REFRESH_SECONDS;

  // Al soltarse la sesion el boton ya no aplica: no dejes la confirmacion
  // abierta. Se ajusta durante el render en vez de en un efecto.
  const [prevIsConnected, setPrevIsConnected] = useState(isConnected);
  if (isConnected !== prevIsConnected) {
    setPrevIsConnected(isConnected);
    if (!isConnected) {
      setConfirmingDisconnect(false);
      setDisconnecting(false);
    }
  }

  const handleDisconnect = async () => {
    if (!onDisconnect || disconnecting) return;
    setDisconnecting(true);
    try {
      await onDisconnect();
      setConfirmingDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  };

  const isExpired = isQrReady && timeLeft <= 0;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl">
        <h1 className="text-lg font-bold text-white">Conecta tu WhatsApp Business</h1>
        <p className="mt-2 text-sm text-slate-400">
          Escanea el código con WhatsApp para vincular tu cuenta y empezar a recibir mensajes.
        </p>

        {/* QR Code Display */}
        <div className="mx-auto mt-6 flex h-56 w-56 items-center justify-center rounded-xl bg-white p-3">
          {isConnected ? (
            <div className="flex flex-col items-center gap-2">
              <svg className="h-16 w-16 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-sm font-semibold text-emerald-600">Conectado</span>
            </div>
          ) : isQrReady && !isExpired ? (
            <img
              src={qrData!.image}
              alt="QR WhatsApp"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-300 border-t-emerald-500" />
              <span className="text-xs text-slate-500">Generando código...</span>
            </div>
          )}
        </div>

        {/* Status & Timer */}
        <div className="mt-6 flex flex-col items-center gap-2">
          {isConnected ? (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Conectado exitosamente
            </div>
          ) : isQrReady && !isExpired ? (
            <>
              <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
                Escanea el código QR
              </div>
              {timeLeft > 0 && (
                <span className="text-xs text-slate-500">
                  Expira en {timeLeft}s
                </span>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
              Esperando conexión...
            </div>
          )}
        </div>

        {/* Request New QR Button */}
        {(!isQrReady || isExpired) && !isConnected && onRequestQr && (
          <button
            onClick={onRequestQr}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Solicitar nuevo código
          </button>
        )}

        {/* Desvincular: la unica salida cuando la sesion activa es de otra cuenta */}
        {isConnected && onDisconnect && (
          <div className="mt-4">
            {confirmingDisconnect ? (
              <div className="rounded-lg border border-red-900/60 bg-red-950/40 p-3">
                <p className="text-xs text-red-200">
                  Se cerrara la sesion de WhatsApp y el CRM dejara de enviar y recibir
                  mensajes hasta que escanees un codigo nuevo.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                  >
                    {disconnecting ? 'Desvinculando...' : 'Si, desvincular'}
                  </button>
                  <button
                    onClick={() => setConfirmingDisconnect(false)}
                    disabled={disconnecting}
                    className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDisconnect(true)}
                className="rounded-lg border border-red-900/60 px-4 py-2 text-sm font-semibold text-red-400 transition-colors hover:bg-red-950/40"
              >
                Desvincular cuenta
              </button>
            )}
          </div>
        )}

        <ol className="mt-6 space-y-1 text-left text-xs text-slate-500">
          <li>1. Abre WhatsApp en tu teléfono</li>
          <li>2. Ve a Configuración → Dispositivos vinculados</li>
          <li>3. Toca &quot;Vincular un dispositivo&quot; y escanea este código</li>
        </ol>

    
      </div>
    </div>
  );
}
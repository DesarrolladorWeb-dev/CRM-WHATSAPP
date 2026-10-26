import type { Metadata } from 'next';
import './globals.css';
import { Suspense } from 'react';
import Script from 'next/script';
import { themeScript } from '@/lib/theme';

// Sin NEXT_PUBLIC_GA_ID no se monta nada: en desarrollo no hay que ensuciar las
// metricas con las visitas del equipo. El CSP de next.config.mjs abre los
// permisos de googletagmanager solo cuando esta variable existe.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const metadata: Metadata = {
  title: 'XIO - CRM Omnicanal & WhatsApp AI Copilot',
  description: 'Plataforma Omnicanal XIO para WhatsApp Web, Instagram, X y Messenger con Inteligencia Artificial Gemini y persistencia MongoDB.',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2325D366"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.82.49 3.53 1.34 5L2 22l5.2-1.31C8.61 21.49 10.26 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2z"/></svg>',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Tema antes del primer pintado: evita el destello blanco al recargar. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
      </head>
      <body className="bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 min-h-screen antialiased selection:bg-emerald-500 selection:text-white">
        <Suspense fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-slate-400">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-sm font-semibold tracking-wider text-emerald-400">Cargando XIO...</span>
            </div>
          </div>
        }>
          {children}
        </Suspense>
      </body>
    </html>
  );
}

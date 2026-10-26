# Contexto General del Proyecto: whato-crm (Whato)

## 1. Visión General
**whato-crm** (mostrado en pantalla como **Whato**) es una plataforma omnicanal de gestión de relaciones con clientes (CRM) y ventas diseñada específicamente para **WhatsApp Web**, Instagram, X (Twitter) y Messenger. Combina un tablero Kanban visual, automatización de flujos de trabajo, motor de persistencia en **MongoDB** y asistentes de Inteligencia Artificial impulsados por **Google Gemini 3.6 Flash**.

La aplicación proporciona una interfaz fluida para equipos de ventas, permitiendo calificar leads, automatizar campañas masivas de difusión, generar respuestas inteligentes asistidas por IA, gestionar respuestas rápidas y botones persistentes con imágenes adjuntas, y operar en una arquitectura unificada Full Stack en **Next.js**.

> ⚠️ **Estado real vs. visión de producto:** este archivo describe el diseño previsto de Whato. Hoy no existe modelo de usuarios/roles (la "gestión interna multiagente" es un campo de texto libre por conversación, no cuentas reales), no hay integración con Google Calendar en el código, y los canales de mensajería no están conectados — todo mensaje "entrante" se simula localmente. Detalle completo en [`AUDITORIA.md`](./AUDITORIA.md).

---

## 2. Arquitectura y Stack Tecnológico

- **Frontend & Backend Unificado:** Next.js 15+ (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide React (Iconografía), Recharts (Analítica).
- **Base de Datos & Persistencia:** **MongoDB** (`whato-crm`) gestionado a través de **Mongoose** con patrón singleton para conexión en caliente y endpoints API dedicados.
- **Motor de Inteligencia Artificial:** `@google/genai` (SDK Oficial de Google Gen AI) utilizando el modelo `gemini-3.6-flash` en el servidor mediante Next.js Route Handlers.
- **Servidor:** Next.js Full Stack escuchando en `http://localhost:3000` (puerto configurable).

---

## 3. Módulos Principales de la Aplicación

### 3.1. Inbox WhatsApp & Chat Omnicanal (`/src/components/Inbox/InboxView.tsx`)

> 🟡 Módulo con UI completa pero canales simulados: no hay conexión real a WhatsApp/Instagram/X/Messenger. Ver [`AUDITORIA.md`](./AUDITORIA.md#10-integración-whatsapp).

- **Filtrado de Conversaciones:** Filtrado rápido por canal (WhatsApp, Instagram, Twitter/X, Messenger). El campo "agente asignado" es texto libre, no una cuenta de usuario real.
- **Interfaz Estilo WhatsApp Web:** Renderizado de hilos de chat con badges de estado, remitentes, marcas de tiempo e indicación de mensajes de bot/agente.
- **Panel de Extensión Whato (Lado Derecho):**
  - Estado del lead y Score de Inteligencia Artificial (0-100).
  - Selector de etapa del embudo de ventas (Prospecto, Cualificado, Negociación, Venta Ganada, Perdido).
  - Gestor dinámico de etiquetas WhatsApp y bloc de notas rápidas del cliente.

  ❌ No hay integración con Google Calendar en el código actual — se retira de esta lista hasta que exista un cliente/endpoint real.
- **Acciones Asistidas por IA:**
  - **Respuestas Rápidas Inteligentes (Smart Replies):** Genera 3 opciones contextuales (Amigable, Formal, Cierre) según el historial del chat usando Gemini.
  - **Resumen Ejecutivo IA:** Analiza el hilo completo para extraer intención principal, objeciones y el siguiente paso sugerido.
  - **Notas de Voz Simuladas:** Envío rápido de audios preseteados.

### 3.2. Gestor de Respuestas Rápidas y Botones Disponibles (`/src/components/Inbox/QuickRepliesModal.tsx`)
- Creación ilimitada de botones de respuesta rápida personalizados.
- Almacenamiento persistente en MongoDB y en almacenamiento local.
- Variables dinámicas `{nombre}`, `{empresa}`, `{canal}`, `{agente}` que se sustituyen en vivo al enviar.
- Galería de imágenes adjuntas predefinidas y subida de archivos/URLs personalizadas.
- Vista previa interactiva estilo WhatsApp Web.

### 3.3. CRM Kanban & Embudo de Clientes (`/src/components/Contacts/ContactsView.tsx`)
- **Tablero Kanban Interactivo:**
  - Columnas por etapa del embudo (*Prospectos Iniciales*, *Cualificados*, *En Negociación*, *Venta Ganada 🎉*, *Perdidos*).
  - Cálculo automático del valor total del Pipeline y ventas cerradas ganadas en USD.
  - Cambio rápido de etapa mediante menú desplegable o acceso directo a WhatsApp.
- **Vista de Tabla Alternativa:** Presentación detallada con ordenamiento, estado de IA, canal de origen y etiquetas.
- **Modal de Creación de Clientes:** Registro inmediato de nuevos leads asignando teléfono, empresa, valor de oportunidad y tags.

### 3.4. Segmentos de Leads (`/src/components/Segments/SegmentsView.tsx`)
- Creación de audiencias con criterios avanzados (etiquetas, score de IA mínimo, canal y etapa del embudo).
- Conexión directa para iniciar campañas masivas de difusión filtradas por segmento.

### 3.5. Difusión Masiva & Asistente IA de Copywriting (`/src/components/Campaigns/CampaignsView.tsx`)
- Creación, revisión y envío de campañas de difusión masiva. *(✅ lógica implementada)*
- **Generador de Copy Publicitario con Gemini:** Crea 3 variaciones ajustadas según el tono de voz y el canal destino (hashtags recomendados, emojis y llamadas a la acción CTA). *(✅ generación con IA real)*
- **Resolución de audiencia real:** el segmento se ejecuta contra la base de contactos y produce la lista efectiva de destinatarios, filtrada por canal, dirección válida y baja de difusión (`optedOut`). Ver `src/lib/services/audienceService.ts`.
- **Ciclo de vida protegido:** `draft → scheduled → running → completed` (+ `paused`, `failed`, `cancelled`), con transiciones validadas en el servidor. Una campaña completada no se puede relanzar ni editar. Ver `src/lib/services/campaignStatus.ts`.
- **Envío con registro por destinatario:** cada intento queda en `campaign_recipients` con su estado, dirección y error. El índice único `(campaign_id, contact_id)` impide el doble envío aunque se relance.
- **Guardar ≠ enviar:** `POST /api/campaigns` solo persiste; el envío exige `POST /api/campaigns/[id]/send`, previa confirmación sobre `GET /api/campaigns/[id]/preview`.
- ✅ Estadísticas de envío, entrega y apertura se calculan agregando `campaign_recipients` y se alimentan de los acuses de recibo de WhatsApp.
- ⚠️ `clickRate` y `conversions` siguen a 0: requieren enlaces con seguimiento y una definición de conversión que el producto aún no tiene. Se dejan a cero a propósito en vez de inventar un número.
- ⚠️ Solo WhatsApp tiene transporte conectado. Instagram, X, Messenger y email están declarados en `src/lib/services/channels.ts` pero sin `send`: sus envíos se registran como `skipped`, nunca como enviados.

### 3.6. Flujos & Automatizaciones (`/src/components/Automation/AutomationView.tsx`)
- Interfaz de reglas activadas por disparadores (Trigger: palabras clave, etiquetas añadidas, inactividad, cambio de etapa).
- ⚠️ El "simulador de ejecución" solo incrementa un contador de la regla; ninguna regla se evalúa aún contra mensajes o eventos reales.

### 3.7. Analítica & Cuadros de Mando (`/src/components/Analytics/AnalyticsView.tsx`)
- Métricas y gráficos de conversión, SLA de respuesta, sentimiento y ROI de campañas.
- ⚠️ Todos los valores provienen de un dataset de ejemplo fijo (`INITIAL_ANALYTICS`); no se calculan a partir de los contactos/mensajes reales de la base de datos.

### 3.8. Playground API & MongoDB (`/src/components/ApiGithub/ApiGithubView.tsx`)
- Consola de pruebas en vivo para todos los endpoints Route Handlers de Next.js. *(✅ ejecuta peticiones reales contra la app)*
- Generador de API Keys con permisos granulares (`read:contacts`, `write:messages`, `admin:all`). ⚠️ Ninguna ruta del backend valida estas keys todavía — son decorativas.
- Simulador de Webhooks: genera un log de "entrega" y una cadena etiquetada como firma. ⚠️ Esa firma **no es HMAC-SHA256**, es el payload codificado en hexadecimal (reversible), no debe tratarse como verificación de integridad.

---

## 4. Instrucciones de Ejecución

1. **Variables de Entorno:**
   ```bash
   cp .env.example .env.local
   # Configurar GEMINI_API_KEY y MONGODB_URI en .env.local
   ```
2. **Población Inicial de Base de Datos:**
   ```bash
   npm run migrate
   ```
3. **Servidor de Desarrollo:**
   ```bash
   npm run dev
   ```
   Acceder a `http://localhost:3000`.

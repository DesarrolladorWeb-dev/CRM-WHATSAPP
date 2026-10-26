# Auditoría técnica y funcional — Whato CRM

> Diagnóstico de solo lectura sobre el código del repositorio (no sobre la documentación previa). Fecha: 2026-08-24. No se aplicaron cambios de código durante esta revisión; los `README.md`, `DOCUMENTACION.md` y `PROJECT_CONTEXT.md` sí fueron corregidos a partir de estos hallazgos.

## Resumen

Whato es un **prototipo funcional de CRM omnicanal**: la interfaz (Inbox, Kanban, Segmentos, Campañas, Automatizaciones, Analítica, Playground de API) está muy desarrollada y el asistente de IA (Gemini) funciona de extremo a extremo. Pero **no hay ninguna integración real con WhatsApp, Instagram, X, Messenger ni Google Calendar** — todo el tráfico de mensajes que se ve en pantalla se genera localmente. Tampoco existe autenticación en ninguna ruta de la API, ni un modelo de usuarios/roles.

## 1–9. Qué es, para quién, y con qué stack

- **Qué es:** una SPA Next.js (App Router) de un único componente cliente (`src/app/page.tsx`, ~600 líneas) que concentra todo el estado y lo reparte por props a 8 vistas. El backend son *Route Handlers* delgados que hacen CRUD directo sobre Mongoose, con *fallback* automático a datos de ejemplo (`src/mockData.ts`) si MongoDB no está disponible.
- **Para quién:** la documentación habla de "equipos multiagente", pero no existe modelo `User` ni login — `assignedAgent` es un string libre. El usuario real hoy es una sola persona explorando la demo.
- **Stack verificado:** Next.js 15.2 · React 19 · TypeScript (`strict: false`) · Tailwind CSS v4 · MongoDB + Mongoose 8.13 · `@google/genai` (Gemini) · sin auth, sin CI/CD, sin Docker, sin tests.
- **Arquitectura:** monolito de dos capas, sin capa de servicios ni repositorios. Solo **Contactos** y **Conversaciones** se releen desde `/api/*` al montar la app; Segmentos, Campañas, Automatizaciones, API Keys y Webhook Logs quedan fijos en el estado de ejemplo aunque sus endpoints y modelos existan.
- **Integraciones reales:** únicamente Gemini (server-side, key nunca expuesta al cliente) y MongoDB (opcional). WhatsApp/Instagram/X/Messenger/Calendar/GitHub son solo texto de producto o simuladores en el cliente.

## 10. Integración WhatsApp

**❌ No implementada.** No hay cliente de WhatsApp Business Cloud API ni de ningún proveedor (Twilio, Baileys, etc.) en `package.json` ni en el código. No hay ruta que reciba webhooks de Meta ni verificación de firma entrante. "Enviar mensaje" solo actualiza el estado de React y, en segundo plano, hace `POST /api/messages` sin esperar el resultado. El botón *"Simular mensaje entrante"* elige un canal al azar y una de tres preguntas fijas — es la única fuente de mensajes "entrantes" que existe hoy.

## 11. Seguridad

| Severidad | Hallazgo | Ubicación |
| :-- | :-- | :-- |
| 🔴 Crítico | Cero autenticación/autorización en las 14 rutas de la API, incluyendo `POST /api/seed` que borra y repuebla toda la base de datos | `src/app/api/**/route.ts` |
| 🔴 Crítico | Asignación masiva sin validación de esquema: `POST`/`PUT` vuelcan el `body` recibido directo a Mongoose (`{ $set: body }`), sin `zod`/`yup` ni allowlist | `api/contacts`, `api/conversations`, `api/campaigns`, `api/automations` |
| 🟠 Alto | La "firma HMAC-SHA256" del simulador de webhook es en realidad `Buffer.from(...).toString('hex')` — hex plano y reversible, no un hash | `api/webhooks/test/route.ts:14` |
| 🟠 Alto | Sin rate limiting en los endpoints de IA — expuestos a agotar la cuota/presupuesto de Gemini | `api/ai/*` |
| 🟡 Medio | API Keys guardadas en texto plano y sin verificación real por ninguna ruta — la sección "API Keys" es decorativa | `src/models/ApiKey.ts` |
| 🟡 Medio | `next.config.mjs` permite imágenes remotas de cualquier host (`hostname: '**'`), combinado con `imageUrl` de texto libre en Quick Replies/Campañas | `next.config.mjs:14` |
| 🟢 Bajo | Mensajes de error internos (`error.message`) devueltos tal cual al cliente | bloques `catch` en las rutas API |

## 12. Calidad del código

- `page.tsx` es un *god component* (~600 líneas, sin Context/store) que concentra estado y lógica de negocio de los 8 módulos.
- El patrón CRUD (try/catch + fallback) se repite casi idéntico en 6 archivos `route.ts` — candidato a una factory de handlers compartida.
- **Datos de ejemplo triplicados y divergentes:** `src/mockData.ts`, `scripts/migrate.mjs` y los *fallbacks* inline de las rutas de IA tienen contenido distinto entre sí (ya ocurrió una deriva real: ids y textos no coinciden).
- `scripts/migrate.mjs` lee `mockData.ts` a un string pero nunca usa ese contenido — código muerto.
- `tsconfig.json` tiene `"strict": false"`; `npm run lint` apunta a `next lint` pero no hay configuración de ESLint en el repo.
- El id de modelo `gemini-3.6-flash` está hardcodeado en 4 rutas; si no es válido, las llamadas reales de IA fallarán (hoy queda oculto por la respuesta de *fallback* cuando falta `GEMINI_API_KEY`).

## 13. Rendimiento

- Los `GET` de `contacts`, `segments`, `quick-replies`, `campaigns` y `automations` insertan datos de ejemplo si la colección está vacía — una lectura puede disparar escrituras y latencia inesperadas.
- Segmentos, Campañas, Automatizaciones, API Keys, Webhook Logs y Analítica nunca releen la API tras el montaje inicial — recargar la página siempre vuelve a los datos de fábrica.
- Toda la app es un único árbol de client components (`'use client'` en la raíz) — sin Server Components ni streaming pese a usar Next 15 App Router.
- Todas las imágenes usan `<img>` planas (13 ocurrencias) en vez de `next/image`, aunque `next.config.mjs` ya está configurado para optimizarlas.

## 14. Testing

**0% de cobertura** — no hay archivos `*.test.*`/`*.spec.*` ni CI. Prioridad de pruebas sugerida: (1) transiciones de etapa del pipeline en `page.tsx`, (2) comportamiento de *fallback* de cada ruta API sin Mongo, (3) parseo de la respuesta JSON de Gemini en las 4 rutas de IA, (4) contrato del simulador de webhook antes de reemplazar su "firma" por una real.

## 15. UX y problemas encontrados

- Pantalla de carga global bloquea toda la app; sin *skeletons* por sección.
- Errores de guardado se silencian (`.catch(() => null)`) — el usuario no se entera si un `PUT`/`POST` falla.
- Las rutas `DELETE` existen en 5 endpoints pero ninguna vista las invoca — no se puede borrar nada desde la interfaz.
- Mezcla de emoji e iconos Lucide SVG en las mismas pantallas.
- `SegmentsView` recibe la lista de `contacts` como prop y no la usa: el conteo de leads por segmento es `Math.random()`.

## 16–17. Deuda técnica y funcionalidades incompletas

1. Ausencia total de auth + validación de entrada — bloquea cualquier despliegue público.
2. Fuente de verdad partida en tres archivos de datos de ejemplo.
3. ~~Segmentos, Campañas, Automatizaciones y Analítica tienen UI completa pero lógica simulada~~ — **Campañas resuelto:** audiencia real desde los criterios del segmento, ciclo de vida validado en servidor, registro por destinatario en `campaign_recipients` y métricas calculadas (`src/lib/services/`). Pendientes: Automatizaciones (sin motor de reglas) y Analítica (dataset fijo `INITIAL_ANALYTICS`).

## 18. Funcionalidades recomendadas

**Alta prioridad:** autenticación y sesión mínima · validación de entrada por esquema (zod) · unificar la fuente de datos semilla · integración real de al menos un canal (WhatsApp Cloud API).
**Media prioridad:** que todos los módulos lean su estado desde `/api/*` al montar · motor real de automatizaciones · exponer los `DELETE` ya existentes en la interfaz · migrar `<img>` a `next/image`.
**Baja prioridad:** terminar de unificar el naming a "Whato" · unificar iconografía · simplificar o completar el panel de exportación a GitHub.

## 19. Riesgos

| Riesgo | Impacto |
| :-- | :-- |
| Exposición pública sin auth (lectura/alteración de datos de clientes por terceros) | Crítico |
| Agotamiento de cuota/presupuesto de Gemini por abuso del endpoint público | Alto |
| Brecha entre lo demostrado (WhatsApp, Calendar) y lo realmente conectado, si se presenta a stakeholders sin este contexto | Medio |
| Pérdida silenciosa de cambios por errores de guardado no reportados al usuario | Medio |

## 20. Roadmap priorizado

- **Fase 0 — Correcciones críticas:** proteger todas las rutas API · quitar el auto-seed de los `GET` · validar el body de entrada · corregir o etiquetar como demo la "firma" del webhook.
- **Fase 1 — Estabilización:** unificar fixtures · tests sobre pipeline y fallbacks de API · activar ESLint/`strict` de forma incremental · reportar errores de guardado al usuario.
- **Fase 2 — UX/UI:** exponer `DELETE` en las vistas · terminar el rebranding a "Whato" · unificar iconografía.
- **Fase 3 — Rendimiento:** que todos los módulos lean de `/api/*` al montar · migrar a `next/image` · índices compuestos en `messages`.
- **Fase 4 — Nuevas funcionalidades:** integración real de WhatsApp Cloud API · motor real de automatizaciones · analítica calculada sobre datos reales.

## Prioridades recomendadas (top 10)

| # | Problema | Solución propuesta | Prioridad |
| :-- | :-- | :-- | :-- |
| 1 | API pública, incl. `/api/seed` destructivo | Auth mínima + proteger seed | Crítica |
| 2 | Un `GET` puede escribir en la base de datos | Mover el seed a un comando explícito | Crítica |
| 3 | `POST`/`PUT` aceptan cualquier campo sin validar | Esquema de validación (zod) por ruta | Alta |
| 4 | "Firma" de webhook es hex plano, no HMAC | Implementar HMAC real o marcarlo como demo | Alta |
| 5 | Sin límite de uso en endpoints de IA | Rate limiting básico por IP/sesión | Alta |
| 6 | Datos semilla divergentes en 3 archivos | Fuente única en `mockData.ts` | Media |
| 7 | Varios módulos no releen de la API | Fetch real al montar cada vista | Media |
| 8 | Sin integración real con ningún canal | WhatsApp Cloud API como primer canal | Media-Alta |
| 9 | Errores de guardado se silencian | Feedback visible al usuario en cada fetch | Media |
| 10 | Cero tests, cero CI | Suite mínima sobre pipeline + fallbacks de API | Media |

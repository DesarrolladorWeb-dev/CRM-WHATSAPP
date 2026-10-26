# Documentación Técnica y Manual Completo: Whato CRM

Sistema de CRM Omnicanal para WhatsApp Web, Instagram, X (Twitter) y Messenger, desarrollado en **Next.js Full Stack (App Router)** con Inteligencia Artificial (**Google Gemini 3.6 Flash**), persistencia en **MongoDB** (Mongoose), Tablero Kanban de Ventas, Campañas Masivas, Automatizaciones y Módulo de Respuestas Rápidas con Botones Persistentes.

> ⚠️ **Alcance actual:** este documento describe el diseño previsto del sistema. El estado real de cada pieza — qué está conectado de verdad y qué es todavía una simulación de interfaz — está marcado en cada sección y se detalla en [`AUDITORIA.md`](./AUDITORIA.md).

---

## 📑 Tabla de Contenidos
1. [Introducción y Propósito](#1-introducción-y-propósito)
2. [Arquitectura y Stack Tecnológico](#2-arquitectura-y-stack-tecnológico)
3. [Módulos del Sistema](#3-módulos-del-sistema)
4. [Persistencia y Modelos MongoDB](#4-persistencia-y-modelos-mongodb)
5. [Inteligencia Artificial con Google Gemini](#5-inteligencia-artificial-con-google-gemini)
6. [Endpoints de la API Backend (Next.js Route Handlers)](#6-endpoints-de-la-api-backend-nextjs-route-handlers)
7. [Guía de Instalación, Configuración y Despliegue](#7-guía-de-instalación-configuración-y-despliegue)

---

## 1. Introducción y Propósito

**Whato CRM** está pensado para equipos de ventas y soporte al cliente. Su objetivo es centralizar las conversaciones provenientes de múltiples canales de mensajería (WhatsApp, Instagram, Twitter/X, Messenger) y dotar a los asesores comerciales de herramientas de productividad:
- Respuestas instantáneas y botones configurables con plantillas de texto e imágenes adjuntas. *(✅ implementado, con persistencia doble MongoDB + `localStorage`)*
- Calificación y seguimiento de leads mediante tableros Kanban. *(✅ implementado)*
- Automatizaciones de flujos de trabajo según interacciones del cliente. *(⚠️ solo la interfaz; las reglas no se evalúan aún contra eventos reales)*
- Persistencia en MongoDB. *(🟡 parcial: Contactos, Conversaciones, Mensajes y Respuestas Rápidas sí se leen de la base de datos al iniciar; Segmentos, Campañas, Automatizaciones y API Keys todavía no)*
- Asistencia con Inteligencia Artificial para generar respuestas inteligentes, resúmenes ejecutivos de conversaciones y copys publicitarios de alto impacto. *(✅ implementado vía Gemini, server-side)*

No existe todavía un modelo de usuarios/roles ni sesión de autenticación: "atención multiagente" hoy es solo un campo de texto libre (`assignedAgent`) en cada conversación, no un sistema de cuentas real. Tampoco hay sincronización en tiempo real entre pestañas o dispositivos (sin websockets/SSE): cada cliente lee el estado una vez al cargar y aplica sus propios cambios de forma optimista.

---

## 2. Arquitectura y Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Framework Full Stack** | Next.js 15+ (App Router) | Servidor unificado, Server/Client components y Route Handlers. |
| **Frontend** | React 19 + TypeScript | SPA reactiva y tipada con componentes desacoplados. |
| **Estilos** | Tailwind CSS v4 | Diseño responsivo con estética moderna inspirada en WhatsApp Web. |
| **Iconografía** | Lucide React | Paquete estándar de íconos vectoriales SVG. |
| **Gráficos** | Recharts | Visualización de métricas y analítica del embudo. |
| **Base de Datos** | MongoDB + Mongoose | Base de datos NoSQL con modelos tipados y conexión singleton optimizada. |
| **Motor de IA** | `@google/genai` (Gemini 3.6 Flash) | Procesamiento de lenguaje natural ejecutado en el servidor Next.js. |

---

## 3. Módulos del Sistema

### 3.1 Inbox Omnicanal & Extensión WhatsApp

> 🟡 La interfaz de esta sección está completa, pero los canales no están conectados: los mensajes "entrantes" se generan con un botón de simulación (`Simular mensaje entrante`) y no llega ni sale tráfico real de WhatsApp/Instagram/X/Messenger. Ver [`AUDITORIA.md`](./AUDITORIA.md#10-integración-whatsapp).

- **Filtros por Canal:** Pestañas para alternar entre todas las conversaciones o filtrar por WhatsApp, Instagram, Twitter/X y Messenger.
- **Visualizador de Hilos de Chat:** Mensajes con diseño de burbujas, marcas de tiempo, estados de entrega (✓✓) y etiquetas visuales de "Bot IA" o "Agente". *(El estado de entrega/lectura se asigna manualmente en el código, no llega de un proveedor real.)*
- **Barra de Acceso Rápido:** Lista horizontal con los botones de respuestas rápidas creados por el usuario, notas de voz y cargador de archivos multimedia.
- **Panel Lateral de Extensión Whato:**
  - Información del contacto (teléfono, correo, empresa, notas).
  - Score de probabilidad de cierre asistido por IA (0 a 100).
  - Selector de etapa del embudo (Prospecto, Cualificado, Negociación, Venta Ganada, Perdido).
  - Gestión rápida de etiquetas de segmentación.

  ❌ La integración con Google Calendar mencionada en versiones anteriores de este documento **no existe en el código actual** — no hay ningún cliente ni endpoint de Calendar en el repositorio. Se retira de esta lista hasta que se implemente.

### 3.2 Gestor de Respuestas Rápidas y Botones Disponibles
- **Creación Ilimitada:** Añadir botones con texto, imágenes y emojis.
- **Variables Dinámicas:** Inserción de `{nombre}`, `{empresa}`, `{canal}` y `{agente}`.
- **Persistencia Doble:** Guardado en MongoDB y respaldo en `localStorage`.

### 3.3 CRM Kanban & Embudo de Ventas
- Columnas de etapas configurables con recálculo del valor del pipeline en el cliente al cambiar una tarjeta.
- Movimiento de tarjetas de leads con cálculo automático del valor del pipeline.

### 3.4 Campañas Masivas & Asistente IA de Copywriting
- Asistente de copywriting con Gemini 3.6 Flash que genera 3 opciones optimizadas según el canal y tono deseado. *(✅ la generación de copy con IA es real)*
- ⚠️ El envío de la campaña y sus métricas (entregados, apertura, clics, conversiones) son valores fijos o aleatorios asignados al crearla — no hay envío real ni tracking.

---

## 4. Persistencia y Modelos MongoDB

Los esquemas de datos residen en `src/models/`:
- `Contact`: Leads con tags, sentiment, leadScore, etapa e interacciones.
- `Conversation`: Estados de conversaciones y agentes asignados.
- `Message`: Mensajes individuales con indicador de generación por IA.
- `Segment`: Definición de audiencias.
- `Campaign`: Campañas masivas de marketing.
- `AutomationRule`: Reglas de flujo automáticas.
- `QuickReply`: Botones rápidos persistentes.
- `ApiKey` y `WebhookLog`: Auditoría y credenciales.

---

## 5. Inteligencia Artificial con Google Gemini

El sistema utiliza el SDK oficial `@google/genai` con el modelo `gemini-3.6-flash`. Por directrices estrictas de seguridad:
- La clave `GEMINI_API_KEY` se ejecuta exclusivamente en el servidor Next.js (`src/app/api/`).
- Ninguna clave privada se expone al navegador o cliente.

---

## 6. Endpoints de la API Backend (Next.js Route Handlers)

> ⚠️ **Ninguna de estas rutas requiere autenticación actualmente.** Están pensadas para desarrollo local; antes de exponerlas fuera de `localhost` hay que añadir una capa de auth (ver [`AUDITORIA.md`](./AUDITORIA.md#11-seguridad)). Además, los `GET` de `/api/contacts`, `/api/segments`, `/api/quick-replies`, `/api/campaigns` y `/api/automations` insertan datos de ejemplo automáticamente la primera vez que la colección está vacía — una simple lectura puede escribir en la base de datos.

| Método | Ruta | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Estado del servidor, Gemini y conexión MongoDB. |
| `GET / POST / PUT / DELETE` | `/api/contacts` | Operaciones CRUD de Contactos. |
| `GET / POST / PUT` | `/api/conversations` | Operaciones CRUD de Conversaciones. |
| `GET / POST` | `/api/messages` | Consulta y envío de Mensajes. |
| `GET / POST / DELETE` | `/api/segments` | Gestión de Segmentos. |
| `GET / POST / PUT / DELETE` | `/api/campaigns` | Gestión de Campañas. |
| `GET / POST / PUT / DELETE` | `/api/automations` | Gestión de Reglas Automáticas. |
| `GET / POST / DELETE` | `/api/quick-replies`| Gestión de Botones Rápidos. |
| `POST` | `/api/seed` | Poblar base de datos MongoDB con datos iniciales. |
| `POST` | `/api/ai/smart-reply` | 3 sugerencias de respuesta y análisis de sentimiento. |
| `POST` | `/api/ai/summarize` | Resumen ejecutivo, intención y próxima acción comercial. |
| `POST` | `/api/ai/campaign-copy` | 3 variantes de copy publicitario estructurado. |
| `POST` | `/api/ai/chatbot-autorespond`| Simulación de respuesta automática de bot. |
| `POST` | `/api/webhooks/test` | Simulación de envío webhook. La "firma" devuelta **no es un HMAC-SHA256 real**, es el payload codificado en hexadecimal — no usar como verificación de integridad. |

---

## 7. Guía de Instalación, Configuración y Despliegue

### 1. Variables de Entorno
Crea un archivo `.env.local` con:
```env
GEMINI_API_KEY="tu_clave_de_gemini_api"
MONGODB_URI="mongodb://localhost:27017/whato-crm"
APP_URL="http://localhost:3000"
```

### 2. Instalación y Ejecución
```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo en Next.js (puerto 3000)
npm run dev

# Compilar para producción
npm run build

# Iniciar servidor de producción
npm run start
```
El CRM estará disponible en `http://localhost:3000`.

---
*Documentación generada para Whato CRM. Para el diagnóstico completo de qué está realmente implementado, simulado o pendiente, ver [`AUDITORIA.md`](./AUDITORIA.md).*

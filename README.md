# 🚀 whato-crm (Whato) - Omnichannel CRM & WhatsApp AI Copilot

Plataforma Omnicanal de CRM y Ventas **Whato** para **WhatsApp Web**, Instagram, X (Twitter) y Messenger, con Inteligencia Artificial (**Google Gemini**), persistencia en **MongoDB** (Mongoose) y arquitectura unificada **Next.js Full Stack (App Router)**.

> ⚠️ **Estado actual: prototipo funcional / demo, no producto conectado.** La interfaz y el modelo de datos del CRM omnicanal están completos, pero **no hay integración real con WhatsApp, Instagram, X, Messenger ni Google Calendar** (los mensajes "entrantes" se generan localmente con un botón de simulación), **no existe autenticación** en ninguna ruta de la API, y varios módulos (Segmentos, Campañas, Automatizaciones, API Keys) todavía no leen sus datos desde MongoDB tras la carga inicial. Ver el detalle en [`AUDITORIA.md`](./AUDITORIA.md) antes de desplegar esto en un entorno accesible públicamente.

---

## 📑 Tabla de Contenidos
1. [Características Principales](#-características-principales)
2. [Stack Tecnológico](#-stack-tecnológico)
3. [Requisitos Previos e Instalación de MongoDB](#-1-requisitos-previos-e-instalación-de-mongodb)
4. [Conexión y Creación de Base de Datos en MongoDB Compass](#-2-conexión-y-creación-de-base-de-datos-en-mongodb-compass)
5. [Configuración de Variables de Entorno (`.env.local`)](#-3-configuración-de-variables-de-entorno-envlocal)
   - [Configuración Activa (MongoDB Local)](#31-configuración-activa-mongodb-local)
   - [Configuración Preparada para el Futuro (MongoDB Atlas Cloud)](#32-configuración-preparada-para-el-futuro-mongodb-atlas-en-la-nube)
   - [Seguridad de API Keys en Producción (`API_KEY_HASH_SECRET`)](#33-seguridad-de-api-keys-en-producción-api_key_hash_secret)
6. [Comando de Migración y Población de Datos](#-4-comando-de-migración-y-población-de-datos-seed)
7. [Ejecución del Proyecto](#-5-ejecución-del-proyecto)
   - [Infraestructura de datos para producción (Postgres/Mongo gestionados)](#-infraestructura-de-datos-para-producción-postgresmongo-gestionados)
8. [Backups de Postgres y MongoDB](#-6-backups-de-postgres-y-mongodb)
   - [Requisitos](#61-requisitos)
   - [Uso](#62-uso)
   - [Automatizarlo (GitHub Actions / cron)](#63-automatizarlo-github-actions--cron)
   - [Runbook de recuperación ante desastres](#64-runbook-de-recuperación-ante-desastres)
9. [Módulos del Sistema](#-7-módulos-del-sistema)
10. [Referencia de Endpoints API](#-8-referencia-de-endpoints-api-nextjs-route-handlers)

---

## ✨ Características Principales

* 💬 **Inbox Omnicanal Whato (Estilo WhatsApp Web):** UI de conversaciones con filtrado por canal (WhatsApp, Instagram, Twitter/X, Messenger), badges de estado y panel lateral de extensión Whato. Los mensajes entrantes se generan con un botón de simulación local; no hay conexión real a ningún canal todavía (ver "Estado actual" arriba).
* 🤖 **Asistente de Inteligencia Artificial (Gemini):** funcional de extremo a extremo, con clave siempre server-side.
  * **Smart Replies:** 3 sugerencias contextuales con análisis de sentimiento.
  * **Resumen Ejecutivo IA:** Extracción de intenciones, objeciones y próximas acciones.
  * **Generador de Copys:** Creación de textos persuasivos adaptados a cada canal.
  * **Simulador de Auto-Respuesta:** Bot inteligente para atención instantánea (disparado manualmente, no por un webhook real).
* ⚡ **Gestor de Botones de Respuesta Rápida:** Creación ilimitada de plantillas con imágenes adjuntas y variables dinámicas (`{nombre}`, `{empresa}`, `{canal}`, `{agente}`). Persistencia doble real: MongoDB + `localStorage`.
* 📊 **Tablero Kanban & Funnel de Ventas:** Columnas interactivas por etapa de venta con recálculo automático del valor total del Pipeline y ventas cerradas.
* 🗄️ **Persistencia en MongoDB (parcial):** Modelos Mongoose tipados y conexión singleton optimizada para Next.js. Contactos, Conversaciones, Mensajes y Respuestas Rápidas se leen de Mongo al iniciar; Segmentos, Campañas, Automatizaciones y API Keys **todavía arrancan con datos de ejemplo** en cada carga.
* 🔄 **Flujos & Automatizaciones (simulado):** la interfaz de reglas existe, pero ninguna regla se evalúa aún contra eventos reales — hoy solo incrementa un contador de prueba.
* 🔐 **API REST, Webhooks & Playground Interactivo:** Generación de API Keys (todavía no verificadas por el backend) y **simulador** de entrega de webhooks — la "firma" que genera no es un HMAC real, es una codificación hexadecimal reversible del payload.

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología | Descripción |
| :--- | :--- | :--- |
| **Framework Full Stack** | **Next.js 15+ (App Router)** | Servidor unificado, Server/Client components y Route Handlers. |
| **Frontend** | **React 19 + TypeScript** | SPA reactiva y tipada. En pantalla se muestra como **Whato**. |
| **Estilos** | **Tailwind CSS v4** | Diseño responsivo moderno con tema oscuro/claro y WhatsApp Web vibes. |
| **Base de Datos** | **MongoDB + Mongoose** | Base de datos NoSQL con modelos estructurados y conexión en caliente (`whato-crm`). |
| **Inteligencia Artificial** | **Google Gemini** | Integrado vía SDK oficial `@google/genai` ejecutado en servidor. |
| **Iconos & Gráficos** | **Lucide React & Recharts** | Iconografía SVG y cuadros de mando interactivos. |

---

## 📥 1. Requisitos Previos e Instalación de MongoDB

Para almacenar los datos localmente en tu computadora necesitas el motor de base de datos **MongoDB Community Server** y la interfaz visual **MongoDB Compass**:

### 1.1 Descargar e Instalar MongoDB Community Server (Motor de Base de Datos)
1. Descarga el instalador oficial para Windows:
   👉 [Descargar MongoDB Community Server (.msi)](https://www.mongodb.com/try/download/community)
2. Abre el archivo `.msi` y selecciona la opción de instalación **"Complete"**.
3. ⚠️ **MUY IMPORTANTE:** Durante el asistente, asegúrate de dejar marcada la casilla:
   ✅ **"Install MongoDB as a Service"** (Ejecutar servicio de MongoDB automáticamente con Windows).
4. Completa la instalación. El servicio quedará corriendo en segundo plano en el puerto `27017`.

### 1.2 Descargar MongoDB Compass (Cliente Visual)
* Si no lo tienes instalado, descárgalo aquí:
   👉 [Descargar MongoDB Compass](https://www.mongodb.com/try/download/compass)

### 1.3 Descargar Postgres
* Si no lo tienes instalado, descárgalo aquí:
   👉 [PostgreSQL](https://www.postgresql.org/download/)
* O utiliza docker 
   👉 [DockeuHub](https://hub.docker.com/_/postgres)

---

##  2. Conexión y Creación de Base de Datos

### 🧭 2.1 Conexión y Creación de Base de Datos en MongoDB Compass

1. Abre **MongoDB Compass**.
2. En la pantalla principal (**New Connection**), escribe la URI de conexión local:
   ```text
   mongodb://127.0.0.1:27017
   ```
3. Haz clic en el botón verde **Connect**.
4. Para crear la base de datos:
   * Haz clic en el botón **"+ Create Database"**.
   * **Database Name:** `whato-crm`
   * **Collection Name:** `contacts`
   * *(Opciones adicionales como Time-Series déjalas sin marcar)*.
   * Haz clic en **Create Database**.

### 🧭 2.2 Conexión y Creación de Base de Datos en Postgress

1. Crear usuario y contraseña (puede ser cualquiera)
2. Crear base de datos **whato_crm**

---

## ⚙️ 3. Configuración de Variables de Entorno (`.env.local`)

Copia o renombra el archivo `.env.example` a `.env.local` en la raíz del proyecto. 
Modificar en base a lo indicado en este

### 3.1 Configuración Activa (Bases de datos Local)
Esta es la configuración predeterminada lista para usar en tu entorno actual:

```env
# ==============================================================================
# whato-crm - CONFIGURACIÓN DE VARIABLES DE ENTORNO (.env.local)
# ==============================================================================

PORT=3000
NODE_ENV=development
APP_URL=http://localhost:3000

# Clave privada de Google Gemini AI (Backend Server-Side)
GEMINI_API_KEY=
# GEMINI_API_KEY=tu_api_key_de_google_ai

# Modelo compartido por las cuatro rutas de IA; verifica acceso con tu clave.
GEMINI_MODEL=gemini-3.6-flash

# --- Bases de datos del hibrido ---------------------------------------------
# Postgres: nucleo relacional (Prisma). Contactos, segmentos, campañas,
# automatizaciones, conversaciones, API keys, etc.
# Realizado con usuario=postgres y contraseña=root
DATABASE_URL=postgresql://postgres:root@localhost:5432/whato_crm?schema=public

# MongoDB Local (Compass / Community Server)
MONGODB_URI=mongodb://127.0.0.1:27017/whato-crm

# --- Rate limit distribuido de IA (valores opcionales) ----------------------
AI_RATE_LIMIT_POINTS=1
AI_RATE_LIMIT_WINDOW_SECONDS=40

# Modo demo. Por defecto, si Postgres o Mongo no responden las rutas de la API
# devuelven 503 (y el frontend muestra un aviso de "datos de ejemplo").
# DEMO_MODE=true fuerza datos de ejemplo; se IGNORA en NODE_ENV=production.
DEMO_MODE=false

# MongoDB Atlas (Nube para el futuro)
# MONGODB_URI=mongodb+srv://<usuario>:<password>@<tu-cluster>.mongodb.net/whato-crm?retryWrites=true&w=majority

# --- Seguridad de API keys -------------------------------------------------
API_KEY_HASH_SECRET=

# Clave maestra opcional: si se define, se acepta como x-api-key con permisos admin
# sin consultar la base de datos. Util en desarrollo.
API_MASTER_KEY=cambia_esta_clave

# Clave publica que el frontend adjunta a cada fetch (viaja al bundle del
# navegador). Nunca debe tener permiso 'admin'.
NEXT_PUBLIC_API_KEY=cambia_esta_clave

# --- CORS -------------------------------------------------------------------

# Origenes permitidos para llamar a /api/* desde otro dominio (navegador),
# separados por comas y con esquema. Vacio = solo mismo origen. En desarrollo
# se aceptan ademas localhost / 127.0.0.1 en cualquier puerto.
#   Ej: CORS_ALLOWED_ORIGINS=https://app.miempresa.com,https://admin.miempresa.com
CORS_ALLOWED_ORIGINS=localhost

# --- Endpoint destructivo de seed ----------------------------------------------

# POST /api/seed BORRA y repuebla ambas bases de datos. En produccion
# (NODE_ENV=production) esta deshabilitado (403) salvo que se ponga esto en
# 'true' de forma deliberada. Se lee en build: cambiarlo exige redeploy.
# Ademas, en produccion la request debe incluir { "confirm": "RESET-WHATO-DB" }.
# Deshabilitalo de nuevo en cuanto termines el primer arranque.
ALLOW_DESTRUCTIVE_SEED=false
```

Los cuatro endpoints de IA comparten sus contadores entre procesos mediante la
colección `rate_limits` de MongoDB. La colección y sus índices único y TTL se
crean automáticamente. Cada endpoint conserva su propio cupo, y la identidad
se almacena como un hash de la credencial autenticada (o de la IP como
fallback), nunca en claro. Si MongoDB no está disponible, el endpoint responde
`503` en vez de omitir la protección.

### 3.2 Configuración Preparada para el Futuro (MongoDB Atlas en la Nube) **[NECESITA ACTUALIZARSE]**
Para conectar tu proyecto a **MongoDB Atlas** en producción sin cambios de código:

1. Crea tu clúster gratuito en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Crea un usuario de base de datos y añade tu IP a la lista de acceso de red.
3. Haz clic en **Connect** > **Drivers** (Node.js) y copia la URI.
4. En `.env.local`, comenta la línea local y pega tu cadena de Atlas:

```env
# MONGODB_URI=mongodb://127.0.0.1:27017/whato-crm
MONGODB_URI=mongodb+srv://<usuario>:<password>@<tu-cluster>.mongodb.net/whato-crm?retryWrites=true&w=majority
```

### 3.3 Seguridad de API Keys en Producción (`API_KEY_HASH_SECRET`)

Las API Keys se guardan hasheadas (HMAC-SHA256 con un *pepper* de servidor). Ese
pepper es **obligatorio en producción**: con `NODE_ENV=production` y sin
`API_KEY_HASH_SECRET` (ni `API_MASTER_KEY` como respaldo), el servidor **aborta el
arranque** y cualquier operación con claves lanza error, en lugar de caer a un
pepper de desarrollo público que anularía el hashing.

Genera el secreto con:

```bash
openssl rand -hex 32
```

y defínelo en el entorno (o `.env`):

```env
API_KEY_HASH_SECRET=<resultado de openssl rand -hex 32>
```

**Rotación:** cambiar `API_KEY_HASH_SECRET` invalida **todas** las API Keys ya
emitidas (sus hashes dejan de coincidir). Tras rotarlo hay que re-emitir cada
clave desde la UI / `POST /api/keys` y repartir las nuevas.

---

## 🚀 4. Comando de Migración y Población de Datos (Seed)

Para poblar automáticamente tu base de datos de MongoDB y Postgre SQL con datos reales iniciales (contactos, conversaciones, plantillas, reglas y campañas), ejecuta en la terminal:

```powershell
npx prisma migrate deploy
```

y

```powershell
npm run db:seed
```

El script creará y estructurará automáticamente las siguientes 9 colecciones en tu base de datos `whato-crm`:
* `contacts` (Leads y clientes)
* `conversations` (Hilos de chat omnicanal)
* `messages` (Historial de mensajes)
* `quickreplies` (Plantillas de respuestas rápidas con imágenes)
* `segments` (Grupos de audiencia)
* `campaigns` (Campañas de difusión masiva)
* `automationrules` (Reglas de automatización y bots)
* `apikeys` (Claves de integración API REST)
* `webhooklogs` (Historial de eventos)

---

## 💻 5. Ejecución del Proyecto

### Credenciales

Correo: `bob@example.com`

Contraseña: `Bob2309231312`

### Modo Desarrollo
```powershell
npm run dev
```
Abre tu navegador en [http://localhost:3000](http://localhost:3000).

### Compilación para Producción
```powershell
npm run build
npm run start
```
`npm start` corre primero `prisma migrate deploy` automáticamente (hook `prestart`, ver `scripts/prestart-migrate.mjs`) y solo si `DATABASE_URL` está definida — sin ella, arranca igual en modo sin Postgres. No hace falta correr la migración a mano antes de desplegar.

### 🏭 Infraestructura de datos para producción (Postgres/Mongo gestionados)

Este proyecto asume un **proceso Node persistente** (Docker/VPS con `npm start`, no funciones serverless): un solo `PrismaClient` y una sola conexión de Mongoose viven durante toda la vida del proceso (singletons cacheados en `global`, ver `src/lib/postgres.ts` y `src/lib/mongodb.ts`). Con ese modelo **no hace falta un pooler externo tipo PgBouncer** — el pool interno de Prisma y el pool del driver de Mongo alcanzan.

**Proveedores recomendados**
- **Postgres:** cualquier Postgres gestionado sirve (Neon, Supabase, RDS, DigitalOcean...). [Neon](https://neon.tech) es el más simple para este stack: da un free tier generoso y una URL con SSL lista para pegar en `DATABASE_URL`.
- **MongoDB:** [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) — ver [§3.2](#32-configuración-preparada-para-el-futuro-mongodb-atlas-en-la-nube) para crear el clúster y obtener la cadena `mongodb+srv://...`.

**Pooling**
- *Postgres:* se ajusta por query params en la URL, sin tocar código — `?connection_limit=10&pool_timeout=20`. Pon `connection_limit` por debajo del máximo de conexiones concurrentes que permite el plan del proveedor (y deja margen para otros clientes que usen esa misma base, como un script de seed corriendo en paralelo).
- *Mongo:* `MONGODB_POOL_MAX` / `MONGODB_POOL_MIN` (opcionales, por defecto 10/1 — ver `.env.example`).

**Migraciones**
- Automáticas en cada arranque de producción vía el hook `prestart` (arriba). Para correrlas a mano: `npm run db:migrate` (= `prisma migrate deploy`, solo aplica migraciones ya generadas — no crea ninguna, a diferencia de `db:migrate:dev`).

**Apagado ordenado**
- En SIGTERM/SIGINT (lo que manda Docker/systemd/tu orquestador al reiniciar o desplegar) el proceso cierra el pool de Prisma y desconecta Mongoose antes de salir (`src/instrumentation.ts`), para no dejar conexiones colgadas que el proveedor gestionado tenga que expirar por timeout.

**Checklist antes de ir a producción**
- [ ] `DATABASE_URL` apunta al Postgres gestionado, con `sslmode=require` y `connection_limit` fijado.
- [ ] `MONGODB_URI` apunta al clúster de Atlas (o el Mongo gestionado elegido).
- [ ] `npm run db:migrate:dev` corrido en local/staging para generar cualquier migración pendiente **antes** de mergear a main (`db:migrate` en producción solo aplica, no genera).
- [ ] `API_KEY_HASH_SECRET` generado con `openssl rand -hex 32` (obligatorio, el arranque aborta sin él en `NODE_ENV=production` — ver §3.3).
- [ ] `ALLOW_DESTRUCTIVE_SEED=false` (el endpoint `/api/seed` borra ambas bases).
- [ ] `DEMO_MODE=false` (en `NODE_ENV=production` se ignora aunque quede a `true`; deja un `warn` al arrancar).
- [ ] Revisar [`docs/PRODUCCION.md`](./docs/PRODUCCION.md) — lista priorizada de lo que falta para producción (bloqueantes de seguridad, deps, tests, CD). Actualiza a [`AUDITORIA.md`](./AUDITORIA.md), que es un snapshot de agosto y ya quedó desfasada en varios puntos.

---

## 🗄️ 6. Backups de Postgres y MongoDB

Scripts en `scripts/backup.mjs` y `scripts/restore.mjs` para respaldar y restaurar ambas bases de datos. Por ahora se corren a mano; ver [§6.3](#63-automatizarlo-programador-de-tareas--cron) para dejarlos corriendo solos.

### 6.1 Requisitos

Las herramientas de línea de comandos de cada base (no las apps gráficas — pgAdmin y MongoDB Compass **no** las incluyen, son paquetes aparte):

- **`pg_dump` / `pg_restore`**: vienen con la instalación de Postgres (`bin/` dentro de la carpeta donde instalaste Postgres, ej. `C:\Program Files\PostgreSQL\17\bin` o `D:\PostgreSQL\17\bin`).
- **`mongodump` / `mongorestore`**: paquete **MongoDB Database Tools**, se descarga aparte del servidor → https://www.mongodb.com/try/download/database-tools

En Windows, agrega ambas carpetas `bin` al PATH del sistema (Variables de entorno → `Path` → Editar → Nuevo) y abre una terminal nueva para que el cambio se aplique. Verifica con:
```powershell
pg_dump --version
mongodump --version
```

### 6.2 Uso

**Generar un backup:**
```powershell
npm run db:backup
```
Crea (o reutiliza) la carpeta `backups/` en la raíz del proyecto con dos archivos por corrida:
- `postgres_<fecha-hora>.dump` — snapshot completo de Postgres (formato `custom` de `pg_dump`, comprimido).
- `mongo_<fecha-hora>.archive.gz` — snapshot completo de MongoDB (`mongodump --archive --gzip`).

Si falta `DATABASE_URL` o `MONGODB_URI` en `.env`/`.env.local`, el script omite esa base en vez de fallar (por ejemplo, si solo tienes Postgres levantado).

**Retención automática:** en cada corrida se conservan los últimos **7** backups de cada base y se borran los más viejos, para no llenar el disco. Ajustable con la variable `BACKUP_RETENTION_COUNT`.

**Restaurar un backup** (para comprobar que sirve — un backup nunca probado no es garantía de nada):
```powershell
npm run db:restore -- --postgres backups/postgres_2026-09-04_21-09-50.dump
npm run db:restore -- --mongo backups/mongo_2026-09-04_21-09-54.archive.gz
```
> ⚠️ Esto **sobreescribe** los datos de la base a la que apunten `DATABASE_URL`/`MONGODB_URI` en ese momento (`pg_restore --clean` y `mongorestore --drop`). Pruébalo contra una base local o de staging, nunca contra producción salvo que sea un restore real y deliberado.

`backups/` está en `.gitignore` — los dumps pueden contener datos sensibles y nunca deben subirse al repo.

### 6.3 Automatizarlo (GitHub Actions / cron)

Los comandos de arriba son manuales. Para producción hay dos workflows ya listos:

| Workflow | Qué hace | Cuándo |
| --- | --- | --- |
| [`.github/workflows/backup.yml`](./.github/workflows/backup.yml) | Corre `scripts/backup.mjs` y sube los dumps a un bucket **S3-compatible** (AWS S3 / Cloudflare R2 / Backblaze B2). Deja también un artefacto de 7 días. Poda el bucket a las últimas 14 copias por base. | Diario 03:17 UTC (+ manual) |
| [`.github/workflows/backup-restore-test.yml`](./.github/workflows/backup-restore-test.yml) | Descarga el último dump del bucket y lo **restaura en contenedores efímeros** para comprobar que sirve. Si falla, el workflow falla. | Lunes 04:42 UTC (+ manual) |

**Para activarlos:** cargar los secrets/variables del bucket y de las bases en
*Settings → Secrets and variables → Actions*. La lista completa está en
[`docs/DISASTER_RECOVERY.md` §8](./docs/DISASTER_RECOVERY.md#8-configuración-necesaria-github-actions).

**Alternativa local (Windows):** Programador de tareas → tarea diaria → acción "Iniciar un programa" → `powershell.exe` con argumentos `-Command "cd D:\ruta\al\proyecto; npm run db:backup"`.

Estos dumps lógicos son la **Capa 2** (secundaria). La **Capa 1** — PITR / backups
continuos del proveedor gestionado (Neon, MongoDB Atlas) — se activa en el panel
del proveedor; ver el runbook.

### 6.4 Runbook de recuperación ante desastres

[`docs/DISASTER_RECOVERY.md`](./docs/DISASTER_RECOVERY.md): objetivos de RPO/RTO,
estrategia de backup en dos capas, política de retención, prueba de restauración
y procedimientos paso a paso para cada escenario de pérdida de datos.

---

## 📦 7. Módulos del Sistema (UI Whato)

| # | Módulo | Estado |
| :-- | :-- | :-- |
| 1 | 💬 **Inbox Omnicanal:** hilos de chat, análisis de sentimiento y extensión lateral Whato. | 🟡 UI completa; canales simulados |
| 2 | 📊 **Embudo Kanban:** gestión visual del ciclo de vida del cliente con semáforo de 4 interacciones. | ✅ Funcional |
| 3 | 🎯 **Segmentos & Audiencias IA:** agrupación por canal, puntuación de lead y tags. | ⚠️ El conteo de contactos por segmento es aleatorio, no calculado |
| 4 | 📣 **Difusión Masiva:** asistente de copy con Gemini y galería de banners. | ⚠️ Redacción con IA real; envío y métricas simulados |
| 5 | ⚡ **Automatizaciones & Flujos:** reglas por disparador. | ⚠️ Sin motor de evaluación real todavía |
| 6 | 📈 **Analítica & Reportes:** gráficos de conversión, SLA de respuesta y sentimiento. | ⚠️ Datos fijos de ejemplo, no derivados de la actividad real |
| 7 | 🔌 **API REST & MongoDB:** consola para pruebas de endpoints y simulación de webhooks. | 🟡 Playground funcional; API sin autenticación |

> Leyenda: ✅ implementado y verificado · 🟡 parcial · ⚠️ implementado con limitaciones conocidas.

---

## 🔌 8. Referencia de Endpoints API (Next.js Route Handlers)

> ⚠️ Ninguno de estos endpoints requiere autenticación hoy. No los expongas en un servidor accesible desde internet sin añadir antes una capa de auth — ver [`AUDITORIA.md`](./AUDITORIA.md#11-seguridad).

| Método | Endpoint | Descripción |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Estado del servidor y conexión a MongoDB. |
| `GET` / `POST` / `PUT` / `DELETE` | `/api/contacts` | CRUD de contactos / leads (`DELETE` no está conectado a la interfaz todavía). |
| `GET` / `POST` / `PUT` | `/api/conversations` | Listar y actualizar hilos de conversación. |
| `GET` / `POST` | `/api/messages` | Listar y enviar mensajes en el chat. |
| `GET` / `POST` / `DELETE` | `/api/quick-replies` | Gestionar plantillas de respuestas rápidas e imágenes. |
| `GET` / `POST` / `DELETE` | `/api/segments` | Segmentación de audiencias. |
| `GET` / `POST` / `PUT` / `DELETE` | `/api/campaigns` | Campañas de marketing. `POST` guarda siempre como borrador; `PUT` y `DELETE` rechazan con 409 las transiciones y borrados no permitidos por el ciclo de vida. |
| `GET` | `/api/campaigns/[id]/preview` | Audiencia real de la campaña **sin enviar nada**: destinatarios, excluidos por motivo y mensaje ya personalizado. |
| `POST` | `/api/campaigns/[id]/send` | Lanza la campaña. Sin cuerpo: es una orden sobre lo ya guardado. Irreversible. |
| `GET` / `POST` / `PUT` / `DELETE` | `/api/automations` | Reglas y disparadores automáticos. |
| `POST` | `/api/ai/smart-reply` | Sugerencias inteligentes con Gemini. |
| `POST` | `/api/ai/campaign-copy` | Redacción de copys publicitarios con IA. |
| `POST` | `/api/ai/summarize` | Resúmenes ejecutivos de conversaciones con IA. |
| `POST` | `/api/ai/chatbot-autorespond` | Auto-respuesta inteligente para simulación de bot. |
| `POST` | `/api/webhooks/test` | **Simulador** de entrega de webhooks; la firma que devuelve no es un HMAC real. |
| `POST` | `/api/seed` | Borra y repuebla la base de datos con datos de ejemplo. Actualmente pública — tratar como destructiva. |

> Nota: los `GET` de `contacts`, `segments`, `quick-replies`, `campaigns` y `automations` insertan datos de ejemplo automáticamente si la colección está vacía. Es un efecto colateral a tener en cuenta: una simple lectura puede escribir en la base de datos la primera vez.

---

## 📄 Licencia

Desarrollado para **Whato** (`whato-crm`). Todos los derechos reservados.

### Modelo de Gemini

Las cuatro rutas `src/app/api/ai/*` obtienen el modelo mediante `getAiModel()` de
`src/lib/gemini.ts`. Para cambiarlo, modifica `GEMINI_MODEL` en `.env.local` y
reinicia el servidor. En produccion, configura la variable en el alojamiento y
reinicia o redespliega la aplicacion. No hay un modelo predeterminado en el codigo.
Consulta los IDs disponibles en https://ai.google.dev/api/models y comprueba que
el modelo elegido admite `generateContent` y respuestas JSON.

Sin una clave configurada se conservan las respuestas de ejemplo existentes.
Con clave configurada pero sin modelo, las rutas devuelven un error 503 explicito.
`/api/health` solo indica IA configurada si hay clave con formato valido y modelo;
esto no comprueba el acceso real a Google. Los errores del proveedor mantienen
el tratamiento de errores existente.

# Runbook de recuperación ante desastres — Whato CRM

> Qué respaldar, cada cuánto, dónde queda y cómo restaurarlo cuando algo se rompe.
> Cubre las dos bases del híbrido: **Postgres** (núcleo relacional, Prisma) y
> **MongoDB** (`messages`, `webhooklogs`).
>
> Relacionado: [`README.md` §6](../README.md#-6-backups-de-postgres-y-mongodb) (uso
> manual de los scripts), `scripts/backup.mjs`, `scripts/restore.mjs`,
> `.github/workflows/backup.yml`, `.github/workflows/backup-restore-test.yml`.

---

## 1. Objetivos (RPO / RTO)

| Métrica | Objetivo con Capa 1 (PITR del proveedor) | Objetivo solo con Capa 2 (dumps lógicos) |
| --- | --- | --- |
| **RPO** — cuántos datos se aceptan perder | ≤ 5 min | ≤ 24 h (último dump diario) |
| **RTO** — cuánto se tarda en volver a operar | 1–2 h | 2–4 h |

Estos valores son una **propuesta técnica**; falta que negocio los confirme
(ver [§9 Decisiones abiertas](#9-decisiones-abiertas)). Mientras la Capa 1 no
esté activada, el RPO real del sistema es **24 h**.

---

## 2. Qué se pierde si falla cada base

| Base | Contenido | Impacto de perderla |
| --- | --- | --- |
| **Postgres** | Contactos, tags, segmentos, campañas, automatizaciones, citas, conversaciones (metadatos), usuarios/sesiones, API keys, configuración de webhooks | Crítico: es el estado del CRM. Sin esto no hay clientes ni pipeline. |
| **MongoDB** | Historial de mensajes de chat (`messages`), bitácora de webhooks entrantes (`webhooklogs`) | Alto: se pierde el hilo de conversación con cada contacto. Los metadatos de la conversación siguen en Postgres, pero no el contenido. |

Las dos bases se respaldan y se restauran de forma **independiente**: se puede
recuperar una sin tocar la otra.

---

## 3. Estrategia de backup — dos capas

### Capa 1 — PITR / backups continuos del proveedor gestionado *(primaria — PENDIENTE de activar)*

Es la línea de defensa principal: permite volver a **cualquier punto en el
tiempo** dentro de la ventana de retención, sin depender de cuándo corrió el
último dump. Se activa en el panel del proveedor, no en este repo.

La decisión de proveedor está **abierta**. Opciones:

- **Neon (Postgres):** el *history retention* / *point-in-time restore* viene
  incluido; en planes de pago la ventana llega a 7–30 días. Restaurar = crear un
  branch desde un timestamp y repuntar `DATABASE_URL`. Acción: confirmar el plan
  y fijar la ventana de retención (recomendado: **≥ 7 días**).
- **MongoDB Atlas:** activar **Continuous Cloud Backup** (no solo snapshots)
  en el clúster. Da PITR con retención configurable. Acción: activarlo y fijar
  retención (recomendado: **≥ 7 días**).
- **Self-managed / otro proveedor (VPS, Docker, RDS, etc.):** no hay PITR "de
  fábrica". Habría que montar archivado WAL de Postgres (`archive_command` +
  `pg_basebackup`, o Barman / pgBackRest) y, en Mongo, oplog dumps frecuentes.
  Es bastante más trabajo de operación; si se va por acá, tratarlo como una
  tarea propia.

> **Hasta que la Capa 1 esté activa, este runbook opera solo con la Capa 2 y el
> RPO es de 24 h.** Marcar la decisión en [§9](#9-decisiones-abiertas).

### Capa 2 — Dumps lógicos diarios offsite *(secundaria — YA implementada)*

- **Qué:** `pg_dump -Fc` (formato *custom*, comprimido) + `mongodump --archive --gzip`.
- **Cómo:** `scripts/backup.mjs`, disparado por `.github/workflows/backup.yml`.
- **Cuándo:** todos los días a las **03:17 UTC** (más `workflow_dispatch` manual).
- **Dónde:** bucket **S3-compatible** (AWS S3 / Cloudflare R2 / Backblaze B2 / MinIO),
  bajo `s3://<BACKUP_S3_BUCKET>/<BACKUP_S3_PREFIX>/`.
  Además, cada corrida deja un **artefacto** de GitHub Actions de 7 días como
  copia de conveniencia.
- **Nombres:** `postgres_2026-09-04_18-30-05.dump`, `mongo_2026-09-04_18-30-05.archive.gz`
  (timestamp ISO ordenable: el orden alfabético es el orden cronológico).

Sirve para: borrado/corrupción lógica que ya se propagó a la Capa 1, error humano
detectado tarde, o pérdida total del proveedor.

### Copias locales *(desarrollo / bajo demanda)*

`npm run db:backup` deja dumps en `backups/` (en `.gitignore`), reteniendo los
**7** más recientes por base (`BACKUP_RETENTION_COUNT`). No es parte de la
estrategia de producción; es para pruebas y respaldos puntuales antes de una
operación de riesgo.

---

## 4. Retención

| Capa | Ubicación | Retención | Dónde se configura |
| --- | --- | --- | --- |
| Capa 1 | Proveedor (Neon / Atlas / …) | **≥ 7 días** de PITR (recomendado) | Panel del proveedor |
| Capa 2 | Bucket S3 | **14** copias diarias por base | `BACKUP_S3_RETENTION_DAILY` (var. de Actions, default 14). El workflow poda las más viejas en cada corrida. |
| Capa 2 | Artefacto de Actions | 7 días | `retention-days` en `backup.yml` |
| Local | `backups/` | 7 por base | `BACKUP_RETENTION_COUNT` (env, default 7) |

**Recomendado además** (opcional, no automatizado en el workflow): activar en el
bucket una *lifecycle rule* para conservar copias **semanales durante 8 semanas**
y **mensuales durante 6 meses**, y (si el bucket lo permite) *Object Lock* /
versionado para que un borrado accidental o un atacante con las llaves no pueda
vaciar el histórico. Documentar aquí la regla el día que se cree.

---

## 5. Prueba de restauración

Un backup no probado no cuenta.

- **Automática — semanal:** `.github/workflows/backup-restore-test.yml` corre los
  lunes 04:42 UTC. Descarga el último dump de cada base del bucket, lo restaura
  en contenedores `postgres:17` / `mongo:7` **efímeros** (nunca toca producción)
  y verifica que aparecen tablas/colecciones y filas. Si falla, el workflow
  falla y GitHub notifica.
- **Manual — trimestral:** hacer una restauración completa a un entorno de
  **staging** siguiendo el [§6 Escenario B](#escenario-b--pérdida-total-de-una-base-gestionada),
  medir el RTO real y anotar el resultado en la tabla de abajo.

### Registro de pruebas

| Fecha | Tipo | Postgres | MongoDB | RTO medido | Ejecutó | Notas |
| --- | --- | --- | --- | --- | --- | --- |
| _pendiente_ | primera manual | — | — | — | — | Correr tras configurar el bucket |

---

## 6. Procedimientos de recuperación

> **Antes de empezar cualquier restore destructivo:** sacar un dump del estado
> actual (`npm run db:backup` apuntando a la base afectada) por si hay que
> volver atrás, y avisar al equipo de que la app va a entrar en mantenimiento.

### Requisitos de herramienta

- `pg_restore` **17** y `mongorestore` (paquete *MongoDB Database Tools*) en el PATH.
  Ver [`README.md` §6.1](../README.md#61-requisitos).
- `aws` CLI configurado con las credenciales del bucket (o descargar el dump a mano).
- Acceso al panel del proveedor de la(s) base(s).

### Escenario A — Borrado o corrupción lógica reciente (dentro de la ventana de PITR)

Ej.: un `DELETE` sin `WHERE`, una migración que borró una columna, `POST /api/seed`
disparado por error.

1. **Parar la escritura:** poner la app en mantenimiento (bajar el servicio o
   `DEMO_MODE=true` no alcanza — hay que cortar el tráfico de escritura real).
2. **Identificar el instante** justo anterior al incidente (revisar logs / hora
   del deploy / hora del reporte).
3. **Postgres (Neon):** crear un branch desde ese timestamp → obtener su
   connection string → apuntar `DATABASE_URL` de producción a ese branch →
   redeploy. (En otro proveedor: *point-in-time restore* a una instancia nueva y
   repuntar la URL.)
4. **MongoDB (Atlas):** *Restore* → *Point in Time* → a un clúster nuevo o al
   mismo → repuntar `MONGODB_URI` → redeploy.
5. **Si solo una base fue afectada**, restaurar solo esa. La otra sigue como está.
6. Ir a [§7 Verificación post-recuperación](#7-verificación-post-recuperación).

> Si el incidente ya es más viejo que la ventana de PITR, o la Capa 1 no está
> activada, usar el Escenario B con el último dump bueno del bucket.

### Escenario B — Pérdida total de una base gestionada

Ej.: se borró el proyecto de Neon / el clúster de Atlas, el proveedor tuvo una
pérdida de datos, o se migra de proveedor.

1. **Provisionar una instancia nueva** (Postgres y/o MongoDB) en el proveedor
   elegido. Anotar sus credenciales.
2. **Traer el último dump bueno del bucket:**
   ```bash
   export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_DEFAULT_REGION=...
   BUCKET=whato-crm-backups ; PREFIX=whato-crm
   # (para R2/B2/MinIO añadir --endpoint-url https://...)
   aws s3 ls "s3://$BUCKET/$PREFIX/"
   aws s3 cp "s3://$BUCKET/$PREFIX/postgres_2026-09-04_03-17-xx.dump" .
   aws s3 cp "s3://$BUCKET/$PREFIX/mongo_2026-09-04_03-17-xx.archive.gz" .
   ```
   (O bajar el artefacto `db-backup-<run_id>` de la corrida de `backup.yml`.)
3. **Configurar el entorno local** apuntando a las instancias NUEVAS:
   ```bash
   export DATABASE_URL='postgresql://user:pass@host-nuevo/whato_crm?sslmode=require'
   export MONGODB_URI='mongodb+srv://user:pass@cluster-nuevo/whato-crm'
   ```
4. **Restaurar:**
   ```bash
   npm run db:restore -- --postgres ./postgres_2026-09-04_03-17-xx.dump
   npm run db:restore -- --mongo    ./mongo_2026-09-04_03-17-xx.archive.gz
   ```
   `restore.mjs` usa `pg_restore --clean --if-exists --no-owner` y
   `mongorestore --drop --gzip`: reemplaza lo que haya en el destino.
5. **Alinear el esquema de Prisma** (el dump trae el esquema tal como estaba;
   si el código ya avanzó, aplicar migraciones):
   ```bash
   npm run db:migrate      # prisma migrate deploy
   ```
6. **Repuntar la app:** actualizar `DATABASE_URL` / `MONGODB_URI` en el hosting →
   redeploy → quitar el modo mantenimiento.
7. Ir a [§7](#7-verificación-post-recuperación).

### Escenario C — Solo Postgres o solo MongoDB

Idéntico al Escenario B pero corriendo **una sola** de las dos líneas de
`restore.mjs`. No hace falta tocar la base sana. Ojo: si se restaura Postgres a un
punto anterior, algunas conversaciones nuevas de Mongo pueden quedar "huérfanas"
(sin metadatos en Postgres); es tolerable — no rompen la app — pero conviene
anotarlo.

### Escenario D — Migración de Prisma mala en producción

1. `npm run db:backup` **antes de tocar nada** (estado actual).
2. Si la migración solo agregó objetos: escribir una migración de reversa
   (`prisma migrate dev` en local) y desplegarla con `npm run db:migrate`.
3. Si la migración destruyó datos: es un Escenario A (PITR al instante previo al
   deploy) o B (último dump bueno).
4. Nunca correr `prisma migrate reset` contra producción.

### Escenario E — El bucket de backups quedó inaccesible o vacío

1. No hay Capa 2. Depender de la Capa 1 (PITR del proveedor) hasta restablecerlo.
2. Revisar credenciales (`BACKUP_S3_*`), *lifecycle rules* del bucket y permisos.
3. Correr `backup.yml` a mano (`workflow_dispatch`) y confirmar que vuelve a subir.
4. Investigar por qué se vació (¿lifecycle mal configurada? ¿llaves filtradas?
   ¿borrado manual?). Considerar *Object Lock* / versionado.

---

## 7. Verificación post-recuperación

- [ ] La app arranca sin errores de conexión a base de datos.
- [ ] `GET /api/contacts` devuelve datos reales (no `source: 'demo'` ni 503).
- [ ] Conteo de contactos ≈ el esperado (comparar con métricas/monitor previos).
- [ ] Abrir una conversación: el historial de mensajes carga desde Mongo.
- [ ] `npm run db:migrate` no reporta migraciones pendientes.
- [ ] Login / API keys funcionan (Postgres: tablas `users`, `sessions`, `api_keys`).
- [ ] Anotar en el [registro de pruebas](#registro-de-pruebas) el RTO real y
      cualquier pérdida de datos entre el punto restaurado y el incidente.
- [ ] Post-mortem: causa raíz, línea de tiempo, y qué cambiar para que no se repita.

---

## 8. Configuración necesaria (GitHub Actions)

*Settings → Secrets and variables → Actions.* Usada por `backup.yml` y
`backup-restore-test.yml`.

### Secrets

| Nombre | Qué es |
| --- | --- |
| `DATABASE_URL` | URL de Postgres de producción (con credenciales). Solo `backup.yml`. |
| `MONGODB_URI` | URI de MongoDB de producción (con credenciales). Solo `backup.yml`. |
| `BACKUP_S3_ACCESS_KEY_ID` | Access key del bucket de backups. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | Secret key del bucket de backups. |

### Variables

| Nombre | Ejemplo | Qué es |
| --- | --- | --- |
| `BACKUP_S3_BUCKET` | `whato-crm-backups` | Nombre del bucket. |
| `BACKUP_S3_REGION` | `us-east-1` / `auto` | Región (para R2 suele ser `auto`). |
| `BACKUP_S3_ENDPOINT` | `https://<id>.r2.cloudflarestorage.com` | Endpoint S3-compatible. Vacío para AWS S3 nativo. |
| `BACKUP_S3_PREFIX` | `whato-crm` | Carpeta dentro del bucket. Default `whato-crm`. |
| `BACKUP_S3_RETENTION_DAILY` | `14` | Copias diarias por base a conservar en el bucket. Default `14`. |

**Credenciales del bucket:** usar una llave IAM/token **dedicada** con permiso
solo sobre `arn:aws:s3:::<bucket>/<prefix>/*` (list, get, put, delete). Nada más.

---

## 9. Decisiones abiertas

| # | Decisión | Estado | Responsable |
| --- | --- | --- | --- |
| 1 | Proveedor de Postgres y si se activa PITR (Neon paid / Atlas / self-managed) | **Abierta** | — |
| 2 | Proveedor de MongoDB y activar *Continuous Cloud Backup* en Atlas | **Abierta** | — |
| 3 | RPO / RTO objetivo confirmados con negocio | **Abierta** — propuesta en §1 | — |
| 4 | Proveedor del bucket S3-compatible (AWS S3 / R2 / B2) y creación de credenciales | **Abierta** | — |
| 5 | *Lifecycle rules* semanales/mensuales + Object Lock en el bucket | **Abierta** — no automatizado | — |
| 6 | Responsables de guardia y canal de escalamiento ante un incidente de datos | **Abierta** | — |

---

## 10. Contactos y escalamiento

_Pendiente de completar._

| Rol | Persona | Contacto |
| --- | --- | --- |
| Responsable de datos / DBA | — | — |
| On-call / infra | — | — |
| Soporte del proveedor de Postgres | — | (plan / ticket) |
| Soporte del proveedor de MongoDB | — | (plan / ticket) |

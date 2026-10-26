import { z } from 'zod';
import { parseScheduledAt } from '@/lib/time';
const ROLES = ['Administrador', 'Empleado'] as const

// ---------------------------------------------------------------------------
// Telefono
// ---------------------------------------------------------------------------
// E.164: un '+', un digito de 1 a 9, y entre 7 y 14 digitos mas. El rango
// allows desde los numeros mas cortos reales hasta los mas largos que emite
// WhatsApp, y descarta '+', '()', '---' y los ensembles de espacios que el
// regex anterior si aceptaba porque usaba '*' en vez de '+'.

const E164 = /^\+[1-9]\d{7,14}$/;

/** Deja solo digitos; conserva el '+' inicial si lo hay. */
export function soloDigitos(valor: string): string {
  const texto = String(valor ?? '').trim();
  return (texto.startsWith('+') ? '+' : '') + texto.replace(/\D+/g, '');
}

/**
 * Digitos que no son un numero real sino relleno.
 *
 * Solo se listan los que aparecen en cualquier formulario de ejemplo o en los
 * datos de arranque: la intencion es frenar el "lo puse para probar" antes de
 * que llegue a una campana, no adivinar cuales numeros existen. Si un contacto
 * real tiene uno de estos, se corrige a mano.
 */
const DIGITOS_DE_EJEMPLO = new Set([
  '000000000',
  '111111111',
  '123456789',
  '999999999',
]);

const esNumeroDeEjemplo = (telefono: string): boolean => {
  const digitos = soloDigitos(telefono).replace(/^\+/, '');
  if (DIGITOS_DE_EJEMPLO.has(digitos)) return true;
  if (/^(\d)\1{6,}$/.test(digitos)) return true;
  // Codigo de pais + resto de un solo digito: +51 5555555, +1 9999999.
  const sinPrefijo = digitos.replace(/^\d{1,3}/, '');
  return sinPrefijo.length >= 7 && /^(\d)\1+$/.test(sinPrefijo);
};

/**
 * Telefono de contacto.
 *
 * Acepta el numero como lo escribe la persona (con espacios, guiones o
 * parentesis) pero exige que, quitarle la punctuacion, quede un numero de
 * verdad. Un campo opcional que acepta '+' o '---' no esta validando nada:
 * es un campo opcional que acepta cualquier cosa.
 */
const telefonoSchema = z
  .string()
  .max(20)
  .regex(/^\+?[\d\s()+.-]+$/, 'El telefono solo puede contener numeros, espacios y + ( ) -')
  .refine((v) => E164.test(soloDigitos(v)), {
    message:
      'El telefono no parece valido. Escribelo con el codigo de pais, por ejemplo +51913123123.',
  })
  .refine((v) => !esNumeroDeEjemplo(v), {
    message: 'Ese telefono parece un numero de ejemplo. Escribe el numero real del contacto.',
  })
  .optional()
  .or(z.literal(''));

// ---------------------------------------------------------------------------
// Valores de relleno
// ---------------------------------------------------------------------------

const TEXTO_DE_EJEMPLO = new Set([
  'n/a',
  'na',
  'null',
  'undefined',
  'none',
  'xxx',
  '---',
  '...',
]);

const esTextoDeEjemplo = (valor: string): boolean =>
  TEXTO_DE_EJEMPLO.has(String(valor ?? '').trim().toLowerCase());

/** Texto libre con tope de longitud, que no admita los rellenos clasicos. */
const textoCorto = (max: number, etiqueta: string) =>
  z
    .string()
    .max(max, `${etiqueta} no puede pasar de ${max} caracteres`)
    .refine((v) => !esTextoDeEjemplo(v), {
      message: `${etiqueta} no puede ser un texto de relleno como "N/A", "null" o "xxx".`,
    });

// ---------------------------------------------------------------------------
// Telefono (Perú)
// ---------------------------------------------------------------------------
// El formulario de alta es Peru: se escriben 9 digitos y el +51 se pone solo.
// Un numero de otro pais se acepta escribiendo su prefijo (el + lo anula la
// regla de Peru), porque la base ya tiene contactos de Colombia y Argentina y
// no pueden dejar de editarse por un filtro del formulario.
export const PREFIJO_PERU = '+51';
export const DIGITOS_PERU = 9;

/**
 * Telefono tal como queda guardado: siempre con '+' y solo digitos.
 *
 * '987654321' y '+51 987 654 321' devuelven los dos '+51987654321'. Un numero
 * con otro prefijo se devuelve tal cual. Devuelve '' si no queda nada usable.
 */
export function normalizarTelefonoPeru(entrada: string): string {
  const texto = String(entrada ?? '').trim();
  const digitos = texto.replace(/\D+/g, '');
  if (!digitos) return '';

  // El '+' delata numero internacional explicito: se respeta tal cual.
  if (texto.startsWith('+')) return '+' + digitos;
  if (digitos.startsWith('00')) return '+' + digitos.slice(2);
  // Sin '+' son 9 digitos de Peru y el +51 se pone solo. no se comprueba que empiece por 9, porque un fijo peruano no lo
  // empieza y el filtro dejaria fuera contactos reales.
  if (digitos.length === DIGITOS_PERU) return PREFIJO_PERU + digitos;
  return '';
}

/**
 * Telefono que llega de una integracion (WhatsApp).
 *
 * Aqui la regla es al reves que en el formulario: se PERMITE y se NORMALIZA,
 * nunca se rechaza por el formato. Este dato lo manda otro programa, no una
 * persona que pueda corregirlo: si el webhook devuelve 400, el cliente
 * desaparece sin que nadie se entere.
 *
 *   "51987654321"        -> "+51987654321"
 *   "+51 987 654 321"    -> "+51987654321"
 *   "<script>alert(1)"   -> rechazado (no es un numero)
 */
const telefonoDeIntegracion = z
  .string()
  .max(32)
  .optional()
  .nullable()
  .superRefine((valor, ctx) => {
    if (valor === undefined || valor === null || valor.trim() === '') return;
    if (!/^\+?[\d\s()+.-]+$/.test(valor.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'El telefono resuelto no es un numero valido',
      });
    }
  })
  .transform((valor) => {
    if (!valor) return undefined;
    const digitos = valor.replace(/\D+/g, '');
    return digitos ? '+' + digitos : undefined;
  })
  // Piso de 7 digitos: es el minimo de E.164, asi que ningun numero real
  // choca con esto. Solo frena lo que es basura obvia ("+519"), que antes de
  // la normalizacion pasaba desapercibido.
  .refine((valor) => valor === undefined || valor.replace(/\D/g, '').length >= 7, {
    message: 'El telefono resuelto es demasiado corto',
  });

// ---------------------------------------------------------------------------
const socialChannel = z.enum(['whatsapp', 'instagram', 'twitter', 'messenger', 'email']);
const leadSentiment = z.enum(['positive', 'neutral', 'urgent', 'churn_risk']);
const pipelineStage = z.enum(['lead', 'qualified', 'negotiation', 'closed_won', 'closed_lost']);
const conversationStatus = z.enum(['open', 'pending', 'resolved']);
const campaignStatus = z.enum([
  'draft',
  'scheduled',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
const automationTrigger = z.enum(['message_received', 'lead_created', 'tag_added', 'stage_changed']);
const automationActionType = z.enum(['send_ai_reply', 'add_tag', 'change_stage', 'call_webhook', 'assign_agent']);


const contactInteractions = z
  .object({
    firstReply: z.boolean().optional(),
    appointmentConfirmed: z.boolean().optional(),
    proposalSent: z.boolean().optional(),
    dealClosed: z.boolean().optional(),
  })
  .strict();

const contactFields = {
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(50).regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'El nombre solo puede contener letras, espacios, guiones y apóstrofes'),
  avatar: textoCorto(2048, 'El avatar').url().optional().or(z.literal('')),
  handle: z.string().min(1).max(120),
  phone: telefonoSchema,
  email: z
    .string()
    .max(254, 'El correo no puede pasar de 254 caracteres')
    .email('Correo electrónico inválido')
    .refine((v) => !/^(test|example|foo|bar|admin|user|asdas)@/i.test(v) && !/@(test|example)\./i.test(v), {
      message: 'Ese correo parece de ejemplo. Escribe el correo real del contacto.',
    })
    .optional()
    .or(z.literal('')),
  channel: socialChannel.optional(),
  // El mismo tope de 60 que impone POST /api/tags. Sin el, crear una etiqueta
  // desde un contacto se llevaba el limite por delante.
  tags: z.array(textoCorto(60, 'Cada etiqueta').min(1)).max(20, 'Un contacto no puede tener mas de 20 etiquetas').optional(),
  sentiment: leadSentiment.optional(),
  leadScore: z.number().int('El score debe ser un numero entero').min(0).max(100).optional(),
  stage: pipelineStage.optional(),
  dealValue: z.number().min(0, 'El valor no puede ser negativo').finite('El valor no es un numero valido').optional(),
  notes: textoCorto(2000, 'Las notas').optional(),
  lastActive: z.string().max(40).optional(),
  location: textoCorto(120, 'La ubicacion').optional(),
  company: textoCorto(120, 'La empresa').optional(),
  customFields: z.record(z.string().max(60), z.string().max(500)).optional(),
  interactions: contactInteractions.optional(),
};

export const contactCreateSchema = z.object(contactFields).strict();

export const contactUpdateSchema = z
  .object(contactFields)
  .partial()
  .extend({ id: z.string().min(1) })
  .strict();


const conversationFields = {
  id: z.string().min(1).max(64).optional(),
  contactId: z.string().min(1).max(64),
  channel: socialChannel.optional(),
  // Antes `z.number().optional()`: admitia -999999 y 1.7e308, y el valor se
  // pinta tal cual en el globo de no leidos del Inbox.
  unreadCount: z.number().int('El contador debe ser un numero entero').min(0).max(9999).optional(),
  lastMessage: z.string().max(500, 'El ultimo mensaje no puede pasar de 500 caracteres').optional(),
  lastMessageTime: z.string().max(40).optional(),
  status: conversationStatus.optional(),
  assignedAgent: z.string().max(80).optional(),
  summary: z.string().max(1000, 'El resumen no puede pasar de 1000 caracteres').optional(),
};

export const conversationCreateSchema = z.object(conversationFields).strict();

export const conversationUpdateSchema = z
  .object(conversationFields)
  .partial()
  .extend({ id: z.string().min(1) })
  .strict();

// ----- Campaign -----

// Las metricas (sentCount, deliveredCount, openRate, clickRate, conversions)
// NO se aceptan como entrada: se calculan en el servidor agregando la tabla de
// destinatarios. Si el cliente pudiera escribirlas, «enviados: 500» seria un
// numero inventado, que es justo lo que habia antes.
const campaignFields = {
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(120, 'El nombre de la campana no puede pasar de 120 caracteres'),
  channel: socialChannel.optional(),
  segmentId: z.string().min(1).max(64),
  segmentName: z.string().max(120).optional(),
  content: z.string().max(4096, 'El mensaje no puede pasar de 4096 caracteres').optional(),
  imageUrl: z.string().optional(),
  status: campaignStatus.optional(),
  scheduledDate: z.string().max(40).optional(),
  // Momento de lanzamiento. Se valida con el mismo interprete que usa el
  // servidor para convertirlo, de modo que lo que aqui se acepta es
  // exactamente lo que alli se entiende: una cadena que pasa esta validacion
  // nunca puede convertirse luego en una fecha distinta o invalida.
  //
  // `null` es un valor con significado propio: desprogramar la campana. Por
  // eso es nullable y no solo opcional — «no lo toques» (undefined) y
  // «quitalo» (null) son ordenes distintas.
  scheduledAt: z
    .string()
    .nullable()
    .optional()
    .refine((v) => v === null || v === undefined || parseScheduledAt(v) !== null, {
      message:
        'Fecha de programacion invalida. Usa "2026-09-25T14:30" (hora local del negocio) ' +
        'o un instante con zona explicita ("2026-09-25T19:30:00Z").',
    }),
  // `createdAt` ya no se acepta como entrada: lo pone el servidor. Antes el
  // cliente podia escribir la fecha de creacion de la campana.
};

/**
 * Una campana en estado `scheduled` SIN fecha no se lanzaria jamas: el worker
 * busca por `scheduledAt`, asi que se quedaria esperando para siempre sin que
 * nadie lo notara. Es justo el fallo silencioso que estamos arreglando, y no
 * vamos a dejar abierta la puerta para volver a crearlo.
 */
const exigeFechaSiEstaProgramada = (datos: { status?: string; scheduledAt?: string | null }) =>
  datos.status !== 'scheduled' || !!datos.scheduledAt;

const MENSAJE_SIN_FECHA = {
  message: 'Una campana programada necesita fecha y hora de lanzamiento.',
  path: ['scheduledAt'],
};

export const campaignCreateSchema = z
  .object(campaignFields)
  .strict()
  .refine(exigeFechaSiEstaProgramada, MENSAJE_SIN_FECHA);

// En la actualizacion la comprobacion es mas floja a proposito: un PUT parcial
// puede traer `status: 'scheduled'` sin `scheduledAt` porque la fecha ya esta
// guardada de antes. Comparar contra lo que hay en la base es cosa del route
// handler, que es quien puede leerlo.
export const campaignUpdateSchema = z
  .object(campaignFields)
  .partial()
  .extend({ id: z.string().min(1) })
  .strict();

const automationAction = z
  .object({
    type: automationActionType,
    targetValue: z.string(),
  })
  .strict();

const automationFields = {
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(120),
  triggerEvent: automationTrigger,
  conditionChannel: socialChannel.optional(),
  conditionKeyword: z.string().max(120).optional(),
  actions: z.array(automationAction).max(10, 'Una regla no puede tener mas de 10 acciones').optional(),
  enabled: z.boolean().optional(),
  // `triggerCount` y `lastTriggered` los cuenta el motor de reglas, no el
  // cliente. Se quitaron del schema porque cualquier usuario con `write`
  // podia escribir un contador y la UI lo ensefia como "Ejecutada N veces".
};

export const automationCreateSchema = z.object(automationFields).strict();

export const automationUpdateSchema = z
  .object(automationFields)
  .partial()
  .extend({ id: z.string().min(1) })
  .strict();


const segmentFields = {
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  channels: z.array(socialChannel).max(5).optional(),
  minScore: z.number().min(0).max(100).optional(),
  tags: z.array(textoCorto(60, 'Cada etiqueta').min(1)).max(20).optional(),
  stages: z.array(pipelineStage).max(5).optional(),
  // `contactCount` lo calcula `audienceService` contando los contactos que
  // cumplen los criterios. Se quito del schema porque el cliente podia
  // escribirlo y el selector de campanas ensefiaba "500 clientes" cuando eran 3.
  createdAt: z.string().max(40).optional(),
};

export const segmentCreateSchema = z.object(segmentFields).strict();

export const segmentUpdateSchema = z
  .object(segmentFields)
  .partial()
  .extend({ id: z.string().min(1) })
  .strict();


// ----- Users -----
const userFields = {
  id: z.string().min(1).optional(),
   name: z.string({
    error: (issue) => issue.input === undefined ? 'Username is required' : 'Username must be a string'
  }).min(3).max(30).regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, 'El nombre solo puede contener letras, espacios, guiones y apóstrofes'),
  password: z.string({
    error: (issue) => issue.input === undefined ? 'Password is required' : 'Password must be a string'
  }).min(8).max(200, 'La contrasena no puede pasar de 200 caracteres'),
  email: z.email({
    error: (issue) => issue.input === undefined ? 'Email is required' : 'This is not a valid email'
  }).max(254, 'Email is too long'),
  role: z.enum(ROLES),
  // Antes era `z.string().max(30)` sin `.optional()`: obligatorio y de 30
  // caracteres, o sea que toda URL real (que pasa de 30) salia con 400.
  avatarUrl: z.string().max(2048, 'La URL del avatar es demasiado larga').url('La URL del avatar no es valida').optional().or(z.literal(''))
}

const userLoginFields = {
  // Sin `.min()` a proposito: el login responde siempre "credenciales no
  // validas", y distinguir entre "falta la contrasena" y "esta mal puesta"
  // seria una pista para quien prueba contrasenas. El `.max()` si hace falta.
  password: z.string({
    error: (issue) => issue.input === undefined ? 'Password is required' : 'Password must be a string'
  }).max(200, 'La contrasena no puede pasar de 200 caracteres'),
  email: z.email({
    error: (issue) => issue.input === undefined ? 'Email is required' : 'This is not a valid email'
  }).max(254, 'Email is too long'),
}

  export const userCreateSchema = z.object(userFields).strict()
export const userLoginSchema = z.object(userLoginFields).strict()

export const userUpdateSchema = z
  .object(userFields)
  .partial()
  .extend({ id: z.string().min(3) })
  .strict()


// ----- Quick Reply -----

const quickReplyCategory = z.enum(['saludo', 'ventas', 'precios', 'soporte', 'general']);

const quickReplyFields = {
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(60, 'El titulo no puede pasar de 60 caracteres'),
  emoji: z.string().max(8).optional(),
  text: z.string().min(1).max(1000, 'El mensaje no puede pasar de 1000 caracteres'),
  imageUrl: z.string().optional(),
  category: quickReplyCategory.optional(),
};

export const quickReplyCreateSchema = z.object(quickReplyFields).strict();

export const quickReplyUpdateSchema = z
  .object(quickReplyFields)
  .partial()
  .extend({ id: z.string().min(1) })
  .strict();

// ----- Preset Image -----
// Galeria compartida (Campanas + Respuestas Rapidas). `url` acepta tanto un
// link http(s) como un data URL base64 de una imagen subida por archivo, por
// eso no se valida con z.string().url().

const presetImageFields = {
  id: z.string().min(1).optional(),
  name: z.string().min(1).max(120),
  url: z.string().min(1),
  type: z.string().min(1).max(60).optional(),
};

export const presetImageCreateSchema = z.object(presetImageFields).strict();

// ----- Tag -----

export const tagCreateSchema = z
  .object({
    name: z.string().min(1).max(60),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color hex invalido (formato #rrggbb)')
      .optional(),
  })
  .strict();

const apiKeyPermission = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z_]+(:[a-z_]+)?$/, 'Permiso con formato invalido');

export const apiKeyCreateSchema = z
  .object({
    name: z.string().min(1).max(120),
    permissions: z.array(apiKeyPermission).min(1).max(20),
  })
  .strict();

/**
 * Primer error de validacion, en una frase que se pueda mostrar tal cual.
 *
 * Zod deja algunos issues sin `message` util — el de clave desconocida
 * (`.strict()`) viene con `message: undefined`, y los `.max()` traen el texto
 * en ingles. Sin esto, quien recibe el 400 ve literalmente "undefined".
 */
export function primerErrorDeZod(err: { issues?: Array<{ path?: PropertyKey[]; message?: string; code?: string }> }): string {
  const issues = err?.issues ?? [];
  const primero = issues[0];
  if (!primero) return 'Datos inválidos';

  const campo = primero.path?.filter((p) => typeof p === 'string' || typeof p === 'number').join('.');
  const detalle = primero.message?.trim();

  if (primero.code === 'unrecognized_keys') {
    const claves = (issues[0] as { keys?: string[] }).keys ?? [];
    return `Campo desconocido: ${claves.join(', ')}.`;
  }
  if (!detalle || /^too (big|small)/i.test(detalle)) {
    return campo ? `El campo "${campo}" no es valido.` : 'Algún campo no es válido.';
  }
  return campo ? `${campo}: ${detalle}` : detalle;
}

// ---------------------------------------------------------------------------
// Mensajes entrantes de WhatsApp
// ---------------------------------------------------------------------------
// El payload que llega por /api/whatsapp/incoming y /api/whatsapp/webhook
// venia sin validar: el unico chequeo era `typeof body === 'object'`. Por ahi
// entraban nombres de 50.000 caracteres (truncados en silencio), telefonos con
// HTML dentro y mensajes de 100 MB que esquivaban el max(5000) de
// messageSchema, porque ese schema solo corre en POST /api/messages, no aqui.

const jidWhatsapp = z
  .string()
  .max(64)
  .regex(/^[\d@.a-z_-]+$/i, 'Identificador de WhatsApp con formato invalido');

const mediaTypeSchema = z.enum(['image', 'audio', 'video', 'document', 'sticker']);

const mediaDataSchema = z
  .object({
    mimetype: z.string().min(1).max(100),
    data: z.string().min(1),
    size: z.number().int().min(0).optional(),
    // El nombre viaja a la base de datos y se muestra en el chat: sin barras
    // ni rutas, que tampoco sirven para nada ahi.
    filename: z.string().max(200).regex(/^[^/\\]+$/, 'El nombre del archivo no puede contener rutas').nullable().optional(),
    width: z.number().int().min(0).optional(),
    height: z.number().int().min(0).optional(),
  })
  .strict();

export const incomingPayloadSchema = z
  .object({
    messageId: z.string().min(1).max(64).optional(),
    // `from` es el JID ("51953123123@s.whatsapp.net" o "273...@lid") o, si
    // no hay JID, un nombre suelto. De ahi viene la confusion historica que
    // hizo que un contacto se llamara "+51 213 123 123".
    from: z.string().min(1).max(64).optional(),
    fromName: z.string().min(1).max(50).optional(),
    timestamp: z.number().int().min(0).optional(),
    text: z.string().max(5000, 'El mensaje no puede pasar de 5000 caracteres').optional(),
    hasMedia: z.boolean().optional(),
    mediaType: mediaTypeSchema.optional(),
    media: mediaDataSchema.optional(),
    receivedAt: z.string().max(40).optional(),
    isLid: z.boolean().optional(),
    lidBase: jidWhatsapp.optional(),
    // `resolvedPhone` se guardaba tal cual en contacts.phone y de ahi llega a
    // campaign_recipients.address, que es la direccion a la que se envia. Por
    // eso pasa por una regla, pero permisiva y normalizadora: lo que llega sin
    // '+' se completa, y solo se rechaza lo que no es un numero.
    resolvedPhone: telefonoDeIntegracion,
    // El mensaje crudo tal como lo entrega Baileys. Lo usa
    // parseInteractive() (src/lib/whatsappInteractive.ts) para traducir los
    // botones de WhatsApp a texto antes de guardarlo, y lo consume el
    // componente Inbox/InteractiveButtons.tsx para dibujarlos en el chat.
    //
    // Se declara porque el navegador lo manda SIEMPRE: src/app/page.tsx lo
    // incluye en el body del POST a /api/whatsapp/incoming sin condicion. Y
    // como este schema es `.strict()`, toda clave ausente de la lista se
    // rechaza: con el campo sin declarar, CUALQUIER mensaje con botones salia
    // con 400 y no llegaba ni al upsert de contacto ni al de conversacion ni al
    // guardado en Mongo. El safeParse devuelve antes de tocar la base, asi que
    // no habia ni error en la UI ni rastro de lo perdido.
    //
    // `z.unknown()` y no `z.any()`: se acepta el valor sin inspeccionarlo, que
    // es lo que corresponde porque aqui no se valida nada. No sale de la
    // funcion: parseInteractive() extrae de el el texto y los botones, y el
    // resto no se persiste.
    rawMessage: z.unknown().optional(),
  })
  .strict();

/** Un JID de WhatsApp tal y como llega en `from`. */
export function esJidValido(valor: string | undefined | null): boolean {
  if (!valor) return false;
  return jidWhatsapp.safeParse(valor).success;
}

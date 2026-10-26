import { describe, it, expect } from 'vitest';
import {
  contactCreateSchema,
  conversationCreateSchema,
  incomingPayloadSchema,
  segmentCreateSchema,
  automationCreateSchema,
  campaignCreateSchema,
  quickReplyCreateSchema,
  userCreateSchema,
  normalizarTelefonoPeru,
  soloDigitos,
  primerErrorDeZod,
} from '@/lib/schemas';

const contactoValido = {
  name: 'Valeria Gomez',
  handle: '+51987654321',
  phone: '+51987654321',
  channel: 'whatsapp' as const,
};

describe('telefono: regla E.164', () => {
  it('acepta numeros reales de Peru, Colombia, Argentina y Espana', () => {
    for (const tel of ['+51987654321', '+573101234567', '+5491145218820', '+34600123456']) {
      expect(contactCreateSchema.safeParse({ ...contactoValido, phone: tel }).success, tel).toBe(true);
    }
  });

  it('acepta el numero con espacios, guiones y parentesis', () => {
    expect(contactCreateSchema.safeParse({ ...contactoValido, phone: '+51 (987) 654-321' }).success).toBe(true);
  });

  it('rechaza lo que el regex anterior si admitia', () => {
    // El regex viejo era /^[\d\s+()-]*$/ con '*', no '+': por eso pasaba '+'.
    for (const tel of ['+', '()', '---', '   ', '+ () ---']) {
      expect(contactCreateSchema.safeParse({ ...contactoValido, phone: tel }).success, tel).toBe(false);
    }
  });

  it('rechaza numeros de ejemplo', () => {
    for (const tel of ['111111111', '+999999999', '000000000', '123456789', '+51555555555']) {
      expect(contactCreateSchema.safeParse({ ...contactoValido, phone: tel }).success, tel).toBe(false);
    }
  });

  it('rechaza un numero demasiado corto para ser real', () => {
    expect(contactCreateSchema.safeParse({ ...contactoValido, phone: '+5191' }).success).toBe(false);
  });

  it('soloDigitos conserva el + inicial', () => {
    expect(soloDigitos('+51 987 654-321')).toBe('+51987654321');
    expect(soloDigitos('51987654321')).toBe('51987654321');
  });
});

describe('correo electronico', () => {
  it('rechaza direcciones mal formadas', () => {
    for (const mail of ['a@b', 'sin-arroba.com', 'a@@b.com', 'a b@c.com']) {
      expect(contactCreateSchema.safeParse({ ...contactoValido, email: mail }).success, mail).toBe(false);
    }
  });

  it('rechaza correos de ejemplo', () => {
    for (const mail of ['test@test.com', 'foo@bar.com', 'user@example.com', 'admin@test.es']) {
      expect(contactCreateSchema.safeParse({ ...contactoValido, email: mail }).success, mail).toBe(false);
    }
  });

  it('acepta un correo real', () => {
    expect(contactCreateSchema.safeParse({ ...contactoValido, email: 'juan@empresa.com.pe' }).success).toBe(true);
  });
});

describe('limites de longitud', () => {
  it('las notas no pueden pasar de 2000 caracteres', () => {
    expect(contactCreateSchema.safeParse({ ...contactoValido, notes: 'x'.repeat(2000) }).success).toBe(true);
    expect(contactCreateSchema.safeParse({ ...contactoValido, notes: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('las notas no aceptan texto de relleno', () => {
    for (const nota of ['N/A', 'null', 'undefined', 'xxx']) {
      expect(contactCreateSchema.safeParse({ ...contactoValido, notes: nota }).success, nota).toBe(false);
    }
  });

  it('cada etiqueta respeta el mismo tope de 60 que POST /api/tags', () => {
    const conEtiquetaLarga = { ...contactoValido, tags: ['x'.repeat(61)] };
    expect(contactCreateSchema.safeParse(conEtiquetaLarga).success).toBe(false);
  });

  it('un contacto no puede tener mas de 20 etiquetas', () => {
    const muchas = { ...contactoValido, tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) };
    expect(contactCreateSchema.safeParse(muchas).success).toBe(false);
  });

  it('el mensaje de campana no puede pasar de 4096 caracteres', () => {
    const base = { title: 'Prueba', segmentId: 'seg_1' };
    expect(campaignCreateSchema.safeParse({ ...base, content: 'x'.repeat(4096) }).success).toBe(true);
    expect(campaignCreateSchema.safeParse({ ...base, content: 'x'.repeat(4097) }).success).toBe(false);
  });

  it('las respuestas rapidas tienen tope', () => {
    expect(quickReplyCreateSchema.safeParse({ title: 'x'.repeat(61), text: 'hola' }).success).toBe(false);
    expect(quickReplyCreateSchema.safeParse({ title: 'hola', text: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('numeros que antes aceptaban cualquier cosa', () => {
  it('unreadCount es un entero entre 0 y 9999', () => {
    const base = { contactId: 'c1' };
    expect(conversationCreateSchema.safeParse({ ...base, unreadCount: -999999 }).success).toBe(false);
    expect(conversationCreateSchema.safeParse({ ...base, unreadCount: 1.7e308 }).success).toBe(false);
    expect(conversationCreateSchema.safeParse({ ...base, unreadCount: 2.5 }).success).toBe(false);
    expect(conversationCreateSchema.safeParse({ ...base, unreadCount: 3 }).success).toBe(true);
  });

  it('leadScore es entero y dealValue no es negativo', () => {
    expect(contactCreateSchema.safeParse({ ...contactoValido, leadScore: 65.5 }).success).toBe(false);
    expect(contactCreateSchema.safeParse({ ...contactoValido, dealValue: -500 }).success).toBe(false);
    expect(contactCreateSchema.safeParse({ ...contactoValido, dealValue: Infinity }).success).toBe(false);
  });
});

describe('metricas que el cliente no puede escribir', () => {
  it('contactCount ya no se acepta como entrada de un segmento', () => {
    const res = segmentCreateSchema.safeParse({ name: 'Clientes', contactCount: 500 });
    expect(res.success).toBe(false);
  });

  it('triggerCount ya no se acepta como entrada de una automatizacion', () => {
    const res = automationCreateSchema.safeParse({
      name: 'Bienvenida',
      triggerEvent: 'lead_created',
      triggerCount: 342,
    });
    expect(res.success).toBe(false);
  });
});

describe('payload entrante de WhatsApp', () => {
  const valido = {
    from: '51953123123@s.whatsapp.net',
    fromName: 'Juan Perez',
    text: 'hola',
    messageId: 'm1',
  };

  it('acepta un payload normal', () => {
    expect(incomingPayloadSchema.safeParse(valido).success).toBe(true);
  });

  it('rechaza mensajes mas largos de 5000 caracteres', () => {
    // Antes se guardaban: messageSchema (max 5000) solo corre en POST /api/messages.
    expect(incomingPayloadSchema.safeParse({ ...valido, text: 'x'.repeat(5001) }).success).toBe(false);
  });

  it('rechaza resolvedPhone que no es un telefono', () => {
    // Este campo acaba en contacts.phone y de ahi en campaign_recipients.address.
    for (const tel of ['<script>alert(1)</script>', '+519', 'no soy un telefono', 'x'.repeat(200)]) {
      expect(incomingPayloadSchema.safeParse({ ...valido, resolvedPhone: tel }).success, tel).toBe(false);
    }
  });

  it('rechaza isLid que no es booleano', () => {
    expect(incomingPayloadSchema.safeParse({ ...valido, isLid: 'si' }).success).toBe(false);
    expect(incomingPayloadSchema.safeParse({ ...valido, isLid: true }).success).toBe(true);
  });

  it('rechaza nombres fuera de rango en vez de truncarlos en silencio', () => {
    expect(incomingPayloadSchema.safeParse({ ...valido, fromName: 'A'.repeat(5000) }).success).toBe(false);
  });

  it('rechaza nombres de archivo con rutas', () => {
    const media = { mimetype: 'image/png', data: 'iVBORw0KGgo=', filename: '../../etc/passwd' };
    expect(incomingPayloadSchema.safeParse({ ...valido, hasMedia: true, mediaType: 'image', media }).success).toBe(false);
  });

  it('rechaza campos desconocidos', () => {
    expect(incomingPayloadSchema.safeParse({ ...valido, hack: 1 }).success).toBe(false);
  });

  it('acepta el payload EXACTAMENTE como lo arma el navegador', () => {
    // src/app/page.tsx incluye `rawMessage` en el body del POST sin condicion,
    // y este schema es `.strict()`. Con el campo sin declarar, TODO mensaje con
    // botones salia con 400 y no llegaba a la base. El body de abajo está
    // copiado del fetch real, con las claves `undefined` que JSON.stringify
    // termina borrando.
    const cuerpo = {
      messageId: '3EB0A7C1',
      from: '51987654321@s.whatsapp.net',
      fromName: 'Cliente',
      timestamp: 1763000000,
      text: 'hola',
      hasMedia: undefined,
      mediaType: undefined,
      media: undefined,
      receivedAt: '2026-01-01T00:00:00.000Z',
      isLid: false,
      lidBase: undefined,
      resolvedPhone: '+51987654321',
      rawMessage: { key: { id: '3EB0A7C1' }, message: { conversation: 'hola' } },
    };
    const r = incomingPayloadSchema.safeParse(JSON.parse(JSON.stringify(cuerpo)));
    expect(r.success).toBe(true);
  });

  it('no rompe los botones: rawMessage llega intacto al parseo', () => {
    // parseInteractive() (ingest.ts) depende de este campo para traducir los
    // botones a texto, e InteractiveButtons.tsx los dibuja en el chat. Si el
    // schema lo transformara o lo perdiera, las plantillas con boton dejarían
    // de mostrarse.
    const boton = {
      interactiveMessage: {
        header: { title: 'XIO CRM' },
        body: { text: 'Confirmar pedido' },
        nativeFlowMessage: {
          buttons: [{ name: 'quick_reply', buttonParamsJson: '{"display_text":"Si, confirmo"}' }],
        },
      },
    };
    const r = incomingPayloadSchema.safeParse({ ...valido, rawMessage: boton });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rawMessage).toEqual(boton);
  });
});

describe('avatarUrl de usuario', () => {
  it('acepta una URL real', () => {
    // Antes era z.string().max(30) sin .optional(): obligatoria y de 30
    // caracteres, o sea que toda URL real salia con 400.
    const usuario = {
      name: 'Administrador',
      password: 'clave12345',
      email: 'admin@empresa.com',
      role: 'Administrador' as const,
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
    };
    expect(userCreateSchema.safeParse(usuario).success).toBe(true);
  });
});

describe('normalizarTelefonoPeru: el formulario es Peru', () => {
  it('anade el +51 a los 9 digitos', () => {
    expect(normalizarTelefonoPeru('987654321')).toBe('+51987654321');
    expect(normalizarTelefonoPeru('  987654321 ')).toBe('+51987654321');
  });

  it('no exige que empiece por 9', () => {
    // Un fijo peruano no empieza por 9, y el filtro lo dejaba afuera.
    expect(normalizarTelefonoPeru('123456789')).toBe('+51123456789');
  });

  it('no duplica el +51 si ya viene puesto', () => {
    expect(normalizarTelefonoPeru('+51987654321')).toBe('+51987654321');
    expect(normalizarTelefonoPeru('+51 987 654 321')).toBe('+51987654321');
  });

  it('respeta un numero de otro pais si trae su +', () => {
    expect(normalizarTelefonoPeru('+573101234567')).toBe('+573101234567');
    expect(normalizarTelefonoPeru('+5491145218820')).toBe('+5491145218820');
    expect(normalizarTelefonoPeru('+34600123456')).toBe('+34600123456');
  });

  it('exige 9 digitos exactos cuando no hay +', () => {
    for (const malo of ['98765432', '9876543210', 'abc', '98765abc21']) {
      expect(normalizarTelefonoPeru(malo), malo).toBe('');
    }
  });

  it('devuelve cadena vacia si no hay numero', () => {
    expect(normalizarTelefonoPeru('')).toBe('');
    expect(normalizarTelefonoPeru('   ')).toBe('');
  });
});

describe('resolvedPhone: la integracion manda datos, no personas', () => {
  const base = { from: '51987654321@s.whatsapp.net', fromName: 'Cliente', text: 'hola' };
  const parse = (extra: Record<string, unknown>) =>
    incomingPayloadSchema.safeParse({ ...base, ...extra });

  it('acepta el numero SIN + y lo normaliza', () => {
    // Este es el caso que rompia clientes reales: el servicio puede mandar
    // el numero sin '+' y la validacion estricta lo rechazaba con 400.
    const r = parse({ resolvedPhone: '51987654321' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.resolvedPhone).toBe('+51987654321');
  });

  it('acepta espacios y lo normaliza', () => {
    const r = parse({ resolvedPhone: '+51 987 654 321' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.resolvedPhone).toBe('+51987654321');
  });

  it('acepta el numero tal cual con +', () => {
    const r = parse({ resolvedPhone: '+51987654321' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.resolvedPhone).toBe('+51987654321');
  });

  it('rechaza lo que no es un numero', () => {
    for (const malo of ['<script>alert(1)</script>', 'no soy un numero', 'abc']) {
      expect(parse({ resolvedPhone: malo }).success, malo).toBe(false);
    }
  });

  it('deja pasar el payload sin resolvedPhone', () => {
    const r = parse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.resolvedPhone).toBeUndefined();
  });
});

describe('el telefono se guarda igual con y sin resolvedPhone', () => {
  // ingest.ts tiene dos caminos para armar el telefono del contacto:
  //   - con resolvedPhone -> ya viene normalizado, "+51987654321"
  //   - sin resolvedPhone -> sale de normalizePhone(), que solo quita el
  //     sufijo @s.whatsapp.net y deja los digitos pelados CON codigo de pais,
  //     "51987654321". Ahi se le antepone el '+' a mano.
  // Se guardaban en la misma columna con formatos distintos, y como
  // upsertContact() deduplica con findFirst({ where: { phone } }) (texto exacto), el mismo cliente quedaba duplicado segun por que entrada
  // llegara el mensaje.

  /** Lo que hace el camino sin resolvedPhone: normalizePhone() + el '+'. */
  const caminoSinResolved = (digitos: string) => `+${digitos.replace(/\D+/g, '')}`;

  it('los dos caminos producen el mismo string', () => {
    const desdeResolved = '+51987654321';
    const desdeFrom = caminoSinResolved('51987654321');
    // La deduplicacion compara texto exacto: tienen que coincidir caracter por caracter o el mismo cliente queda en dos filas.
    expect(desdeFrom).toBe(desdeResolved);
  });

  it('no le antepone el +51 a un numero que ya trae codigo de pais', () => {
    // El bug de este arreglo: pasar por normalizarTelefonoPeru() (que espera 9
    // digitos locales) devolvia cadena vacia con los 11 que ya traen el 51, y el
    // contacto se guardaba SIN telefono. Anteponer solo el '+' lo evita.
    expect(caminoSinResolved('51987654321')).toBe('+51987654321');
    expect(normalizarTelefonoPeru('51987654321')).toBe('');
  });

  it('respeta el codigo de pais que venga, sin Assume +51', () => {
    // Un numero que llega sin el '+' conserva su pais: anteponer el signo no
    // cambia el prefijo.
    expect(caminoSinResolved('34600123456')).toBe('+34600123456'); // España
    expect(caminoSinResolved('573101234567')).toBe('+573101234567'); // Colombia
  });
});

describe('primerErrorDeZod', () => {
  it('nunca devuelve undefined', () => {
    // El issue de clave desconocida de .strict() viene con message: undefined,
    // y antes el formulario mostraba literalmente la palabra "undefined".
    const res = contactCreateSchema.safeParse({ ...contactoValido, hack: 1 });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msg = primerErrorDeZod(res.error);
      expect(msg).toBeTruthy();
      expect(msg).not.toContain('undefined');
      expect(msg).toContain('hack');
    }
  });
});
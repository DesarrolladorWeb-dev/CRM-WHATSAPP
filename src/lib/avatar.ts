/**
 * Avatares generados aqui mismo, sin salir a internet.
 *
 * Antes se pedian a DiceBear (api.dicebear.com). El servicio funciona, pero es
 * un dominio de terceros: Brave, uBlock y cualquier bloqueador lo cortan, y el
 * usuario ve el icono de imagen rota en TODA la lista de contactos. Ademas son
 * tantas peticiones externas como contactos haya en pantalla.
 *
 * Aqui se devuelve un `data:` URI con el SVG incrustado: no hay red de por
 * medio, no hay nada que bloquear y pinta al instante. El CSP ya permite
 * `img-src ... data:` (ver next.config.mjs), asi que los componentes siguen
 * usando <img src={contact.avatar}> sin cambiar una linea.
 */

/**
 * Paleta deliberadamente apagada. Son tonos de marca sobrios, no los colores
 * saturados que suelen generar estas librerias: el avatar tiene que leerse
 * como parte de un CRM, no competir con el contenido del chat.
 */
const PALETA = [
  '#475569', // slate
  '#1d4ed8', // azul
  '#0f766e', // teal
  '#b45309', // ambar oscuro
  '#9f1239', // rosa oscuro
  '#4338ca', // indigo
  '#15803d', // verde
  '#7c2d12', // marron
];

/**
 * Hash estable (djb2) para elegir color a partir del nombre.
 *
 * Importa que sea estable y no aleatorio: un contacto debe conservar SIEMPRE
 * el mismo color, entre recargas y entre navegadores. El color acaba siendo
 * una senal visual mas para reconocerlo de un vistazo en la lista.
 */
function hashEstable(texto: string): number {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) {
    h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Iniciales legibles: una letra por cada una de las dos primeras palabras.
 *
 * "Davy"                -> "D"
 * "ONG ASDEN juanCarlos" -> "OA"
 *
 * Se ignoran los trozos que no empiezan por letra (emojis ya filtrados antes,
 * numeros sueltos, guiones) para no acabar con iniciales como "3" o "-".
 */
function iniciales(nombre: string): string {
  const palabras = nombre
    .trim()
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p));

  if (palabras.length === 0) return '';
  if (palabras.length === 1) return palabras[0].charAt(0).toUpperCase();
  return (palabras[0].charAt(0) + palabras[1].charAt(0)).toUpperCase();
}

/** Empaqueta un SVG como data: URI. */
function comoDataUri(svg: string): string {
  // encodeURIComponent en vez de base64: pesa menos y el resultado se puede
  // leer de un vistazo al depurar.
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

/** Avatar con las iniciales del contacto sobre un fondo de color estable. */
export function avatarDeIniciales(nombre: string): string {
  const letras = iniciales(nombre);
  const fondo = PALETA[hashEstable(nombre) % PALETA.length];

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <rect width="128" height="128" fill="${fondo}"/>
      <text x="64" y="64" fill="#ffffff"
            font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            font-size="${letras.length > 1 ? 48 : 56}" font-weight="600"
            text-anchor="middle" dominant-baseline="central">${letras}</text>
    </svg>`;

  return comoDataUri(svg);
}

/**
 * Avatar para contactos sin nombre: silueta neutra.
 *
 * Es el mismo para todos a proposito. Un contacto sin nombre no tiene identidad
 * que representar, y darle color o iniciales inventadas sugeriria una
 * informacion que no tenemos.
 */
export function avatarGenerico(): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
      <rect width="128" height="128" fill="#e2e8f0"/>
      <circle cx="64" cy="50" r="21" fill="#94a3b8"/>
      <path d="M64 78c-19 0-34 12-37 29h74c-3-17-18-29-37-29z" fill="#94a3b8"/>
    </svg>`;

  return comoDataUri(svg);
}

/**
 * Punto de entrada: decide que avatar corresponde.
 *
 * `tieneNombre` lo decide quien llama, porque desde aqui no se puede
 * distinguir un nombre real de un marcador de posicion: "+51 953 740 108" y
 * "Contacto WhatsApp" son nombres validos como cadena, pero no identifican a
 * nadie y sus "iniciales" no significarian nada.
 */
export function avatarPara(nombre: string, tieneNombre: boolean): string {
  if (!tieneNombre) return avatarGenerico();
  const letras = iniciales(nombre);
  return letras ? avatarDeIniciales(nombre) : avatarGenerico();
}

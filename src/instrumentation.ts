/**
 * Se ejecuta una vez al arrancar el servidor (Next.js instrumentation hook).
 * Falla rapido si falta configuracion de seguridad obligatoria en produccion,
 * en vez de descubrirlo en la primera request que toque API keys.
 *
 * El import es dinamico y esta detras del check de runtime: `apiKeySecurity`
 * usa `crypto` de Node, que no existe en el Edge Runtime donde Next tambien
 * evalua este archivo.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertApiKeyHashSecret } = await import('@/lib/apiKeySecurity');
    assertApiKeyHashSecret();

    const { assertJwtSecret } = await import('@/lib/repositories/userRepo');
    assertJwtSecret();

    const { logger, captureException } = await import('@/lib/logger');

    // Error tracking a nivel de proceso: cualquier excepcion o promesa
    // rechazada que se escape de los route handlers queda registrada con un
    // errorId, en vez de perderse en la consola o tumbar el proceso en
    // silencio. No reemplaza el manejo de errores dentro de cada ruta.
    process.on('uncaughtException', (err) => {
      captureException(err, { source: 'uncaughtException' });
    });

    process.on('unhandledRejection', (reason) => {
      captureException(reason, { source: 'unhandledRejection' });
    });

    // Apagado ordenado: en un proceso persistente (Docker/VPS) el
    // orquestador manda SIGTERM antes de matar el contenedor (deploy,
    // restart, scale down). Sin esto las conexiones a Postgres/Mongo quedan
    // abiertas hasta que el proveedor gestionado las expira por timeout,
    // agotando el pool en despliegues seguidos.
    // Worker de campanas. Sin esto, una campana programada se queda en
    // `scheduled` esperando un clic que nadie va a dar: `launchCampaign` solo
    // se invocaba desde la ruta de envio manual, que exige sesion de usuario.
    //
    // Vive aqui porque este proyecto asume un proceso Node persistente
    // (Docker/VPS con `npm start`, ver README): el intervalo sobrevive entre
    // peticiones. En serverless no serviria y habria que apuntar un cron
    // externo a /api/campaigns/tick, que hace exactamente lo mismo.
    const { iniciarScheduler, detenerScheduler } = await import(
      '@/lib/services/campaignScheduler'
    );
    iniciarScheduler();

    let shuttingDown = false;
    const shutdown = async (signal: NodeJS.Signals) => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('server.shutting_down', { signal });
      // Primero se para el worker: arrancar un despacho nuevo mientras se
      // cierran los pools de conexion solo produce errores.
      detenerScheduler();
      const { closePostgres } = await import('@/lib/postgres');
      const { closeDatabase } = await import('@/lib/mongodb');
      await Promise.allSettled([closePostgres(), closeDatabase()]);
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    logger.info('server.started', { runtime: 'nodejs' });
  }
}

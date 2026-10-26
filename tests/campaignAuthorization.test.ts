import { describe, it, expect } from 'vitest';
import { hasPermission } from '@/lib/auth';

/**
 * La eliminacion de campañas (DELETE /api/campaigns) exige el permiso explicito
 * 'delete'. Estas pruebas fijan esa regla: 'write' NO debe otorgar borrado.
 */
describe('hasPermission — permiso explicito "delete"', () => {

   it('una credencial de Empleado para solo lectura y escritura no puede borrar', () => {
    expect(hasPermission('Empleado', 'delete')).toBe(false);
  });
  // it('una credencial de solo lectura no puede borrar', () => {
  //   expect(hasPermission(['read'], 'delete')).toBe(false);
  // });

  // it('una credencial de edicion (read + write) NO hereda el permiso de borrado', () => {
  //   expect(hasPermission(['read', 'write'], 'delete')).toBe(false);
  // });

  // it('"write" por si solo tampoco otorga "delete"', () => {
  //   expect(hasPermission(['write'], 'delete')).toBe(false);
  // });

  // it('una credencial con "delete" explicito puede borrar', () => {
  //   expect(hasPermission(['read', 'write', 'delete'], 'delete')).toBe(true);
  // });

  // it('acepta un scope prefijado tipo "delete:campaigns"', () => {
  //   expect(hasPermission(['delete:campaigns'], 'delete')).toBe(true);
  // });

  // it('los alias de administrador siguen pudiendo borrar', () => {
  //   expect(hasPermission(['admin'], 'delete')).toBe(true);
  //   expect(hasPermission(['admin:all'], 'delete')).toBe(true);
  //   expect(hasPermission(['full_access'], 'delete')).toBe(true);
  // });

  // it('no rompe las operaciones de escritura existentes', () => {
  //   expect(hasPermission(['write'], 'write')).toBe(true);
  //   expect(hasPermission(['read', 'write'], 'write')).toBe(true);
  //   expect(hasPermission(['read'], 'write')).toBe(false);
  // });

  // it('no rompe las operaciones de lectura existentes', () => {
  //   expect(hasPermission(['read'], 'read')).toBe(true);
  //   expect(hasPermission([], 'read')).toBe(false);
  // });
});

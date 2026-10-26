import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'prisma/config';

// Prisma CLI usa los mismos archivos de entorno que Next.js, incluido .env.local.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
  },
});
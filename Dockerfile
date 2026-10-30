
#FROM node:24-bookworm-slim
#FROM node:22-alpine
FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar dependencias
COPY package*.json ./

# Copiar el esquema de Prisma ANTES de npm ci
COPY prisma ./prisma

COPY scripts ./scripts

# Instalar dependencias y ejecutar postinstall
RUN npm ci

# Copiar el resto del proyecto
COPY . .

# Continuar con tus instrucciones actuales...
ARG NEXT_PUBLIC_WHATSAPP_SERVICE_URL

ENV NEXT_PUBLIC_WHATSAPP_SERVICE_URL=$NEXT_PUBLIC_WHATSAPP_SERVICE_URL


RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start"]

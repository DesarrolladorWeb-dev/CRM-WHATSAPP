import { Role } from "@/types";
import type { PrismaClient, Prisma, User } from "../../generated/prisma/client";
import bcrypt from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import { AuthError } from "../errors";

/**
 * Falla rapido si falta JWT_SECRET. Sin el, jose intenta firmar con una
 * clave de longitud cero y el login responde 500 con un error de WebCrypto
 * ("Zero-length key is not supported"), que no dice nada sobre la causa.
 *
 * A diferencia del pepper de las API keys, este no tiene fallback de
 * desarrollo: sin la variable el login no funciona en ningun entorno.
 */
export function assertJwtSecret(): void {
  if (!process.env.JWT_SECRET) {
    throw new Error(
      '[auth] JWT_SECRET es obligatorio. Sin el, los tokens de sesion no se ' +
      'pueden firmar y el login responde 500. Generalo con ' +
      'openssl rand -hex 32 y definelo en el entorno antes de arrancar.'
    );
  }
}

const salt = parseInt(process.env.SALT_ROUNDS || "10", 10) || 10
const secret = new TextEncoder().encode(process.env.JWT_SECRET)

type UserRow = User;

type UserInput = Partial<User>


export async function generateToken(userId: string) {
    return new SignJWT({
        userId
    })
    .setProtectedHeader({alg: 'HS256'})
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)
}

export async function verifyToken(token: string){
    const {payload} = await jwtVerify(token, secret)
    return payload
}

async function scalarData(input: UserInput): Promise<Record<string, unknown>> {
    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name
    if (input.email !== undefined) data.email = input.email
    if (input.password !== undefined) data.password = await bcrypt.hash(input.password, salt)
    if (input.role !== undefined) data.role = input.role
    if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl
    return data
}

// Lo que la API expone de un usuario. Deliberadamente NO incluye el hash de
// la contrasena: el tipo lo hace imposible de filtrar por descuido.
export type ApiUser = Omit<UserRow, 'password'>;

export function toApiUser(row: UserRow): ApiUser {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role as Role,
        avatarUrl: row.avatarUrl,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    }
}

export async function listUsers(db: PrismaClient): Promise<ApiUser[]> {
    const rows = await db.user.findMany({ orderBy: { createdAt: 'desc' } })
    return rows.map(toApiUser)
}

export async function getUser(db: PrismaClient, id: string): Promise<ApiUser | null> {
    const row = await db.user.findUnique({ where: { id } });
    return row ? toApiUser(row) : null;
}

export async function upsertUser(db: PrismaClient, id: string, input: UserInput): Promise<ApiUser | null> {
    const scalar = await scalarData(input)
    const user = await db.user.upsert({
        where: { id },
        update: scalar as Prisma.UserUpdateInput,
        create: {...(scalar as Prisma.UserUncheckedCreateInput)}
    })

    const row = await db.user.findUnique({ where: { id: user.id } });
    return row ? toApiUser(row) : null;
}

export async function updateUser(db: PrismaClient, id: string, input: UserInput): Promise<ApiUser | null> {
    const exists = await db.user.findUnique({where: {id}})
    if (!exists) return null;

    await db.user.update({
        where: {id},
        data: scalarData(input) as Prisma.UserUpdateInput
    })

    const row = await db.user.findUnique({ where: {id}})
    if (!row) return null;
    return toApiUser(row)
}


export async function deleteUser(db: PrismaClient, id: string): Promise<void> {
    await db.user.delete({ where: { id } })
}

export async function Login(db: PrismaClient, email: string, password: string): Promise<{user: ApiUser, token: string}> {
    const exists = await db.user.findUnique({where: {email}})
    if (!exists) throw new AuthError('Credenciales inválidas')

    const isValid = await bcrypt.compare(password, exists.password)
    if (!isValid) throw new AuthError('Credenciales inválidas')

    const token = await generateToken(exists.id)
    return {user: toApiUser(exists), token}
}


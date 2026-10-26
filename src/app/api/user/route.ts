import { requireAuth, requireUserPermission  } from "@/lib/auth";
import { dbUnavailableResponse, DEMO_MODE } from "@/lib/demo";
import { captureException, logger, motivo } from "@/lib/logger";
import { connectToPostgres } from "@/lib/postgres";
import { deleteUser, listUsers, upsertUser,getUser } from "@/lib/repositories/userRepo";
import { userCreateSchema, primerErrorDeZod } from "@/lib/schemas";
import { INITIAL_USERS } from "@/mockData";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
    const denied = await requireUserPermission(req, 'read')
    if (denied) return denied
    try {
        const db = await connectToPostgres()

        if (!db) {
            if (DEMO_MODE) {
                return NextResponse.json({ success: true, source: 'demo', data: INITIAL_USERS })
            }
            return dbUnavailableResponse()
        }

        const users = await listUsers(db)
        if (users.length === 0 && DEMO_MODE) {
            return NextResponse.json({ success: true, source: 'demo', data: INITIAL_USERS })
        }
        return NextResponse.json({ success: true, source: 'postgres', data: users })
    } catch {
        if (DEMO_MODE) {
            return NextResponse.json({ success: true, source: 'demo', data: INITIAL_USERS })
        }
        return NextResponse.json({
            success: false,
            error: 'No se obtuvieron los usuarios'
        })
    }
}

export async function POST(req: NextRequest) {

    const denied = await requireUserPermission(req, 'write')
    if (denied) return denied
    
    try {
        const body = await req.json()
        const parsed = userCreateSchema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: primerErrorDeZod(parsed.error), details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const db = await connectToPostgres()

        if (!db) {
            if (DEMO_MODE) {
                return NextResponse.json({ success: true, source: 'demo', data: INITIAL_USERS })
            }
            return dbUnavailableResponse()
        }

        // Sin id, `parsed.data.id || ''` hacia upsert sobre `where: {id: ''}`, que no
        // encuentra nunca: todos los POST sin id caian en la misma fila vacia,
        // sin error y sin aviso. Si no viene id, se crea con uno nuevo.
        const { id: idPedido, ...datos } = parsed.data;
        const id = idPedido || `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const saved = await upsertUser(db, id, datos)
        // upsertUser ya devuelve un ApiUser, sin el hash de la contrasena.
        return NextResponse.json({  success: true, source: 'postgres', data: saved  })
    } catch (err) {
        const errorId = captureException(err, { route: `/api/users`, method: 'POST' })
        logger.error('Error in POST /api/users', { motivo: motivo(err) })
        return NextResponse.json({ success: false, error: 'Error interno en el servidor', errorId }, { status: 500 })
    }
}

export async function DELETE(req: NextRequest) {

    try {
        const { payload, error } = await requireAuth(req)
        if (error) return error

        const db = await connectToPostgres()

        if (!db) {
            if (DEMO_MODE) {
                return NextResponse.json({ success: true, source: 'demo', data: INITIAL_USERS })
            }
            return dbUnavailableResponse()
        }

        const requester = await getUser(db, payload!.userId)
        if (!requester || requester.role !== 'Administrador') {
            return NextResponse.json({ success: false, error: 'No tienes permisos para eliminar usuarios' }, { status: 403 })
        }

        const { searchParams } = new URL(req.url)
        const id = searchParams.get('id')
        if (!id) return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 })

        await deleteUser(db, id)

        return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente' })
    } catch (err) {
        const errorId = captureException(err, { route: `/api/users`, method: 'DELETE' })
        logger.error('Error in DELETE /api/users', { motivo: motivo(err) })
        return NextResponse.json({ success: false, error: 'Error interno en el servidor', errorId }, { status: 500 })
    }
}
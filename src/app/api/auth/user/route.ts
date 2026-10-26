import { requireAuth } from "@/lib/auth";
import { dbUnavailableResponse, DEMO_MODE } from "@/lib/demo";
import { AuthError } from "@/lib/errors";
import { connectToPostgres } from "@/lib/postgres";
import { getUser, Login } from "@/lib/repositories/userRepo";
import { enforceLoginRateLimit } from "@/lib/rateLimit";
import { userLoginSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const parsed = userLoginSchema.safeParse(body)

        const db = await connectToPostgres()

        if (!db) {
            if (DEMO_MODE) {
                return NextResponse.json({ success: true, source: 'demo' })
            }
            return dbUnavailableResponse()
        }

        if (!parsed.success) {
            return NextResponse.json(
                { success: false, error: 'Datos de usuario inválidos', details: parsed.error.flatten() },
                { status: 400 }
            )
        }
        const email = parsed.data.email
        const password = parsed.data.password

        const limited = await enforceLoginRateLimit(req, email)
        if (limited) return limited

        const logged = await Login(db, email, password)
        // Login ya devuelve un ApiUser, sin el hash de la contrasena.

        const response = NextResponse.json({
            success: true,
            source: 'postgres',
            // El token NO viaja en el cuerpo: va solo en la cookie httpOnly de
            // mas abajo. Devolverlo aqui anulaba el httpOnly, porque cualquier
            // script que interceptara esta respuesta se lo llevaba. Ningun
            // consumidor lo usaba: la sesion se lee de la cookie en auth.ts.
            data: { user: logged.user }
        })
        // Sesion por cookie httpOnly. Simetrico con el borrado en
        // /api/auth/logout.
        response.cookies.set('session_token', logged.token, {
            httpOnly: true,
            secure: process.env.NODE_ENV == 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 24 * 7, // 7 dias, igual al expirationTime del JWT
            path: '/'
        })

        return response;

    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 401 })
        }
        throw err
    }
}

export async function GET(req: NextRequest) {
    const auth = await requireAuth(req)
    if ('error' in auth) return auth.error

    try {
        const db = await connectToPostgres()

        if (!db) {
            if (DEMO_MODE) {
                return NextResponse.json({ success: true, source: 'demo' })
            }
            return dbUnavailableResponse()
        }

        const user = await getUser(db, auth.payload.userId)

        if (!user) return NextResponse.json({ succes: false }, { status: 401 })

        return NextResponse.json({ success: true, source: 'postgres', data: user })

    } catch (err) {
        if (err instanceof AuthError) {
            return NextResponse.json({ success: false, error: err.message }, { status: 401 })
        }
        throw err
    }
}
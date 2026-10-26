import { NextResponse } from "next/server"

export async function POST() {
    const response = NextResponse.json({ success: true, message: 'Sesión cerrada correctamente' })

    response.cookies.set('session_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV == 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/'
    })
    // response.cookies.delete('session_token')
    return response
}
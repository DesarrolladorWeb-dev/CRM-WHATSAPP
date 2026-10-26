import React, { useState } from 'react';
import { Loader2, Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

export const LoginView = ({ onLoginSuccess }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const validate = (): string | null => {
        if (!email.trim() || !password) {
            return 'Completa correo y contraseña para continuar.';
        }
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email.trim())) {
            return 'Ingresa un correo electrónico válido.';
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setError('');
        setIsLoading(true);
        try {
            const result = await apiFetch('/api/auth/user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email, password
                })
            })

            const resData = await result.json()

            if (!resData.success) {
                setError(resData.error || 'No se pudo iniciar sesión. Intenta nuevamente.');
                return;
            }
            onLoginSuccess(resData.data.user);
        } catch {
            setError('Error de conexión con el servidor. Intenta nuevamente.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-slate-950 font-sans antialiased px-4">
            <div className="w-full max-w-sm">
                {/*  Brand */}
                <div className="flex items-center justify-center gap-3 mb-8">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg shadow-emerald-500/20 font-black text-2xl tracking-tight shrink-0">
                        W
                    </div>
                    <div>
                        <div className="font-extrabold text-white text-lg tracking-tight flex items-center gap-1.5">
                            <span>XIO</span>
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md font-bold">
                                CRM
                            </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium">WhatsApp</p>
                    </div>
                </div>

                {/* Login Card */}
                <form
                    onSubmit={handleSubmit}
                    noValidate
                    className="text-black bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4"
                >
                    <div>
                        <h1 className="text-lg font-bold text-slate-900">Iniciar sesión</h1>
                        <p className="text-xs text-slate-500 mt-1">Ingresa tus credenciales para acceder al panel.</p>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-xs font-medium rounded-lg px-3 py-2.5">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <label htmlFor="login-email" className="text-xs font-semibold text-slate-700">
                            Correo electrónico
                        </label>
                        <div className="relative">
                            <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                            <input
                                id="login-email"
                                type="email"
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="tucorreo@empresa.com"
                                disabled={isLoading}
                                className="w-full pl-8 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:opacity-60"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label htmlFor="login-password" className="text-xs font-semibold text-slate-700">
                            Contraseña
                        </label>
                        <div className="relative">
                            <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                            <input
                                id="login-password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                disabled={isLoading}
                                className="w-full pl-8 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all disabled:opacity-60"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                disabled={isLoading}
                                tabIndex={-1}
                                aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                                {showPassword ? (
                                    <EyeOff className="w-3.5 h-3.5" />
                                ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                )}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-600/60 text-white rounded-lg text-sm font-semibold shadow-xs transition-all active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Verificando...
                            </>
                        ) : (
                            'Ingresar'
                        )}
                    </button>

                    <p className="text-[14px] text-slate-700 text-center pt-1">
                        Demo: <br/> bob@example.com <br/> Bob2309231312
                    </p>
                </form>
            </div>
        </div>
    );
};
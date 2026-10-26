import { NextRequest, NextResponse } from 'next/server';
import { getAiClient, isAiConfigured } from '@/lib/gemini';
import { captureException } from '@/lib/logger';
import { enforceAiRateLimit } from '@/lib/rateLimit';
import { logger, motivo } from '@/lib/logger';
import { requireUserPermission } from '@/lib/auth';

function pcmToWav(pcmBase64: string, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): string {
    const pcmBuffer = Buffer.from(pcmBase64, 'base64');
    //pcmBuffer.swap16();
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmBuffer.length;

    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    const wavBuffer = Buffer.concat([header, pcmBuffer]);
    return wavBuffer.toString('base64');
}

export async function POST(req: NextRequest) {
    const denied = await requireUserPermission(req, 'write');
    if (denied) return denied;

    const limited = await enforceAiRateLimit(req, 'generalAI');
    if (limited) return limited;

    try {
        const { text } = await req.json();

        if (!text || typeof text !== 'string' || !text.trim()) {
            return NextResponse.json(
                { success: false, error: 'El campo "text" es requerido' },
                { status: 400 }
            );
        }

        if (!isAiConfigured()) {
            return NextResponse.json({
                success: true,
                data: {
                    audioUrl: null,
                    simulated: true,
                    message: 'Nota de voz simulada: IA no configurada (falta GEMINI_API_KEY).'
                }
            });
        }

        const ai = getAiClient();

        const maxRetries = 3;
        let audioData: string | undefined;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const response = await ai.models.generateContent({
                model: process.env.GEMINI_TTS_MODEL_ID || 'gemini-2.5-flash-preview-tts',
                contents: [{ role: 'user', parts: [{ text }] }],
                config: {
                    responseModalities: ['audio'],
                    speechConfig: {
                        voiceConfig: {
                            prebuiltVoiceConfig: { voiceName: 'Kore' }
                        }
                    }
                }
            });

            audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

            if (audioData) break;

            logger.error(`Intento ${attempt}/${maxRetries} sin audio (finishReason: ${response.candidates?.[0]?.finishReason})`);

            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
            }
        }

        if (!audioData) {
            throw new Error('Gemini no devolvió datos de audio tras varios intentos');
        }
        const wavBase64 = pcmToWav(audioData);
        const audioUrl = `data:audio/wav;base64,${wavBase64}`;

        return NextResponse.json({ success: true, data: { audioUrl, simulated: false } });
    } catch (error) {
        const errorId = captureException(error, { route: '/api/ai/text-to-speech', method: 'POST' });
        logger.error('Error in /api/ai/text-to-speech', { motivo: motivo(error) });
        return NextResponse.json(
            {
                success: false,
                error: 'Error al generar nota de voz',
                errorId,
            },
            { status: 500 }
        );
    }
}
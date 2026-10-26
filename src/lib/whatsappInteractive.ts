export type InteractiveButtonKind = 'url' | 'call' | 'reply' | 'copy' | 'other'

export interface InteractiveButton {
    kind: InteractiveButtonKind;
    label: string;
    url?: string;
    phone?:string;
    code?: string;  
}

export interface InteractiveContent {
    header?: string;
    body: string;
    footer?: string;
    buttons: InteractiveButton[]
}

function unwrap(raw:any) :any {
    let m = raw;
    for (let i = 0; i <4 && m; i++){
        const inner = 
        m.ephemeralMessage?.message ||
        m.viewOnceMessage?.message || 
        m.viewOnceMessageV2?.message ||
        m.documentWithCaptionMessage?.message;

        if (!inner) break;
        m = inner;
    }

    return m;
}

export function parseInteractive(rawMessage: any): InteractiveContent | null {
    const root = unwrap(rawMessage)

    const m  = root?.interactiveMessage || root?.buttonsMessage;
    if (!m) return null;

    const buttons: InteractiveButton[] = []

    for (const b of m.nativeFlowMessage?.buttons || []) {
        let p: any = {}
        try {p = JSON.parse(b.buttonParamsJson || '{}')} catch {}
        const label = String(p.display_text || p.title || b.name || 'Boton')

        if (b.name === 'cta_url' && /^https?:\/\//i.test(p.url || '')) {
            buttons.push({kind: 'url', label, url: p.url})
        } else if (b.name === 'cta_call'){
            buttons.push({kind: 'call', label, phone: p.phone_number})
        } else if (b.name === 'cta_copy'){
            buttons.push({kind: 'copy', label, code: p.copy_code})
        } else if (b.name === 'quick_reply') {
            buttons.push({kind: 'reply', label})
        } else {
            buttons.push({kind: 'other', label})
        }
    }

    for (const b of m.buttons || []){
        const label = b.buttonText?.displayText
        if (label) buttons.push({kind: 'reply', label: String(label)})
    }

    const body = String(m.body?.text || m.contentText || '')
    const header = m.header?.title || m.header?.subtitle || undefined
    const footer = m.footer?.text || m.footerText || undefined
    if (!body && !header && buttons.length === 0) return null
    return {header, body, footer, buttons}
}

export function interactiveToText(c: InteractiveContent): string {
    const lineas = [c.header, c.body, ...c.buttons.map(b => b.url ? `${b.label}: ${b.url}`: b.label), c.footer]
    return lineas.filter(Boolean).join('\n')
}

export const extractInteractiveText = (raw: any): string | null => {
    const c = parseInteractive(raw)
    return c ? interactiveToText(c): null
}
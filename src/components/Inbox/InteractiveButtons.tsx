import { InteractiveButton } from "@/lib/whatsappInteractive";
import { Check, Copy, ExternalLink, List, Phone, Reply } from "lucide-react";
import { useState } from "react";

const ICONOS = {
    url: ExternalLink,
    call: Phone,
    reply: Reply,
    copy: Copy,
    other: List
} as const

const CLASE = "w-full flex items-center justify-center gap-2 py-2.5 px-3 text-[13px] font-semibold " +
"text-[#027eb5] border-t border-black/10 hover:bg-black/5 transition-colors"

function Boton({b}: {b: InteractiveButton}){
    const [copiado, setCopiado] = useState(false)
    const Icono = copiado ? Check: ICONOS[b.kind]
    
    if (b.kind === 'url' && b.url){
        return (
            <a href={b.url} target="_blank" rel="noopener noreferrer" className={CLASE}>
                <Icono className="w-4 h-4"/> <span>{b.label}</span>
            </a>
        )
    }

    if (b.kind === 'call' && b.phone){
        return (
            <a href={`tel:${b.phone.replace(/[^\d+]/g, '')}`} className={CLASE}>
                <Icono className="w-4 h-4"/> <span>{b.label}</span>
            </a>
        )
    }


    if (b.kind === 'copy'){
        return (
            <button
            type="button"
            className={CLASE}
            onClick={async () => {
                try {
                    await navigator.clipboard.writeText(b.code || b.label)
                    setCopiado(true)
                    setTimeout(() => setCopiado(false), 1500)
                } catch {}
            }}
            >
                <Icono className="w-4 h-4"/> <span>{copiado ? 'Copiado': b.label}</span>
            </button>
        )
    }

    return (
        <div className={`${CLASE} cursor-default hover:bg-transparent`}>
            <Icono className="w-4 h-4"/> <span>{b.label}</span>
        </div>
    )
}

export const InteractiveButtons: React.FC<{buttons: InteractiveButton[]}> = ({buttons})=> {
    if (!buttons.length) return null
    return (
        <div className="-mx-3.5 -mb-3.5 mt-2.5 overflow-hidden rounded-b-2xl">
            {buttons.map((b, i) => <Boton key={i} b={b}/>)}
        </div>
    )
}
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Share2, Check, Copy } from "lucide-react";

interface ShareLiveLinkProps {
    tournamentId: string;
}

export function ShareLiveLink({ tournamentId }: ShareLiveLinkProps) {
    const [copied, setCopied] = useState(false);

    const handleCopyLink = async () => {
        const baseUrl = window.location.origin;
        const liveUrl = `${baseUrl}/live/${tournamentId}`;

        try {
            await navigator.clipboard.writeText(liveUrl);
            setCopied(true);
            toast.success("¡Enlace copiado!", {
                description: "Compártelo con los espectadores del torneo",
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            // Fallback for older browsers
            const textArea = document.createElement("textarea");
            textArea.value = liveUrl;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
            setCopied(true);
            toast.success("¡Enlace copiado!");
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <Button
            variant="outline"
            onClick={handleCopyLink}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
        >
            {copied ? (
                <>
                    <Check className="mr-2 h-4 w-4" />
                    ¡Copiado!
                </>
            ) : (
                <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Compartir Link Público
                </>
            )}
        </Button>
    );
}

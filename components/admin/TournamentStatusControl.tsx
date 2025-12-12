"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Circle, Play, Trophy, CheckCircle2, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TournamentStatus } from "@/types/database";

interface TournamentStatusControlProps {
    tournamentId: string;
    currentStatus: TournamentStatus;
}

const STATUS_CONFIG: Record<TournamentStatus, {
    label: string;
    color: string;
    bgColor: string;
    icon: typeof Circle;
    nextStatus?: TournamentStatus;
    nextLabel?: string;
}> = {
    draft: {
        label: "Borrador",
        color: "text-gray-600",
        bgColor: "bg-gray-100 border-gray-300",
        icon: FileText,
        nextStatus: "qualification",
        nextLabel: "Iniciar Clasificación",
    },
    registration: {
        label: "Inscripción",
        color: "text-blue-600",
        bgColor: "bg-blue-100 border-blue-300",
        icon: Circle,
        nextStatus: "qualification",
        nextLabel: "Iniciar Clasificación",
    },
    qualification: {
        label: "Clasificación",
        color: "text-amber-600",
        bgColor: "bg-amber-100 border-amber-300",
        icon: Play,
        nextStatus: "elimination",
        nextLabel: "Iniciar Eliminatorias",
    },
    elimination: {
        label: "Eliminatorias",
        color: "text-orange-600",
        bgColor: "bg-orange-100 border-orange-300",
        icon: Trophy,
        nextStatus: "completed",
        nextLabel: "Finalizar Torneo",
    },
    completed: {
        label: "Finalizado",
        color: "text-emerald-600",
        bgColor: "bg-emerald-100 border-emerald-300",
        icon: CheckCircle2,
    },
};

const ALL_STATUSES: TournamentStatus[] = ["draft", "registration", "qualification", "elimination", "completed"];

export function TournamentStatusControl({ tournamentId, currentStatus }: TournamentStatusControlProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isUpdating, setIsUpdating] = useState(false);

    const config = STATUS_CONFIG[currentStatus];
    const StatusIcon = config.icon;

    const handleStatusChange = async (newStatus: TournamentStatus) => {
        if (newStatus === currentStatus) return;

        setIsUpdating(true);
        try {
            const { error } = await supabase
                .from("tournaments")
                .update({ status: newStatus })
                .eq("id", tournamentId);

            if (error) throw error;

            toast.success("Estado actualizado", {
                description: `El torneo ahora está en: ${STATUS_CONFIG[newStatus].label}`,
            });

            router.refresh();
        } catch (error: any) {
            toast.error("Error", { description: error.message });
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div className="flex items-center gap-3">
            {/* Current Status Badge */}
            <Badge className={`${config.bgColor} ${config.color} border-2 px-3 py-1.5 text-sm font-bold`}>
                <StatusIcon className="h-4 w-4 mr-1.5" />
                {config.label}
            </Badge>

            {/* Status Dropdown */}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isUpdating} className="gap-2">
                        {isUpdating ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <>
                                Cambiar Estado
                                <ChevronDown className="h-4 w-4" />
                            </>
                        )}
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                    {ALL_STATUSES.map((status) => {
                        const statusConfig = STATUS_CONFIG[status];
                        const Icon = statusConfig.icon;
                        const isActive = status === currentStatus;

                        return (
                            <DropdownMenuItem
                                key={status}
                                onClick={() => handleStatusChange(status)}
                                className={`gap-2 ${isActive ? "bg-slate-100" : ""}`}
                            >
                                <Icon className={`h-4 w-4 ${statusConfig.color}`} />
                                <span className={isActive ? "font-bold" : ""}>
                                    {statusConfig.label}
                                </span>
                                {isActive && <span className="ml-auto text-xs text-slate-400">Actual</span>}
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Quick Action Button (if there's a next status) */}
            {config.nextStatus && (
                <Button
                    size="sm"
                    onClick={() => handleStatusChange(config.nextStatus!)}
                    disabled={isUpdating}
                    className="gap-2"
                >
                    <Play className="h-4 w-4" />
                    {config.nextLabel}
                </Button>
            )}
        </div>
    );
}

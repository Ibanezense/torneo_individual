"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    ArrowLeft,
    Check,
    Copy,
    Eye,
    EyeOff,
    Loader2,
    RefreshCcw,
    Smartphone,
    Target,
    Users,
} from "lucide-react";
import { toast } from "sonner";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";

interface TargetWithArchers {
    id: string;
    target_number: number;
    distance: number;
    hasEliminationMatch: boolean;
    archers: {
        position: string;
        archerName: string;
        turn: string;
    }[];
}

interface AssignmentArcherRow {
    position: string;
    turn: string;
    archer: {
        first_name: string;
        last_name: string;
    } | null;
}

interface TargetAssignmentsRow {
    id: string;
    target_number: number;
    distance: number;
    assignments: AssignmentArcherRow[] | null;
}

interface EliminationTargetRow {
    target_id: string | null;
}

export default function AccessCodesPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isNormalizing, setIsNormalizing] = useState(false);
    const [targets, setTargets] = useState<TargetWithArchers[]>([]);
    const [tournamentName, setTournamentName] = useState("");
    const [copiedCode, setCopiedCode] = useState<string | null>(null);
    const [showUnusedTargets, setShowUnusedTargets] = useState(false);

    const fetchData = useCallback(async () => {
        setIsLoading(true);

        const { data: tournament } = await supabase
            .from("tournaments")
            .select("name")
            .eq("id", tournamentId)
            .single();

        if (tournament) {
            setTournamentName(tournament.name);
        }

        const { data: targetsData } = await supabase
            .from("targets")
            .select(`
                id,
                target_number,
                distance,
                assignments(
                    id,
                    position,
                    turn,
                    archer:archers(first_name, last_name)
                )
            `)
            .eq("tournament_id", tournamentId)
            .order("target_number");

        const targetIds = ((targetsData || []) as TargetAssignmentsRow[]).map((target) => target.id);
        const { data: eliminationMatches } = targetIds.length
            ? await supabase
                .from("elimination_matches")
                .select("target_id")
                .in("target_id", targetIds)
            : { data: [] };

        const eliminationTargetIds = new Set(
            ((eliminationMatches || []) as EliminationTargetRow[])
                .map((match) => match.target_id)
                .filter((targetId): targetId is string => Boolean(targetId))
        );

        const targetsWithArchers: TargetWithArchers[] = ((targetsData || []) as TargetAssignmentsRow[]).map((target) => ({
            id: target.id,
            target_number: target.target_number,
            distance: target.distance,
            hasEliminationMatch: eliminationTargetIds.has(target.id),
            archers: (target.assignments || [])
                .sort((left, right) => left.position.localeCompare(right.position))
                .map((assignment) => ({
                    position: assignment.position,
                    archerName: assignment.archer
                        ? `${assignment.archer.first_name} ${assignment.archer.last_name}`
                        : "Sin arquero",
                    turn: assignment.turn,
                })),
        }));

        setTargets(targetsWithArchers);
        setIsLoading(false);
    }, [supabase, tournamentId]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void fetchData();
        }, 0);

        return () => clearTimeout(timer);
    }, [fetchData]);

    const copyCode = async (code: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedCode(code);
        toast.success("Código copiado");
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const normalizeAccessCodes = async () => {
        setIsNormalizing(true);
        const { data, error } = await supabase.rpc("admin_normalize_tournament_access_codes", {
            p_tournament_id: tournamentId,
        });

        if (error) {
            toast.error("No se pudieron normalizar los códigos", { description: error.message });
            setIsNormalizing(false);
            return;
        }

        const updatedCount =
            data && typeof data === "object" && "updated" in data && typeof data.updated === "number"
                ? data.updated
                : 0;
        toast.success(`Códigos normalizados (${updatedCount} actualizados)`);
        await fetchData();
        setIsNormalizing(false);
    };

    const accessUrl = "https://torneo-individual.vercel.app/access";

    const unusedTargetsCount = useMemo(
        () => targets.filter((target) => target.archers.length === 0).length,
        [targets]
    );

    const displayedTargets = useMemo(
        () =>
            showUnusedTargets
                ? targets
                : targets.filter((target) => target.archers.length > 0 || target.hasEliminationMatch),
        [showUnusedTargets, targets]
    );

    if (isLoading) {
        return <FullPageLoader text="Cargando códigos..." />;
    }

    if (targets.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/tournaments/${tournamentId}`}>
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <h2 className="text-3xl font-bold tracking-tight">Códigos de Acceso</h2>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Smartphone className="h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-4 text-muted-foreground">
                            No hay pacas configuradas. Primero asigna arqueros a las pacas.
                        </p>
                        <Button asChild className="mt-4">
                            <Link href={`/admin/tournaments/${tournamentId}/assignments`}>
                                Ir a Asignaciones
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/tournaments/${tournamentId}`}>
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Códigos de Acceso</h2>
                        <p className="text-muted-foreground">
                            {tournamentName} - {displayedTargets.length} pacas visibles
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {unusedTargetsCount > 0 ? (
                        <Button
                            variant="outline"
                            onClick={() => setShowUnusedTargets((previous) => !previous)}
                        >
                            {showUnusedTargets ? (
                                <EyeOff className="mr-2 h-4 w-4" />
                            ) : (
                                <Eye className="mr-2 h-4 w-4" />
                            )}
                            {showUnusedTargets ? "Ocultar sin uso" : `Mostrar sin uso (${unusedTargetsCount})`}
                        </Button>
                    ) : null}
                    <Button
                        variant="outline"
                        onClick={normalizeAccessCodes}
                        disabled={isNormalizing}
                    >
                        {isNormalizing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <RefreshCcw className="mr-2 h-4 w-4" />
                        )}
                        Normalizar Códigos
                    </Button>
                </div>
            </div>

            <Card className="border-blue-200 bg-blue-50">
                <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                        <Smartphone className="h-8 w-8 text-blue-600 shrink-0" />
                        <div className="space-y-2">
                            <h3 className="font-semibold text-blue-900">¿Cómo usan los arqueros su código?</h3>
                            <ol className="text-sm text-blue-700 space-y-1">
                                <li>1. El arquero abre <strong className="text-blue-900">{accessUrl}</strong> en su celular</li>
                                <li>2. Ingresa el código de la paca (ej: <strong>T1</strong>, <strong>T2</strong>)</li>
                                <li>3. Verá a todos los arqueros de esa paca y puede anotar para cualquiera</li>
                            </ol>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {!showUnusedTargets && unusedTargetsCount > 0 ? (
                <Card className="border-amber-200 bg-amber-50">
                    <CardContent className="pt-4 text-sm text-amber-800">
                        Se ocultaron {unusedTargetsCount} pacas sin arqueros asignados.
                    </CardContent>
                </Card>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {displayedTargets.map((target) => {
                    const code = `T${target.target_number}`;
                    const hasArchers = target.archers.length > 0;
                    const hasContent = hasArchers || target.hasEliminationMatch;

                    return (
                        <Card
                            key={target.id}
                            className={`border-2 ${hasContent ? "border-slate-200" : "border-dashed border-slate-300 opacity-60"}`}
                        >
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 border-2 border-blue-300">
                                            <Target className="h-6 w-6 text-blue-600" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-2xl font-black">{code}</CardTitle>
                                            <CardDescription>{target.distance}m</CardDescription>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyCode(code)}
                                        className="gap-2"
                                    >
                                        {copiedCode === code ? (
                                            <Check className="h-4 w-4 text-green-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                        Copiar
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="pt-0">
                                {hasArchers ? (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                            <Users className="h-4 w-4" />
                                            <span>{target.archers.length} arqueros</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            {target.archers.map((archer) => (
                                                <div
                                                    key={archer.position}
                                                    className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                                                >
                                                    <Badge
                                                        variant="outline"
                                                        className="font-bold w-6 h-6 flex items-center justify-center p-0"
                                                    >
                                                        {archer.position}
                                                    </Badge>
                                                    <span className="truncate font-medium text-slate-700">
                                                        {archer.archerName}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : target.hasEliminationMatch ? (
                                    <p className="text-sm text-slate-600 font-medium">Partido de eliminatoria asignado</p>
                                ) : (
                                    <p className="text-sm text-slate-400 italic">Sin arqueros asignados</p>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}

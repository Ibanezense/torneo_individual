"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Save, Loader2, Target, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import type { Tournament, Target as TargetType } from "@/types/database";

interface TargetConfig {
    distance: number;
    count: number;
    startNumber: number;
}

export default function TargetSetupPage() {
    const params = useParams();
    const router = useRouter();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [existingTargets, setExistingTargets] = useState<TargetType[]>([]);
    const [targetConfigs, setTargetConfigs] = useState<TargetConfig[]>([]);

    useEffect(() => {
        fetchData();
    }, [tournamentId]);

    const fetchData = async () => {
        setIsLoading(true);

        // Get tournament
        const { data: tournamentData, error: tournamentError } = await supabase
            .from("tournaments")
            .select("*")
            .eq("id", tournamentId)
            .single();

        if (tournamentError || !tournamentData) {
            toast.error("Torneo no encontrado");
            router.push("/admin/tournaments");
            return;
        }

        setTournament(tournamentData);

        // Get existing targets
        const { data: targetsData } = await supabase
            .from("targets")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("target_number");

        setExistingTargets(targetsData || []);

        // Initialize config from tournament distances
        const distances = tournamentData.distances || [];

        // Count existing targets per distance
        const existingCounts = new Map<number, number>();
        for (const target of targetsData || []) {
            existingCounts.set(target.distance, (existingCounts.get(target.distance) || 0) + 1);
        }

        // Create initial configs
        let currentStartNumber = 1;
        const configs: TargetConfig[] = distances.map((distance: number) => {
            const count = existingCounts.get(distance) || 0;
            const config = {
                distance,
                count,
                startNumber: currentStartNumber,
            };
            currentStartNumber += count || 0;
            return config;
        });

        setTargetConfigs(configs);
        setIsLoading(false);
    };

    const updateCount = (distance: number, delta: number) => {
        setTargetConfigs((prev) => {
            const updated = prev.map((config) => {
                if (config.distance === distance) {
                    return { ...config, count: Math.max(0, config.count + delta) };
                }
                return config;
            });

            // Recalculate start numbers
            let currentStart = 1;
            return updated.map((config) => {
                const newConfig = { ...config, startNumber: currentStart };
                currentStart += config.count;
                return newConfig;
            });
        });
    };

    const setCount = (distance: number, count: number) => {
        setTargetConfigs((prev) => {
            const updated = prev.map((config) => {
                if (config.distance === distance) {
                    return { ...config, count: Math.max(0, count) };
                }
                return config;
            });

            // Recalculate start numbers
            let currentStart = 1;
            return updated.map((config) => {
                const newConfig = { ...config, startNumber: currentStart };
                currentStart += config.count;
                return newConfig;
            });
        });
    };

    const handleSave = async () => {
        const totalTargets = targetConfigs.reduce((sum, c) => sum + c.count, 0);

        if (totalTargets === 0) {
            toast.error("Configura al menos una paca");
            return;
        }

        setIsSaving(true);

        try {
            // Delete existing targets (this will cascade delete assignments)
            await supabase
                .from("targets")
                .delete()
                .eq("tournament_id", tournamentId);

            // Create new targets
            const targetsToInsert: { tournament_id: string; target_number: number; distance: number }[] = [];

            for (const config of targetConfigs) {
                for (let i = 0; i < config.count; i++) {
                    targetsToInsert.push({
                        tournament_id: tournamentId,
                        target_number: config.startNumber + i,
                        distance: config.distance,
                    });
                }
            }

            const { error: insertError } = await supabase
                .from("targets")
                .insert(targetsToInsert);

            if (insertError) throw insertError;

            toast.success(`${totalTargets} pacas configuradas correctamente`);
            router.push(`/admin/tournaments/${tournamentId}/assignments`);
        } catch (error: any) {
            toast.error("Error al guardar", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <FullPageLoader text="Cargando configuración..." />;
    }

    if (!tournament) {
        return null;
    }

    const totalTargets = targetConfigs.reduce((sum, c) => sum + c.count, 0);

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/tournaments/${tournamentId}`}>
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Configurar Pacas</h2>
                    <p className="text-muted-foreground">
                        {tournament.name} - Define las pacas para cada distancia
                    </p>
                </div>
            </div>

            {/* Info Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Distancias del Torneo
                    </CardTitle>
                    <CardDescription>
                        Indica cuántas pacas físicas tendrás disponibles para cada distancia
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {targetConfigs.map((config) => (
                        <div
                            key={config.distance}
                            className="flex items-center justify-between rounded-lg border p-4"
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Badge variant="default" className="text-lg px-3 py-1">
                                        {config.distance}m
                                    </Badge>
                                </div>
                                {config.count > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        Pacas {config.startNumber} - {config.startNumber + config.count - 1}
                                    </p>
                                )}
                            </div>

                            <div className="flex items-center gap-3">
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => updateCount(config.distance, -1)}
                                    disabled={config.count === 0 || isSaving}
                                >
                                    <Minus className="h-4 w-4" />
                                </Button>

                                <Input
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={config.count}
                                    onChange={(e) => setCount(config.distance, parseInt(e.target.value) || 0)}
                                    className="w-20 text-center text-lg font-bold"
                                    disabled={isSaving}
                                />

                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => updateCount(config.distance, 1)}
                                    disabled={isSaving}
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    ))}

                    {/* Summary */}
                    <div className="rounded-lg bg-muted/50 p-4">
                        <div className="flex items-center justify-between">
                            <span className="font-medium">Total de Pacas:</span>
                            <span className="text-2xl font-bold">{totalTargets}</span>
                        </div>
                        {totalTargets > 0 && (
                            <p className="mt-1 text-sm text-muted-foreground">
                                Numeradas del 1 al {totalTargets}
                            </p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-4">
                        <Button
                            variant="outline"
                            onClick={() => router.push(`/admin/tournaments/${tournamentId}`)}
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving || totalTargets === 0}>
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar y Continuar
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Existing targets warning */}
            {existingTargets.length > 0 && (
                <Card className="border-yellow-500/50 bg-yellow-500/10">
                    <CardContent className="pt-6">
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                            ⚠️ Ya tienes {existingTargets.length} pacas configuradas. Al guardar, las asignaciones existentes serán eliminadas.
                        </p>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

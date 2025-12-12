"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wand2, Loader2, Save, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { Archer, Target, AgeCategory, TargetPosition, ShootingTurn } from "@/types/database";

interface TargetAssignment {
    archerId: string;
    archer: Archer;
    position: TargetPosition;
    turn: ShootingTurn;
}

interface TargetWithAssignments {
    target: Target;
    assignments: TargetAssignment[];
}

export default function AssignmentsPage() {
    const params = useParams();
    const router = useRouter();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [targets, setTargets] = useState<TargetWithAssignments[]>([]);
    const [unassignedArchers, setUnassignedArchers] = useState<Archer[]>([]);
    const [allArchers, setAllArchers] = useState<Archer[]>([]);
    const [draggedArcher, setDraggedArcher] = useState<{ archer: Archer; fromTargetId?: string } | null>(null);
    const [hasChanges, setHasChanges] = useState(false);

    useEffect(() => {
        fetchData();
    }, [tournamentId]);

    const fetchData = async () => {
        setIsLoading(true);

        // Get targets
        const { data: targetsData } = await supabase
            .from("targets")
            .select("*")
            .eq("tournament_id", tournamentId)
            .order("target_number");

        // Get assignments with archers
        const { data: assignmentsData } = await supabase
            .from("assignments")
            .select("*, archer:archers(*)")
            .eq("tournament_id", tournamentId);

        // Get all archers
        const { data: archersData } = await supabase
            .from("archers")
            .select("*")
            .order("last_name");

        // Build target assignments map
        const assignmentsByTarget = new Map<string, TargetAssignment[]>();
        const assignedArcherIds = new Set<string>();

        for (const assignment of assignmentsData || []) {
            if (!assignmentsByTarget.has(assignment.target_id)) {
                assignmentsByTarget.set(assignment.target_id, []);
            }
            assignmentsByTarget.get(assignment.target_id)!.push({
                archerId: assignment.archer_id,
                archer: assignment.archer,
                position: assignment.position,
                turn: assignment.turn,
            });
            assignedArcherIds.add(assignment.archer_id);
        }

        // Create target structures
        const targetStructures: TargetWithAssignments[] = (targetsData || []).map(target => ({
            target,
            assignments: (assignmentsByTarget.get(target.id) || []).sort((a, b) =>
                a.position.localeCompare(b.position)
            ),
        }));

        // Find unassigned archers
        const unassigned = (archersData || []).filter(a => !assignedArcherIds.has(a.id));

        setTargets(targetStructures);
        setUnassignedArchers(unassigned);
        setAllArchers(archersData || []);
        setIsLoading(false);
        setHasChanges(false);
    };

    const handleDragStart = (archer: Archer, fromTargetId?: string) => {
        setDraggedArcher({ archer, fromTargetId });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDropOnTarget = (targetId: string) => {
        if (!draggedArcher) return;

        const { archer, fromTargetId } = draggedArcher;
        const targetIndex = targets.findIndex(t => t.target.id === targetId);

        if (targetIndex === -1) return;

        // Check if target has space (max 4)
        if (targets[targetIndex].assignments.length >= 4) {
            toast.error("La paca ya tiene 4 arqueros");
            setDraggedArcher(null);
            return;
        }

        // Check if archer's distance matches target distance
        if (archer.distance !== targets[targetIndex].target.distance) {
            toast.error(`El arquero tira a ${archer.distance}m, la paca es de ${targets[targetIndex].target.distance}m`);
            setDraggedArcher(null);
            return;
        }

        setTargets(prev => {
            const updated = [...prev];

            // Remove from source if it was on another target
            if (fromTargetId) {
                const sourceIdx = updated.findIndex(t => t.target.id === fromTargetId);
                if (sourceIdx !== -1) {
                    updated[sourceIdx] = {
                        ...updated[sourceIdx],
                        assignments: updated[sourceIdx].assignments.filter(a => a.archerId !== archer.id),
                    };
                }
            }

            // Get next available position
            const existingPositions = new Set(updated[targetIndex].assignments.map(a => a.position));
            const positions: TargetPosition[] = ["A", "B", "C", "D"];
            const nextPosition = positions.find(p => !existingPositions.has(p)) || "A";
            const turn: ShootingTurn = nextPosition === "A" || nextPosition === "B" ? "AB" : "CD";

            // Add to target
            updated[targetIndex] = {
                ...updated[targetIndex],
                assignments: [
                    ...updated[targetIndex].assignments,
                    { archerId: archer.id, archer, position: nextPosition, turn },
                ].sort((a, b) => a.position.localeCompare(b.position)),
            };

            return updated;
        });

        // Remove from unassigned if it was there
        if (!fromTargetId) {
            setUnassignedArchers(prev => prev.filter(a => a.id !== archer.id));
        }

        setDraggedArcher(null);
        setHasChanges(true);
    };

    const handleDropOnUnassigned = () => {
        if (!draggedArcher || !draggedArcher.fromTargetId) return;

        const { archer, fromTargetId } = draggedArcher;

        // Remove from target
        setTargets(prev => {
            const updated = [...prev];
            const sourceIdx = updated.findIndex(t => t.target.id === fromTargetId);
            if (sourceIdx !== -1) {
                updated[sourceIdx] = {
                    ...updated[sourceIdx],
                    assignments: updated[sourceIdx].assignments.filter(a => a.archerId !== archer.id),
                };
            }
            return updated;
        });

        // Add to unassigned
        setUnassignedArchers(prev => [...prev, archer].sort((a, b) =>
            a.last_name.localeCompare(b.last_name)
        ));

        setDraggedArcher(null);
        setHasChanges(true);
    };

    const removeFromTarget = (targetId: string, archerId: string) => {
        const target = targets.find(t => t.target.id === targetId);
        const assignment = target?.assignments.find(a => a.archerId === archerId);

        if (!assignment) return;

        setTargets(prev => prev.map(t => {
            if (t.target.id !== targetId) return t;
            return {
                ...t,
                assignments: t.assignments.filter(a => a.archerId !== archerId),
            };
        }));

        setUnassignedArchers(prev => [...prev, assignment.archer].sort((a, b) =>
            a.last_name.localeCompare(b.last_name)
        ));
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);

        try {
            // Delete existing assignments
            await supabase
                .from("assignments")
                .delete()
                .eq("tournament_id", tournamentId);

            // Create new assignments
            const newAssignments = [];
            for (const target of targets) {
                for (const assignment of target.assignments) {
                    newAssignments.push({
                        tournament_id: tournamentId,
                        archer_id: assignment.archerId,
                        target_id: target.target.id,
                        position: assignment.position,
                        turn: assignment.turn,
                        access_code: `T${target.target.target_number}${assignment.position}`,
                    });
                }
            }

            if (newAssignments.length > 0) {
                const { error } = await supabase
                    .from("assignments")
                    .insert(newAssignments);

                if (error) throw error;
            }

            toast.success("Asignaciones guardadas");
            setHasChanges(false);
        } catch (error: any) {
            toast.error("Error al guardar", { description: error.message });
        } finally {
            setIsSaving(false);
        }
    };

    const handleAutoGenerate = async () => {
        // Get selected archers (all that have matching distances)
        const tournamentDistances = new Set(targets.map(t => t.target.distance));
        const eligibleArchers = allArchers.filter(a => tournamentDistances.has(a.distance));

        if (eligibleArchers.length === 0) {
            toast.error("No hay arqueros con distancias compatibles");
            return;
        }

        setIsGenerating(true);

        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/assignments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    archerIds: eligibleArchers.map(a => a.id),
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error);
            }

            toast.success(`${result.assignments} arqueros asignados automáticamente`);
            fetchData();
        } catch (error: any) {
            toast.error("Error al generar", { description: error.message });
        } finally {
            setIsGenerating(false);
        }
    };

    if (isLoading) {
        return <FullPageLoader text="Cargando asignaciones..." />;
    }

    // Group unassigned by distance
    const unassignedByDistance = new Map<number, Archer[]>();
    for (const archer of unassignedArchers) {
        if (!unassignedByDistance.has(archer.distance)) {
            unassignedByDistance.set(archer.distance, []);
        }
        unassignedByDistance.get(archer.distance)!.push(archer);
    }

    // Group targets by distance
    const targetsByDistance = new Map<number, TargetWithAssignments[]>();
    for (const target of targets) {
        if (!targetsByDistance.has(target.target.distance)) {
            targetsByDistance.set(target.target.distance, []);
        }
        targetsByDistance.get(target.target.distance)!.push(target);
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/tournaments/${tournamentId}`}>
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Asignar Arqueros</h2>
                        <p className="text-muted-foreground">
                            Arrastra arqueros a las pacas o usa generación automática
                        </p>
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        onClick={handleAutoGenerate}
                        disabled={isGenerating || targets.length === 0}
                    >
                        {isGenerating ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Wand2 className="mr-2 h-4 w-4" />
                        )}
                        Auto-generar
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isSaving || !hasChanges}
                    >
                        {isSaving ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="mr-2 h-4 w-4" />
                        )}
                        Guardar Cambios
                    </Button>
                </div>
            </div>

            {targets.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground mb-4">
                            No hay pacas configuradas. Configura las pacas primero.
                        </p>
                        <Button asChild>
                            <Link href={`/admin/tournaments/${tournamentId}/targets`}>
                                Configurar Pacas
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Process each distance */}
                    {Array.from(targetsByDistance.entries()).map(([distance, distanceTargets]) => (
                        <div key={distance} className="space-y-4">
                            <h3 className="text-xl font-semibold flex items-center gap-2">
                                <Badge variant="default" className="text-lg px-3 py-1">{distance}m</Badge>
                            </h3>

                            <div className="grid gap-4 lg:grid-cols-2">
                                {/* Unassigned Archers for this distance */}
                                <Card>
                                    <CardHeader className="pb-3">
                                        <CardTitle className="text-base">Sin Asignar</CardTitle>
                                        <CardDescription>
                                            {unassignedByDistance.get(distance)?.length || 0} arqueros
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div
                                            className="min-h-[100px] rounded-lg border-2 border-dashed border-muted p-2 space-y-1"
                                            onDragOver={handleDragOver}
                                            onDrop={handleDropOnUnassigned}
                                        >
                                            {(unassignedByDistance.get(distance) || []).map(archer => (
                                                <div
                                                    key={archer.id}
                                                    draggable
                                                    onDragStart={() => handleDragStart(archer)}
                                                    className="flex items-center gap-2 rounded-md border bg-card p-2 cursor-grab active:cursor-grabbing hover:bg-accent transition-colors"
                                                >
                                                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                    <span className="flex-1 text-sm font-medium">
                                                        {archer.first_name} {archer.last_name}
                                                    </span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {CATEGORY_LABELS[archer.age_category as AgeCategory]}
                                                    </Badge>
                                                </div>
                                            ))}
                                            {(unassignedByDistance.get(distance) || []).length === 0 && (
                                                <p className="text-sm text-muted-foreground text-center py-4">
                                                    Todos asignados
                                                </p>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Targets for this distance */}
                                <div className="space-y-3">
                                    {distanceTargets.map(({ target, assignments }) => (
                                        <Card
                                            key={target.id}
                                            className={`transition-colors ${draggedArcher ? 'border-primary/50' : ''}`}
                                            onDragOver={handleDragOver}
                                            onDrop={() => handleDropOnTarget(target.id)}
                                        >
                                            <CardHeader className="pb-2 pt-3 px-4">
                                                <div className="flex items-center justify-between">
                                                    <CardTitle className="text-base">
                                                        Paca {target.target_number}
                                                    </CardTitle>
                                                    <Badge variant="secondary">{assignments.length}/4</Badge>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="px-4 pb-3">
                                                <div className="min-h-[60px] space-y-1">
                                                    {assignments.map(({ archerId, archer, position, turn }) => (
                                                        <div
                                                            key={archerId}
                                                            draggable
                                                            onDragStart={() => handleDragStart(archer, target.id)}
                                                            className="flex items-center gap-2 rounded-md border bg-card p-2 cursor-grab active:cursor-grabbing group"
                                                        >
                                                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                                                            <Badge className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                                                                {position}
                                                            </Badge>
                                                            <span className="flex-1 text-sm">
                                                                {archer.first_name} {archer.last_name}
                                                            </span>
                                                            <Badge variant="outline" className="text-xs">
                                                                {CATEGORY_LABELS[archer.age_category as AgeCategory]}
                                                            </Badge>
                                                            <Badge variant="outline" className="text-xs">
                                                                {turn}
                                                            </Badge>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                                                onClick={() => removeFromTarget(target.id, archerId)}
                                                            >
                                                                <Trash2 className="h-3 w-3 text-destructive" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    {assignments.length === 0 && (
                                                        <p className="text-sm text-muted-foreground text-center py-2">
                                                            Arrastra arqueros aquí
                                                        </p>
                                                    )}
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

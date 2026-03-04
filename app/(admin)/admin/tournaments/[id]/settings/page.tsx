"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import {
    AGE_CATEGORY_OPTIONS,
    CATEGORY_LABELS,
    DIVISION_LABELS,
    TOURNAMENT_DIVISION_OPTIONS,
} from "@/lib/constants/categories";
import type { AgeCategory, Tournament, TournamentDivision, TournamentType } from "@/types/database";

const INDOOR_DISTANCES = [18, 25];
const OUTDOOR_DISTANCES = [10, 15, 18, 20, 25, 30, 40, 50, 60, 70];

interface TournamentSettingsForm {
    name: string;
    type: TournamentType;
    distances: number[];
    categories: AgeCategory[];
    divisions: TournamentDivision[];
    split_brackets_by_gender: boolean;
    split_brackets_by_division: boolean;
    date: string;
    location: string;
    qualification_arrows: number;
    arrows_per_end: number;
}

export default function TournamentSettingsPage() {
    const params = useParams();
    const router = useRouter();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<TournamentSettingsForm | null>(null);

    const availableDistances = formData?.type === "indoor" ? INDOOR_DISTANCES : OUTDOOR_DISTANCES;

    const combinations = useMemo(
        () =>
            formData
                ? formData.divisions.flatMap((division) =>
                    formData.categories.flatMap((category) =>
                        formData.distances.map((distance) => ({
                            division,
                            category,
                            distance,
                        }))
                    )
                )
                : [],
        [formData]
    );

    useEffect(() => {
        const fetchTournament = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from("tournaments")
                .select("*")
                .eq("id", tournamentId)
                .single();

            if (error || !data) {
                toast.error("No se pudo cargar la configuracion del torneo");
                router.push(`/admin/tournaments/${tournamentId}`);
                return;
            }

            const tournament = data as Tournament;
            setFormData({
                name: tournament.name,
                type: tournament.type,
                distances: Array.isArray(tournament.distances) ? tournament.distances : [],
                categories:
                    Array.isArray(tournament.categories) && tournament.categories.length > 0
                        ? tournament.categories
                        : ["open"],
                divisions:
                    Array.isArray(tournament.divisions) && tournament.divisions.length > 0
                        ? tournament.divisions
                        : ["recurvo"],
                split_brackets_by_gender: Boolean(tournament.split_brackets_by_gender),
                split_brackets_by_division: Boolean(tournament.split_brackets_by_division),
                date: tournament.date,
                location: tournament.location || "",
                qualification_arrows: tournament.qualification_arrows,
                arrows_per_end: tournament.arrows_per_end,
            });
            setIsLoading(false);
        };

        void fetchTournament();
    }, [router, supabase, tournamentId]);

    const handleTypeChange = (type: TournamentType) => {
        if (!formData) return;

        if (type === "indoor") {
            setFormData({
                ...formData,
                type,
                distances: [18],
                qualification_arrows: 60,
                arrows_per_end: 3,
            });
            return;
        }

        setFormData({
            ...formData,
            type,
            distances: [70],
            qualification_arrows: 72,
            arrows_per_end: 6,
        });
    };

    const toggleDistance = (distance: number) => {
        if (!formData) return;
        const hasDistance = formData.distances.includes(distance);
        setFormData({
            ...formData,
            distances: hasDistance
                ? formData.distances.filter((value) => value !== distance)
                : [...formData.distances, distance].sort((a, b) => a - b),
        });
    };

    const toggleCategory = (category: AgeCategory) => {
        if (!formData) return;
        const hasCategory = formData.categories.includes(category);
        setFormData({
            ...formData,
            categories: hasCategory
                ? formData.categories.filter((value) => value !== category)
                : [...formData.categories, category],
        });
    };

    const toggleDivision = (division: TournamentDivision) => {
        if (!formData) return;
        const hasDivision = formData.divisions.includes(division);
        setFormData({
            ...formData,
            divisions: hasDivision
                ? formData.divisions.filter((value) => value !== division)
                : [...formData.divisions, division],
        });
    };

    const removeDistance = (distance: number) => {
        if (!formData) return;
        setFormData({
            ...formData,
            distances: formData.distances.filter((value) => value !== distance),
        });
    };

    const handleSave = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!formData) return;
        if (formData.distances.length === 0) {
            toast.error("Selecciona al menos una distancia");
            return;
        }
        if (formData.categories.length === 0) {
            toast.error("Selecciona al menos una categoria");
            return;
        }
        if (formData.divisions.length === 0) {
            toast.error("Selecciona al menos una division");
            return;
        }

        setIsSaving(true);
        const { error } = await supabase
            .from("tournaments")
            .update(formData)
            .eq("id", tournamentId);

        if (error) {
            toast.error("No se pudo guardar la configuracion", {
                description: error.message,
            });
            setIsSaving(false);
            return;
        }

        toast.success("Configuracion actualizada");
        router.push(`/admin/tournaments/${tournamentId}`);
    };

    if (isLoading || !formData) {
        return <FullPageLoader text="Cargando configuracion..." />;
    }

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href={`/admin/tournaments/${tournamentId}`}>
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Configuracion del Torneo</h2>
                    <p className="text-muted-foreground">Define opciones disponibles y agrupacion de brackets</p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Ajustes Generales</CardTitle>
                    <CardDescription>Estos cambios afectan la configuracion competitiva del torneo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre del Torneo *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                                disabled={isSaving}
                                required
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="type">Tipo de Torneo *</Label>
                                <Select value={formData.type} onValueChange={handleTypeChange} disabled={isSaving}>
                                    <SelectTrigger id="type">
                                        <SelectValue placeholder="Seleccionar tipo" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="outdoor">Outdoor</SelectItem>
                                        <SelectItem value="indoor">Indoor</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="date">Fecha *</Label>
                                <Input
                                    id="date"
                                    type="date"
                                    value={formData.date}
                                    onChange={(event) => setFormData({ ...formData, date: event.target.value })}
                                    disabled={isSaving}
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label>Divisiones disponibles *</Label>
                            <div className="grid grid-cols-3 gap-3">
                                {TOURNAMENT_DIVISION_OPTIONS.map((division) => (
                                    <button
                                        key={division}
                                        type="button"
                                        onClick={() => toggleDivision(division)}
                                        disabled={isSaving}
                                        className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                                            formData.divisions.includes(division)
                                                ? "border-primary bg-primary/10"
                                                : "border-muted hover:border-muted-foreground/50"
                                        }`}
                                    >
                                        {DIVISION_LABELS[division]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label>Categorias disponibles *</Label>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {AGE_CATEGORY_OPTIONS.map((category) => (
                                    <button
                                        key={category}
                                        type="button"
                                        onClick={() => toggleCategory(category)}
                                        disabled={isSaving}
                                        className={`rounded-lg border-2 p-3 text-sm font-medium transition-all ${
                                            formData.categories.includes(category)
                                                ? "border-primary bg-primary/10"
                                                : "border-muted hover:border-muted-foreground/50"
                                        }`}
                                    >
                                        {CATEGORY_LABELS[category]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label>Distancias del Torneo *</Label>
                            <p className="text-sm text-muted-foreground">
                                Selecciona todas las distancias habilitadas para este torneo.
                            </p>
                            {formData.distances.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {formData.distances.map((distance) => (
                                        <Badge key={distance} variant="secondary" className="text-sm py-1.5 px-3">
                                            {distance}m
                                            <button
                                                type="button"
                                                onClick={() => removeDistance(distance)}
                                                className="ml-2 hover:text-destructive"
                                                disabled={isSaving}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            <div className="grid grid-cols-5 gap-3">
                                {availableDistances.map((distance) => (
                                    <label
                                        key={distance}
                                        className={`flex cursor-pointer items-center justify-center rounded-lg border-2 p-3 transition-all ${
                                            formData.distances.includes(distance)
                                                ? "border-primary bg-primary/10"
                                                : "border-muted hover:border-muted-foreground/50"
                                        }`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formData.distances.includes(distance)}
                                            onChange={() => toggleDistance(distance)}
                                            disabled={isSaving}
                                        />
                                        <span className="font-medium">{distance}m</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3 rounded-lg border p-4">
                            <Label>Combinaciones disponibles ({combinations.length})</Label>
                            {combinations.length === 0 ? (
                                <p className="text-sm text-muted-foreground">
                                    Selecciona al menos una division, categoria y distancia.
                                </p>
                            ) : (
                                <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
                                    {combinations.map((item) => (
                                        <div
                                            key={`${item.division}-${item.category}-${item.distance}`}
                                            className="rounded-md border bg-muted/30 px-3 py-2 text-sm"
                                        >
                                            {DIVISION_LABELS[item.division]} {CATEGORY_LABELS[item.category]} {item.distance}m
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 rounded-lg border p-4">
                            <Label>Agrupacion de Brackets</Label>
                            <p className="text-sm text-muted-foreground">
                                La generacion masiva siempre separa por categoria y distancia. Usa estas opciones para decidir si tambien debe separar por genero o por division.
                            </p>
                            <div className="grid gap-3 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setFormData((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    split_brackets_by_gender: !prev.split_brackets_by_gender,
                                                }
                                                : prev
                                        )
                                    }
                                    disabled={isSaving}
                                    className={`rounded-lg border-2 p-4 text-left transition-all ${
                                        formData.split_brackets_by_gender
                                            ? "border-primary bg-primary/10"
                                            : "border-muted hover:border-muted-foreground/50"
                                    }`}
                                >
                                    <div className="font-semibold">Separar por genero</div>
                                    <div className="text-sm text-muted-foreground">
                                        Activalo solo si quieres cuadros distintos para damas y varones.
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() =>
                                        setFormData((prev) =>
                                            prev
                                                ? {
                                                    ...prev,
                                                    split_brackets_by_division: !prev.split_brackets_by_division,
                                                }
                                                : prev
                                        )
                                    }
                                    disabled={isSaving}
                                    className={`rounded-lg border-2 p-4 text-left transition-all ${
                                        formData.split_brackets_by_division
                                            ? "border-primary bg-primary/10"
                                            : "border-muted hover:border-muted-foreground/50"
                                    }`}
                                >
                                    <div className="font-semibold">Separar por division</div>
                                    <div className="text-sm text-muted-foreground">
                                        Activalo solo si quieres cuadros independientes por recurvo, compuesto o barebow.
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="location">Ubicacion</Label>
                            <Input
                                id="location"
                                value={formData.location}
                                onChange={(event) => setFormData({ ...formData, location: event.target.value })}
                                disabled={isSaving}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="qualification_arrows">Flechas Clasificatorias</Label>
                                <Input
                                    id="qualification_arrows"
                                    type="number"
                                    min={1}
                                    value={formData.qualification_arrows}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            qualification_arrows: parseInt(event.target.value, 10) || 72,
                                        })
                                    }
                                    disabled={isSaving}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="arrows_per_end">Flechas por Ronda</Label>
                                <Input
                                    id="arrows_per_end"
                                    type="number"
                                    min={1}
                                    max={6}
                                    value={formData.arrows_per_end}
                                    onChange={(event) =>
                                        setFormData({
                                            ...formData,
                                            arrows_per_end: parseInt(event.target.value, 10) || 6,
                                        })
                                    }
                                    disabled={isSaving}
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push(`/admin/tournaments/${tournamentId}`)}
                                disabled={isSaving}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="mr-2 h-4 w-4" />
                                        Guardar Configuracion
                                    </>
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

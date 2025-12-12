"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ArrowLeft, X } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import type { TournamentType } from "@/types/database";

// Distance options by tournament type
const INDOOR_DISTANCES = [18, 25];
const OUTDOOR_DISTANCES = [10, 15, 18, 20, 25, 30, 40, 50, 60, 70];

export default function NewTournamentPage() {
    const router = useRouter();
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        type: "outdoor" as TournamentType,
        distances: [70] as number[],
        date: "",
        location: "",
        qualification_arrows: 72,
        arrows_per_end: 6,
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (formData.distances.length === 0) {
            toast.error("Selecciona al menos una distancia");
            return;
        }

        setIsLoading(true);

        const { data, error } = await supabase
            .from("tournaments")
            .insert([formData])
            .select()
            .single();

        if (error) {
            toast.error("Error al crear el torneo", {
                description: error.message,
            });
            setIsLoading(false);
            return;
        }

        toast.success("Torneo creado correctamente");
        router.push(`/admin/tournaments/${data.id}`);
    };

    const handleTypeChange = (type: TournamentType) => {
        // Update defaults based on tournament type
        if (type === "indoor") {
            setFormData({
                ...formData,
                type,
                distances: [18], // Default indoor distance
                qualification_arrows: 60,
                arrows_per_end: 3,
            });
        } else {
            setFormData({
                ...formData,
                type,
                distances: [70], // Default outdoor distance
                qualification_arrows: 72,
                arrows_per_end: 6,
            });
        }
    };

    const toggleDistance = (distance: number) => {
        setFormData((prev) => {
            const hasDistance = prev.distances.includes(distance);
            if (hasDistance) {
                return {
                    ...prev,
                    distances: prev.distances.filter((d) => d !== distance),
                };
            } else {
                return {
                    ...prev,
                    distances: [...prev.distances, distance].sort((a, b) => a - b),
                };
            }
        });
    };

    const removeDistance = (distance: number) => {
        setFormData((prev) => ({
            ...prev,
            distances: prev.distances.filter((d) => d !== distance),
        }));
    };

    // Get available distances based on type
    const availableDistances = formData.type === "indoor" ? INDOOR_DISTANCES : OUTDOOR_DISTANCES;

    return (
        <div className="mx-auto max-w-2xl space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" asChild>
                    <Link href="/admin/tournaments">
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                </Button>
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Nuevo Torneo</h2>
                    <p className="text-muted-foreground">
                        Configura los parámetros básicos del torneo
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Información del Torneo</CardTitle>
                    <CardDescription>
                        Estos valores pueden modificarse más adelante
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="name">Nombre del Torneo *</Label>
                            <Input
                                id="name"
                                placeholder="Ej: Torneo Nacional 2024"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                                disabled={isLoading}
                            />
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="type">Tipo de Torneo *</Label>
                                <Select
                                    value={formData.type}
                                    onValueChange={handleTypeChange}
                                    disabled={isLoading}
                                >
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
                                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        {/* Multi-select distances */}
                        <div className="space-y-3">
                            <Label>Distancias del Torneo *</Label>
                            <p className="text-sm text-muted-foreground">
                                Selecciona todas las distancias que se usarán en este torneo
                            </p>

                            {/* Selected distances */}
                            {formData.distances.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {formData.distances.map((d) => (
                                        <Badge key={d} variant="secondary" className="text-sm py-1.5 px-3">
                                            {d}m
                                            <button
                                                type="button"
                                                onClick={() => removeDistance(d)}
                                                className="ml-2 hover:text-destructive"
                                                disabled={isLoading}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </Badge>
                                    ))}
                                </div>
                            )}

                            {/* Distance checkboxes */}
                            <div className="grid grid-cols-5 gap-3">
                                {availableDistances.map((d) => (
                                    <label
                                        key={d}
                                        className={`flex items-center justify-center rounded-lg border-2 p-3 cursor-pointer transition-all ${formData.distances.includes(d)
                                                ? "border-primary bg-primary/10"
                                                : "border-muted hover:border-muted-foreground/50"
                                            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
                                    >
                                        <input
                                            type="checkbox"
                                            className="sr-only"
                                            checked={formData.distances.includes(d)}
                                            onChange={() => toggleDistance(d)}
                                            disabled={isLoading}
                                        />
                                        <span className="font-medium">{d}m</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="location">Ubicación</Label>
                            <Input
                                id="location"
                                placeholder="Ej: Campo de Tiro Municipal"
                                value={formData.location}
                                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                disabled={isLoading}
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
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            qualification_arrows: parseInt(e.target.value) || 72,
                                        })
                                    }
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Total de flechas en la fase clasificatoria
                                </p>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="arrows_per_end">Flechas por Ronda</Label>
                                <Input
                                    id="arrows_per_end"
                                    type="number"
                                    min={1}
                                    max={6}
                                    value={formData.arrows_per_end}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            arrows_per_end: parseInt(e.target.value) || 6,
                                        })
                                    }
                                    disabled={isLoading}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Flechas que se disparan en cada ronda
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => router.push("/admin/tournaments")}
                                disabled={isLoading}
                            >
                                Cancelar
                            </Button>
                            <Button type="submit" disabled={isLoading || formData.distances.length === 0}>
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creando...
                                    </>
                                ) : (
                                    "Crear Torneo"
                                )}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AGE_CATEGORY_OPTIONS,
    CATEGORY_LABELS,
    DIVISION_LABELS,
    GENDER_LABELS,
    TOURNAMENT_DIVISION_OPTIONS,
} from "@/lib/constants/categories";
import type { AgeCategory, Gender, TournamentDivision } from "@/types/database";

interface ArcherCreateFormProps {
    allowedDistances?: number[];
    allowedCategories?: AgeCategory[];
    allowedDivisions?: TournamentDivision[];
    onCreated: () => Promise<void> | void;
}

interface ArcherCreateState {
    first_name: string;
    last_name: string;
    club: string;
    age_category: AgeCategory;
    gender: Gender;
    division: TournamentDivision;
    distance: number;
}

export function ArcherCreateForm({
    allowedDistances = [],
    allowedCategories = [],
    allowedDivisions = [],
    onCreated,
}: ArcherCreateFormProps) {
    const supabase = createClient();
    const [isSaving, setIsSaving] = useState(false);

    const categoryOptions = useMemo(
        () => (allowedCategories.length > 0 ? allowedCategories : AGE_CATEGORY_OPTIONS),
        [allowedCategories]
    );

    const divisionOptions = useMemo(
        () => (allowedDivisions.length > 0 ? allowedDivisions : TOURNAMENT_DIVISION_OPTIONS),
        [allowedDivisions]
    );

    const distanceOptions = useMemo(() => {
        const unique = new Set(allowedDistances.filter((distance) => Number.isFinite(distance) && distance > 0));
        return Array.from(unique).sort((a, b) => a - b);
    }, [allowedDistances]);

    const [form, setForm] = useState<ArcherCreateState>({
        first_name: "",
        last_name: "",
        club: "",
        age_category: categoryOptions[0],
        gender: "male",
        division: divisionOptions[0],
        distance: distanceOptions[0] ?? 20,
    });

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const firstName = form.first_name.trim();
        const lastName = form.last_name.trim();
        const club = form.club.trim();

        if (!firstName || !lastName) {
            toast.error("Nombre y apellido son obligatorios");
            return;
        }

        if (!form.distance || form.distance <= 0) {
            toast.error("Distancia invalida");
            return;
        }

        setIsSaving(true);
        const { error } = await supabase.from("archers").insert({
            first_name: firstName,
            last_name: lastName,
            club: club || null,
            age_category: form.age_category,
            gender: form.gender,
            division: form.division,
            distance: form.distance,
        });

        if (error) {
            toast.error("No se pudo crear el arquero", { description: error.message });
            setIsSaving(false);
            return;
        }

        toast.success("Arquero agregado");
        setForm((prev) => ({
            ...prev,
            first_name: "",
            last_name: "",
            club: "",
        }));
        await onCreated();
        setIsSaving(false);
    };

    return (
        <Card className="border-2 border-slate-200 shadow-sm">
            <CardHeader className="bg-slate-50 border-b border-slate-200">
                <CardTitle className="text-slate-800">Agregar Arquero Individual</CardTitle>
                <CardDescription>Registra un arquero manualmente en el padron general.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="new-archer-first-name">Nombre</Label>
                            <Input
                                id="new-archer-first-name"
                                value={form.first_name}
                                onChange={(event) =>
                                    setForm((prev) => ({ ...prev, first_name: event.target.value }))
                                }
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-archer-last-name">Apellido</Label>
                            <Input
                                id="new-archer-last-name"
                                value={form.last_name}
                                onChange={(event) =>
                                    setForm((prev) => ({ ...prev, last_name: event.target.value }))
                                }
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="new-archer-club">Club</Label>
                            <Input
                                id="new-archer-club"
                                value={form.club}
                                onChange={(event) => setForm((prev) => ({ ...prev, club: event.target.value }))}
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="space-y-2">
                            <Label>Categoria</Label>
                            <Select
                                value={form.age_category}
                                onValueChange={(value) =>
                                    setForm((prev) => ({ ...prev, age_category: value as AgeCategory }))
                                }
                                disabled={isSaving}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {categoryOptions.map((category) => (
                                        <SelectItem key={category} value={category}>
                                            {CATEGORY_LABELS[category]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Genero</Label>
                            <Select
                                value={form.gender}
                                onValueChange={(value) =>
                                    setForm((prev) => ({ ...prev, gender: value as Gender }))
                                }
                                disabled={isSaving}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="male">{GENDER_LABELS.male}</SelectItem>
                                    <SelectItem value="female">{GENDER_LABELS.female}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Division</Label>
                            <Select
                                value={form.division}
                                onValueChange={(value) =>
                                    setForm((prev) => ({ ...prev, division: value as TournamentDivision }))
                                }
                                disabled={isSaving}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {divisionOptions.map((division) => (
                                        <SelectItem key={division} value={division}>
                                            {DIVISION_LABELS[division]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Distancia</Label>
                            {distanceOptions.length > 0 ? (
                                <Select
                                    value={String(form.distance)}
                                    onValueChange={(value) =>
                                        setForm((prev) => ({ ...prev, distance: parseInt(value, 10) || prev.distance }))
                                    }
                                    disabled={isSaving}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {distanceOptions.map((distance) => (
                                            <SelectItem key={distance} value={String(distance)}>
                                                {distance}m
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    type="number"
                                    min={1}
                                    value={form.distance}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            distance: parseInt(event.target.value, 10) || 0,
                                        }))
                                    }
                                    disabled={isSaving}
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isSaving}>
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                            Agregar Arquero
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}

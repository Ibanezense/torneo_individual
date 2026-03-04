"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    AGE_CATEGORY_OPTIONS,
    CATEGORY_LABELS,
    DIVISION_LABELS,
    GENDER_LABELS,
    TOURNAMENT_DIVISION_OPTIONS,
} from "@/lib/constants/categories";
import type { AgeCategory, Archer, TournamentDivision } from "@/types/database";

interface ArcherEditDialogProps {
    archer: Archer;
    allowedDistances?: number[];
    allowedCategories?: AgeCategory[];
    allowedDivisions?: TournamentDivision[];
    onSaved: () => Promise<void> | void;
}

interface ArcherFormState {
    first_name: string;
    last_name: string;
    club: string;
    age_category: AgeCategory;
    gender: "male" | "female";
    division: TournamentDivision;
    distance: number;
}

function getInitialState(archer: Archer): ArcherFormState {
    return {
        first_name: archer.first_name,
        last_name: archer.last_name,
        club: archer.club || "",
        age_category: archer.age_category,
        gender: archer.gender,
        division: archer.division,
        distance: archer.distance,
    };
}

export function ArcherEditDialog({
    archer,
    allowedDistances = [],
    allowedCategories = [],
    allowedDivisions = [],
    onSaved,
}: ArcherEditDialogProps) {
    const supabase = createClient();
    const [open, setOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState<ArcherFormState>(() => getInitialState(archer));

    const categoryOptions = useMemo(() => {
        const list = allowedCategories.length > 0 ? allowedCategories : AGE_CATEGORY_OPTIONS;
        return list.includes(form.age_category) ? list : [...list, form.age_category];
    }, [allowedCategories, form.age_category]);

    const divisionOptions = useMemo(() => {
        const list = allowedDivisions.length > 0 ? allowedDivisions : TOURNAMENT_DIVISION_OPTIONS;
        return list.includes(form.division) ? list : [...list, form.division];
    }, [allowedDivisions, form.division]);

    const distanceOptions = useMemo(() => {
        const sorted = [...allowedDistances].sort((a, b) => a - b);
        if (sorted.length === 0) return [form.distance];
        if (sorted.includes(form.distance)) return sorted;
        return [...sorted, form.distance].sort((a, b) => a - b);
    }, [allowedDistances, form.distance]);

    const resetForm = () => {
        setForm(getInitialState(archer));
    };

    const handleOpenChange = (nextOpen: boolean) => {
        setOpen(nextOpen);
        if (nextOpen) {
            resetForm();
        }
    };

    const handleSave = async () => {
        if (!form.first_name.trim() || !form.last_name.trim()) {
            toast.error("Nombre y apellido son obligatorios");
            return;
        }
        if (!form.distance || form.distance <= 0) {
            toast.error("Distancia invalida");
            return;
        }

        setIsSaving(true);
        const { error } = await supabase
            .from("archers")
            .update({
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                club: form.club.trim() || null,
                age_category: form.age_category,
                gender: form.gender,
                division: form.division,
                distance: form.distance,
            })
            .eq("id", archer.id);

        if (error) {
            toast.error("No se pudo actualizar el arquero", { description: error.message });
            setIsSaving(false);
            return;
        }

        toast.success("Arquero actualizado");
        await onSaved();
        setIsSaving(false);
        setOpen(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Editar
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Editar Arquero</DialogTitle>
                    <DialogDescription>
                        Actualiza los datos del arquero. Este cambio se refleja en todos los torneos.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor={`first-${archer.id}`}>Nombre</Label>
                            <Input
                                id={`first-${archer.id}`}
                                value={form.first_name}
                                onChange={(e) => setForm((prev) => ({ ...prev, first_name: e.target.value }))}
                                disabled={isSaving}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`last-${archer.id}`}>Apellido</Label>
                            <Input
                                id={`last-${archer.id}`}
                                value={form.last_name}
                                onChange={(e) => setForm((prev) => ({ ...prev, last_name: e.target.value }))}
                                disabled={isSaving}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor={`club-${archer.id}`}>Club</Label>
                        <Input
                            id={`club-${archer.id}`}
                            value={form.club}
                            onChange={(e) => setForm((prev) => ({ ...prev, club: e.target.value }))}
                            disabled={isSaving}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
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
                                    setForm((prev) => ({ ...prev, gender: value as "male" | "female" }))
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
                    </div>

                    <div className="grid grid-cols-2 gap-3">
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
                        </div>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
                        Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Guardar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

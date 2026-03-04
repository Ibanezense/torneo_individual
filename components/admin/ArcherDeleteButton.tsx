"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";

interface ArcherDeleteButtonProps {
    archerId: string;
    archerName: string;
    onDeleted: () => Promise<void> | void;
}

export function ArcherDeleteButton({ archerId, archerName, onDeleted }: ArcherDeleteButtonProps) {
    const supabase = createClient();
    const [open, setOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const { count: assignmentsCount, error: assignmentsError } = await supabase
                .from("assignments")
                .select("*", { count: "exact", head: true })
                .eq("archer_id", archerId);

            if (assignmentsError) throw assignmentsError;

            if ((assignmentsCount || 0) > 0) {
                toast.error("No se puede eliminar", {
                    description: "El arquero tiene asignaciones en torneos. Quita sus asignaciones primero.",
                });
                setIsDeleting(false);
                return;
            }

            const { count: eliminationCount, error: eliminationError } = await supabase
                .from("elimination_matches")
                .select("*", { count: "exact", head: true })
                .or(`archer1_id.eq.${archerId},archer2_id.eq.${archerId}`);

            if (eliminationError) throw eliminationError;

            if ((eliminationCount || 0) > 0) {
                toast.error("No se puede eliminar", {
                    description: "El arquero tiene historial en eliminatorias. Eliminalo del torneo correspondiente primero.",
                });
                setIsDeleting(false);
                return;
            }

            const { error } = await supabase
                .from("archers")
                .delete()
                .eq("id", archerId);

            if (error) throw error;

            toast.success("Arquero eliminado");
            await onDeleted();
            setOpen(false);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Error interno";
            toast.error("No se pudo eliminar el arquero", { description: message });
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-8">
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    Eliminar
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Eliminar Arquero</DialogTitle>
                    <DialogDescription>
                        Se eliminara a {archerName}. Esta accion no se puede deshacer.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
                        Cancelar
                    </Button>
                    <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                        {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Eliminar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceMutationOrigin } from "@/lib/security/origin";

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const forbiddenResponse = enforceMutationOrigin(request);
        if (forbiddenResponse) return forbiddenResponse;

        const { id: tournamentId } = await params;
        const supabase = await createClient();

        const { data: tournament, error: tournamentError } = await supabase
            .from("tournaments")
            .select("id")
            .eq("id", tournamentId)
            .maybeSingle();

        if (tournamentError) {
            return NextResponse.json(
                { error: tournamentError.message || "No se pudo validar el torneo" },
                { status: 500 }
            );
        }

        if (!tournament) {
            return NextResponse.json(
                { error: "Torneo no encontrado o sin permisos para eliminar" },
                { status: 404 }
            );
        }

        const { error: deleteTournamentError } = await supabase.rpc(
            "admin_delete_tournament",
            { p_tournament_id: tournamentId }
        );

        if (deleteTournamentError) {
            return NextResponse.json(
                { error: deleteTournamentError.message || "No se pudo eliminar el torneo" },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Error interno";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

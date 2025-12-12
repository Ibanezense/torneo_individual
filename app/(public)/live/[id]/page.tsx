"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LiveTournamentPage() {
    const params = useParams();
    const router = useRouter();
    const tournamentId = params.id as string;

    useEffect(() => {
        // Redirect to classification by default
        router.replace(`/live/${tournamentId}/classification`);
    }, [tournamentId, router]);

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center">
            <div className="animate-spin h-8 w-8 border-4 border-slate-600 border-t-transparent rounded-full" />
        </div>
    );
}

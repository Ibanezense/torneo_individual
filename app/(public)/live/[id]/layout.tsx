"use client";

import { useState, useEffect } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Trophy, Target, Crown, Radio } from "lucide-react";

interface Tournament {
    id: string;
    name: string;
    date: string;
    location: string;
    status: string;
}

export default function LiveTournamentLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const pathname = usePathname();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [tournament, setTournament] = useState<Tournament | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchTournament = async () => {
            const { data } = await supabase
                .from("tournaments")
                .select("id, name, date, location, status")
                .eq("id", tournamentId)
                .single();

            setTournament(data);
            setIsLoading(false);
        };

        fetchTournament();
    }, [tournamentId]);

    const navItems = [
        {
            href: `/live/${tournamentId}/classification`,
            label: "Clasificación",
            icon: Target,
        },
        {
            href: `/live/${tournamentId}/brackets`,
            label: "Eliminatorias",
            icon: Trophy,
        },
        {
            href: `/live/${tournamentId}/rankings`,
            label: "Rankings",
            icon: Crown,
        },
    ];

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin h-8 w-8 border-4 border-white border-t-transparent rounded-full" />
            </div>
        );
    }

    if (!tournament) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
                <div className="text-center text-white">
                    <h1 className="text-xl font-bold">Torneo no encontrado</h1>
                    <p className="text-slate-400 mt-2">El torneo que buscas no existe</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col">
            {/* Header */}
            <header className="bg-slate-900 text-white sticky top-0 z-50 shadow-lg">
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold truncate">{tournament.name}</h1>
                            <p className="text-xs text-slate-400 truncate">
                                {tournament.location} • {new Date(tournament.date).toLocaleDateString("es-ES")}
                            </p>
                        </div>
                        {tournament.status === "in_progress" && (
                            <div className="flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
                                <Radio className="h-3 w-3 animate-pulse" />
                                EN VIVO
                            </div>
                        )}
                    </div>
                </div>

                {/* Navigation Tabs */}
                <nav className="flex border-t border-slate-700">
                    {navItems.map((item) => {
                        const isActive = pathname === item.href;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`
                                    flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium
                                    transition-colors
                                    ${isActive
                                        ? "bg-white text-slate-900 border-b-2 border-blue-600"
                                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                                    }
                                `}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="hidden sm:inline">{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </header>

            {/* Content */}
            <main className="flex-1">
                {children}
            </main>

            {/* Footer */}
            <footer className="bg-slate-900 text-slate-500 text-center py-3 text-xs">
                Powered by Absolute Archery
            </footer>
        </div>
    );
}

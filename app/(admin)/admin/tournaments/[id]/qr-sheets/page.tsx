"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Download, Printer, QrCode } from "lucide-react";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";
import { toast } from "sonner";
import QRCode from "qrcode";
import type { Target, Assignment, Archer } from "@/types/database";

interface TargetWithAssignments extends Target {
    assignments: (Assignment & { archer: Archer })[];
}

export default function QRSheetsPage() {
    const params = useParams();
    const tournamentId = params.id as string;
    const supabase = createClient();

    const [isLoading, setIsLoading] = useState(true);
    const [targets, setTargets] = useState<TargetWithAssignments[]>([]);
    const [tournamentName, setTournamentName] = useState("");
    const [qrCodes, setQrCodes] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        fetchData();
    }, [tournamentId]);

    const fetchData = async () => {
        setIsLoading(true);

        // Get tournament
        const { data: tournament } = await supabase
            .from("tournaments")
            .select("name")
            .eq("id", tournamentId)
            .single();

        if (tournament) {
            setTournamentName(tournament.name);
        }

        // Get targets with assignments
        const { data: targetsData } = await supabase
            .from("targets")
            .select(`
        *,
        assignments (
          *,
          archer:archers(*)
        )
      `)
            .eq("tournament_id", tournamentId)
            .order("target_number");

        const targetsWithAssignments = (targetsData || []) as TargetWithAssignments[];
        setTargets(targetsWithAssignments);

        // Generate QR codes for each target
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
        const codes = new Map<string, string>();

        for (const target of targetsWithAssignments) {
            if (target.assignments.length > 0) {
                // Use the first assignment's token for the target QR
                const token = target.assignments[0].access_token;
                const url = `${appUrl}/target/${token}`;

                try {
                    const qrDataUrl = await QRCode.toDataURL(url, {
                        width: 200,
                        margin: 2,
                        color: {
                            dark: "#000000",
                            light: "#ffffff",
                        },
                    });
                    codes.set(target.id, qrDataUrl);
                } catch (err) {
                    console.error("Error generating QR:", err);
                }
            }
        }

        setQrCodes(codes);
        setIsLoading(false);
    };

    const handlePrint = () => {
        window.print();
    };

    if (isLoading) {
        return <FullPageLoader text="Generando códigos QR..." />;
    }

    if (targets.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/tournaments/${tournamentId}`}>
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <h2 className="text-3xl font-bold tracking-tight">Hojas de QR</h2>
                </div>
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <QrCode className="h-12 w-12 text-muted-foreground/50" />
                        <p className="mt-4 text-muted-foreground">
                            No hay pacas configuradas. Primero genera las asignaciones.
                        </p>
                        <Button asChild className="mt-4">
                            <Link href={`/admin/tournaments/${tournamentId}/assignments`}>
                                Ir a Asignaciones
                            </Link>
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header - Hidden on print */}
            <div className="flex items-center justify-between print:hidden">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/tournaments/${tournamentId}`}>
                            <ArrowLeft className="h-5 w-5" />
                        </Link>
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Hojas de QR</h2>
                        <p className="text-muted-foreground">
                            {tournamentName} - {targets.length} pacas
                        </p>
                    </div>
                </div>

                <Button onClick={handlePrint}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir Todo
                </Button>
            </div>

            {/* QR Cards Grid */}
            <div className="grid gap-6 print:gap-4 md:grid-cols-2 lg:grid-cols-3 print:grid-cols-3">
                {targets.map((target) => (
                    <Card
                        key={target.id}
                        className="break-inside-avoid print:border-2 print:shadow-none"
                    >
                        <CardHeader className="pb-2 text-center">
                            <CardTitle className="text-2xl">Paca {target.target_number}</CardTitle>
                            <CardDescription className="text-lg font-medium">
                                {target.distance}m - {tournamentName}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* QR Code */}
                            <div className="flex justify-center">
                                {qrCodes.has(target.id) ? (
                                    <img
                                        src={qrCodes.get(target.id)}
                                        alt={`QR Paca ${target.target_number}`}
                                        className="h-48 w-48"
                                    />
                                ) : (
                                    <div className="flex h-48 w-48 items-center justify-center bg-muted">
                                        <QrCode className="h-12 w-12 text-muted-foreground" />
                                    </div>
                                )}
                            </div>

                            {/* Archer List */}
                            <div className="space-y-2">
                                {target.assignments
                                    .sort((a, b) => a.position.localeCompare(b.position))
                                    .map((assignment) => (
                                        <div
                                            key={assignment.id}
                                            className="flex items-center justify-between rounded-md border p-2 text-sm"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="font-bold">
                                                    {assignment.position}
                                                </Badge>
                                                <span>
                                                    {assignment.archer.first_name} {assignment.archer.last_name}
                                                </span>
                                            </div>
                                            <Badge variant="secondary" className="text-xs">
                                                {assignment.turn}
                                            </Badge>
                                        </div>
                                    ))}
                            </div>

                            {/* Instructions */}
                            <p className="text-center text-xs text-muted-foreground">
                                Escanea el código QR para registrar puntuaciones
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Print Styles */}
            <style jsx global>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:grid-cols-3 {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .print\\:gap-4 {
            gap: 1rem;
          }
          .print\\:border-2 {
            border-width: 2px;
          }
          .print\\:shadow-none {
            box-shadow: none;
          }
        }
      `}</style>
        </div>
    );
}

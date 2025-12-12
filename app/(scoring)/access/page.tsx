"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

export default function AccessPage() {
    const router = useRouter();
    const supabase = createClient();
    const [code, setCode] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const cleanCode = code.toUpperCase().trim();

        if (!cleanCode) {
            toast.error("Ingresa el código de la paca");
            return;
        }

        setIsLoading(true);

        try {
            // Regex for Target Code: T{number} (e.g., T5, T12)
            const targetMatch = cleanCode.match(/^T(\d+)$/);

            if (targetMatch) {
                const targetNumber = parseInt(targetMatch[1]);

                console.log("Searching for target number:", targetNumber);

                // Find target by number - ONLY from active tournaments (qualification or elimination status)
                const { data: targets, error } = await supabase
                    .from("targets")
                    .select(`
                        id, 
                        target_number, 
                        tournament:tournaments!inner(id, name, status)
                    `)
                    .eq("target_number", targetNumber);

                if (error) throw error;

                // Filter to only include targets from active tournaments
                const activeTargets = (targets || []).filter((t: any) => {
                    const status = t.tournament?.status;
                    return status === "qualification" || status === "elimination";
                });

                console.log("Found active targets:", activeTargets);

                if (activeTargets.length > 1) {
                    // Multiple active tournaments have this target number
                    toast.error("Múltiples torneos activos", {
                        description: `La Paca ${targetNumber} existe en varios torneos activos. Contacta al organizador.`,
                    });
                    setIsLoading(false);
                    return;
                }

                if (activeTargets.length === 1) {
                    const targetId = activeTargets[0].id;
                    const tournamentStatus = (activeTargets[0] as any).tournament?.status;

                    // Route based on tournament phase
                    if (tournamentStatus === "elimination") {
                        router.push(`/scoring/elimination/target/${targetId}`);
                    } else {
                        router.push(`/scoring/target/${targetId}`);
                    }
                    return;
                }

                // No active target found, check if there are any targets at all
                if (targets && targets.length > 0) {
                    toast.error("Torneo no activo", {
                        description: `La Paca ${targetNumber} pertenece a un torneo que no está en curso.`,
                    });
                } else {
                    toast.error("Paca no encontrada", {
                        description: `No existe la Paca ${targetNumber}`,
                    });
                }
                setIsLoading(false);
                return;
            }

            // Fallback: Try searching for specific assignment code (legacy support: T5A)
            // Or just reject if user wants STRICT T5. 
            // User said "Code access by TARGET ... not by archer".
            // But preserving T5A support might be useful just in case? 
            // I'll keep it but prioritize Target flow.

            const assignmentMatch = cleanCode.match(/^T(\d{1,2})([A-D])$/);
            if (assignmentMatch) {
                toast.error("Usa el código de la Paca", {
                    description: `Prueba ingresando solo T${assignmentMatch[1]} para ver a todos los arqueros.`,
                });
                // Optional: redirect anyway?
                // logic...
            } else {
                toast.error("Formato incorrecto", {
                    description: "Usa el formato T + Número (ej: T5, T12)",
                });
            }

        } catch (error: any) {
            console.error("Error searching:", error);
            toast.error("Error al buscar", {
                description: error.message,
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
            <Card className="w-full max-w-md border-0 shadow-2xl bg-slate-800 text-white">
                <CardHeader className="space-y-4 text-center pb-2">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-blue-600 shadow-lg shadow-blue-900/50">
                        <Target className="h-10 w-10 text-white" />
                    </div>
                    <div>
                        <CardTitle className="text-3xl font-black tracking-tight">Escanear Paca</CardTitle>
                        <CardDescription className="text-slate-400 text-lg">
                            Ingresa el código de la paca
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="pt-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <Input
                                id="code"
                                type="text"
                                placeholder="Ej: T5"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                className="text-center text-4xl font-black tracking-widest h-20 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 rounded-2xl focus-visible:ring-blue-500"
                                maxLength={6}
                                autoComplete="off"
                                autoCapitalize="characters"
                                disabled={isLoading}
                            />
                            <p className="text-sm text-center text-slate-500">
                                El código está visible en la tarjeta de la paca
                            </p>
                        </div>

                        <Button
                            type="submit"
                            className="w-full h-16 text-xl font-bold rounded-xl bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98]"
                            disabled={isLoading || !code.trim()}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-3 h-6 w-6 animate-spin" />
                                    Buscando...
                                </>
                            ) : (
                                <>
                                    INGRESAR
                                    <ArrowRight className="ml-3 h-6 w-6" />
                                </>
                            )}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}

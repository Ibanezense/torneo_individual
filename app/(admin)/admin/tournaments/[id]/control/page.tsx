"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Wifi, WifiOff, AlertTriangle, RefreshCw, Target, CheckCircle2, Clock, XCircle } from "lucide-react";
import { TargetGrid } from "@/components/admin/TargetGrid";
import { useRealtimeTargets } from "@/hooks/use-realtime-targets";
import { FullPageLoader } from "@/components/shared/LoadingSpinner";

export default function ControlRoomPage() {
    const params = useParams();
    const tournamentId = params.id as string;

    const { targets, stats, isConnected, isLoading, refetch } = useRealtimeTargets(tournamentId);

    if (isLoading) {
        return <FullPageLoader text="Cargando campo..." />;
    }

    // Calculate total archers and progress
    const totalArchers = targets.reduce((sum, t) => sum + (t.archerCount || 0), 0);
    const totalCompleted = targets.reduce((sum, t) => sum + (t.completedCount || 0), 0);
    const progressPercent = totalArchers > 0 ? Math.round((totalCompleted / totalArchers) * 100) : 0;

    return (
        <div className="min-h-screen bg-white space-y-6 pb-20">
            {/* Header */}
            <div className="bg-gradient-to-b from-slate-100 to-white border-b border-slate-200 -mx-6 -mt-6 px-8 py-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-4">
                            <Button variant="outline" size="icon" asChild className="border-slate-300 hover:bg-slate-100">
                                <Link href={`/admin/tournaments/${tournamentId}`}>
                                    <ArrowLeft className="h-5 w-5 text-slate-700" />
                                </Link>
                            </Button>
                            <div>
                                <div className="flex items-center gap-3">
                                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 uppercase">
                                        Control Room
                                    </h1>
                                    {isConnected ? (
                                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300 border">
                                            <Wifi className="mr-1 h-3 w-3" />
                                            En Vivo
                                        </Badge>
                                    ) : (
                                        <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-300 border">
                                            <WifiOff className="mr-1 h-3 w-3" />
                                            Desconectado
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-slate-600 mt-1 font-medium">
                                    Vista en tiempo real del campo de tiro
                                </p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            onClick={() => refetch()}
                            className="border-slate-300"
                        >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Actualizar
                        </Button>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
                        <div className="bg-white border-2 border-slate-200 rounded-xl p-4 text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <Target className="h-4 w-4 text-slate-500" />
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Pacas</p>
                            </div>
                            <p className="text-2xl font-black text-slate-900">{targets.length}</p>
                        </div>
                        <div className="bg-white border-2 border-slate-200 rounded-xl p-4 text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <div className="h-3 w-3 rounded-full bg-slate-400" />
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Inactivos</p>
                            </div>
                            <p className="text-2xl font-black text-slate-500">{stats.inactive}</p>
                        </div>
                        <div className="bg-white border-2 border-blue-200 rounded-xl p-4 text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <Clock className="h-4 w-4 text-blue-500" />
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Anotando</p>
                            </div>
                            <p className="text-2xl font-black text-blue-600">{stats.scoring}</p>
                        </div>
                        <div className="bg-white border-2 border-emerald-200 rounded-xl p-4 text-center shadow-sm">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Completos</p>
                            </div>
                            <p className="text-2xl font-black text-emerald-600">{stats.confirmed}</p>
                        </div>
                        <div className={`bg-white border-2 rounded-xl p-4 text-center shadow-sm ${stats.conflict > 0 ? 'border-red-400' : 'border-slate-200'}`}>
                            <div className="flex items-center justify-center gap-2 mb-1">
                                {stats.conflict > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                                <XCircle className={`h-4 w-4 ${stats.conflict > 0 ? 'text-red-500' : 'text-slate-400'}`} />
                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Conflictos</p>
                            </div>
                            <p className={`text-2xl font-black ${stats.conflict > 0 ? 'text-red-600' : 'text-slate-400'}`}>{stats.conflict}</p>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {totalArchers > 0 && (
                        <div className="mt-6 bg-white border-2 border-slate-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-slate-700">Progreso General</span>
                                <span className="text-sm font-bold text-slate-900">
                                    {totalCompleted}/{totalArchers} arqueros completos ({progressPercent}%)
                                </span>
                            </div>
                            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 space-y-6">
                {/* Legend */}
                <Card className="border-2 border-slate-200 shadow-sm">
                    <CardContent className="flex flex-wrap items-center gap-6 pt-4 pb-4">
                        <span className="text-sm font-bold text-slate-600">Leyenda:</span>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-slate-300 border border-slate-400" />
                            <span className="text-sm text-slate-600">Inactivo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-blue-400 animate-pulse" />
                            <span className="text-sm text-slate-600">Anotando</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-emerald-500" />
                            <span className="text-sm text-slate-600">Completo</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="h-4 w-4 rounded bg-red-500" />
                            <span className="text-sm text-slate-600">Conflicto</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Target Grid */}
                {targets.length > 0 ? (
                    <Card className="border-2 border-slate-200 shadow-sm">
                        <CardHeader className="bg-slate-50 border-b border-slate-200">
                            <CardTitle className="text-xl font-bold text-slate-800">Campo de Tiro</CardTitle>
                            <CardDescription>
                                {targets.length} pacas configuradas • Clic en una paca para ver detalles
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-6">
                            <TargetGrid
                                targets={targets}
                                onTargetClick={(targetId) => {
                                    // TODO: Open target detail modal
                                    console.log("Target clicked:", targetId);
                                }}
                            />
                        </CardContent>
                    </Card>
                ) : (
                    <Card className="border-2 border-slate-200 shadow-sm">
                        <CardContent className="flex flex-col items-center justify-center py-16">
                            <div className="bg-slate-100 p-4 rounded-full mb-4">
                                <Target className="h-8 w-8 text-slate-400" />
                            </div>
                            <h3 className="font-bold text-slate-900 text-lg">No hay pacas configuradas</h3>
                            <p className="text-slate-500 max-w-sm mt-2 text-center">
                                Primero debes configurar las pacas y asignar arqueros para poder ver el estado del campo.
                            </p>
                            <Button asChild className="mt-4">
                                <Link href={`/admin/tournaments/${tournamentId}/targets`}>
                                    Configurar Pacas
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </div>
    );
}

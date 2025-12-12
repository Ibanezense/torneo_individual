"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Upload, FileSpreadsheet, Check, X, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { AgeCategory, Gender } from "@/types/database";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/lib/constants/categories";

interface ImportedArcher {
    first_name: string;
    last_name: string;
    club?: string;
    age_category: AgeCategory;
    gender: Gender;
    distance: number;
    isValid: boolean;
    errors: string[];
}

interface ArcherImporterProps {
    tournamentId: string;
    availableDistances?: number[];
    onSuccess?: () => void;
}

const VALID_CATEGORIES: AgeCategory[] = ["u10", "u13", "u15", "u18", "u21", "senior", "master", "open"];

export function ArcherImporter({ tournamentId, availableDistances = [], onSuccess }: ArcherImporterProps) {
    const supabase = createClient();
    const [importedArchers, setImportedArchers] = useState<ImportedArcher[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const validateArcher = (row: Record<string, string>): ImportedArcher => {
        const errors: string[] = [];

        const first_name = row.nombre || row.first_name || row.Nombre || "";
        const last_name = row.apellido || row.last_name || row.Apellido || "";
        const club = row.club || row.Club || "";
        const categoryRaw = (row.categoria || row.age_category || row.Categoria || "").toLowerCase();
        const genderRaw = (row.genero || row.gender || row.Genero || row.sexo || row.Sexo || "").toLowerCase();
        const distanceRaw = row.distancia || row.distance || row.Distancia || "";

        if (!first_name) errors.push("Nombre requerido");
        if (!last_name) errors.push("Apellido requerido");

        // Normalize category
        let age_category: AgeCategory = "open";
        if (VALID_CATEGORIES.includes(categoryRaw as AgeCategory)) {
            age_category = categoryRaw as AgeCategory;
        } else if (categoryRaw.includes("10") || categoryRaw.includes("sub10")) {
            age_category = "u10";
        } else if (categoryRaw.includes("13") || categoryRaw.includes("sub13")) {
            age_category = "u13";
        } else if (categoryRaw.includes("15") || categoryRaw.includes("sub15")) {
            age_category = "u15";
        } else if (categoryRaw.includes("18") || categoryRaw.includes("cadete")) {
            age_category = "u18";
        } else if (categoryRaw.includes("21") || categoryRaw.includes("junior")) {
            age_category = "u21";
        } else if (categoryRaw.includes("mayor")) {
            age_category = "senior";
        } else if (categoryRaw === "senior") {
            age_category = "master";
        } else if (categoryRaw) {
            errors.push(`Categoría no válida: ${categoryRaw}`);
        }

        // Normalize gender
        let gender: Gender = "male";
        if (genderRaw === "male" || genderRaw === "m" || genderRaw === "masculino" || genderRaw === "hombre") {
            gender = "male";
        } else if (genderRaw === "female" || genderRaw === "f" || genderRaw === "femenino" || genderRaw === "mujer") {
            gender = "female";
        } else if (genderRaw) {
            errors.push(`Género no válido: ${genderRaw}`);
        }

        // Parse distance
        let distance = 0;
        if (distanceRaw) {
            const distNum = parseInt(distanceRaw.replace(/m/i, "").trim());
            if (!isNaN(distNum) && distNum > 0) {
                distance = distNum;
                if (availableDistances.length > 0 && !availableDistances.includes(distNum)) {
                    errors.push(`Distancia ${distNum}m no disponible en este torneo`);
                }
            } else {
                errors.push(`Distancia no válida: ${distanceRaw}`);
            }
        } else {
            errors.push("Distancia requerida");
        }

        return {
            first_name,
            last_name,
            club: club || undefined,
            age_category,
            gender,
            distance,
            isValid: errors.length === 0,
            errors,
        };
    };

    const processFile = useCallback((file: File) => {
        setIsProcessing(true);
        const fileExtension = file.name.split(".").pop()?.toLowerCase();

        if (fileExtension === "csv") {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const archers = results.data.map((row) => validateArcher(row as Record<string, string>));
                    setImportedArchers(archers);
                    setIsProcessing(false);
                },
                error: (error) => {
                    toast.error("Error al procesar CSV", { description: error.message });
                    setIsProcessing(false);
                },
            });
        } else if (fileExtension === "xlsx" || fileExtension === "xls") {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet) as Record<string, string>[];

                    const archers = json.map((row) => validateArcher(row));
                    setImportedArchers(archers);
                    setIsProcessing(false);
                } catch {
                    toast.error("Error al procesar Excel");
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            toast.error("Formato no soportado", { description: "Usa archivos CSV o Excel (.xlsx)" });
            setIsProcessing(false);
        }
    }, [availableDistances]);

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) processFile(file);
        },
        [processFile]
    );

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleSave = async () => {
        const validArchers = importedArchers.filter((a) => a.isValid);
        if (validArchers.length === 0) {
            toast.error("No hay arqueros válidos para guardar");
            return;
        }

        setIsSaving(true);

        try {
            const archersToInsert = validArchers.map(({ isValid, errors, ...archer }) => ({
                ...archer,
                division: "recurvo",
            }));

            const { data: insertedArchers, error: archersError } = await supabase
                .from("archers")
                .insert(archersToInsert)
                .select();

            if (archersError) throw archersError;

            toast.success(`${insertedArchers.length} arqueros importados correctamente`);
            setImportedArchers([]);
            if (onSuccess) onSuccess();
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : "Error desconocido";
            toast.error("Error al guardar arqueros", { description: errMsg });
        } finally {
            setIsSaving(false);
        }
    };

    const downloadTemplate = () => {
        const distanceExample = availableDistances.length > 0 ? availableDistances[0] : 20;
        const template = [
            ["Nombre", "Apellido", "Club", "Categoria", "Genero", "Distancia"],
            ["Juan", "Pérez", "Club A", "senior", "male", distanceExample],
            ["María", "García", "Club B", "u18", "female", distanceExample],
        ];
        const ws = XLSX.utils.aoa_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Arqueros");
        XLSX.writeFile(wb, "plantilla_arqueros.xlsx");
    };

    const validCount = importedArchers.filter((a) => a.isValid).length;
    const invalidCount = importedArchers.filter((a) => !a.isValid).length;

    return (
        <div className="space-y-6">
            {/* Available distances info */}
            {availableDistances.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium text-slate-600">Distancias disponibles:</span>
                    {availableDistances.map((d) => (
                        <Badge key={d} variant="secondary" className="bg-blue-100 text-blue-700">{d}m</Badge>
                    ))}
                </div>
            )}

            {/* Upload Area */}
            <Card className="border-0 shadow-none">
                <CardContent className="space-y-4 p-0">
                    <div
                        onDrop={handleDrop}
                        onDragOver={(e) => e.preventDefault()}
                        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-10 transition-colors hover:bg-slate-100 hover:border-slate-400 cursor-pointer relative group"
                    >
                        {isProcessing ? (
                            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                        ) : (
                            <>
                                <div className="bg-white p-4 rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform">
                                    <Upload className="h-8 w-8 text-blue-600" />
                                </div>
                                <p className="mb-1 text-lg font-bold text-slate-700">
                                    Arrastra tu archivo aquí
                                </p>
                                <p className="text-sm text-slate-500 font-medium">
                                    Soporta Excel (.xlsx) o CSV
                                </p>
                            </>
                        )}
                        <Input
                            type="file"
                            accept=".csv,.xlsx,.xls"
                            onChange={handleFileChange}
                            className="absolute inset-0 cursor-pointer opacity-0"
                            disabled={isProcessing}
                        />
                    </div>

                    <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 text-sm text-blue-800">
                            <FileSpreadsheet className="h-4 w-4" />
                            <span className="font-semibold">¿Necesitas ayuda?</span>
                            <span className="text-blue-600">Descarga la plantilla oficial para evitar errores.</span>
                        </div>
                        <Button variant="outline" size="sm" onClick={downloadTemplate} className="bg-white border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800">
                            <Download className="mr-2 h-4 w-4" />
                            Plantilla Excel
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Preview Section */}
            {importedArchers.length > 0 && (
                <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="bg-slate-50 px-6 py-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h4 className="font-bold text-slate-800">Validación de Datos</h4>
                            <div className="flex gap-2 text-sm font-medium">
                                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">{validCount} Válidos</span>
                                {invalidCount > 0 && <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">{invalidCount} Errores</span>}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setImportedArchers([])} className="text-slate-500 hover:text-slate-700">
                                Cancelar
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving || validCount === 0} className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-900/10">
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                                Importar {validCount} Arqueros
                            </Button>
                        </div>
                    </div>
                    <div className="max-h-[400px] overflow-auto">
                        <Table>
                            <TableHeader className="bg-white sticky top-0 shadow-sm z-10">
                                <TableRow>
                                    <TableHead className="w-10 text-center">#</TableHead>
                                    <TableHead className="font-bold text-slate-700">Nombre</TableHead>
                                    <TableHead className="font-bold text-slate-700">Club</TableHead>
                                    <TableHead className="font-bold text-slate-700">Categoría</TableHead>
                                    <TableHead className="font-bold text-slate-700">Distancia</TableHead>
                                    <TableHead className="font-bold text-slate-700">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {importedArchers.map((archer, index) => (
                                    <TableRow key={index} className={!archer.isValid ? "bg-red-50/50" : ""}>
                                        <TableCell className="text-center text-slate-400 font-mono text-xs">{index + 1}</TableCell>
                                        <TableCell>
                                            <div className="font-bold text-slate-700">{archer.last_name}, {archer.first_name}</div>
                                            <div className="text-xs text-slate-400">{GENDER_LABELS[archer.gender]}</div>
                                        </TableCell>
                                        <TableCell>{archer.club || "-"}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-slate-100">{CATEGORY_LABELS[archer.age_category]}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono font-bold text-slate-600">{archer.distance}m</span>
                                        </TableCell>
                                        <TableCell>
                                            {archer.isValid ? (
                                                <div className="flex items-center text-green-600 text-sm font-bold"><Check className="w-4 h-4 mr-1" /> Listo</div>
                                            ) : (
                                                <div className="text-red-600 text-xs font-medium">
                                                    {archer.errors.map((e, i) => <div key={i}>• {e}</div>)}
                                                </div>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            )}
        </div>
    );
}

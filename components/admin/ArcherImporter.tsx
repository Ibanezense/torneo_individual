"use client";

import { useState, useCallback } from "react";
import Papa from "papaparse";
import { Upload, FileSpreadsheet, Check, Loader2, Download } from "lucide-react";
import { toast } from "sonner";
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
import {
    AGE_CATEGORY_OPTIONS,
    CATEGORY_LABELS,
    DIVISION_LABELS,
    GENDER_LABELS,
    TOURNAMENT_DIVISION_OPTIONS,
} from "@/lib/constants/categories";
import type { AgeCategory, Gender, TournamentDivision } from "@/types/database";

interface ImportedArcher {
    first_name: string;
    last_name: string;
    club?: string;
    age_category: AgeCategory;
    gender: Gender;
    division: TournamentDivision;
    distance: number;
    isValid: boolean;
    errors: string[];
}

interface ArcherImporterProps {
    tournamentId: string;
    availableDistances?: number[];
    allowedCategories?: AgeCategory[];
    allowedDivisions?: TournamentDivision[];
    onSuccess?: () => void;
}

const VALID_CATEGORIES = AGE_CATEGORY_OPTIONS;
const VALID_DIVISIONS = TOURNAMENT_DIVISION_OPTIONS;
const MAX_IMPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const DISALLOWED_IMPORT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

interface ArcherWritePayload {
    first_name: string;
    last_name: string;
    club: string | null;
    age_category: AgeCategory;
    gender: Gender;
    division: TournamentDivision;
    distance: number;
}

interface ExistingArcherRow extends ArcherWritePayload {
    id: string;
}

function normalizeLookupKey(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function getRowValue(row: Record<string, unknown>, keys: string[]): string {
    const normalizedKeys = new Set(keys.map(normalizeLookupKey));

    for (const [key, value] of Object.entries(row)) {
        if (normalizedKeys.has(normalizeLookupKey(key)) && value !== undefined && value !== null) {
            return String(value).trim();
        }
    }

    return "";
}

function sanitizeImportRow(row: Record<string, unknown>): Record<string, unknown> {
    const safeRow = Object.create(null) as Record<string, unknown>;

    for (const [key, value] of Object.entries(row)) {
        if (DISALLOWED_IMPORT_KEYS.has(normalizeLookupKey(key))) continue;
        safeRow[key] = value;
    }

    return safeRow;
}

function normalizeCategory(raw: string): AgeCategory | null {
    const value = normalizeLookupKey(raw);
    const compactValue = value.replace(/\s+/g, "");
    if (!value) return null;

    if (VALID_CATEGORIES.includes(value as AgeCategory)) return value as AgeCategory;
    if (compactValue.includes("sub10") || compactValue.includes("u10") || value === "10") return "u10";
    if (compactValue.includes("sub13") || compactValue.includes("u13") || value === "13") return "u13";
    if (compactValue.includes("sub15") || compactValue.includes("u15") || value === "15") return "u15";
    if (compactValue.includes("sub18") || compactValue.includes("u18") || value.includes("cadete") || value === "18") return "u18";
    if (compactValue.includes("sub21") || compactValue.includes("u21") || value.includes("junior") || value === "21") return "u21";
    if (value.includes("mayor")) return "senior";
    if (value === "senior" || value.includes("master") || value.includes("veteran")) return "master";
    if (value.includes("open") || value.includes("abierto")) return "open";

    return null;
}

function normalizeGender(raw: string): Gender | null {
    const value = normalizeLookupKey(raw);
    if (!value) return null;

    if (["male", "m", "masculino", "hombre", "varon", "varones"].includes(value)) return "male";
    if (["female", "f", "femenino", "mujer", "dama", "damas"].includes(value)) return "female";
    return null;
}

function normalizeDivision(raw: string): TournamentDivision | null {
    const value = normalizeLookupKey(raw);
    if (!value) return null;

    if (VALID_DIVISIONS.includes(value as TournamentDivision)) return value as TournamentDivision;
    if (value.includes("recurv") || value.includes("recuv") || value.includes("olympic")) return "recurvo";
    if (value.includes("compuest") || value.includes("compound")) return "compuesto";
    if (value.includes("barebow") || value.includes("instintiv") || value.includes("desnudo")) return "barebow";

    return null;
}

function normalizeText(value?: string | null): string {
    return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildArcherKey(archer: ArcherWritePayload): string {
    return [
        normalizeText(archer.first_name),
        normalizeText(archer.last_name),
        normalizeText(archer.club),
        archer.age_category,
        archer.gender,
        archer.division,
        String(archer.distance),
    ].join("|");
}

export function ArcherImporter({
    availableDistances = [],
    allowedCategories = [],
    allowedDivisions = [],
    onSuccess,
}: ArcherImporterProps) {
    const supabase = createClient();
    const [importedArchers, setImportedArchers] = useState<ImportedArcher[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const validateArcher = useCallback((row: Record<string, unknown>): ImportedArcher => {
        const errors: string[] = [];

        const first_name = getRowValue(row, ["nombre", "Nombre", "NOMBRE", "first_name", "First Name"]);
        const last_name = getRowValue(row, ["apellido", "Apellido", "APELLIDO", "last_name", "Last Name"]);
        const club = getRowValue(row, ["club", "Club", "CLUB"]);

        const categoryRaw = getRowValue(row, [
            "categoria",
            "Categoria",
            "CATEGORIA",
            "age_category",
            "category",
        ]);
        const genderRaw = getRowValue(row, [
            "genero",
            "Genero",
            "GENERO",
            "sexo",
            "Sexo",
            "SEXO",
            "gender",
        ]);
        const divisionRaw = getRowValue(row, [
            "division",
            "Division",
            "DIVISION",
            "modalidad",
            "Modalidad",
            "MODALIDAD",
            "arco",
            "Arco",
            "ARCO",
        ]);
        const distanceRaw = getRowValue(row, [
            "distancia",
            "Distancia",
            "DISTANCIA",
            "distance",
        ]);

        if (!first_name) errors.push("Nombre requerido");
        if (!last_name) errors.push("Apellido requerido");

        const age_category = normalizeCategory(categoryRaw);
        if (!age_category) {
            errors.push(`Categoria no valida: ${categoryRaw || "(vacia)"}`);
        } else if (allowedCategories.length > 0 && !allowedCategories.includes(age_category)) {
            errors.push(`Categoria ${CATEGORY_LABELS[age_category]} no habilitada en este torneo`);
        }

        const gender = normalizeGender(genderRaw);
        if (!gender) {
            errors.push(`Genero no valido: ${genderRaw || "(vacio)"}`);
        }

        const division = normalizeDivision(divisionRaw);
        if (!division) {
            errors.push(`Division no valida: ${divisionRaw || "(vacia)"}`);
        } else if (allowedDivisions.length > 0 && !allowedDivisions.includes(division)) {
            errors.push(`Division ${DIVISION_LABELS[division]} no habilitada en este torneo`);
        }

        let distance = 0;
        if (distanceRaw) {
            const distNum = parseInt(distanceRaw.replace(/m/i, "").trim(), 10);
            if (!isNaN(distNum) && distNum > 0) {
                distance = distNum;
                if (availableDistances.length > 0 && !availableDistances.includes(distNum)) {
                    errors.push(`Distancia ${distNum}m no disponible en este torneo`);
                }
            } else {
                errors.push(`Distancia no valida: ${distanceRaw}`);
            }
        } else {
            errors.push("Distancia requerida");
        }

        return {
            first_name,
            last_name,
            club: club || undefined,
            age_category: age_category || "open",
            gender: gender || "male",
            division: division || "recurvo",
            distance,
            isValid: errors.length === 0,
            errors,
        };
    }, [availableDistances, allowedCategories, allowedDivisions]);

    const processFile = useCallback(
        (file: File) => {
            setIsProcessing(true);
            const fileExtension = file.name.split(".").pop()?.toLowerCase();

            if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
                toast.error("Archivo demasiado grande", {
                    description: "El archivo no debe superar 5 MB.",
                });
                setIsProcessing(false);
                return;
            }

            if (fileExtension === "csv") {
                Papa.parse(file, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        const parsedRows = Array.isArray(results.data)
                            ? results.data
                            : [];
                        const limitedRows = parsedRows.slice(0, MAX_IMPORT_ROWS);
                        if (parsedRows.length > MAX_IMPORT_ROWS) {
                            toast.warning("Archivo truncado", {
                                description: `Solo se procesaran las primeras ${MAX_IMPORT_ROWS} filas.`,
                            });
                        }
                        const archers = limitedRows
                            .map((row) => sanitizeImportRow(row as Record<string, unknown>))
                            .map((row) => validateArcher(row));
                        setImportedArchers(archers);
                        setIsProcessing(false);
                    },
                    error: (error) => {
                        toast.error("Error al procesar CSV", { description: error.message });
                        setIsProcessing(false);
                    },
                });
                return;
            }

            toast.error("Formato no soportado", { description: "Usa archivos CSV (.csv)." });
            setIsProcessing(false);
        },
        [validateArcher]
    );

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
        const validArchers = importedArchers.filter((archer) => archer.isValid);
        if (validArchers.length === 0) {
            toast.error("No hay arqueros validos para guardar");
            return;
        }

        setIsSaving(true);

        try {
            const normalizedImport: ArcherWritePayload[] = validArchers.map((archer) => ({
                first_name: archer.first_name,
                last_name: archer.last_name,
                club: archer.club || null,
                age_category: archer.age_category,
                gender: archer.gender,
                division: archer.division,
                distance: archer.distance,
            }));

            const uniqueByKey = new Map<string, ArcherWritePayload>();
            for (const archer of normalizedImport) {
                uniqueByKey.set(buildArcherKey(archer), archer);
            }

            const uniqueImportArchers = Array.from(uniqueByKey.values());

            const { data: existingArchers, error: existingError } = await supabase
                .from("archers")
                .select("id, first_name, last_name, club, age_category, gender, division, distance");

            if (existingError) throw existingError;

            const existingByKey = new Map<string, ExistingArcherRow>();
            for (const existing of (existingArchers || []) as ExistingArcherRow[]) {
                const key = buildArcherKey(existing);
                if (!existingByKey.has(key)) {
                    existingByKey.set(key, existing);
                }
            }

            const toInsert: ArcherWritePayload[] = [];
            const toUpdate: (ArcherWritePayload & { id: string })[] = [];

            for (const archer of uniqueImportArchers) {
                const key = buildArcherKey(archer);
                const existing = existingByKey.get(key);
                if (existing) {
                    toUpdate.push({ id: existing.id, ...archer });
                } else {
                    toInsert.push(archer);
                }
            }

            if (toUpdate.length > 0) {
                const { error: updateError } = await supabase
                    .from("archers")
                    .upsert(toUpdate, { onConflict: "id" });
                if (updateError) throw updateError;
            }

            if (toInsert.length > 0) {
                const { error: insertError } = await supabase
                    .from("archers")
                    .insert(toInsert);
                if (insertError) throw insertError;
            }

            const duplicatedRowsInFile = normalizedImport.length - uniqueImportArchers.length;
            const summaryParts = [
                `${toInsert.length} nuevos`,
                `${toUpdate.length} actualizados`,
            ];
            if (duplicatedRowsInFile > 0) {
                summaryParts.push(`${duplicatedRowsInFile} duplicados internos ignorados`);
            }

            toast.success(`Importacion completada: ${summaryParts.join(", ")}`);
            setImportedArchers([]);
            onSuccess?.();
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : "Error desconocido";
            toast.error("Error al guardar arqueros", { description: errMsg });
        } finally {
            setIsSaving(false);
        }
    };

    const downloadTemplate = () => {
        const distanceExample = availableDistances.length > 0 ? availableDistances[0] : 20;
        const templateRows = [
            {
                Nombre: "Juan",
                Apellido: "Perez",
                Club: "Club A",
                Categoria: "Mayores",
                Genero: "Varones",
                Division: "Recurvo",
                Distancia: String(distanceExample),
            },
            {
                Nombre: "Maria",
                Apellido: "Garcia",
                Club: "Club B",
                Categoria: "U18",
                Genero: "Damas",
                Division: "Compuesto",
                Distancia: String(distanceExample),
            },
        ];

        const csvContent = Papa.unparse(templateRows);
        const blob = new Blob([`\uFEFF${csvContent}`], {
            type: "text/csv;charset=utf-8;",
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "plantilla_arqueros.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    const validCount = importedArchers.filter((archer) => archer.isValid).length;
    const invalidCount = importedArchers.filter((archer) => !archer.isValid).length;

    return (
        <div className="space-y-6">
            {availableDistances.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium text-slate-600">Distancias disponibles:</span>
                    {availableDistances.map((distance) => (
                        <Badge key={distance} variant="secondary" className="bg-blue-100 text-blue-700">
                            {distance}m
                        </Badge>
                    ))}
                </div>
            )}

            {allowedDivisions.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium text-slate-600">Divisiones habilitadas:</span>
                    {allowedDivisions.map((division) => (
                        <Badge key={division} variant="secondary" className="bg-slate-100 text-slate-700">
                            {DIVISION_LABELS[division]}
                        </Badge>
                    ))}
                </div>
            )}

            {allowedCategories.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap text-sm">
                    <span className="font-medium text-slate-600">Categorias habilitadas:</span>
                    {allowedCategories.map((category) => (
                        <Badge key={category} variant="secondary" className="bg-slate-100 text-slate-700">
                            {CATEGORY_LABELS[category]}
                        </Badge>
                    ))}
                </div>
            )}

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
                                <p className="mb-1 text-lg font-bold text-slate-700">Arrastra tu archivo aqui</p>
                                <p className="text-sm text-slate-500 font-medium">Soporta CSV (.csv)</p>
                            </>
                        )}
                        <Input
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="absolute inset-0 cursor-pointer opacity-0"
                            disabled={isProcessing}
                        />
                    </div>

                    <div className="flex justify-between items-center bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                        <div className="flex items-center gap-2 text-sm text-blue-800">
                            <FileSpreadsheet className="h-4 w-4" />
                            <span className="font-semibold">Necesitas ayuda?</span>
                            <span className="text-blue-600">Descarga la plantilla oficial para evitar errores.</span>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={downloadTemplate}
                            className="bg-white border-blue-200 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                        >
                            <Download className="mr-2 h-4 w-4" />
                            Plantilla CSV
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {importedArchers.length > 0 && (
                <div className="border rounded-xl overflow-hidden shadow-sm bg-white">
                    <div className="bg-slate-50 px-6 py-4 border-b flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <h4 className="font-bold text-slate-800">Validacion de Datos</h4>
                            <div className="flex gap-2 text-sm font-medium">
                                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                                    {validCount} Validos
                                </span>
                                {invalidCount > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                                        {invalidCount} Errores
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setImportedArchers([])}
                                className="text-slate-500 hover:text-slate-700"
                            >
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSave}
                                disabled={isSaving || validCount === 0}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-md shadow-blue-900/10"
                            >
                                {isSaving ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Check className="mr-2 h-4 w-4" />
                                )}
                                Importar {validCount} Arqueros
                            </Button>
                        </div>
                    </div>
                    <div className="max-h-[420px] overflow-auto">
                        <Table>
                            <TableHeader className="bg-white sticky top-0 shadow-sm z-10">
                                <TableRow>
                                    <TableHead className="w-10 text-center">#</TableHead>
                                    <TableHead className="font-bold text-slate-700">Nombre</TableHead>
                                    <TableHead className="font-bold text-slate-700">Club</TableHead>
                                    <TableHead className="font-bold text-slate-700">Categoria</TableHead>
                                    <TableHead className="font-bold text-slate-700">Division</TableHead>
                                    <TableHead className="font-bold text-slate-700">Distancia</TableHead>
                                    <TableHead className="font-bold text-slate-700">Estado</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {importedArchers.map((archer, index) => (
                                    <TableRow key={index} className={!archer.isValid ? "bg-red-50/50" : ""}>
                                        <TableCell className="text-center text-slate-400 font-mono text-xs">
                                            {index + 1}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-bold text-slate-700">
                                                {archer.last_name}, {archer.first_name}
                                            </div>
                                            <div className="text-xs text-slate-400">
                                                {GENDER_LABELS[archer.gender]}
                                            </div>
                                        </TableCell>
                                        <TableCell>{archer.club || "-"}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-slate-100">
                                                {CATEGORY_LABELS[archer.age_category]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="bg-slate-100">
                                                {DIVISION_LABELS[archer.division]}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="font-mono font-bold text-slate-600">
                                                {archer.distance}m
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            {archer.isValid ? (
                                                <div className="flex items-center text-green-600 text-sm font-bold">
                                                    <Check className="w-4 h-4 mr-1" /> Listo
                                                </div>
                                            ) : (
                                                <div className="text-red-600 text-xs font-medium">
                                                    {archer.errors.map((error, i) => (
                                                        <div key={i}>- {error}</div>
                                                    ))}
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

"use client";

import { cn } from "@/lib/utils";
import { SCORE_LABELS } from "@/lib/constants/world-archery";
import { getScoreColors } from "@/lib/utils/scoring";
import { Delete, RotateCcw } from "lucide-react";

interface ScoreKeypadProps {
    onScore: (value: number) => void;
    onBackspace: () => void;
    onClear: () => void;
    disabled?: boolean;
    disabledValues?: number[];
}

const keypadLayout = [
    [11, 10, 9], // X, 10, 9
    [8, 7, 6],
    [5, 4, 3],
    [2, 1, 0], // 2, 1, M
];

export function ScoreKeypad({
    onScore,
    onBackspace,
    onClear,
    disabled = false,
    disabledValues = [],
}: ScoreKeypadProps) {
    return (
        <div className="w-full max-w-sm mx-auto space-y-2">
            {/* Score buttons */}
            {keypadLayout.map((row, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-3 gap-2">
                    {row.map((value) => {
                        const colors = getScoreColors(value);
                        const isDisabled = disabled || disabledValues.includes(value);

                        return (
                            <button
                                key={value}
                                onClick={() => onScore(value)}
                                disabled={isDisabled}
                                className={cn(
                                    "flex items-center justify-center rounded-lg text-2xl font-bold h-16 transition-all",
                                    "active:scale-95 active:opacity-80",
                                    "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                                    colors.bg,
                                    colors.text,
                                    "border-2 border-transparent",
                                    "hover:brightness-110 focus:ring-2 focus:ring-ring focus:outline-none"
                                )}
                            >
                                {SCORE_LABELS[value]}
                            </button>
                        );
                    })}
                </div>
            ))}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                    onClick={onBackspace}
                    disabled={disabled}
                    className={cn(
                        "flex items-center justify-center gap-2 rounded-lg h-14",
                        "bg-muted text-muted-foreground",
                        "hover:bg-muted/80 active:scale-95",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                        "transition-all focus:ring-2 focus:ring-ring focus:outline-none"
                    )}
                >
                    <Delete className="h-5 w-5" />
                    <span className="text-sm font-medium">Borrar</span>
                </button>

                <button
                    onClick={onClear}
                    disabled={disabled}
                    className={cn(
                        "flex items-center justify-center gap-2 rounded-lg h-14",
                        "bg-destructive/10 text-destructive",
                        "hover:bg-destructive/20 active:scale-95",
                        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
                        "transition-all focus:ring-2 focus:ring-ring focus:outline-none"
                    )}
                >
                    <RotateCcw className="h-5 w-5" />
                    <span className="text-sm font-medium">Limpiar</span>
                </button>
            </div>
        </div>
    );
}

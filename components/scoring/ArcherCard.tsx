"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Check } from "lucide-react";
import { ArrowDisplay, EndSummary } from "./ArrowDisplay";
import { ScoreKeypad } from "./ScoreKeypad";
import { calculateTotal, countXs } from "@/lib/utils/scoring";
import { CATEGORY_LABELS } from "@/lib/constants/categories";
import type { Archer, Assignment, QualificationScore, AgeCategory } from "@/types/database";

interface ArcherCardProps {
    archer: Archer;
    assignment: Assignment;
    scores: QualificationScore[];
    currentEndScores: (number | null)[];
    arrowsPerEnd: number;
    isActive: boolean;
    onActivate: () => void;
    onScoreChange: (arrowIndex: number, score: number | null) => void;
    onConfirmEnd: () => void;
    currentArrowIndex: number;
    onArrowSelect: (index: number) => void;
}

export function ArcherCard({
    archer,
    assignment,
    scores,
    currentEndScores,
    arrowsPerEnd,
    isActive,
    onActivate,
    onScoreChange,
    onConfirmEnd,
    currentArrowIndex,
    onArrowSelect,
}: ArcherCardProps) {
    const [isExpanded, setIsExpanded] = useState(isActive);

    // Group scores by end
    const endScores = new Map<number, (number | null)[]>();
    for (const score of scores) {
        if (!endScores.has(score.end_number)) {
            endScores.set(score.end_number, Array(arrowsPerEnd).fill(null));
        }
        const endArr = endScores.get(score.end_number)!;
        endArr[score.arrow_number - 1] = score.score;
    }

    // Calculate totals
    const confirmedTotal = scores.reduce((sum, s) => {
        if (s.score === null) return sum;
        return sum + (s.score === 11 ? 10 : s.score);
    }, 0);

    const currentEndTotal = calculateTotal(currentEndScores);
    const currentEndXs = countXs(currentEndScores);

    // Check if current end is complete
    const isEndComplete = currentEndScores.every((s) => s !== null);

    const handleScore = (value: number) => {
        onScoreChange(currentArrowIndex, value);
        // Auto-advance to next arrow
        if (currentArrowIndex < arrowsPerEnd - 1) {
            onArrowSelect(currentArrowIndex + 1);
        }
    };

    const handleBackspace = () => {
        if (currentEndScores[currentArrowIndex] !== null) {
            onScoreChange(currentArrowIndex, null);
        } else if (currentArrowIndex > 0) {
            onArrowSelect(currentArrowIndex - 1);
            onScoreChange(currentArrowIndex - 1, null);
        }
    };

    const handleClear = () => {
        for (let i = 0; i < arrowsPerEnd; i++) {
            onScoreChange(i, null);
        }
        onArrowSelect(0);
    };

    return (
        <Card
            className={cn(
                "transition-all",
                isActive && "ring-2 ring-primary",
                assignment.is_finished && "opacity-60"
            )}
        >
            <CardHeader
                className="cursor-pointer p-4"
                onClick={() => {
                    if (!isActive) onActivate();
                    setIsExpanded(!isExpanded);
                }}
            >
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className={cn(
                                "flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold",
                                "bg-primary text-primary-foreground"
                            )}
                        >
                            {assignment.position}
                        </div>
                        <div>
                            <h3 className="font-semibold">
                                {archer.first_name} {archer.last_name}
                            </h3>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Badge variant="outline" className="text-xs">
                                    {CATEGORY_LABELS[archer.age_category as AgeCategory]}
                                </Badge>
                                {archer.club && <span>{archer.club}</span>}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-2xl font-bold">{confirmedTotal + currentEndTotal}</p>
                            <p className="text-xs text-muted-foreground">
                                Total
                            </p>
                        </div>
                        {isExpanded ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                    </div>
                </div>
            </CardHeader>

            {isExpanded && (
                <CardContent className="space-y-4 pt-0">
                    {/* Previous ends */}
                    {endScores.size > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-medium text-muted-foreground">
                                Rondas Anteriores
                            </p>
                            <div className="space-y-2">
                                {Array.from(endScores.entries())
                                    .sort((a, b) => b[0] - a[0])
                                    .slice(0, 3)
                                    .map(([endNumber, endArr]) => (
                                        <EndSummary
                                            key={endNumber}
                                            scores={endArr}
                                            endNumber={endNumber}
                                            isConfirmed={true}
                                        />
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* Current end */}
                    {!assignment.is_finished && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">
                                    Ronda {assignment.current_end + 1}
                                </p>
                                {currentEndXs > 0 && (
                                    <Badge className="bg-yellow-500">{currentEndXs} X</Badge>
                                )}
                            </div>

                            <ArrowDisplay
                                scores={currentEndScores}
                                currentIndex={isActive ? currentArrowIndex : undefined}
                                arrowsPerEnd={arrowsPerEnd}
                                size="lg"
                                onArrowClick={isActive ? onArrowSelect : undefined}
                            />

                            <div className="text-center text-lg font-semibold">
                                Suma: {currentEndTotal}
                            </div>

                            {isActive && (
                                <>
                                    <ScoreKeypad
                                        onScore={handleScore}
                                        onBackspace={handleBackspace}
                                        onClear={handleClear}
                                        disabled={assignment.is_finished}
                                    />

                                    <Button
                                        className="w-full"
                                        size="lg"
                                        onClick={onConfirmEnd}
                                        disabled={!isEndComplete}
                                    >
                                        <Check className="mr-2 h-5 w-5" />
                                        Confirmar Ronda
                                    </Button>
                                </>
                            )}
                        </div>
                    )}

                    {assignment.is_finished && (
                        <div className="rounded-lg bg-green-500/10 p-4 text-center">
                            <Check className="mx-auto h-8 w-8 text-green-500" />
                            <p className="mt-2 font-medium text-green-500">
                                Clasificación Completada
                            </p>
                        </div>
                    )}
                </CardContent>
            )}
        </Card>
    );
}

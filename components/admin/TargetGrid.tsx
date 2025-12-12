"use client";

import { cn } from "@/lib/utils";
import type { AssignmentStatus } from "@/types/database";

interface TargetCellProps {
    targetNumber: number;
    status: AssignmentStatus;
    distance: number;
    archerCount?: number;
    completedCount?: number;
    onClick?: () => void;
}

const statusStyles: Record<
    AssignmentStatus,
    { bg: string; border: string; text: string; indicator: string }
> = {
    inactive: {
        bg: "bg-slate-100",
        border: "border-slate-300",
        text: "text-slate-500",
        indicator: "bg-slate-400",
    },
    scoring: {
        bg: "bg-blue-50",
        border: "border-blue-400",
        text: "text-blue-700",
        indicator: "bg-blue-500",
    },
    confirmed: {
        bg: "bg-emerald-50",
        border: "border-emerald-400",
        text: "text-emerald-700",
        indicator: "bg-emerald-500",
    },
    conflict: {
        bg: "bg-red-50",
        border: "border-red-400",
        text: "text-red-700",
        indicator: "bg-red-500",
    },
};

export function TargetCell({
    targetNumber,
    status,
    distance,
    archerCount = 0,
    completedCount = 0,
    onClick,
}: TargetCellProps) {
    const styles = statusStyles[status];

    return (
        <button
            onClick={onClick}
            className={cn(
                "relative flex flex-col items-center justify-center rounded-xl border-2 p-4",
                "transition-all hover:shadow-lg active:scale-95",
                "min-h-[100px] w-full",
                styles.bg,
                styles.border,
                onClick ? "cursor-pointer" : "cursor-default"
            )}
        >
            {/* Target number */}
            <span className={cn("text-3xl font-black", styles.text)}>
                {targetNumber}
            </span>

            {/* Distance badge */}
            <span className="text-xs font-bold text-slate-500 mt-1">{distance}m</span>

            {/* Progress indicator */}
            <div className="mt-2 flex items-center gap-1.5">
                <div
                    className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        styles.indicator,
                        status === "scoring" && "animate-pulse"
                    )}
                />
                <span className="text-xs font-bold text-slate-600">
                    {completedCount}/{archerCount}
                </span>
            </div>

            {/* Status badge */}
            {status === "scoring" && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 animate-pulse">
                    <span className="text-[10px] font-bold text-white">⏱</span>
                </span>
            )}
            {status === "confirmed" && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                    <span className="text-[10px] font-bold text-white">✓</span>
                </span>
            )}
            {status === "conflict" && (
                <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 animate-pulse">
                    <span className="text-[10px] font-bold text-white">!</span>
                </span>
            )}
        </button>
    );
}

interface TargetGridProps {
    targets: Array<{
        id: string;
        target_number: number;
        current_status: AssignmentStatus;
        distance: number;
        archerCount?: number;
        completedCount?: number;
    }>;
    onTargetClick?: (targetId: string) => void;
}

export function TargetGrid({ targets, onTargetClick }: TargetGridProps) {
    // Group targets by distance
    const byDistance = new Map<number, typeof targets>();
    for (const target of targets) {
        if (!byDistance.has(target.distance)) {
            byDistance.set(target.distance, []);
        }
        byDistance.get(target.distance)!.push(target);
    }

    // Sort distances
    const sortedDistances = [...byDistance.keys()].sort((a, b) => a - b);

    return (
        <div className="space-y-6">
            {sortedDistances.map((distance) => (
                <div key={distance}>
                    <h3 className="text-lg font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-lg text-sm">
                            {distance}m
                        </span>
                        <span className="text-slate-400 font-normal text-sm">
                            {byDistance.get(distance)!.length} pacas
                        </span>
                    </h3>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
                        {byDistance.get(distance)!.map((target) => (
                            <TargetCell
                                key={target.id}
                                targetNumber={target.target_number}
                                status={target.current_status}
                                distance={target.distance}
                                archerCount={target.archerCount}
                                completedCount={target.completedCount}
                                onClick={onTargetClick ? () => onTargetClick(target.id) : undefined}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

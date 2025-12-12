// Zustand store for realtime dashboard state
import { create } from "zustand";
import type { Target, AssignmentStatus } from "@/types/database";

interface TargetWithCount extends Target {
    confirmedCount: number;
    activeCount: number;
    totalArchers: number;
}

interface RealtimeState {
    // Connected status
    isConnected: boolean;
    setIsConnected: (connected: boolean) => void;

    // Targets with realtime status
    targets: TargetWithCount[];
    setTargets: (targets: TargetWithCount[]) => void;
    updateTargetStatus: (targetId: string, status: AssignmentStatus) => void;

    // Conflicts
    conflicts: string[]; // Target IDs with conflicts
    addConflict: (targetId: string) => void;
    removeConflict: (targetId: string) => void;

    // Filters
    statusFilter: AssignmentStatus | "all";
    setStatusFilter: (filter: AssignmentStatus | "all") => void;
    distanceFilter: number | "all";
    setDistanceFilter: (filter: number | "all") => void;

    // Stats
    stats: {
        inactive: number;
        scoring: number;
        confirmed: number;
        conflict: number;
    };
    updateStats: () => void;

    // Reset
    reset: () => void;
}

const initialState = {
    isConnected: false,
    targets: [],
    conflicts: [],
    statusFilter: "all" as const,
    distanceFilter: "all" as const,
    stats: {
        inactive: 0,
        scoring: 0,
        confirmed: 0,
        conflict: 0,
    },
};

export const useRealtimeStore = create<RealtimeState>((set, get) => ({
    ...initialState,

    setIsConnected: (isConnected) => set({ isConnected }),

    setTargets: (targets) => {
        set({ targets });
        get().updateStats();
    },

    updateTargetStatus: (targetId, status) => {
        set((state) => ({
            targets: state.targets.map((t) =>
                t.id === targetId ? { ...t, current_status: status } : t
            ),
        }));
        get().updateStats();
    },

    addConflict: (targetId) =>
        set((state) => ({
            conflicts: [...new Set([...state.conflicts, targetId])],
        })),

    removeConflict: (targetId) =>
        set((state) => ({
            conflicts: state.conflicts.filter((id) => id !== targetId),
        })),

    setStatusFilter: (statusFilter) => set({ statusFilter }),

    setDistanceFilter: (distanceFilter) => set({ distanceFilter }),

    updateStats: () => {
        const targets = get().targets;
        const stats = {
            inactive: targets.filter((t) => t.current_status === "inactive").length,
            scoring: targets.filter((t) => t.current_status === "scoring").length,
            confirmed: targets.filter((t) => t.current_status === "confirmed").length,
            conflict: targets.filter((t) => t.current_status === "conflict").length,
        };
        set({ stats });
    },

    reset: () => set(initialState),
}));

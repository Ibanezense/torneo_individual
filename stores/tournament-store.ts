// Zustand store for tournament state
import { create } from "zustand";
import type { Tournament, Target, Assignment, Archer } from "@/types/database";

interface TournamentState {
    // Current tournament
    currentTournament: Tournament | null;
    setCurrentTournament: (tournament: Tournament | null) => void;

    // Targets for the current tournament
    targets: Target[];
    setTargets: (targets: Target[]) => void;
    updateTarget: (target: Target) => void;

    // Assignments
    assignments: Assignment[];
    setAssignments: (assignments: Assignment[]) => void;

    // Archers
    archers: Archer[];
    setArchers: (archers: Archer[]) => void;

    // Loading states
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;

    // Reset store
    reset: () => void;
}

const initialState = {
    currentTournament: null,
    targets: [],
    assignments: [],
    archers: [],
    isLoading: false,
};

export const useTournamentStore = create<TournamentState>((set) => ({
    ...initialState,

    setCurrentTournament: (tournament) =>
        set({ currentTournament: tournament }),

    setTargets: (targets) => set({ targets }),

    updateTarget: (updatedTarget) =>
        set((state) => ({
            targets: state.targets.map((t) =>
                t.id === updatedTarget.id ? updatedTarget : t
            ),
        })),

    setAssignments: (assignments) => set({ assignments }),

    setArchers: (archers) => set({ archers }),

    setIsLoading: (isLoading) => set({ isLoading }),

    reset: () => set(initialState),
}));

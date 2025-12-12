// Zustand store for scoring state (mobile scoring view)
import { create } from "zustand";
import type { Assignment, Archer, QualificationScore } from "@/types/database";

interface ScoringArcher {
    assignment: Assignment;
    archer: Archer;
    scores: QualificationScore[];
    currentEndScores: (number | null)[];
}

interface ScoringState {
    // Current target token
    accessToken: string | null;
    setAccessToken: (token: string | null) => void;

    // Archers on the current target
    scoringArchers: ScoringArcher[];
    setScoringArchers: (archers: ScoringArcher[]) => void;

    // Active archer (the one being scored)
    activeArcherIndex: number;
    setActiveArcherIndex: (index: number) => void;

    // Current end being scored
    currentEnd: number;
    setCurrentEnd: (end: number) => void;

    // Current arrow being scored (0-5 for 6 arrows)
    currentArrowIndex: number;
    setCurrentArrowIndex: (index: number) => void;

    // Update a score for the active archer
    setArrowScore: (arrowIndex: number, score: number | null) => void;

    // Clear current end scores for active archer
    clearCurrentEndScores: () => void;

    // Confirm end for active archer
    confirmEnd: () => void;

    // Loading and error states
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    isSaving: boolean;
    setIsSaving: (saving: boolean) => void;

    // Reset
    reset: () => void;
}

const initialState = {
    accessToken: null,
    scoringArchers: [],
    activeArcherIndex: 0,
    currentEnd: 1,
    currentArrowIndex: 0,
    isLoading: false,
    isSaving: false,
};

export const useScoringStore = create<ScoringState>((set) => ({
    ...initialState,

    setAccessToken: (accessToken) => set({ accessToken }),

    setScoringArchers: (scoringArchers) => set({ scoringArchers }),

    setActiveArcherIndex: (activeArcherIndex) => set({ activeArcherIndex }),

    setCurrentEnd: (currentEnd) => set({ currentEnd }),

    setCurrentArrowIndex: (currentArrowIndex) => set({ currentArrowIndex }),

    setArrowScore: (arrowIndex, score) =>
        set((state) => {
            const updatedArchers = [...state.scoringArchers];
            if (updatedArchers[state.activeArcherIndex]) {
                const currentEndScores = [
                    ...updatedArchers[state.activeArcherIndex].currentEndScores,
                ];
                currentEndScores[arrowIndex] = score;
                updatedArchers[state.activeArcherIndex] = {
                    ...updatedArchers[state.activeArcherIndex],
                    currentEndScores,
                };
            }
            return { scoringArchers: updatedArchers };
        }),

    clearCurrentEndScores: () =>
        set((state) => {
            const updatedArchers = [...state.scoringArchers];
            if (updatedArchers[state.activeArcherIndex]) {
                updatedArchers[state.activeArcherIndex] = {
                    ...updatedArchers[state.activeArcherIndex],
                    currentEndScores: Array(6).fill(null),
                };
            }
            return { scoringArchers: updatedArchers, currentArrowIndex: 0 };
        }),

    confirmEnd: () =>
        set((state) => ({
            currentEnd: state.currentEnd + 1,
            currentArrowIndex: 0,
        })),

    setIsLoading: (isLoading) => set({ isLoading }),

    setIsSaving: (isSaving) => set({ isSaving }),

    reset: () => set(initialState),
}));

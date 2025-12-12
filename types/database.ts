// Database types - generated from Supabase schema

// Enums
export type TournamentType = "indoor" | "outdoor";

export type AgeCategory =
    | "u10"
    | "u13"
    | "u15"
    | "u18"
    | "u21"
    | "senior"
    | "master"
    | "open";

export type Gender = "male" | "female";

export type AssignmentStatus = "inactive" | "scoring" | "confirmed" | "conflict";

export type TournamentStatus =
    | "draft"
    | "registration"
    | "qualification"
    | "elimination"
    | "completed";

export type TargetPosition = "A" | "B" | "C" | "D";

export type ShootingTurn = "AB" | "CD";

export type MatchStatus = "pending" | "in_progress" | "shootoff" | "completed";

// Table types
export interface Tournament {
    id: string;
    name: string;
    type: TournamentType;
    distances: number[];
    status: TournamentStatus;
    qualification_arrows: number;
    arrows_per_end: number;
    elimination_arrows_per_set: number;
    points_to_win_match: number;
    date: string;
    location: string | null;
    created_at: string;
    updated_at: string;
    created_by: string | null;
}

export interface Archer {
    id: string;
    first_name: string;
    last_name: string;
    club: string | null;
    age_category: AgeCategory;
    gender: Gender;
    division: string;
    distance: number;
    created_at: string;
    updated_at: string;
}

export interface Target {
    id: string;
    tournament_id: string;
    target_number: number;
    distance: number;
    current_status: AssignmentStatus;
    active_turn: ShootingTurn | null;
    created_at: string;
    updated_at: string;
}

export interface Assignment {
    id: string;
    tournament_id: string;
    archer_id: string;
    target_id: string;
    position: TargetPosition;
    turn: ShootingTurn;
    access_token: string;
    access_code: string;
    current_end: number;
    is_finished: boolean;
    created_at: string;
    updated_at: string;
}

export interface QualificationScore {
    id: string;
    assignment_id: string;
    end_number: number;
    arrow_number: number;
    score: number | null;
    recorded_at: string;
    recorded_by: string | null;
    is_edited: boolean;
    original_score: number | null;
    edited_at: string | null;
    edited_by: string | null;
    edit_reason: string | null;
}

export interface QualificationEnd {
    id: string;
    assignment_id: string;
    end_number: number;
    end_total: number;
    is_confirmed: boolean;
    confirmed_at: string | null;
}

export interface EliminationBracket {
    id: string;
    tournament_id: string;
    category: AgeCategory;
    gender: Gender;
    bracket_size: number;
    current_round: number;
    is_completed: boolean;
    created_at: string;
}

export interface EliminationMatch {
    id: string;
    bracket_id: string;
    round_number: number;
    match_position: number;
    archer1_id: string | null;
    archer2_id: string | null;
    archer1_seed: number | null;
    archer2_seed: number | null;
    archer1_set_points: number;
    archer2_set_points: number;
    status: MatchStatus;
    winner_id: string | null;
    target_id: string | null; // Target assigned for this match
    next_match_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface Set {
    id: string;
    match_id: string;
    set_number: number;
    archer1_arrows: number[];
    archer2_arrows: number[];
    archer1_set_result: number | null;
    archer2_set_result: number | null;
    is_shootoff: boolean;
    shootoff_archer1_distance: number | null;
    shootoff_archer2_distance: number | null;
    is_confirmed: boolean;
    confirmed_at: string | null;
}

// View types
export interface QualificationRanking {
    archer_id: string;
    first_name: string;
    last_name: string;
    age_category: AgeCategory;
    gender: Gender;
    club: string | null;
    tournament_id: string;
    total_score: number;
    x_count: number;
    tens_count: number;
    ranking: number;
}

// Extended types with relations
export interface AssignmentWithArcher extends Assignment {
    archer: Archer;
}

export interface AssignmentWithRelations extends Assignment {
    archer: Archer;
    target: Target;
}

export interface TargetWithAssignments extends Target {
    assignments: AssignmentWithArcher[];
}

export interface EliminationMatchWithArchers extends EliminationMatch {
    archer1: Archer | null;
    archer2: Archer | null;
    winner: Archer | null;
}

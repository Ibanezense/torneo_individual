type MatchRow = {
    id: string;
    round_number: number;
    match_position: number;
    archer1_id: string | null;
    archer2_id: string | null;
    archer1_seed: number | null;
    archer2_seed: number | null;
    archer1_set_points: number;
    archer2_set_points: number;
    status: string;
    winner_id: string | null;
    target_id: string | null;
};

type SelectResult = {
    data: unknown;
    error: { message: string } | null;
};

type UpdateResult = {
    error: { message: string } | null;
};

type SupabaseLike = {
    from: (table: string) => {
        select: (columns: string) => {
            eq: (column: string, value: string) => PromiseLike<SelectResult>;
        };
        update: (values: Record<string, string | number | null>) => {
            eq: (column: string, value: string) => PromiseLike<UpdateResult>;
        };
    };
};

const getAutoWinnerId = (match: MatchRow) => {
    if (match.archer1_id && !match.archer2_id) return match.archer1_id;
    if (match.archer2_id && !match.archer1_id) return match.archer2_id;
    return null;
};

const getAutoWinnerSeed = (match: MatchRow) => {
    if (match.archer1_id && !match.archer2_id) return match.archer1_seed;
    if (match.archer2_id && !match.archer1_id) return match.archer2_seed;
    return null;
};

export async function resolvePendingByeAdvances(
    supabase: SupabaseLike,
    bracketId: string,
    bracketSize: number
) {
    const totalRounds = Math.log2(bracketSize);
    if (!Number.isFinite(totalRounds) || totalRounds < 1) return;

    for (let pass = 0; pass < totalRounds + 2; pass++) {
        const { data, error } = await supabase
            .from("elimination_matches")
            .select("id, round_number, match_position, archer1_id, archer2_id, archer1_seed, archer2_seed, archer1_set_points, archer2_set_points, status, winner_id, target_id")
            .eq("bracket_id", bracketId);

        if (error) throw new Error(error.message);

        const matches = (data || []) as MatchRow[];
        const matchByKey = new Map(matches.map((match) => [`${match.round_number}-${match.match_position}`, match]));
        let changed = false;

        const orderedMatches = [...matches]
            .sort((a, b) => a.round_number - b.round_number || a.match_position - b.match_position);

        for (const match of orderedMatches) {
            const completedWithoutWinnerButAssigned =
                match.status === "completed" &&
                !match.winner_id &&
                Boolean(match.archer1_id || match.archer2_id);

            if (completedWithoutWinnerButAssigned) {
                const { error: reopenError } = await supabase
                    .from("elimination_matches")
                    .update({
                        status: "pending",
                        winner_id: null,
                        archer1_set_points: 0,
                        archer2_set_points: 0,
                    })
                    .eq("id", match.id);

                if (reopenError) throw new Error(reopenError.message);
                changed = true;

                if (match.round_number < totalRounds) {
                    const nextRound = match.round_number + 1;
                    const nextMatchPosition = Math.ceil(match.match_position / 2);
                    const isOddPosition = match.match_position % 2 === 1;
                    const nextMatch = matchByKey.get(`${nextRound}-${nextMatchPosition}`);

                    if (nextMatch) {
                        const updateNextData: Record<string, string | number | null> = isOddPosition
                            ? { archer1_id: null, archer1_seed: null }
                            : { archer2_id: null, archer2_seed: null };

                        updateNextData.status = "pending";
                        updateNextData.winner_id = null;
                        updateNextData.archer1_set_points = 0;
                        updateNextData.archer2_set_points = 0;

                        const { error: clearNextError } = await supabase
                            .from("elimination_matches")
                            .update(updateNextData)
                            .eq("id", nextMatch.id);

                        if (clearNextError) throw new Error(clearNextError.message);
                        changed = true;
                    }
                }
                continue;
            }

            const hasBothArchers = Boolean(match.archer1_id && match.archer2_id);
            const staleCompletedAutoMatch = hasBothArchers &&
                match.status === "completed" &&
                Boolean(match.winner_id) &&
                match.archer1_set_points === 0 &&
                match.archer2_set_points === 0;

            if (staleCompletedAutoMatch) {
                const { error: reopenError } = await supabase
                    .from("elimination_matches")
                    .update({
                        status: "pending",
                        winner_id: null,
                        archer1_set_points: 0,
                        archer2_set_points: 0,
                    })
                    .eq("id", match.id);

                if (reopenError) throw new Error(reopenError.message);
                changed = true;

                if (match.round_number < totalRounds) {
                    const nextRound = match.round_number + 1;
                    const nextMatchPosition = Math.ceil(match.match_position / 2);
                    const isOddPosition = match.match_position % 2 === 1;
                    const nextMatch = matchByKey.get(`${nextRound}-${nextMatchPosition}`);

                    if (nextMatch) {
                        const updateNextData: Record<string, string | number | null> = isOddPosition
                            ? { archer1_id: null, archer1_seed: null }
                            : { archer2_id: null, archer2_seed: null };

                        updateNextData.status = "pending";
                        updateNextData.winner_id = null;
                        updateNextData.archer1_set_points = 0;
                        updateNextData.archer2_set_points = 0;

                        const { error: clearNextError } = await supabase
                            .from("elimination_matches")
                            .update(updateNextData)
                            .eq("id", nextMatch.id);

                        if (clearNextError) throw new Error(clearNextError.message);
                        changed = true;
                    }
                }
                continue;
            }

            if (match.round_number === 0) continue;
            if (match.status === "completed" && match.winner_id) continue;

            const autoWinnerId = getAutoWinnerId(match);
            if (!autoWinnerId) continue;

            if (match.round_number > 1) {
                const feederA = matchByKey.get(`${match.round_number - 1}-${(match.match_position * 2) - 1}`);
                const feederB = matchByKey.get(`${match.round_number - 1}-${match.match_position * 2}`);
                const feedersReady = Boolean(feederA && feederB && feederA.status === "completed" && feederB.status === "completed");
                if (!feedersReady) continue;
            }

            const { error: completeError } = await supabase
                .from("elimination_matches")
                .update({
                    status: "completed",
                    winner_id: autoWinnerId,
                })
                .eq("id", match.id);

            if (completeError) throw new Error(completeError.message);
            changed = true;

            if (match.round_number >= totalRounds) continue;

            const nextRound = match.round_number + 1;
            const nextMatchPosition = Math.ceil(match.match_position / 2);
            const nextMatch = matchByKey.get(`${nextRound}-${nextMatchPosition}`);
            if (!nextMatch) continue;

            const isOddPosition = match.match_position % 2 === 1;
            const winnerSeed = getAutoWinnerSeed(match);
            const updateData: Record<string, string | number | null> = {};

            if (isOddPosition && nextMatch.archer1_id !== autoWinnerId) {
                updateData.archer1_id = autoWinnerId;
            }
            if (!isOddPosition && nextMatch.archer2_id !== autoWinnerId) {
                updateData.archer2_id = autoWinnerId;
            }
            if (isOddPosition && nextMatch.archer1_seed == null && winnerSeed != null) {
                updateData.archer1_seed = winnerSeed;
            }
            if (!isOddPosition && nextMatch.archer2_seed == null && winnerSeed != null) {
                updateData.archer2_seed = winnerSeed;
            }

            const siblingArcherId = isOddPosition ? nextMatch.archer2_id : nextMatch.archer1_id;
            if (siblingArcherId && !nextMatch.target_id && match.target_id) {
                updateData.target_id = match.target_id;
            }

            const nextArcher1Id = isOddPosition ? autoWinnerId : nextMatch.archer1_id;
            const nextArcher2Id = isOddPosition ? nextMatch.archer2_id : autoWinnerId;
            if (
                nextArcher1Id &&
                nextArcher2Id &&
                (nextMatch.status === "completed" || nextMatch.winner_id)
            ) {
                updateData.status = "pending";
                updateData.winner_id = null;
                updateData.archer1_set_points = 0;
                updateData.archer2_set_points = 0;
            }

            if (Object.keys(updateData).length > 0) {
                const { error: nextMatchError } = await supabase
                    .from("elimination_matches")
                    .update(updateData)
                    .eq("id", nextMatch.id);

                if (nextMatchError) throw new Error(nextMatchError.message);
                changed = true;
            }
        }

        const bronzeMatch = matchByKey.get("0-1");
        const semifinalRound = totalRounds - 1;
        if (bronzeMatch && semifinalRound >= 1 && (!bronzeMatch.winner_id || bronzeMatch.status !== "completed")) {
            const bronzeWinnerId = getAutoWinnerId(bronzeMatch);
            if (bronzeWinnerId) {
                const semifinalMatches = matches.filter((match) => match.round_number === semifinalRound);
                const semifinalsReady = semifinalMatches.length >= 2 && semifinalMatches.every((match) => match.status === "completed");
                const semifinalMatch1 = matchByKey.get(`${semifinalRound}-1`);
                const semifinalMatch2 = matchByKey.get(`${semifinalRound}-2`);
                const semifinal1WasBye = Boolean(semifinalMatch1 && getAutoWinnerId(semifinalMatch1));
                const semifinal2WasBye = Boolean(semifinalMatch2 && getAutoWinnerId(semifinalMatch2));
                const bronzeMissingFromByeSide =
                    (!bronzeMatch.archer1_id && semifinal1WasBye) ||
                    (!bronzeMatch.archer2_id && semifinal2WasBye);

                if (semifinalsReady && bronzeMissingFromByeSide) {
                    const { error: bronzeError } = await supabase
                        .from("elimination_matches")
                        .update({
                            status: "completed",
                            winner_id: bronzeWinnerId,
                        })
                        .eq("id", bronzeMatch.id);

                    if (bronzeError) throw new Error(bronzeError.message);
                    changed = true;
                }
            }
        }

        if (!changed) break;
    }
}

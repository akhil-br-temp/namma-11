"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LeagueOption = {
  id: string;
  name: string;
};

type Player = {
  id: string;
  name: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  creditValue: number;
  isOverseas: boolean;
  photoUrl?: string | null;
  team: {
    name: string;
    short_name: string;
  } | null;
  isPlaying: boolean;
  isImpactPlayer: boolean;
  isConcussionSubstitute: boolean;
};

type MatchData = {
  id: string;
  match_date: string;
  team_lock_time: string | null;
};

type ExistingTeam = {
  id: string;
  team_name: string | null;
  captain_player_id: string | null;
  vice_captain_player_id: string | null;
  players: Array<{ player_id: string }>;
};

type TeamBuilderProps = {
  matchId: string;
  leagueOptions: LeagueOption[];
};

type SyncResponse = {
  error?: string;
  squads?: { upsertedMatchPlayers?: number; preloadedMatchPlayers?: number };
};

const ROLE_LIMITS: Record<Player["role"], { min: number; max: number }> = {
  WK: { min: 1, max: 4 },
  BAT: { min: 1, max: 6 },
  AR: { min: 1, max: 4 },
  BOWL: { min: 1, max: 6 },
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.trim().charAt(0))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function PlayerAvatar({ name }: { name: string }) {
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-[11px] font-bold text-zinc-200">
      <span>{getInitials(name)}</span>
    </div>
  );
}

export function TeamBuilder({ matchId, leagueOptions }: TeamBuilderProps) {
  const [leagueId, setLeagueId] = useState(leagueOptions[0]?.id ?? "");
  const [players, setPlayers] = useState<Player[]>([]);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState("");
  const [viceCaptainId, setViceCaptainId] = useState("");
  const [teamName, setTeamName] = useState("My XI");
  const [activeTab, setActiveTab] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingSquad, setSyncingSquad] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isTeamLocked = useMemo(() => {
    if (!matchData?.team_lock_time) return false;
    return new Date() >= new Date(matchData.team_lock_time);
  }, [matchData?.team_lock_time]);

  useEffect(() => {
    if (!activeTab || (activeTab !== "players" && activeTab !== "cvc")) {
      setActiveTab("players");
    }
  }, [activeTab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch(`/api/match/${matchId}/players`, { cache: "no-store" });
      const payload = (await response.json()) as { error?: string; match?: MatchData; players?: Player[] };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load players");
      }

      setPlayers(payload.players ?? []);
      setMatchData(payload.match ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load players");
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const loadExistingTeam = async () => {
      if (!leagueId) {
        setSelectedIds([]);
        setCaptainId("");
        setViceCaptainId("");
        setTeamName("My XI");
        return;
      }

      setError(null);
      setMessage(null);

      try {
        const response = await fetch(`/api/teams?leagueId=${leagueId}&matchId=${matchId}`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; team?: ExistingTeam | null };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load your team");
        }

        if (!payload.team) {
          setSelectedIds([]);
          setCaptainId("");
          setViceCaptainId("");
          setTeamName("My XI");
          return;
        }

        setSelectedIds(payload.team.players?.map((entry) => entry.player_id) ?? []);
        setCaptainId(payload.team.captain_player_id ?? "");
        setViceCaptainId(payload.team.vice_captain_player_id ?? "");
        setTeamName(payload.team.team_name ?? "My XI");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load your team");
      }
    };

    void loadExistingTeam();
  }, [leagueId, matchId]);

  const playerById = useMemo(() => {
    const map = new Map<string, Player>();
    players.forEach((player) => map.set(player.id, player));
    return map;
  }, [players]);

  const selectedPlayers = useMemo(() => {
    return selectedIds
      .map((id) => playerById.get(id))
      .filter((player): player is Player => Boolean(player));
  }, [playerById, selectedIds]);

  const creditsUsed = useMemo(() => {
    return selectedPlayers.reduce((total, player) => total + player.creditValue, 0);
  }, [selectedPlayers]);

  const selectedRoleCounts = useMemo(() => {
    const counts = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
    selectedPlayers.forEach((player) => {
      counts[player.role] += 1;
    });
    return counts;
  }, [selectedPlayers]);

  const selectedCountByTeam = useCallback(
    (shortName: string) => {
      if (shortName === "UNASSIGNED") {
        return selectedPlayers.filter((player) => !player.team?.short_name).length;
      }

      return selectedPlayers.filter((player) => player.team?.short_name === shortName).length;
    },
    [selectedPlayers]
  );

  const groupedPlayers = useMemo(() => {
    const grouped = players.reduce((acc, player) => {
      const key = player.team?.short_name ?? "UNASSIGNED";
      const current = acc.get(key) ?? [];
      current.push(player);
      acc.set(key, current);
      return acc;
    }, new Map<string, Player[]>());

    return Array.from(grouped.entries())
      .map(([team, roster]) => [team, [...roster].sort((a, b) => a.name.localeCompare(b.name))] as const)
      .sort(([teamA], [teamB]) => {
        if (teamA === "UNASSIGNED") return 1;
        if (teamB === "UNASSIGNED") return -1;
        return teamA.localeCompare(teamB);
      });
  }, [players]);

  const togglePlayer = (playerId: string) => {
    if (isTeamLocked) {
      return;
    }

    setMessage(null);
    setError(null);

    setSelectedIds((current) => {
      if (current.includes(playerId)) {
        const next = current.filter((id) => id !== playerId);

        if (captainId === playerId) setCaptainId("");
        if (viceCaptainId === playerId) setViceCaptainId("");

        return next;
      }

      if (current.length >= 11) {
        setError("You can only select 11 players.");
        return current;
      }

      const picked = playerById.get(playerId);
      if (!picked) {
        return current;
      }

      const teamShortName = picked?.team?.short_name;

      if (teamShortName) {
        const fromThisTeam = current
          .map((id) => playerById.get(id))
          .filter((player): player is Player => Boolean(player))
          .filter((player) => player.team?.short_name === teamShortName).length;

        if (fromThisTeam >= 7) {
          setError(`You can select a maximum of 7 players from ${teamShortName}.`);
          return current;
        }
      }

      const currentPlayers = current
        .map((id) => playerById.get(id))
        .filter((player): player is Player => Boolean(player));

      const overseasCount = currentPlayers.filter((player) => player.isOverseas).length;
      if (picked.isOverseas && overseasCount >= 4) {
        setError("You can select a maximum of 4 overseas players.");
        return current;
      }

      const roleCount = currentPlayers.filter((player) => player.role === picked.role).length;
      if (roleCount >= ROLE_LIMITS[picked.role].max) {
        setError(`You can select a maximum of ${ROLE_LIMITS[picked.role].max} ${picked.role} players.`);
        return current;
      }

      const projectedCredits = currentPlayers.reduce((total, player) => total + player.creditValue, 0) + picked.creditValue;
      if (projectedCredits > 100) {
        setError("You cannot exceed 100 credits.");
        return current;
      }

      return [...current, playerId];
    });
  };

  const chooseCaptain = (playerId: string) => {
    if (isTeamLocked) return;
    setCaptainId(playerId);
    if (viceCaptainId === playerId) {
      setViceCaptainId("");
    }
  };

  const chooseViceCaptain = (playerId: string) => {
    if (isTeamLocked) return;
    setViceCaptainId(playerId);
    if (captainId === playerId) {
      setCaptainId("");
    }
  };

  const saveTeam = async () => {
    if (!leagueId) {
      setError("Select a league first.");
      return;
    }

    if (selectedIds.length !== 11) {
      setError("Select exactly 11 players.");
      return;
    }

    if (creditsUsed > 100) {
      setError("You cannot exceed 100 credits.");
      return;
    }

    if (selectedPlayers.filter((player) => player.isOverseas).length > 4) {
      setError("You can select a maximum of 4 overseas players.");
      return;
    }

    const roleViolations = (Object.keys(ROLE_LIMITS) as Array<Player["role"]>).find((role) => {
      const count = selectedRoleCounts[role];
      return count < ROLE_LIMITS[role].min || count > ROLE_LIMITS[role].max;
    });

    if (roleViolations) {
      const roleLimit = ROLE_LIMITS[roleViolations];
      setError(`${roleViolations} count must be between ${roleLimit.min} and ${roleLimit.max}.`);
      return;
    }

    if (!captainId || !viceCaptainId) {
      setError("Choose captain and vice-captain in the C/VC tab.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueId,
          matchId,
          teamName,
          playerIds: selectedIds,
          captainPlayerId: captainId,
          viceCaptainPlayerId: viceCaptainId,
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save team");
      }

      setMessage("Team saved successfully.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save team");
    } finally {
      setSaving(false);
    }
  };

  const syncSquadNow = async () => {
    setSyncingSquad(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json()) as SyncResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sync squad");
      }

      await loadData();
      setMessage(
        `Squad synced. Refreshed players (${payload.squads?.upsertedMatchPlayers ?? 0} squad rows, ${
          payload.squads?.preloadedMatchPlayers ?? 0
        } default preload rows).`
      );
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Unable to sync squad");
    } finally {
      setSyncingSquad(false);
    }
  };

  return (
    <section className="space-y-4">
      {!isTeamLocked ? (
        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h3 className="text-base font-bold text-zinc-50">Build Your XI</h3>
          <p className="mt-1 text-sm text-zinc-300">Select players from the two squad groups, then finalize Captain and Vice-Captain in C/VC.</p>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="block text-sm font-medium text-zinc-200">
              League
              <select
                value={leagueId}
                onChange={(event) => setLeagueId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2 text-sm"
              >
                {leagueOptions.map((league) => (
                  <option key={league.id} value={league.id}>
                    {league.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-zinc-200">
              Team name
              <input
                type="text"
                value={teamName}
                onChange={(event) => setTeamName(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-700 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-zinc-900 p-3 text-xs text-zinc-200 md:grid-cols-6">
            <div className="rounded-lg bg-zinc-950 p-2 text-center">
              <p className="font-semibold text-zinc-400">Selected</p>
              <p className="mt-1 text-sm font-bold text-zinc-50">{selectedIds.length}/11</p>
            </div>
            <div className="rounded-lg bg-zinc-950 p-2 text-center">
              <p className="font-semibold text-zinc-400">Credits</p>
              <p className="mt-1 text-sm font-bold text-zinc-50">{creditsUsed.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-zinc-950 p-2 text-center">
              <p className="font-semibold text-zinc-400">WK</p>
              <p className="mt-1 text-sm font-bold text-zinc-50">{selectedRoleCounts.WK}</p>
            </div>
            <div className="rounded-lg bg-zinc-950 p-2 text-center">
              <p className="font-semibold text-zinc-400">BAT</p>
              <p className="mt-1 text-sm font-bold text-zinc-50">{selectedRoleCounts.BAT}</p>
            </div>
            <div className="rounded-lg bg-zinc-950 p-2 text-center">
              <p className="font-semibold text-zinc-400">AR</p>
              <p className="mt-1 text-sm font-bold text-zinc-50">{selectedRoleCounts.AR}</p>
            </div>
            <div className="rounded-lg bg-zinc-950 p-2 text-center">
              <p className="font-semibold text-zinc-400">BOWL</p>
              <p className="mt-1 text-sm font-bold text-zinc-50">{selectedRoleCounts.BOWL}</p>
            </div>
          </div>

          <p className="mt-2 text-xs text-zinc-400">
            Rules: 1-4 WK, 1-6 BAT, 1-4 AR, 1-6 BOWL, max 7 from one team, max 4 overseas, 100 credits.
          </p>
        </article>
      ) : (
        <article className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <h3 className="text-base font-bold text-zinc-50">Team Locked</h3>
          <p className="mt-1 text-sm text-zinc-200">The match has started. Team edits are disabled.</p>
          <div className="mt-3 rounded-lg bg-zinc-950 p-3 text-sm text-zinc-200">
            <p>
              Captain: <strong>{players.find((p) => p.id === captainId)?.name || "-"}</strong>
            </p>
            <p>
              Vice-Captain: <strong>{players.find((p) => p.id === viceCaptainId)?.name || "-"}</strong>
            </p>
          </div>
        </article>
      )}

      <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("players")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              activeTab === "players" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            Players
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cvc")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              activeTab === "cvc" ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }`}
          >
            C/VC
          </button>
        </div>

        {loading ? <p className="mt-3 text-sm text-zinc-300">Loading players...</p> : null}

        {!loading && players.length === 0 ? (
          <div className="mt-3 space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-200">No players available yet. Sync squad/match players first.</p>
            <button
              type="button"
              onClick={syncSquadNow}
              disabled={syncingSquad}
              className="inline-flex items-center rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {syncingSquad ? "Syncing squad..." : "Sync squad now"}
            </button>
          </div>
        ) : null}

        {!loading && players.length > 0 && activeTab === "players" ? (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-zinc-300">Players are grouped by team for quicker scanning and selection.</p>

            {groupedPlayers.some(([team]) => team === "UNASSIGNED") ? (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-200">
                Some players are missing team mapping and are shown under Unassigned Team. Run Sync squad now to refresh mappings.
              </p>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2">
              {groupedPlayers.map(([teamShortName, roster]) => (
                <section key={teamShortName} className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-zinc-50">
                      {teamShortName === "UNASSIGNED" ? "Unassigned Team" : teamShortName}
                    </h4>
                    <span className="rounded-full bg-zinc-950 px-2 py-0.5 text-xs font-semibold text-zinc-300">
                      {selectedCountByTeam(teamShortName)} selected
                    </span>
                  </div>

                  <div className="mt-2 space-y-2">
                    {roster.map((player) => {
                      const checked = selectedIds.includes(player.id);

                      return (
                        <label
                          key={player.id}
                          className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm transition ${
                            checked ? "border-red-500 bg-red-500/10" : "border-zinc-800 bg-zinc-950"
                          } ${isTeamLocked ? "cursor-not-allowed opacity-75" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <PlayerAvatar name={player.name} />
                            <div>
                              <p className="font-semibold text-zinc-50">{player.name}</p>
                              <p className="text-xs text-zinc-300">
                                {player.role} • {player.creditValue.toFixed(1)} credits
                                {player.isOverseas ? " • Overseas" : ""}
                              </p>
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePlayer(player.id)}
                            disabled={isTeamLocked}
                            className="h-4 w-4 disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            {selectedIds.length === 11 ? (
              <button
                type="button"
                onClick={() => setActiveTab("cvc")}
                className="inline-flex rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Continue to C/VC
              </button>
            ) : null}
          </div>
        ) : null}

        {!loading && players.length > 0 && activeTab === "cvc" ? (
          <div className="mt-3 space-y-3">
            {selectedPlayers.length === 0 ? (
              <p className="rounded-lg bg-zinc-900 p-3 text-sm text-zinc-300">Select players in the squad lists first, then assign C and VC here.</p>
            ) : null}

            {selectedPlayers.map((player) => {
              const isCaptain = captainId === player.id;
              const isVice = viceCaptainId === player.id;

              return (
                <div key={player.id} className="flex items-center justify-between rounded-xl border border-zinc-800 p-3">
                  <div className="flex items-center gap-3">
                    <PlayerAvatar name={player.name} />
                    <div>
                      <p className="text-sm font-semibold text-zinc-50">{player.name}</p>
                      <p className="text-xs text-zinc-300">
                        {player.role} • {player.team?.short_name ?? "TBD"}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => chooseCaptain(player.id)}
                      disabled={isTeamLocked}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                        isCaptain ? "bg-red-600 text-white" : "bg-zinc-800 text-zinc-200"
                      }`}
                    >
                      C
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseViceCaptain(player.id)}
                      disabled={isTeamLocked}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-semibold ${
                        isVice ? "bg-red-500 text-white" : "bg-zinc-800 text-zinc-200"
                      }`}
                    >
                      VC
                    </button>
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={saveTeam}
              disabled={saving || loading || isTeamLocked}
              className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save team"}
            </button>
          </div>
        ) : null}

        {message ? <p className="mt-3 text-sm text-emerald-400">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-400">{error}</p> : null}
      </article>
    </section>
  );
}

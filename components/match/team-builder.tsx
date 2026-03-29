"use client";

import { useEffect, useMemo, useState } from "react";

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
  team: {
    name: string;
    short_name: string;
  } | null;
  isPlaying: boolean;
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

export function TeamBuilder({ matchId, leagueOptions }: TeamBuilderProps) {
  const [leagueId, setLeagueId] = useState(leagueOptions[0]?.id ?? "");
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [captainId, setCaptainId] = useState("");
  const [viceCaptainId, setViceCaptainId] = useState("");
  const [teamName, setTeamName] = useState("My XI");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPlayers = async () => {
      setLoading(true);
      setError(null);
      setMessage(null);

      try {
        const response = await fetch(`/api/match/${matchId}/players`, { cache: "no-store" });
        const payload = (await response.json()) as { error?: string; players?: Player[] };

        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load players");
        }

        setPlayers(payload.players ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load players");
      } finally {
        setLoading(false);
      }
    };

    void loadPlayers();
  }, [matchId]);

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

  const selectedPlayers = useMemo(
    () => players.filter((player) => selectedIds.includes(player.id)),
    [players, selectedIds]
  );

  const creditsUsed = useMemo(
    () => selectedPlayers.reduce((total, player) => total + player.creditValue, 0),
    [selectedPlayers]
  );

  const togglePlayer = (playerId: string) => {
    setMessage(null);
    setError(null);

    setSelectedIds((current) => {
      if (current.includes(playerId)) {
        const next = current.filter((id) => id !== playerId);

        if (captainId === playerId) {
          setCaptainId("");
        }
        if (viceCaptainId === playerId) {
          setViceCaptainId("");
        }

        return next;
      }

      if (current.length >= 11) {
        setError("You can only select 11 players.");
        return current;
      }

      return [...current, playerId];
    });
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

    if (!captainId || !viceCaptainId) {
      setError("Choose captain and vice-captain.");
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

  return (
    <section className="space-y-4">
      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-base font-bold text-slate-900">Build Your XI</h3>
        <p className="mt-1 text-sm text-slate-600">Pick 11 players, then assign captain (2x) and vice-captain (1.5x).</p>

        <div className="mt-4 grid gap-3">
          <label className="block text-sm font-medium text-slate-700">
            League
            <select
              value={leagueId}
              onChange={(event) => setLeagueId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              {leagueOptions.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Team name
            <input
              type="text"
              value={teamName}
              onChange={(event) => setTeamName(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="rounded-xl bg-slate-100 p-3 text-sm text-slate-700">
            Selected: <strong>{selectedIds.length}/11</strong> | Credits used: <strong>{creditsUsed.toFixed(1)}</strong>
          </div>

          <label className="block text-sm font-medium text-slate-700">
            Captain
            <select
              value={captainId}
              onChange={(event) => setCaptainId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select captain</option>
              {selectedPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Vice-captain
            <select
              value={viceCaptainId}
              onChange={(event) => setViceCaptainId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select vice-captain</option>
              {selectedPlayers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={saveTeam}
            disabled={saving || loading}
            className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save team"}
          </button>

          {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        </div>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Players</h3>
        {loading ? <p className="mt-2 text-sm text-slate-600">Loading players...</p> : null}
        {!loading && players.length === 0 ? <p className="mt-2 text-sm text-slate-600">No players available yet. Sync squad/match players first.</p> : null}

        <div className="mt-3 space-y-2">
          {players.map((player) => {
            const checked = selectedIds.includes(player.id);
            return (
              <label
                key={player.id}
                className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-sm transition ${
                  checked ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"
                }`}
              >
                <div>
                  <p className="font-semibold text-slate-900">{player.name}</p>
                  <p className="text-xs text-slate-600">
                    {player.role} • {player.team?.short_name ?? "TBD"} • {player.creditValue.toFixed(1)} credits
                    {player.isOverseas ? " • Overseas" : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {player.isPlaying ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Playing</span> : null}
                  <input type="checkbox" checked={checked} onChange={() => togglePlayer(player.id)} className="h-4 w-4" />
                </div>
              </label>
            );
          })}
        </div>
      </article>
    </section>
  );
}

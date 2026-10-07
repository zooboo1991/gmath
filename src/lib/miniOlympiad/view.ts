import {
  leftRosterEntries,
  listOlympiadRoster,
  listResults,
  testUserIds,
  type MiniOlympiad,
  type OlympiadResult,
  type OlympiadRosterEntry,
} from "./db";
import { standings, totalOf } from "./score";
import { compareMn } from "../sortMn";

/** A result as the admin table shows it: who, how much, which place. */
export type AdminResultRow = OlympiadResult & { name: string; phone: string; total: number; place: number; isTest: boolean };

export type AdminOlympiadDetail = {
  olympiad: MiniOlympiad;
  results: AdminResultRow[];
  /** Everyone a written name may point at: the programme's children, and those who left but have a result here. */
  roster: OlympiadRosterEntry[];
};

/**
 * The programme's children plus any child who left it but still has a result
 * in this olympiad — so a scan named for a child who left is never matched to
 * a namesake still on the programme.
 */
export async function olympiadPeople(olympiad: MiniOlympiad, results?: OlympiadResult[]): Promise<OlympiadRosterEntry[]> {
  const [roster, rows] = await Promise.all([listOlympiadRoster(olympiad.programId), results ?? listResults(olympiad)]);
  const on = new Set(roster.map((r) => r.userId));
  return [...roster, ...(await leftRosterEntries(rows.map((r) => r.userId).filter((id) => !on.has(id))))];
}

/**
 * Results ranked best first, each with the child's name. Places are the ones
 * the families see: a test account is placed but never counted against real
 * children.
 */
export async function adminDetail(olympiad: MiniOlympiad): Promise<AdminOlympiadDetail> {
  const results = await listResults(olympiad);
  const [roster, tests] = await Promise.all([olympiadPeople(olympiad, results), testUserIds(results.map((r) => r.userId))]);
  const byUser = new Map(roster.map((r) => [r.userId, r]));
  const placed = standings(results.map((r) => ({ userId: r.userId, total: totalOf(r.scores), isTest: tests.has(r.userId) })));
  const rows = results
    .map((r) => {
      const who = byUser.get(r.userId);
      return {
        ...r,
        name: who ? `${who.name}${who.left ? " (хөтөлбөрөөс гарсан)" : ""}` : "(устгагдсан сурагч)",
        phone: who?.phone ?? "",
        total: totalOf(r.scores),
        place: placed.get(r.userId)!.place,
        isTest: tests.has(r.userId),
      };
    })
    .sort((a, b) => a.place - b.place || Number(a.isTest) - Number(b.isTest) || compareMn(a.name, b.name));
  return { olympiad, results: rows, roster };
}

/**
 * Мини олимпиад — /api/admin/olympiads/** and the family's «Мини олимпиад» tab.
 *
 * The questions: can only full admins and teachers change results; does a
 * family see nothing until «Нийтлэх», and then only their own child — score,
 * place among how many, the teacher's comment and their own scan — never
 * another child's name, comment or the teacher-only note; are families told
 * once.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { adminClient, anonClient, signedInClient, staffClient, type TestClient } from "../../support/client";
import { cleanupTracked, testDb, track, trackStorageObject } from "../../support/db";
import {
  createTestRegistration,
  createTestUser,
  notificationsFor,
  trackNotificationsForCreatedUsers,
  type TestUser,
} from "../../support/factories";

// Our own programme: the test DB starts empty, and its roster holds only this file's children.
const PROGRAM = "program-olympiad-test";

beforeAll(async () => {
  const { error } = await testDb().from("yearly_programs").upsert({
    id: PROGRAM,
    tag: "ТЕСТ АНГИЛАЛ",
    title: "Тестийн олимпиадын хөтөлбөр",
    label: "Тестийн олимпиадын хөтөлбөр",
    topics: "Туршилт",
    price: "1,000,000₮",
    enrollment_closed: false,
  });
  if (error) throw new Error(`test programme seed failed: ${error.message}`);
});

afterAll(async () => {
  await trackNotificationsForCreatedUsers();
  await cleanupTracked();
  await testDb().from("yearly_programs").delete().eq("id", PROGRAM);
});

type Detail = {
  olympiad: { id: string; publishedAt?: string };
  results: {
    userId: string;
    name: string;
    total: number;
    place: number;
    comments: string[];
    notes: string[];
    files: { path: string; name: string }[];
    notifiedAt?: string;
    isTest: boolean;
  }[];
  roster: { userId: string; isTest?: boolean }[];
};
type Preview = {
  rows: { name: string; userId: string | null; suggestion: string | null; scores: number[]; comments: string[]; notes: string[] }[];
  hasComments: boolean;
  hasNotes: boolean;
};

// Letters only: the name matcher splits words at digits, as real names have none.
const suffix = () => Array.from({ length: 5 }, () => "абвгдежзиклмнопрстуфхцчшэюя"[Math.floor(Math.random() * 27)]).join("");
const TOLD = "Мини олимпиадын дүн гарлаа";

/** A child on the test programme with a distinctive first name. */
async function child(firstName: string): Promise<{ user: TestUser; client: TestClient; registrationId: string }> {
  const user = await createTestUser({ firstName, lastName: "Тестов" });
  const registration = await createTestRegistration({
    userId: user.id,
    programId: PROGRAM,
    programLabel: "Тестийн олимпиадын хөтөлбөр",
    price: "2,800,000₮",
    payMethod: "manual",
    status: "active",
  });
  return { user, client: await signedInClient(user.phone, user.password), registrationId: registration.id };
}

async function newOlympiad(admin: TestClient, title = `Тест олимпиад ${suffix()}`) {
  const res = await admin.post<{ olympiad: { id: string } }>("/api/admin/olympiads", {
    title,
    programId: PROGRAM,
    heldOn: "2026-10-04",
    problemCount: 3,
    maxPerProblem: 7,
  });
  expect(res.status).toBe(200);
  track("mini_olympiads", res.body.olympiad.id);
  return { id: res.body.olympiad.id, title };
}

function workbook(rows: [string, number, number, number][], comments?: [string, number, string][]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Сурагч", "1", "2", "3"], ...rows]), "Дүн");
  if (!comments) return new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "dun.xlsx");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Сурагч", "Бодлого", "Тайлбар"], ...comments]),
    "Тайлбар"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Сурагч", "Бодлого", "Тэмдэглэл"], [rows[0][0], 1, "БАГШИЙН-НУУЦ-ТЭМДЭГЛЭЛ"]]),
    "Багшид"
  );
  return new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "dun.xlsx");
}

async function importPreview(admin: TestClient, olympiadId: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return admin.postForm<Preview>(`/api/admin/olympiads/${olympiadId}/import`, form);
}

/** What a family's tab says about their place. React may split "2" and "-р байр" with a comment node. */
const placeText = (n: number) => new RegExp(`${n}(<!-- -->)?-р байр`);
const fieldText = (n: number) => new RegExp(`${n}(<!-- -->)?\\s*хүүхдээс`);

describe("who may change results", () => {
  it("the read-only admin may look but not create", async () => {
    const viewer = await adminClient("viewer");
    expect((await viewer.get("/api/admin/olympiads")).status).toBe(200);
    expect((await viewer.post("/api/admin/olympiads", { title: "x", programId: PROGRAM, problemCount: 3 })).status).toBe(401);
    expect((await anonClient().get("/api/admin/olympiads")).status).toBe(401);
  });

  it("needs a date, so the list stays newest first", async () => {
    const admin = await adminClient("full");
    const res = await admin.post("/api/admin/olympiads", { title: "Огноогүй", programId: PROGRAM, problemCount: 3 });
    expect(res.status).toBe(400);
  });

  it("a teacher can create and enter results", async () => {
    const owner = await adminClient("full");
    const { client: teacher, id: staffId } = await staffClient(owner, {
      name: "Олимп Багш",
      username: `olymp${Math.random().toString(36).slice(2, 7)}`,
      password: "nuuts-ug-123",
      role: "teacher",
    });
    track("admin_users", staffId);
    const kid = await child(`Багштест${suffix()}`);
    const o = await newOlympiad(teacher);
    const res = await teacher.put<Detail>(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, {
      scores: [7, 2, null],
      comments: ["Зөв", "", ""],
      notes: ["", "", ""],
    });
    expect(res.status).toBe(200);
    expect(res.body.results[0]).toMatchObject({ userId: kid.user.id, total: 9, place: 1 });
  });

  it("refuses points above the maximum and children not on the programme", async () => {
    const admin = await adminClient("full");
    const o = await newOlympiad(admin);
    const kid = await child(`Хэтэрсэн${suffix()}`);
    expect((await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [8, 0, 0] })).status).toBe(400);
    const outsider = await createTestUser();
    expect((await admin.put(`/api/admin/olympiads/${o.id}/results/${outsider.id}`, { scores: [1, 1, 1] })).status).toBe(400);
  });
});

describe("import, publish and what a family sees", () => {
  it("imports, ranks with ties, and shows each family only their own child", async () => {
    const admin = await adminClient("full");
    const a = await child(`Анхтэст${suffix()}`);
    const b = await child(`Батест${suffix()}`);
    const c = await child(`Цэцтэст${suffix()}`);
    const o = await newOlympiad(admin);

    const preview = await importPreview(
      admin,
      o.id,
      workbook(
        [
          [`Тестов ${a.user.firstName}`, 7, 7, 3],
          [`${b.user.firstName}`, 5, 2, 0],
          [`Тестов ${c.user.firstName}`, 7, 0, 0],
        ],
        [
          [`Тестов ${a.user.firstName}`, 1, "АНХНЫ-ТАЙЛБАР"],
          [`${b.user.firstName}`, 2, "БАТЫН-ТАЙЛБАР"],
        ]
      )
    );
    expect(preview.status).toBe(200);
    // Surname and first name agree: picked. First name alone: only suggested, for the admin to confirm.
    expect(preview.body.rows.map((r) => r.userId)).toEqual([a.user.id, null, c.user.id]);
    expect(preview.body.rows[1].suggestion).toBe(b.user.id);

    const saved = await admin.post<Detail>(`/api/admin/olympiads/${o.id}/results`, {
      rows: preview.body.rows.map((r) => ({ userId: r.userId ?? r.suggestion, scores: r.scores, comments: r.comments, notes: r.notes })),
    });
    expect(saved.status).toBe(200);
    expect(saved.body.results.map((r) => [r.userId, r.total, r.place])).toEqual([
      [a.user.id, 17, 1],
      [b.user.id, 7, 2],
      [c.user.id, 7, 2],
    ]);

    // Not published: nothing on the family's tab.
    const before = await a.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(before.status).toBe(200);
    expect(before.text).not.toContain(o.title);

    const published = await admin.post<{ notified: number }>(`/api/admin/olympiads/${o.id}/publish`, { publish: true });
    expect(published.body.notified).toBe(3);

    const page = await b.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(page.text).toContain(o.title);
    expect(page.text).toMatch(placeText(2));
    expect(page.text).toMatch(fieldText(3));
    expect(page.text).toContain("БАТЫН-ТАЙЛБАР");
    // Nothing of the others, and never the teacher's note.
    expect(page.text).not.toContain(a.user.firstName);
    expect(page.text).not.toContain(c.user.firstName);
    expect(page.text).not.toContain("АНХНЫ-ТАЙЛБАР");
    expect(page.text).not.toContain("БАГШИЙН-НУУЦ-ТЭМДЭГЛЭЛ");
    const own = await a.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(own.text).toMatch(placeText(1));
    expect(own.text).not.toContain("БАГШИЙН-НУУЦ-ТЭМДЭГЛЭЛ");

    // Told once, even if hidden and published again.
    expect((await notificationsFor(b.user.id)).filter((n) => n.title === TOLD)).toHaveLength(1);
    await admin.post(`/api/admin/olympiads/${o.id}/publish`, { publish: false });
    const hidden = await b.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(hidden.text).not.toContain(o.title);
    const again = await admin.post<{ notified: number }>(`/api/admin/olympiads/${o.id}/publish`, { publish: true });
    expect(again.body.notified).toBe(0);
    expect((await notificationsFor(b.user.id)).filter((n) => n.title === TOLD)).toHaveLength(1);

    // A child added after publishing sees the result at once, so their family is told then.
    const late = await child(`Хоцорсон${suffix()}`);
    const added = await admin.put<{ notified: number }>(`/api/admin/olympiads/${o.id}/results/${late.user.id}`, { scores: [1, 0, 0] });
    expect(added.body.notified).toBe(1);
    expect((await notificationsFor(late.user.id)).filter((n) => n.title === TOLD)).toHaveLength(1);
    expect((await notificationsFor(b.user.id)).filter((n) => n.title === TOLD)).toHaveLength(1);
  });

  it("re-importing scores alone keeps the saved texts; a comments sheet replaces them", async () => {
    const admin = await adminClient("full");
    const kid = await child(`Дахинтест${suffix()}`);
    const o = await newOlympiad(admin);
    const name = `Тестов ${kid.user.firstName}`;
    const first = await importPreview(admin, o.id, workbook([[name, 1, 1, 1]], [[name, 1, "ЭХНИЙ-ТАЙЛБАР"]]));
    await admin.post(`/api/admin/olympiads/${o.id}/results`, {
      rows: [{ userId: first.body.rows[0].userId, scores: first.body.rows[0].scores, comments: first.body.rows[0].comments, notes: first.body.rows[0].notes }],
    });
    // Typed in by hand afterwards.
    await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, {
      scores: [1, 1, 1],
      comments: ["ЭХНИЙ-ТАЙЛБАР", "ГАРААР-БИЧСЭН", ""],
      notes: ["", "", "ГАРААР-ТЭМДЭГЛЭЛ"],
    });

    // A workbook with only the score sheet: the panel sends no texts.
    const scoresOnly = await importPreview(admin, o.id, workbook([[name, 7, 2, 0]]));
    expect(scoresOnly.body).toMatchObject({ hasComments: false, hasNotes: false });
    const saved = await admin.post<Detail>(`/api/admin/olympiads/${o.id}/results`, {
      rows: [{ userId: kid.user.id, scores: scoresOnly.body.rows[0].scores }],
    });
    expect(saved.body.results[0]).toMatchObject({
      total: 9,
      comments: ["ЭХНИЙ-ТАЙЛБАР", "ГАРААР-БИЧСЭН", ""],
      notes: ["", "", "ГАРААР-ТЭМДЭГЛЭЛ"],
    });

    // A workbook with the sheets is the whole truth for the rows it covers — nothing
    // saved earlier (say, on this child by a wrong match) survives it.
    const withComment = await importPreview(admin, o.id, workbook([[name, 7, 2, 0]], [[name, 3, "ШИНЭ-ТАЙЛБАР"]]));
    const replaced = await admin.post<Detail>(`/api/admin/olympiads/${o.id}/results`, {
      rows: [{ userId: kid.user.id, scores: withComment.body.rows[0].scores, comments: withComment.body.rows[0].comments, notes: withComment.body.rows[0].notes }],
    });
    expect(replaced.body.results[0].comments).toEqual(["", "", "ШИНЭ-ТАЙЛБАР"]);
    expect(replaced.body.results[0].notes).toEqual(["БАГШИЙН-НУУЦ-ТЭМДЭГЛЭЛ", "", ""]);

    // The editor saving scores only leaves the texts alone.
    const scoresOnlyEdit = await admin.put<Detail>(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [7, 3, 0] });
    expect(scoresOnlyEdit.body.results[0]).toMatchObject({ total: 10, comments: ["", "", "ШИНЭ-ТАЙЛБАР"] });
  });

  it("refuses an editor's save when the result changed since it was opened", async () => {
    const admin = await adminClient("full");
    const kid = await child(`Зөрчил${suffix()}`);
    const o = await newOlympiad(admin);
    const first = await admin.put<Detail>(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, {
      scores: [1, 1, 1], comments: ["", "", ""], notes: ["", "", ""], opened: null,
    });
    expect(first.status).toBe(200);
    const opened = { scores: [1, 1, 1], comments: ["", "", ""], notes: ["", "", ""] };
    // Someone else (an import) changes it…
    await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [7, 7, 7] });
    // …so the stale editor is refused instead of reverting it.
    const stale = await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [2, 2, 2], comments: ["", "", ""], notes: ["", "", ""], opened });
    expect(stale.status).toBe(409);
    // A "new child" editor for a child who already has a result is refused too.
    expect((await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [0, 0, 0], opened: null })).status).toBe(409);
    // An editor opened on the current values saves.
    const fresh = await admin.put<Detail>(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, {
      scores: [6, 6, 6], comments: ["", "", ""], notes: ["", "", ""], opened: { scores: [7, 7, 7], comments: ["", "", ""], notes: ["", "", ""] },
    });
    expect(fresh.status).toBe(200);
    expect(fresh.body.results[0].total).toBe(18);
  });

  it("does not notify a child who left the programme, whose course page they can no longer open", async () => {
    const admin = await adminClient("full");
    const stays = await child(`Үлдсэн${suffix()}`);
    const left = await child(`Гарсан${suffix()}`);
    const o = await newOlympiad(admin);
    await admin.put(`/api/admin/olympiads/${o.id}/results/${stays.user.id}`, { scores: [1, 1, 1] });
    await admin.put(`/api/admin/olympiads/${o.id}/results/${left.user.id}`, { scores: [2, 2, 2] });
    await testDb().from("registrations").update({ status: "pending" }).eq("id", left.registrationId);
    const published = await admin.post<{ notified: number }>(`/api/admin/olympiads/${o.id}/publish`, { publish: true });
    expect(published.body.notified).toBe(1);
    expect((await notificationsFor(left.user.id)).filter((n) => n.title === TOLD)).toHaveLength(0);
    // Still listed for the admin, named and marked.
    const detail = await admin.get<Detail>(`/api/admin/olympiads/${o.id}`);
    expect(detail.body.results.find((r) => r.userId === left.user.id)?.name).toContain("хөтөлбөрөөс гарсан");
  });

  it("refuses an impossible date", async () => {
    const admin = await adminClient("full");
    const res = await admin.post("/api/admin/olympiads", { title: "Буруу огноо", programId: PROGRAM, heldOn: "2026-02-31", problemCount: 3 });
    expect(res.status).toBe(400);
  });

  it("refuses a workbook with more problems than the olympiad, or a name twice", async () => {
    const admin = await adminClient("full");
    const o = await newOlympiad(admin);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Сурагч", "1", "2", "3", "4"], ["Бат Ану", 1, 1, 1, 7]]), "Дүн");
    const extra = await importPreview(admin, o.id, new File([XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer], "x.xlsx"));
    expect(extra.status).toBe(400);
    const twice = await importPreview(admin, o.id, workbook([["Tuguldur", 7, 0, 0], ["Tuguldur", 0, 5, 0]]));
    expect(twice.status).toBe(400);
  });

  it("lists the owner's test account but never counts it in real children's places", async () => {
    const admin = await adminClient("full");
    const real = await child(`Жинхэнэ${suffix()}`);
    const tester = await child(`Туршигч${suffix()}`);
    await testDb().from("users").update({ is_test: true }).eq("id", tester.user.id);
    const o = await newOlympiad(admin);
    await admin.put(`/api/admin/olympiads/${o.id}/results/${real.user.id}`, { scores: [1, 0, 0] });
    const detail = await admin.put<Detail>(`/api/admin/olympiads/${o.id}/results/${tester.user.id}`, { scores: [7, 7, 7] });
    expect(detail.status).toBe(200);
    expect(detail.body.roster.find((r) => r.userId === tester.user.id)?.isTest).toBe(true);
    expect(detail.body.results.find((r) => r.userId === real.user.id)?.place).toBe(1);
    expect(detail.body.results.find((r) => r.userId === tester.user.id)).toMatchObject({ place: 1, isTest: true });

    await admin.post(`/api/admin/olympiads/${o.id}/publish`, { publish: true });
    const realPage = await real.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(realPage.text).toMatch(placeText(1));
    expect(realPage.text).toMatch(fieldText(1));
    const testPage = await tester.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(testPage.text).toMatch(fieldText(2));
  });

  it("serves a child's scan only to that family, and only once published", async () => {
    const admin = await adminClient("full");
    const a = await child(`Скантест${suffix()}`);
    const b = await child(`Бусадтест${suffix()}`);
    const o = await newOlympiad(admin);
    await admin.put(`/api/admin/olympiads/${o.id}/results/${a.user.id}`, { scores: [1, 1, 1] });
    await admin.put(`/api/admin/olympiads/${o.id}/results/${b.user.id}`, { scores: [2, 2, 2] });

    const url = await admin.post<{ path: string; signedUrl: string; contentType: string }>(
      `/api/admin/olympiads/${o.id}/results/${a.user.id}/files`,
      { ext: "pdf", size: 9 }
    );
    expect(url.status).toBe(200);
    trackStorageObject("mini-olympiad", url.body.path);
    const put = await fetch(url.body.signedUrl, { method: "PUT", headers: { "Content-Type": url.body.contentType }, body: "%PDF-1.4\n" });
    expect(put.ok).toBe(true);
    // A path the server did not hand out for this olympiad is refused.
    expect(
      (await admin.put(`/api/admin/olympiads/${o.id}/results/${a.user.id}/files`, { path: "olympiads/other/x.pdf", name: "x" })).status
    ).toBe(400);
    const reg = await admin.put<Detail>(`/api/admin/olympiads/${o.id}/results/${a.user.id}/files`, {
      path: url.body.path,
      name: "bodolt.pdf",
      size: 9,
    });
    expect(reg.status).toBe(200);

    const { data } = await testDb().from("mini_olympiad_results").select("id").eq("olympiad_id", o.id).eq("user_id", a.user.id).single();
    const resultId = (data as { id: string }).id;
    const path = `/api/profile/olympiads/${resultId}/files/0`;

    expect((await a.client.get(path)).status).toBe(404); // not published yet
    await admin.post(`/api/admin/olympiads/${o.id}/publish`, { publish: true });
    expect([302, 307]).toContain((await a.client.get(path)).status);
    // The family gets the scan, never the name it was uploaded under (it may be another child's).
    const page = await a.client.get(`/profile/course/${PROGRAM}?tab=olympiad`);
    expect(page.text).toContain(`/api/profile/olympiads/${resultId}/files/0`);
    expect(page.text).not.toContain("bodolt.pdf");
    expect((await b.client.get(path)).status).toBe(404);
    expect((await anonClient().get(path)).status).toBe(404);
  });

  it("removes a scan by its path, so a stale screen can never delete another file", async () => {
    const admin = await adminClient("full");
    const kid = await child(`Файлтест${suffix()}`);
    const o = await newOlympiad(admin);
    await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [1, 1, 1] });
    const base = `/api/admin/olympiads/${o.id}/results/${kid.user.id}/files`;
    const paths: string[] = [];
    for (const name of ["neg.pdf", "hoyor.pdf"]) {
      const url = await admin.post<{ path: string; signedUrl: string; contentType: string }>(base, { ext: "pdf", size: 9 });
      trackStorageObject("mini-olympiad", url.body.path);
      await fetch(url.body.signedUrl, { method: "PUT", headers: { "Content-Type": url.body.contentType }, body: "%PDF-1.4\n" });
      expect((await admin.put(base, { path: url.body.path, name, size: 9 })).status).toBe(200);
      paths.push(url.body.path);
    }
    const removed = await admin.del<Detail>(`${base}?path=${encodeURIComponent(paths[0])}`);
    expect(removed.status).toBe(200);
    expect(removed.body.results.find((r) => r.userId === kid.user.id)?.files.map((f) => f.name)).toEqual(["hoyor.pdf"]);
    // A scan already on one child cannot be put on another.
    const other = await child(`Бусадфайл${suffix()}`);
    await admin.put(`/api/admin/olympiads/${o.id}/results/${other.user.id}`, { scores: [0, 0, 0] });
    const stolen = await admin.put(`/api/admin/olympiads/${o.id}/results/${other.user.id}/files`, { path: paths[1], name: "x", size: 9 });
    expect(stolen.status).toBe(400);
    // The same click from a tab that still shows the first file: nothing else goes.
    expect((await admin.del(`${base}?path=${encodeURIComponent(paths[0])}`)).status).toBe(404);
    expect((await admin.del(`${base}?index=0`)).status).toBe(404);
    const { data } = await testDb().from("mini_olympiad_results").select("files").eq("olympiad_id", o.id).eq("user_id", kid.user.id).single();
    expect((data as { files: { name: string }[] }).files.map((f) => f.name)).toEqual(["hoyor.pdf"]);
  });

  it("deletes an olympiad with its results", async () => {
    const admin = await adminClient("full");
    const kid = await child(`Устгах${suffix()}`);
    const o = await newOlympiad(admin);
    await admin.put(`/api/admin/olympiads/${o.id}/results/${kid.user.id}`, { scores: [0, 0, 0] });
    expect((await admin.del(`/api/admin/olympiads/${o.id}`)).status).toBe(200);
    const { data } = await testDb().from("mini_olympiad_results").select("id").eq("olympiad_id", o.id);
    expect(data).toEqual([]);
  });
});

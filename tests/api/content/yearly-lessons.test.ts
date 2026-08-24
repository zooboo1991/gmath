/**
 * PUT /api/admin/yearly/[id] — adding lessons to a yearly programme.
 *
 * Written to answer one report: "1 жилийн хөтөлбөр дээр хичээл нэмж
 * болдоггүй". The same editor works on courses, so the question is whether
 * the yearly route saves what the form sends it.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";

const PROGRAM_ID = "program-c";
let original: Record<string, unknown> | null = null;

beforeAll(async () => {
  const { data } = await testDb().from("yearly_programs").select("*").eq("id", PROGRAM_ID).maybeSingle();
  original = data as Record<string, unknown> | null;
  if (!original) {
    const seed = await testDb()
      .from("yearly_programs")
      .insert({
        id: PROGRAM_ID,
        tag: "C АНГИЛАЛ",
        title: "1 жилийн хөтөлбөр",
        label: "1 жилийн хөтөлбөр (C ангилал)",
        topics: "сэдэв",
        price: "2,800,000₮",
        period: "/ жил",
        lessons: [],
      })
      .select("*")
      .single();
    if (seed.error) throw new Error(seed.error.message);
    original = null;
  }
});

afterAll(async () => {
  // Put the row back exactly as it was — this is a seeded row shared by every
  // other test that reads yearly programmes.
  if (original) {
    await testDb().from("yearly_programs").update(original).eq("id", PROGRAM_ID);
  } else {
    await testDb().from("yearly_programs").delete().eq("id", PROGRAM_ID);
  }
  await cleanupTracked();
});

/** The body the admin form actually sends. */
function formBody(lessons: unknown[]) {
  return {
    tag: "C АНГИЛАЛ",
    title: "1 жилийн хөтөлбөр",
    label: "1 жилийн хөтөлбөр (C ангилал)",
    topics: "сэдэв",
    price: "2,800,000₮",
    period: "/ жил",
    facebookGroup: "",
    zoomLink: "",
    zoomMeetingId: "",
    zoomPasscode: "",
    introVideoUrl: "",
    showOnHomepage: false,
    articleIds: [],
    lessons,
  };
}

async function storedLessons() {
  const { data } = await testDb().from("yearly_programs").select("lessons").eq("id", PROGRAM_ID).single();
  return (data as { lessons: { topic: string; schedule?: string }[] }).lessons ?? [];
}

describe("adding lessons to a yearly programme", () => {
  it("saves them", async () => {
    const admin = await adminClient("full");

    const res = await admin.put(
      `/api/admin/yearly/${PROGRAM_ID}`,
      formBody([
        { topic: "Хичээл №1", schedule: "2026.08.24 Даваа гараг · 19:00–21:00", mode: "online" },
        { topic: "Хичээл №2", schedule: "2026.08.26 Лхагва гараг · 19:00–21:00", mode: "online" },
      ])
    );

    expect(res.status, res.text).toBe(200);
    const lessons = await storedLessons();
    expect(lessons).toHaveLength(2);
    expect(lessons[0].topic).toBe("Хичээл №1");
    expect(lessons[1].schedule).toBe("2026.08.26 Лхагва гараг · 19:00–21:00");
  });

  it("keeps them when a later save does not mention lessons", async () => {
    const admin = await adminClient("full");
    await admin.put(
      `/api/admin/yearly/${PROGRAM_ID}`,
      formBody([{ topic: "Ганц хичээл", schedule: "2026.09.01 Мягмар гараг · 19:00–21:00", mode: "online" }])
    );

    const { lessons: _dropped, ...withoutLessons } = formBody([]);
    const res = await admin.put(`/api/admin/yearly/${PROGRAM_ID}`, withoutLessons);

    expect(res.status).toBe(200);
    expect(await storedLessons()).toHaveLength(1);
  });

  it("drops a row with no topic rather than saving a blank lesson", async () => {
    const admin = await adminClient("full");

    await admin.put(
      `/api/admin/yearly/${PROGRAM_ID}`,
      formBody([
        { topic: "Бодит хичээл", schedule: "2026.09.02 Лхагва гараг · 19:00–21:00", mode: "online" },
        { topic: "   ", schedule: "2026.09.03 Пүрэв гараг · 19:00–21:00", mode: "online" },
      ])
    );

    const lessons = await storedLessons();
    expect(lessons).toHaveLength(1);
    expect(lessons[0].topic).toBe("Бодит хичээл");
  });
});

/**
 * /profile/course/[id] — сурагчийн нэг сургалтын дэлгэрэнгүй хуудас.
 *
 * Энэ хуудас нь ирц, шалгалт, хуваарийг нэг дор харуулдаг тул хоёр зүйлийг
 * батлах ёстой: (1) зөвхөн тухайн сургалтад төлбөрөө төлсөн сурагч л нээж
 * чадна, (2) ирцийн дүгнэлт нь Zoom-д суусан хугацаанд тохирч байна.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb, track } from "../../support/db";
import { createTestCourse, createTestRegistration, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

/** Өнгөрсөн, Монголын цагаар 18:00–20:00 (UTC 10:00–12:00) хичээл. */
const PAST_DATE = "2026.08.10";
const PAST_LESSON_UTC_START = "2026-08-10T10:00:00Z";

function lesson(topic: string, extra: Record<string, unknown> = {}) {
  return { topic, schedule: `${PAST_DATE} Даваа гараг · 18:00–20:00`, mode: "online", ...extra };
}

async function meetingFor(courseId: string, lessonIndex: number) {
  const { data, error } = await testDb()
    .from("lesson_meetings")
    .insert({
      course_id: courseId,
      lesson_index: lessonIndex,
      zoom_meeting_id: `9${Math.floor(Math.random() * 1_000_000_000)}`,
      join_url: "https://zoom.us/j/1",
    })
    .select("id")
    .single();
  if (error) throw new Error(`lesson_meetings insert failed: ${error.message}`);
  const id = (data as { id: string }).id;
  track("lesson_meetings", id);
  return id;
}

async function attend(meetingId: string, userId: string, joinedAt: string, leftAt: string) {
  const { data, error } = await testDb()
    .from("lesson_attendance")
    .insert({ lesson_meeting_id: meetingId, user_id: userId, joined_at: joinedAt, left_at: leftAt })
    .select("id")
    .single();
  if (error) throw new Error(`lesson_attendance insert failed: ${error.message}`);
  track("lesson_attendance", (data as { id: string }).id);
}

/** Хоёр хичээлтэй сургалт, идэвхтэй бүртгэлтэй сурагч. */
async function enrolledStudent(lessons = [lesson("Тоон онол"), lesson("Геометр")]) {
  const course = await createTestCourse({ lessons });
  const student = await createTestUser();
  await createTestRegistration({
    userId: student.id,
    programId: course.id,
    programLabel: course.title,
    status: "active",
  });
  return { course, student };
}

describe("GET /profile/course/[id] — хандах эрх", () => {
  it("нэвтрээгүй зочныг профайл руу буцаана", async () => {
    const { course } = await enrolledStudent();
    const res = await anonClient().get(`/profile/course/${course.id}`);

    // Сургалтын мэдээлэл алдагдаагүй нь гол. Хаашаа явуулж байгааг
    // production дээр Location толгойгоос, dev серверт Next-ийн
    // NEXT_REDIRECT дохиоос уншина — хоёул /profile руу заана.
    expect(res.text).not.toContain("Тоон онол");
    expect(res.headers.get("location") ?? res.text).toContain("/profile");
  });

  it("өөр сургалтын сурагчид 404 өгнө", async () => {
    const { course } = await enrolledStudent();
    const outsider = await createTestUser();
    const client = await signedInClient(outsider.phone, outsider.password);

    const res = await client.get(`/profile/course/${course.id}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("Тоон онол");
  });

  it("төлбөр нь баталгаажаагүй сурагчид 404 өгнө", async () => {
    const course = await createTestCourse({ lessons: [lesson("Тоон онол")] });
    const student = await createTestUser();
    await createTestRegistration({ userId: student.id, programId: course.id, status: "pending" });
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}`);
    expect(res.status).toBe(404);
    expect(res.text).not.toContain("Тоон онол");
  });
});

describe("GET /profile/course/[id] — ирц", () => {
  it("хичээлийн талаас илүүг сууссан сурагчийг ирсэн гэж харуулна", async () => {
    const { course, student } = await enrolledStudent([lesson("Тоон онол")]);
    const meeting = await meetingFor(course.id, 0);
    // 10:00–11:30 UTC = хоёр цагийн хичээлийн 75%.
    await attend(meeting, student.id, PAST_LESSON_UTC_START, "2026-08-10T11:30:00Z");
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}?tab=attendance`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Ирсэн");
    expect(res.text).toContain("75%");
    expect(res.text).toContain("90 минут суусан");
  });

  it("талаас бага сууссан сурагчийг дутуу суусан гэж харуулна", async () => {
    const { course, student } = await enrolledStudent([lesson("Тоон онол")]);
    const meeting = await meetingFor(course.id, 0);
    await attend(meeting, student.id, PAST_LESSON_UTC_START, "2026-08-10T10:30:00Z");
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}?tab=attendance`);

    expect(res.text).toContain("Дутуу суусан");
    expect(res.text).toContain("25%");
  });

  it("Zoom-оор хянагдаагүй хичээлийг тасалсан гэж буруутгахгүй", async () => {
    // Хичээл дээр lesson_meetings мөр байхгүй — ирцийг мэдэх аргагүй.
    const { course, student } = await enrolledStudent([lesson("Тоон онол")]);
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}?tab=attendance`);

    expect(res.text).toContain("Бүртгэгдээгүй");
    expect(res.text).not.toContain("Тасалсан");
  });

  it("танхимын хичээлд багшийн бүртгэлийг харуулна", async () => {
    const { course, student } = await enrolledStudent([lesson("Геометр", { mode: "inperson" })]);
    const { data, error } = await testDb()
      .from("lesson_roll_call")
      .insert({ course_id: course.id, lesson_index: 0, user_id: student.id, present: false })
      .select("id")
      .single();
    if (error) throw new Error(`lesson_roll_call insert failed: ${error.message}`);
    track("lesson_roll_call", (data as { id: string }).id);
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}?tab=attendance`);

    expect(res.text).toContain("Тасалсан");
  });

  it("бичлэгээр нөхөж үзсэнийг ирцийн хажууд тэмдэглэнэ", async () => {
    const { course, student } = await enrolledStudent([lesson("Тоон онол")]);
    await meetingFor(course.id, 0); // хянагдсан ч ороогүй → тасалсан
    const { data, error } = await testDb()
      .from("lesson_recording_views")
      .insert({ course_id: course.id, lesson_index: 0, user_id: student.id })
      .select("id")
      .single();
    if (error) throw new Error(`lesson_recording_views insert failed: ${error.message}`);
    track("lesson_recording_views", (data as { id: string }).id);
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}?tab=attendance`);

    expect(res.text).toContain("Тасалсан");
    expect(res.text).toContain("Бичлэг үзсэн");
  });
});

describe("GET /profile/course/[id] — табууд", () => {
  it("бүх таб гарчигтайгаа гарч, хаягаар нь нээгдэнэ", async () => {
    const { course, student } = await enrolledStudent([lesson("Тоон онол")]);
    const client = await signedInClient(student.phone, student.password);

    const res = await client.get(`/profile/course/${course.id}`);

    for (const label of ["Хичээлийн хуваарь", "Ирц", "Түвшин тогтоох", "Мини олимпиад", "Гэрээ"]) {
      expect(res.text).toContain(label);
    }
    // Анхны таб бол хуваарь.
    expect(res.text).toContain("Тоон онол");

    const contract = await client.get(`/profile/course/${course.id}?tab=contract`);
    expect(contract.text).toContain("Гэрээ тун удахгүй");
  });
});

/**
 * Certificates — /api/certificates/[id]/download and the public /certificate
 * lookup page.
 *
 * Two different rules meet here. The PDF is private: it is matched to the
 * signed-in account's own phone number, so an id belonging to someone else
 * must not download. The lookup page is deliberately public — an employer
 * checking a teacher's certificate has no account — so the thing to test
 * there is that it verifies without handing over the holder's contact
 * details.
 */

import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked } from "../../support/db";
import { createTestCertificate, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

describe("GET /api/certificates/[id]/download", () => {
  it("refuses a signed-out visitor", async () => {
    const owner = await createTestUser();
    const certificate = await createTestCertificate({ phone: owner.phone });

    const res = await anonClient().get(`/api/certificates/${certificate.id}/download`);
    expect(res.status).toBe(401);
  });

  it("downloads the signed-in holder's own certificate", async () => {
    const owner = await createTestUser();
    const certificate = await createTestCertificate({ phone: owner.phone });
    const client = await signedInClient(owner.phone, owner.password);

    const res = await client.get(`/api/certificates/${certificate.id}/download`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(certificate.certificateNumber);
  });

  it("refuses a certificate issued to a different phone number", async () => {
    const owner = await createTestUser();
    const certificate = await createTestCertificate({ phone: owner.phone });

    const stranger = await createTestUser();
    const client = await signedInClient(stranger.phone, stranger.password);

    const res = await client.get(`/api/certificates/${certificate.id}/download`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toBe("application/pdf");
  });

  it("answers an unknown id the same way as someone else's", async () => {
    const owner = await createTestUser();
    const certificate = await createTestCertificate({ phone: owner.phone });
    const stranger = await createTestUser();
    const client = await signedInClient(stranger.phone, stranger.password);

    const someoneElses = await client.get<{ error: string }>(
      `/api/certificates/${certificate.id}/download`
    );
    const unknown = await client.get<{ error: string }>(`/api/certificates/${randomUUID()}/download`);

    expect(unknown.status).toBe(someoneElses.status);
    expect(unknown.body.error).toBe(someoneElses.body.error);
  });

  it("does not crash on an id that is not a UUID", async () => {
    const user = await createTestUser();
    const client = await signedInClient(user.phone, user.password);

    const res = await client.get("/api/certificates/not-a-uuid/download");
    expect(res.status).toBe(404);
  });
});

describe("public certificate lookup", () => {
  it("verifies a real certificate number", async () => {
    const holder = await createTestUser();
    const certificate = await createTestCertificate({
      phone: holder.phone,
      lastName: "Батбаяр",
      firstName: "Сүхээ",
    });

    const res = await anonClient().get(
      `/certificate?number=${encodeURIComponent(certificate.certificateNumber)}`
    );
    expect(res.status).toBe(200);
    expect(res.text).toContain("Батбаяр");
    expect(res.text).toContain("Баталгаажсан");
  });

  it("does not publish the holder's phone number", async () => {
    const holder = await createTestUser();
    const certificate = await createTestCertificate({ phone: holder.phone });

    const res = await anonClient().get(
      `/certificate?number=${encodeURIComponent(certificate.certificateNumber)}`
    );
    expect(res.status).toBe(200);
    // Anyone may check a certificate; nobody should learn a contact number
    // from it — the phone is only there to match the holder's own account.
    expect(res.text).not.toContain(holder.phone);
  });

  it("reports an unknown number as not found rather than erroring", async () => {
    const res = await anonClient().get("/certificate?number=NO-SUCH-NUMBER-9999");
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("Баталгаажсан");
  });

  it("survives an over-long and an injection-shaped query", async () => {
    for (const number of ["x".repeat(500), "%25", "' or 1=1 --", "<script>alert(1)</script>"]) {
      const res = await anonClient().get(`/certificate?number=${encodeURIComponent(number)}`);
      expect(res.status, `number=${number.slice(0, 20)}`).toBe(200);
      expect(res.text).not.toContain("<script>alert(1)</script>");
    }
  });
});

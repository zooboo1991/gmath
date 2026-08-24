/**
 * Counting certificate use: downloads by the holder, lookups on the public
 * "сертификат шалгах" page. Both feed the two columns in the admin list.
 */

import { afterAll, describe, expect, it } from "vitest";
import { anonClient, signedInClient } from "../../support/client";
import { cleanupTracked, testDb } from "../../support/db";
import { createTestCertificate, createTestUser } from "../../support/factories";

afterAll(async () => {
  await cleanupTracked();
});

async function events(certificateId: string): Promise<string[]> {
  const { data } = await testDb()
    .from("certificate_events")
    .select("kind")
    .eq("certificate_id", certificateId);
  return ((data ?? []) as { kind: string }[]).map((row) => row.kind);
}

describe("certificate usage", () => {
  it("records a download when the holder takes their PDF", async () => {
    const user = await createTestUser();
    const certificate = await createTestCertificate({ phone: user.phone });
    const client = await signedInClient(user.phone, user.password);

    const res = await client.get(`/api/certificates/${certificate.id}/download`);
    expect(res.status, res.text).toBe(200);

    expect(await events(certificate.id)).toEqual(["download"]);
  });

  it("counts each download separately", async () => {
    const user = await createTestUser();
    const certificate = await createTestCertificate({ phone: user.phone });
    const client = await signedInClient(user.phone, user.password);

    await client.get(`/api/certificates/${certificate.id}/download`);
    await client.get(`/api/certificates/${certificate.id}/download`);

    expect(await events(certificate.id)).toEqual(["download", "download"]);
  });

  it("records a public lookup of a real number", async () => {
    const user = await createTestUser();
    const certificate = await createTestCertificate({ phone: user.phone });

    const res = await anonClient().get(
      `/certificate?number=${encodeURIComponent(certificate.certificateNumber)}`
    );
    expect(res.status).toBe(200);

    expect(await events(certificate.id)).toEqual(["verify"]);
  });

  it("records nothing for a refused download", async () => {
    const holder = await createTestUser();
    const stranger = await createTestUser();
    const certificate = await createTestCertificate({ phone: holder.phone });

    const client = await signedInClient(stranger.phone, stranger.password);
    const res = await client.get(`/api/certificates/${certificate.id}/download`);
    expect(res.status).toBe(404);

    expect(await events(certificate.id)).toEqual([]);
  });
});

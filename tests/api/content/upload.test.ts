/**
 * Image uploads — /api/admin/upload (article covers) and
 * /api/admin/problems/upload (problem figures).
 *
 * Both write into a public bucket, so the file type is decided by reading
 * the bytes rather than trusting the Content-Type the client declared or the
 * extension it chose. SVG is deliberately not accepted: it is markup that can
 * carry script, and no byte signature can rule that out.
 */

import { afterAll, describe, expect, it } from "vitest";
import { adminClient, TestClient } from "../../support/client";
import { cleanupTracked, trackStorageUrl } from "../../support/db";

const UPLOAD_ROUTES = ["/api/admin/upload", "/api/admin/problems/upload"];

afterAll(async () => {
  await cleanupTracked();
});

/** A real 1x1 PNG, so the signature check has something valid to accept. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function upload(client: TestClient, path: string, file: File) {
  const form = new FormData();
  form.set("file", file);
  return client.postForm<{ ok: boolean; url?: string; error?: string }>(path, form);
}

describe.each(UPLOAD_ROUTES)("POST %s", (path) => {
  it("accepts a real PNG and returns a URL", async () => {
    const admin = await adminClient("full");
    const res = await upload(admin, path, new File([PNG_BYTES], "cover.png", { type: "image/png" }));

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("/storage/v1/object/public/");
    trackStorageUrl(res.body.url!);
  });

  it("refuses a request with no file", async () => {
    const admin = await adminClient("full");
    const res = await admin.postForm(path, new FormData());

    expect(res.status).toBe(400);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("refuses a field that is a string rather than a file", async () => {
    const admin = await adminClient("full");
    const form = new FormData();
    form.set("file", "https://example.test/not-really-a-file.png");

    const res = await admin.postForm(path, form);
    expect(res.status).toBe(400);
  });

  it("refuses a file over the 5MB limit", async () => {
    const admin = await adminClient("full");
    // Valid PNG bytes at the front: the size check has to be what stops this,
    // not the signature check.
    const oversized = Buffer.concat([PNG_BYTES, Buffer.alloc(5 * 1024 * 1024 + 1)]);
    const res = await upload(admin, path, new File([oversized], "big.png", { type: "image/png" }));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("5MB");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("refuses text pretending to be a PNG", async () => {
    const admin = await adminClient("full");
    const res = await upload(
      admin,
      path,
      // Correct extension, correct declared MIME type, wrong bytes.
      new File([Buffer.from("<?php system($_GET['c']); ?>")], "shell.png", { type: "image/png" })
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("PNG");
  });

  it("refuses an SVG, whatever it calls itself", async () => {
    const admin = await adminClient("full");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');

    for (const [name, type] of [
      ["drawing.svg", "image/svg+xml"],
      ["drawing.png", "image/png"],
    ]) {
      const res = await upload(admin, path, new File([svg], name, { type }));
      // SVG is markup, not a bitmap — no byte signature can vouch for it, so
      // it never reaches a bucket the whole internet can read.
      expect(res.status, name).toBe(400);
    }
  });

  it("refuses an empty file", async () => {
    const admin = await adminClient("full");
    const res = await upload(admin, path, new File([], "empty.png", { type: "image/png" }));
    expect(res.status).toBe(400);
  });

  it("answers JSON, never an HTML error page", async () => {
    const admin = await adminClient("full");
    const res = await upload(admin, path, new File([Buffer.from("nope")], "x.png", { type: "image/png" }));

    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.text.trimStart().startsWith("<")).toBe(false);
    expect(res.body.ok).toBe(false);
  });

  it("names the stored file from the bytes, not from what the client called it", async () => {
    const admin = await adminClient("full");
    const res = await upload(
      admin,
      path,
      new File([PNG_BYTES], "../../evil.php", { type: "application/x-php" })
    );

    expect(res.status).toBe(200);
    const url = res.body.url!;
    trackStorageUrl(url);
    // The path is a generated UUID plus the extension the signature implies.
    expect(url).toMatch(/\/[0-9a-f-]{36}\.png$/);
    expect(url).not.toContain("evil");
    expect(url).not.toContain("..");
  });
});

import { describe, expect, it } from "vitest";
import {
  reconcileUploadedImages,
  runImageUploads,
  updateUpload,
  type UploadEntry,
} from "./image-uploads";
const entry = (key: string): UploadEntry => ({
  key,
  file: new File([key], key + ".png", { type: "image/png" }),
  previewUrl: "blob:" + key,
  status: "pending",
  attempt: 0,
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
describe("per-image uploads", () => {
  it("settles concurrent responses out of order by stable key and retains a failed image for retry only", async () => {
    let queue = [entry("first"), entry("second"), entry("third")];
    const a = deferred<{ id: number; url: string }>(),
      b = deferred<{ id: number; url: string }>(),
      c = deferred<{ id: number; url: string }>();
    const task = runImageUploads(
      queue,
      (file) =>
        ({ first: a, second: b, third: c })[
          file.name.replace(".png", "") as "first"
        ].promise,
      (update) => {
        queue = updateUpload(queue, update);
      },
    );
    expect(queue.map((e) => e.status)).toEqual([
      "uploading",
      "uploading",
      "uploading",
    ]);
    b.resolve({ id: 22, url: "https://image.test/2" });
    await Promise.resolve();
    await Promise.resolve();
    expect(queue[1].status).toBe("saved");
    expect(queue[0].status).toBe("uploading");
    c.reject({ status: 503 });
    a.resolve({ id: 11, url: "https://image.test/1" });
    await task;
    expect(queue.map((e) => e.status)).toEqual(["saved", "saved", "failed"]);
    const retried: string[] = [];
    await runImageUploads(
      queue,
      async (file) => {
        retried.push(file.name);
        return { id: 33, url: "https://image.test/3" };
      },
      (update) => {
        queue = updateUpload(queue, update);
      },
    );
    expect(retried).toEqual(["third.png"]);
    expect(queue.map((e) => e.image?.id)).toEqual([11, 22, 33]);
  });
  it("never treats local preview as saved; lost/invalid responses are uncertain and never automatically reuploaded", async () => {
    let queue = [entry("a")];
    expect(queue[0].status).toBe("pending");
    await runImageUploads(
      queue,
      async () => {
        throw { status: 0 };
      },
      (update) => {
        queue = updateUpload(queue, update);
      },
    );
    expect(queue[0].status).toBe("uncertain");
    let calls = 0;
    await runImageUploads(
      queue,
      async () => {
        calls++;
        return { id: 1, url: "x" };
      },
      () => {},
    );
    expect(calls).toBe(0);
  });
  it("ignores removed entries and stale attempt responses without resurrecting/deleting another image", () => {
    const current = { ...entry("a"), status: "uploading" as const, attempt: 2 };
    expect(
      updateUpload([current], {
        key: "a",
        attempt: 1,
        status: "saved",
        image: { id: 9, url: "x" },
      })[0],
    ).toEqual(current);
    expect(
      updateUpload([], {
        key: "removed",
        attempt: 1,
        status: "saved",
        image: { id: 9, url: "x" },
      }),
    ).toEqual([]);
  });
});

describe("authoritative image reconciliation", () => {
  it("removes only acknowledged uploads whose stable ID is absent, independent of image order/count", () => {
    const a = {
      ...entry("a"),
      status: "saved" as const,
      image: { id: 11, url: "a" },
    };
    const b = {
      ...entry("b"),
      status: "saved" as const,
      image: { id: 22, url: "b" },
    };
    const c = {
      ...entry("c"),
      status: "saved" as const,
      image: { id: 33, url: "c" },
    };
    const entries = [a, b, c];
    expect(
      reconcileUploadedImages(entries, [{ id: 33 }, { id: 44 }, { id: 11 }]),
    ).toEqual([a, c]);
    expect(entries).toEqual([a, b, c]);
    expect(reconcileUploadedImages([a], [{ id: 11 }])).toEqual([a]);
    expect(reconcileUploadedImages([a], [])).toEqual([]);
  });
  it.each(["pending", "uploading", "failed", "uncertain"] as const)(
    "preserves %s files without guessing server identity",
    (status) => {
      const local = { ...entry(status), status };
      expect(reconcileUploadedImages([local], [])).toEqual([local]);
      expect(reconcileUploadedImages([local], [{ id: 99 }])).toEqual([local]);
    },
  );
  it("keeps delayed uploads and newly selected local files while deleting another acknowledged image", async () => {
    let queue = [
      {
        ...entry("deleted"),
        status: "saved" as const,
        image: { id: 1, url: "a" },
      },
      entry("delayed"),
    ];
    const pending = deferred<{ id: number; url: string }>();
    const task = runImageUploads(
      queue,
      () => pending.promise,
      (update) => {
        queue = updateUpload(queue, update);
      },
    );
    queue = reconcileUploadedImages([...queue, entry("new")], []);
    expect(queue.map((e) => e.key)).toEqual(["delayed", "new"]);
    pending.resolve({ id: 2, url: "b" });
    await task;
    expect(queue.map((e) => [e.key, e.status])).toEqual([
      ["delayed", "saved"],
      ["new", "pending"],
    ]);
    expect(reconcileUploadedImages(queue, [{ id: 2 }])).toEqual(queue);
  });
});

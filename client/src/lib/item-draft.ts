import type { ItemFields } from "./item-form";

// Unsent "new post" drafts survive accidental navigation, reloads and closed
// tabs. Text fields live in localStorage; chosen photos live in IndexedDB
// because localStorage cannot hold binary data. Drafts are per account and
// are removed as soon as the post is created or the user discards them.
export interface ItemDraft {
  fields: ItemFields;
  step: number;
  savedAt: number;
}
export interface DraftPhoto {
  key: string;
  name: string;
  type: string;
  blob: Blob;
}

const MAX_AGE = 14 * 24 * 3600 * 1000;
const DB = "findit-drafts";
const STORE = "photos";
const textKey = (userId: number) => `findit.itemDraft.v1.${userId}`;

export function hasContent(fields: ItemFields) {
  return Boolean(
    fields.title.trim() ||
    fields.categoryId ||
    fields.locationId ||
    fields.eventDate ||
    fields.description.trim() ||
    fields.color.trim(),
  );
}

export function loadDraft(userId: number): ItemDraft | null {
  try {
    const raw = localStorage.getItem(textKey(userId));
    if (!raw) return null;
    const draft = JSON.parse(raw) as ItemDraft;
    if (
      !draft ||
      typeof draft.savedAt !== "number" ||
      Date.now() - draft.savedAt > MAX_AGE ||
      !draft.fields ||
      !["LOST", "FOUND"].includes(draft.fields.type)
    ) {
      localStorage.removeItem(textKey(userId));
      return null;
    }
    return {
      fields: {
        title: String(draft.fields.title ?? ""),
        type: draft.fields.type,
        categoryId: String(draft.fields.categoryId ?? ""),
        locationId: String(draft.fields.locationId ?? ""),
        eventDate: String(draft.fields.eventDate ?? ""),
        description: String(draft.fields.description ?? ""),
        color: String(draft.fields.color ?? ""),
      },
      step: draft.step === 2 || draft.step === 3 ? draft.step : 1,
      savedAt: draft.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveDraft(userId: number, fields: ItemFields, step: number) {
  try {
    localStorage.setItem(
      textKey(userId),
      JSON.stringify({ fields, step, savedAt: Date.now() }),
    );
  } catch {
    /* Storage full or disabled: the form keeps working without drafts. */
  }
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(request ? request.result : undefined);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        resolve(undefined);
      };
    } catch {
      db.close();
      resolve(undefined);
    }
  });
}

export async function saveDraftPhotos(userId: number, photos: DraftPhoto[]) {
  await withStore("readwrite", (store) => {
    store.put(photos, String(userId));
  });
}

export async function loadDraftPhotos(userId: number): Promise<DraftPhoto[]> {
  const photos = await withStore<DraftPhoto[]>("readonly", (store) =>
    store.get(String(userId)),
  );
  return Array.isArray(photos)
    ? photos.filter((photo) => photo && photo.blob instanceof Blob).slice(0, 5)
    : [];
}

export async function clearDraft(userId: number) {
  try {
    localStorage.removeItem(textKey(userId));
  } catch {
    /* ignore */
  }
  await withStore("readwrite", (store) => {
    store.delete(String(userId));
  });
}

export type NominationDraftData = {
  version: 1;
  submissionId?: string;
  saved_at: string;
  step: 1 | 2 | 3 | 4;
  selectedAwardId: string;
  nomineeName: string;
  employeeId: string;
  positionTitle: string;
  officeId: string;
  divisionSection: string;
  employmentCategory: 'Permanent' | 'Casual' | 'Contractual' | 'Job Order' | 'Barangay Official' | 'Barangay Worker';
  contactNumber: string;
  email: string;
  barangay: string;
  nominationType: 'Individual' | 'Group / Team';
  nominatorName: string;
  nominatorPosition: string;
  nominatingOffice: string;
  justification: string;
  accomplishments: string;
  supportingNarrative: string;
};

type StoredDraftFile = {
  key: string;
  userId: string;
  awardId: string;
  requirementId: string;
  file: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
};

const DRAFT_STORAGE_PREFIX = 'praise-nomination-draft';
const FILE_DATABASE_NAME = 'tacloban-praise-drafts';
const FILE_STORE_NAME = 'nomination-files';

function draftStorageKey(userId: string): string {
  return `${DRAFT_STORAGE_PREFIX}:${userId}`;
}

function fileStorageKey(userId: string, awardId: string, requirementId: string): string {
  return `${userId}::${awardId}::${requirementId}`;
}

export function readNominationDraft(userId: string): NominationDraftData | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = window.localStorage.getItem(draftStorageKey(userId));
    if (!stored) return null;

    const draft = JSON.parse(stored) as NominationDraftData;
    if (draft.version !== 1 || draft.step < 1 || draft.step > 4) return null;
    return draft;
  } catch {
    return null;
  }
}

export function saveNominationDraft(userId: string, draft: NominationDraftData): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(draftStorageKey(userId), JSON.stringify(draft));
}

export function clearNominationDraft(userId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(draftStorageKey(userId));
}

function openFileDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }

    const request = window.indexedDB.open(FILE_DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE_NAME)) {
        database.createObjectStore(FILE_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open draft file storage.'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Draft file transaction failed.'));
    transaction.onabort = () => reject(transaction.error || new Error('Draft file transaction was aborted.'));
  });
}

export async function saveNominationDraftFile(
  userId: string,
  awardId: string,
  requirementId: string,
  file: File
): Promise<void> {
  const database = await openFileDatabase();
  try {
    const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
    const storedFile: StoredDraftFile = {
      key: fileStorageKey(userId, awardId, requirementId),
      userId,
      awardId,
      requirementId,
      file,
      fileName: file.name,
      fileType: file.type,
      lastModified: file.lastModified,
    };
    transaction.objectStore(FILE_STORE_NAME).put(storedFile);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function readNominationDraftFiles(userId: string, awardId: string): Promise<Map<string, File>> {
  const database = await openFileDatabase();
  try {
    const transaction = database.transaction(FILE_STORE_NAME, 'readonly');
    const transactionComplete = waitForTransaction(transaction);
    const request = transaction.objectStore(FILE_STORE_NAME).getAll();
    const storedFiles = await new Promise<StoredDraftFile[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredDraftFile[]);
      request.onerror = () => reject(request.error || new Error('Unable to read draft files.'));
    });
    await transactionComplete;

    return new Map(
      storedFiles
        .filter(item => item.userId === userId && item.awardId === awardId)
        .map(item => [
          item.requirementId,
          new File([item.file], item.fileName, {
            type: item.fileType || item.file.type,
            lastModified: item.lastModified,
          }),
        ])
    );
  } finally {
    database.close();
  }
}

export async function clearNominationDraftFiles(userId: string): Promise<void> {
  const database = await openFileDatabase();
  try {
    const transaction = database.transaction(FILE_STORE_NAME, 'readwrite');
    const transactionComplete = waitForTransaction(transaction);
    const store = transaction.objectStore(FILE_STORE_NAME);
    const request = store.getAllKeys();
    const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Unable to list draft files.'));
    });

    keys
      .filter(key => typeof key === 'string' && key.startsWith(`${userId}::`))
      .forEach(key => store.delete(key));
    await transactionComplete;
  } finally {
    database.close();
  }
}

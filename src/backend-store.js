/**
 * Lightweight document-store compatibility layer.
 * Purpose: keep older pages working without external legacy SDKs.
 */

const STORAGE_KEY = 'invex-backend-store-v1';
let listeners = [];

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function collectionPath(path) {
  return String(path || '').replace(/^\/+|\/+$/g, '');
}

function ensureCollection(store, path) {
  const key = collectionPath(path);
  if (!store[key]) store[key] = {};
  return store[key];
}

function splitDocPath(path) {
  const clean = collectionPath(path);
  const parts = clean.split('/');
  return {
    collection: parts.slice(0, -1).join('/'),
    docId: parts[parts.length - 1] || '',
  };
}

function randomId() {
  return `doc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function makeDocSnapshot(id, data) {
  return {
    id,
    exists: () => Boolean(data),
    data: () => (data ? { ...data } : undefined),
  };
}

function applyConstraints(rows, constraints = []) {
  let list = [...rows];

  constraints.forEach((c) => {
    if (!c || !c.type) return;
    if (c.type === 'where' && c.op === '==') {
      list = list.filter((row) => row?.[c.field] === c.value);
    }
  });

  const orderRule = constraints.find((c) => c?.type === 'orderBy');
  if (orderRule) {
    const dir = orderRule.direction === 'desc' ? -1 : 1;
    list.sort((a, b) => {
      const av = a?.[orderRule.field];
      const bv = b?.[orderRule.field];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return av > bv ? dir : -dir;
    });
  }

  return list;
}

export function collection(_db, ...segments) {
  return {
    __kind: 'collection',
    path: collectionPath(segments.join('/')),
  };
}

export function doc(_db, ...segments) {
  return {
    __kind: 'doc',
    path: collectionPath(segments.join('/')),
  };
}

export function where(field, op, value) {
  return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function query(ref, ...constraints) {
  return {
    __kind: 'query',
    path: ref?.path || '',
    constraints,
  };
}

export function serverTimestamp() {
  return new Date().toISOString();
}

export function deleteField() {
  return { __deleteField: true };
}

export async function getDocs(refOrQuery) {
  const store = loadStore();
  const path = collectionPath(refOrQuery?.path || '');
  const coll = store[path] || {};
  let rows = Object.entries(coll).map(([id, row]) => ({ id, ...row }));

  if (refOrQuery?.__kind === 'query') {
    rows = applyConstraints(rows, refOrQuery.constraints);
  }

  const docs = rows.map((row) => ({
    id: row.id,
    data: () => ({ ...row, id: undefined }),
  }));

  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach(cb) {
      docs.forEach(cb);
    },
  };
}

export async function getDoc(docRef) {
  const store = loadStore();
  const { collection: collPath, docId } = splitDocPath(docRef?.path || '');
  const coll = store[collPath] || {};
  const data = coll[docId];
  return makeDocSnapshot(docId, data);
}

export async function addDoc(collectionRef, data) {
  const store = loadStore();
  const coll = ensureCollection(store, collectionRef?.path || '');
  const id = randomId();
  coll[id] = { ...(data || {}) };
  saveStore(store);
  notify();
  return { id };
}

export async function setDoc(docRef, data, options = {}) {
  const store = loadStore();
  const { collection: collPath, docId } = splitDocPath(docRef?.path || '');
  const coll = ensureCollection(store, collPath);
  const prev = coll[docId] || {};
  coll[docId] = options.merge ? { ...prev, ...(data || {}) } : { ...(data || {}) };
  saveStore(store);
  notify();
}

export async function updateDoc(docRef, updates) {
  const store = loadStore();
  const { collection: collPath, docId } = splitDocPath(docRef?.path || '');
  const coll = ensureCollection(store, collPath);
  const prev = coll[docId] || {};
  const next = { ...prev };

  Object.entries(updates || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object' && v.__deleteField) {
      delete next[k];
    } else {
      next[k] = v;
    }
  });

  coll[docId] = next;
  saveStore(store);
  notify();
}

export async function deleteDoc(docRef) {
  const store = loadStore();
  const { collection: collPath, docId } = splitDocPath(docRef?.path || '');
  const coll = ensureCollection(store, collPath);
  delete coll[docId];
  saveStore(store);
  notify();
}

export function onSnapshot(refOrQuery, onNext, onError) {
  const runner = async () => {
    try {
      if (refOrQuery?.__kind === 'doc') {
        const snap = await getDoc(refOrQuery);
        onNext?.(snap);
      } else {
        const snap = await getDocs(refOrQuery);
        onNext?.(snap);
      }
    } catch (err) {
      onError?.(err);
    }
  };

  runner();
  listeners.push(runner);
  return () => {
    listeners = listeners.filter((l) => l !== runner);
  };
}


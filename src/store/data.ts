import {create} from 'zustand';
import type {BankAccount, DiagEntry, Txn} from '../engine/types';
import {debouncedWriter, readJSON, storage, uid, writeJSON} from './storage';

const TX_KEY = 'txns.v1';
const ACC_KEY = 'accounts.v1';
const DIAG_KEY = 'diag.v1';
const DIAG_MAX = 400;

const txWriter = debouncedWriter(TX_KEY);
const diagWriter = debouncedWriter(DIAG_KEY, 800);

interface DataStore {
  /** Newest first. */
  txns: Txn[];
  accounts: BankAccount[];
  diag: DiagEntry[];
  lastAnnouncedId?: string;

  addTxn: (t: Txn) => void;
  updateTxn: (id: string, patch: Partial<Txn>) => void;
  deleteTxn: (id: string) => void;
  addMany: (list: Txn[]) => void;
  clearTxns: () => void;
  pruneOlderThan: (days: number) => number;

  upsertAccount: (a: Partial<BankAccount> & {bank: string; displayName: string}) => BankAccount;
  removeAccount: (id: string) => void;
  setDefaultAccount: (id: string) => void;

  log: (e: Omit<DiagEntry, 'id' | 'at'> & {at?: number}) => void;
  clearDiag: () => void;
  setLastAnnounced: (id: string) => void;
}

const sortDesc = (a: Txn, b: Txn) => b.timestamp - a.timestamp;
const ACCOUNT_COLORS = 8;

export const useData = create<DataStore>((set, get) => {
  const saveTx = (txns: Txn[]) => {
    set({txns});
    txWriter.write(txns);
  };
  const saveAcc = (accounts: BankAccount[]) => {
    set({accounts});
    writeJSON(ACC_KEY, accounts);
  };
  return {
    txns: readJSON<Txn[]>(TX_KEY, []),
    accounts: readJSON<BankAccount[]>(ACC_KEY, []),
    diag: readJSON<DiagEntry[]>(DIAG_KEY, []),
    lastAnnouncedId: storage.getString('lastAnnounced'),

    addTxn: t => {
      const txns = get().txns;
      // Most inserts are newest; keep order without a full sort.
      if (!txns.length || t.timestamp >= txns[0].timestamp) saveTx([t, ...txns]);
      else saveTx([...txns, t].sort(sortDesc));
    },
    updateTxn: (id, patch) =>
      saveTx(get().txns.map(t => (t.id === id ? {...t, ...patch, updatedAt: Date.now()} : t))),
    deleteTxn: id => saveTx(get().txns.filter(t => t.id !== id)),
    addMany: list => saveTx([...list, ...get().txns].sort(sortDesc)),
    clearTxns: () => {
      saveTx([]);
      txWriter.flush();
    },
    pruneOlderThan: days => {
      if (!days) return 0;
      const cut = Date.now() - days * 86400000;
      const before = get().txns.length;
      const kept = get().txns.filter(t => t.timestamp >= cut);
      if (kept.length !== before) saveTx(kept);
      return before - kept.length;
    },

    upsertAccount: a => {
      const list = get().accounts;
      const existing = a.id ? list.find(x => x.id === a.id) : undefined;
      const acc: BankAccount = existing
        ? {...existing, ...a}
        : {
            id: uid(),
            type: 'savings',
            upiIds: [],
            sources: [],
            active: true,
            isDefault: list.length === 0,
            color: list.length % ACCOUNT_COLORS,
            createdAt: Date.now(),
            ...a,
          };
      saveAcc(existing ? list.map(x => (x.id === acc.id ? acc : x)) : [...list, acc]);
      return acc;
    },
    removeAccount: id => {
      const rest = get().accounts.filter(a => a.id !== id);
      if (rest.length && !rest.some(a => a.isDefault)) rest[0] = {...rest[0], isDefault: true};
      saveAcc(rest);
    },
    setDefaultAccount: id => saveAcc(get().accounts.map(a => ({...a, isDefault: a.id === id}))),

    log: e => {
      const entry: DiagEntry = {id: uid(), at: e.at ?? Date.now(), ...e};
      const diag = [entry, ...get().diag].slice(0, DIAG_MAX);
      set({diag});
      diagWriter.write(diag);
    },
    clearDiag: () => {
      set({diag: []});
      writeJSON(DIAG_KEY, []);
    },
    setLastAnnounced: id => {
      set({lastAnnouncedId: id});
      storage.set('lastAnnounced', id);
    },
  };
});

export const data = () => useData.getState();

/**
 * Writes pending debounced changes now. Headless tasks must call this before finishing:
 * React Native freezes JS timers once the task ends, so a debounced write could never land.
 */
export function flushStores() {
  txWriter.flush();
  diagWriter.flush();
}

export function wipeAllLocalData() {
  useData.setState({txns: [], diag: [], lastAnnouncedId: undefined});
  storage.delete(TX_KEY);
  storage.delete(DIAG_KEY);
  storage.delete('lastAnnounced');
}

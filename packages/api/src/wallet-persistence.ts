import { createPersistentStore, type PersistentStore } from "@simulacrum/core";

export interface PersistedWallet {
  accountId: string;
  privateKey: string;
  privateKeyType: "der" | "ecdsa" | "ed25519" | "auto";
}

export interface WalletPersistenceStore {
  wallets: PersistedWallet[];
  escrow?: PersistedWallet;
}

interface SerializedWalletStore {
  wallets: PersistedWallet[];
  escrow?: PersistedWallet;
}

export function createWalletPersistence(fileName: string): PersistentStore<WalletPersistenceStore> {
  return createPersistentStore<WalletPersistenceStore, SerializedWalletStore>({
    fileName,
    create: () => ({ wallets: [] }),
    serialize: (store) => ({
      wallets: store.wallets,
      escrow: store.escrow
    }),
    deserialize: (store, data) => {
      if (Array.isArray(data.wallets)) {
        store.wallets = data.wallets;
      }

      if (data.escrow?.accountId && data.escrow?.privateKey) {
        store.escrow = data.escrow;
      }
    }
  });
}

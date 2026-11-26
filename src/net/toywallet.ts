import { parseEconomyState, type EconomyState } from '../core/storage';
import { ToyStorage, toySupports, type ToyLike } from './toy';

/**
 * The 星尘 wallet, mirrored into the B站 Toy's per-user cloud storage — the platform's one storage
 * capability (abilities `getCloudStorage` / `setCloudStorage`). Everything about the mirror is
 * best-effort:
 *
 * - **Silent.** No screen, no status line: the local save is the truth, the cloud is a convenience
 *   for playing on another device. Every failure resolves to "nothing happened".
 * - **One-way by lifetime.** A cloud state is adopted only when it has earned strictly more
 *   lifetime 星尘 than the local one — the same wallet lineage, simply further along — and then
 *   adopted wholesale. A lower or equal lifetime means the local state wins and gets pushed back.
 *   There is no field-level merge, because two branches of one wallet cannot be reconciled
 *   honestly (spending here and earning there would both claim to be the truth).
 * - **One item, one key.** The whole state serializes to a small JSON string (a maxed-out wallet
 *   stays a few kilobytes), so the mirror is one read and one write per sync point.
 */

/** The single storage key the mirror uses. */
export const TOY_WALLET_KEY = 'economy';

export interface WalletMirror {
  /** The cloud wallet, or null when unreadable. Never throws. */
  load(): Promise<EconomyState | null>;
  /** Pushes the wallet. Resolves false when the write did not land. */
  save(state: EconomyState): Promise<boolean>;
}

/**
 * Decides whether a cloud wallet replaces the local one: only a strictly larger lifetime is
 * "the same wallet, further along". Returns the state to adopt, or null to keep local.
 */
export function mergeWallet(local: EconomyState, cloud: EconomyState | null): EconomyState | null {
  if (!cloud) return null;
  return cloud.lifetime > local.lifetime ? cloud : null;
}

/** The Toy-channel {@link WalletMirror}, backed by the SDK's storage API. */
export class ToyWalletMirror implements WalletMirror {
  /** False once the host proved to have no storage ability; never re-asked after that. */
  private supported: boolean | null = null;
  private storage: ToyStorage | null = null;

  constructor(private readonly sdk: () => Promise<ToyLike | null>) {}

  async load(): Promise<EconomyState | null> {
    const storage = await this.client();
    if (!storage) return null;
    const result = await storage.get([TOY_WALLET_KEY]);
    if (!result.ok) return null;
    return parseEconomyState(result.data[TOY_WALLET_KEY]);
  }

  async save(state: EconomyState): Promise<boolean> {
    const storage = await this.client();
    if (!storage) return false;
    // The state is stored as the value itself: the SDK's storage is a JSON channel, so the
    // same repair rules apply on the way back out (parseEconomyState in `load`).
    const result = await storage.set({ [TOY_WALLET_KEY]: state });
    return result.ok;
  }

  /** Resolves the storage API once; a host without it is remembered and never asked again. */
  private async client(): Promise<ToyStorage | null> {
    if (this.supported === false) return null;
    if (this.storage) return this.storage;
    const sdk = await this.sdk();
    if (!sdk?.storage) {
      this.supported = false;
      return null;
    }
    if (this.supported === null) this.supported = await toySupports(sdk, 'getCloudStorage');
    if (!this.supported) return null;
    this.storage = new ToyStorage(sdk.storage);
    return this.storage;
  }
}

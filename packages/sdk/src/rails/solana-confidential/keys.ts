/**
 * Confidential-transfer keys for a (owner, mint) pair, derived from the owner's signer the way the
 * Solana `solana-conf-bal/v1` standard prescribes, so any wallet holding the signer can re-derive them.
 */
import { deriveAeKeyForOwnerMint, deriveElGamalKeypairForOwnerMint } from "@solana-program/token-2022/confidential";
import { getAddressEncoder, type Address, type MessagePartialSigner } from "@solana/kit";
import { AeKey, ElGamalKeypair, ElGamalSecretKey } from "@solana/zk-sdk/bundler";

export type ConfidentialKeys = {
  elgamalKeypair: ElGamalKeypair;
  elgamalSecretKey: ElGamalSecretKey;
  /** ElGamal public key as Token-2022 stores it (base58, Address-typed). */
  elgamalPubkey: Address;
  elgamalPubkeyBytes: Uint8Array;
  aesKey: AeKey;
};

export async function deriveConfidentialKeys(signer: MessagePartialSigner, mint: Address, owner?: Address): Promise<ConfidentialKeys> {
  const ownerAddress = owner ?? signer.address;
  const eg = await deriveElGamalKeypairForOwnerMint({ signer, owner: ownerAddress, mint });
  const ae = await deriveAeKeyForOwnerMint({ signer, owner: ownerAddress, mint });
  const elgamalSecretKey = ElGamalSecretKey.fromBytes(new Uint8Array(eg.secretKey));
  return {
    elgamalKeypair: ElGamalKeypair.fromSecretKey(elgamalSecretKey),
    elgamalSecretKey,
    elgamalPubkey: eg.elgamalPubkey,
    elgamalPubkeyBytes: addressToBytes(eg.elgamalPubkey),
    aesKey: AeKey.fromBytes(new Uint8Array(ae)),
  };
}

export function addressToBytes(a: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(a));
}

/** Secret material only — what a payee server or an auditor needs to decrypt amounts. */
export function elgamalSecretFromBytes(bytes: Uint8Array | number[]): ElGamalSecretKey {
  return ElGamalSecretKey.fromBytes(new Uint8Array(bytes));
}

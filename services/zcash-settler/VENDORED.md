# Provenance

`services/zcash-settler` is a fork of [zcash/zcash-devtool](https://github.com/zcash/zcash-devtool)
(dual-licensed MIT / Apache-2.0 — see `LICENSE-MIT` and `LICENSE-APACHE`). sotto adds:

- `serve` — an HTTP API (`/address`, `/sync`, `/balance`, `/send`, `/received`) so the TypeScript SDK can
  send shielded payments and detect incoming ones by memo through a viewing key.
- `with_extra_ca` in `remote.rs` — trusts `SSL_CERT_FILE` in addition to the bundled roots.
- `enhance::Command::new` + an early return when nothing is queued — `serve` runs enhancement after every sync so
  received notes get their memos (compact blocks carry none). `/received` labels pool 4 as Ironwood.

**NU7 port (October 4, 2026).** NU7 activated on Zcash testnet at block 4,465,026 (consensus branch
`0x77190AD9`, v6 transactions). Upstream zcash-devtool was still on librustzcash's August releases, so the
fork moved itself to the NU7 pre-releases published on September 30: `zcash_protocol 0.11.0-pre.0`,
`zcash_primitives`/`zcash_proofs 0.31.0-pre.0`, `zcash_client_backend 0.25.0-pre.0`, `zcash_client_sqlite
0.23.0-pre.0`, `zcash_keys 0.17.0-pre.0`, `zcash_address 0.14.0-pre.0`, `zcash_transparent 0.11.0-pre.0`,
`pczt 0.10.0-pre.0`, `zip321 0.10.0-pre.0`, with `orchard 0.16`, `sapling-crypto 0.9` and `rand 0.10`. The API
changes were small: `SysRng` (behind `UnwrapErr`) replaces `OsRng`, `create_proposed_transactions` takes a
clock and an RNG, `Ufvk::decode` returns the ZIP 316 revision, `UnifiedAddress::from_receivers` takes expiry
fields, and Sapling ZIP 32 derivation is fallible. Wallets created before the port need `wallet upgrade`.

To keep the port small, the fork now carries only the commands sotto uses or that compiled unchanged:
`wallet`, `zip48` and `create-multisig-address`. Upstream's `inspect`, `pczt`, `migration` and `keystone`
commands were removed rather than ported; use upstream zcash-devtool for those.

Everything else is upstream code; credit belongs to its authors.
upstream: 5a26ee8 Merge pull request #239 from zcash/librustzcash-releases

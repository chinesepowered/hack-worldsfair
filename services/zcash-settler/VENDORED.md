# Provenance

`services/zcash-settler` is a fork of [zcash/zcash-devtool](https://github.com/zcash/zcash-devtool)
(dual-licensed MIT / Apache-2.0 — see `LICENSE-MIT` and `LICENSE-APACHE`). The upstream CLI is kept
intact; sotto adds:

- `serve` — an HTTP API (`/address`, `/sync`, `/balance`, `/send`, `/received`) so the TypeScript SDK can
  send shielded payments and detect incoming ones by memo through a viewing key.
- `with_extra_ca` in `remote.rs` — trusts `SSL_CERT_FILE` in addition to the bundled roots.

Everything else is upstream code; credit belongs to its authors.
upstream: 5a26ee8 Merge pull request #239 from zcash/librustzcash-releases

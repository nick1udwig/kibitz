# Kibitz Shim Mode — Engineer Runbook

## Prereqs
- Hyperware node with Hypergrid installed and running on the same node
- Repos side-by-side:
  - `kibitz` (branch: `shim-hyper`)
  - `hyperware-kibitz` (serves the built FE)

## Build (from kibitz/)
```bash
NEXT_PUBLIC_BASE_PATH=/kibitz:kibitz:nick.hypr \
NEXT_PUBLIC_DEFAULT_WS_ENDPOINT=/operator:hypergrid:ware.hypr/shim/mcp \
NEXT_PUBLIC_HYPERGRID_LOCKED=1 \
npm ci && npm run build
```

## Package (copy export into wrapper)
```bash
rsync -a --delete ./out/ ../hyperware-kibitz/pkg/kibitz-ui/
```

## Wrapper manifest
- Edit `hyperware-kibitz/pkg/manifest.json` and delete the block where `"process_name": "fwd-ws"`.
- Leave only the `"kibitz"` process (the package just serves the FE).

## Install on node
- Install `hyperware-kibitz` on the node (only `kibitz` process).

## Run / Validate
- Open `/kibitz:kibitz:nick.hypr` on the node.
- Expected:
  - Exactly one MCP server: “Hypergrid”, connected
  - No add/remove MCP controls
  - WS connects to: `ws(s)://<host>/operator:hypergrid:ware.hypr/shim/mcp`

## Override (if needed)
- To test a different shim path/publisher, rebuild with:
```bash
NEXT_PUBLIC_DEFAULT_WS_ENDPOINT=/your/custom/path \
NEXT_PUBLIC_HYPERGRID_LOCKED=1 \
npm run build
```

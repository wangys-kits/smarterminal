# Bundled `tmux` Binaries

Put prebuilt static `tmux` binaries here so the runtime can fall back when the
target machine does not provide `tmux`. The runtime looks for the binaries
under the following layout:

```
app/resources/tmux/
├── linux-x86_64/
│   ├── tmux          # executable
│   └── tmux.sha256   # (optional) checksum
└── linux-arm64/
    ├── tmux
    └── tmux.sha256
```

Only Linux variants are required right now because remote SSH targets are
expected to be Linux servers. macOS builds use the system `tmux` if available.

Files shipped with the repository are placeholders – replace them with the real
executables during packaging or deployment.

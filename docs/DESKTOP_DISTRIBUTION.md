# ARC Studio Desktop support

| Platform | Minimum supported version | Build architecture | Download |
|---|---|---|---|
| macOS | macOS 14 Sonoma | Universal app for Intel and Apple silicon | `.dmg` |
| Windows | Windows 10 version 1803 (build 17134) or Windows 11 | x64; ARM64 on Windows 11 | NSIS `.exe`, ARM package contains a native ARM64 app |
| Linux | Ubuntu 22.04 / Debian 12, or a compatible distribution with glibc 2.35 and WebKitGTK 4.1 | x86_64 and ARM64, as separate builds | AppImage and `.deb` |

The macOS universal build contains both Intel and Apple silicon application code and the bundled Node.js runtime. Windows installers bootstrap WebView2 if it is not already installed.

Linux AppImages work across distributions that provide the required glibc and WebKitGTK system libraries. They are not fully self-contained against every Linux distribution, and CPU architectures require separate AppImages. Debian packages are provided for Debian and Ubuntu based systems and install through the system package manager. The in-app updater continues to use signed AppImages on Linux, so `.deb` installations receive updates through later `.deb` downloads rather than the updater. Build each architecture on its matching Ubuntu 22.04 runner to retain the documented baseline.

Run `npm run build:desktop` on the target operating system to create its package. Linux builds produce both an AppImage and a Debian package under `packages/studio-desktop/src-tauri/target/<target>/release/bundle/`. Before a local universal macOS build, install both Rust targets with `rustup target add x86_64-apple-darwin aarch64-apple-darwin`.

The build channel is inferred from the root version unless `ARC_RELEASE_CHANNEL` is set: versions with a prerelease suffix, such as `2026.1.1-alpha.6`, build as Nightly, versions without a suffix, such as `2026.1.1`, build as Stable. Nightly bundles receive purple-tinted app and project-file icons on macOS, Windows, and Linux. Stable builds use the shared blue icons. Nightly Discord Rich Presence uses the purple image in `src-tauri/icons/nightly-icon.png` directly by the GitHub url for the arc-studio repo.

Windows and Linux installers are built on matching GitHub Actions runners, so they will not appear in a macOS checkout's local `target` directory. Run the **Desktop Builds** workflow to download them from that Actions run. When a `v*` tag is pushed, the workflow attaches macOS and Windows installers, Linux AppImages and `.deb` packages for both architectures, and the signed updater metadata to the GitHub release. GitHub displays each release asset's SHA-256 digest, so the workflow does not publish redundant checksum sidecar files.

## In-app updates

The Tauri updater verifies signed update bundles with the public key in `src-tauri/tauri.conf.json`. GitHub Actions reads the matching private key from the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets. 

Pushing a version tag builds and signs each platform's updater bundle, creates `latest.json`, and attaches both to that version's GitHub release. Stable builds check the latest stable release. Prerelease builds check the rolling `nightly` release, whose manifest points to the immutable versioned prerelease artifacts. The app checks on launch and every six hours while online, unless automatic checks are disabled in Settings. Stable updates download automatically and apply on the next launch. Nightly updates ask before downloading and installing, then restart ARC to apply.
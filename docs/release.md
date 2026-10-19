# Releasing Boleiro

Boleiro ships as a macOS `.dmg` and a Windows installer (an NSIS `.exe` and an `.msi`). Both come from `pnpm tauri build`; the window, bundle and installer settings live in `apps/desktop/src-tauri/tauri.conf.json`, with `tauri.macos.conf.json` and `tauri.windows.conf.json` layered on top for each system. Nothing is code-signed yet, so both systems warn on first launch (see [Unsigned builds](#unsigned-builds)).

## Build on a Mac

```sh
pnpm install
pnpm tauri build                                                   # this Mac's architecture
pnpm tauri build --target universal-apple-darwin --bundles app,dmg # Apple Silicon and Intel in one app; needs: rustup target add x86_64-apple-darwin
```

`pnpm tauri build` runs `pnpm build` (Vite) first and embeds `apps/desktop/dist/` in the executable. The bundles land in `apps/desktop/src-tauri/target/release/bundle/` (`macos/Boleiro.app`, `dmg/Boleiro_<version>_aarch64.dmg`); with `--target` the path gains the target's name, e.g. `target/universal-apple-darwin/release/bundle/dmg/Boleiro_<version>_universal.dmg`.

What fills the app: the web build is about 27 MB, half of it club crests (1,750 WebP files, 13 MB) and half JavaScript (the screens bundle with the data packs, 7.5 MB, and the engine worker, 4.9 MB). Tauri compresses the embedded files, so the Apple Silicon `.app` is about 25 MB and its `.dmg` about 20 MB. The universal build carries the embedded files once per architecture: about 49 MB for the `.app` and 38 MB for the `.dmg`.

## Build in GitHub Actions

`.github/workflows/release.yml` builds the universal `.dmg` on `macos-latest` and the NSIS `.exe` and `.msi` on `windows-latest`. It needs no secrets. It runs in two ways:

- **A version tag** publishes a release. Set the version in `apps/desktop/src-tauri/tauri.conf.json`, commit, then push a tag with the same number: `git tag v0.1.0 && git push origin v0.1.0`. When both installers have built, the `publish` job creates the GitHub release for that tag with the `.dmg`, the `-setup.exe` and the `.msi` attached, the first-launch steps for unsigned builds as its notes, followed by GitHub's generated list of changes. A tag with a hyphen (`v0.2.0-beta.1`) makes a prerelease, which the README's `releases/latest` link skips. Rerunning the workflow for a tag whose release exists replaces its files.
- **By hand** (Actions → Release → Run workflow, or `gh workflow run release.yml --ref <branch>`) it only builds: download the `boleiro-macos` and `boleiro-windows` artifacts from the run's summary page (GitHub keeps them for 90 days by default). Started on a tag, it publishes as a pushed tag does. GitHub offers the button only once the workflow is on the default branch (`main`).

Both jobs take about 15–25 minutes; the macOS job compiles the Rust side twice, once per architecture. Standard GitHub-hosted runners are free for a public repository.

The release is never published without both systems: if the macOS or the Windows build fails, the `publish` job is skipped, and it also stops if the downloaded artifacts lack a `.dmg` or a `-setup.exe`. The `.msi` is optional. WiX, which builds it, needs Windows' optional VBScript feature (Tauri issue #13752), so the Windows job packs it with `pnpm tauri bundle --bundles msi` in a step of its own that may fail; the `.exe` and the release go ahead without it.

## Unsigned builds

macOS: the app is signed ad hoc (`"signingIdentity": "-"` in `tauri.macos.conf.json`), which seals the bundle but proves no identity. A copy built on the same Mac opens normally. A copy downloaded from GitHub is quarantined: the first open says Apple could not verify it. Open System Settings → Privacy & Security and click Open Anyway, or run `xattr -dr com.apple.quarantine /Applications/Boleiro.app`. Without the ad-hoc seal, a downloaded Apple Silicon app is reported as damaged and can't be opened at all.

Windows: SmartScreen says "Windows protected your PC". Click More info → Run anyway.

## Signing later

Signing needs accounts and certificates only the owner can get; nothing in the repo references them yet.

macOS (signing and notarization, so Gatekeeper opens the app without a warning):

1. Join the Apple Developer Program (US$99 a year) and create a Developer ID Application certificate. Export it with its private key as a `.p12`.
2. Add repository secrets: `APPLE_CERTIFICATE` (the `.p12`, base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY` (the certificate's name, e.g. `Developer ID Application: Name (TEAMID)`), and for notarization either an App Store Connect API key (`APPLE_API_ISSUER`, `APPLE_API_KEY`, and the `.p8` file written to `APPLE_API_KEY_PATH`) or an Apple ID (`APPLE_ID`, `APPLE_PASSWORD` as an app-specific password, `APPLE_TEAM_ID`).
3. Pass those secrets as `env:` on the macOS build step of `release.yml`. `APPLE_SIGNING_IDENTITY` replaces the `"-"` in `tauri.macos.conf.json`; without it, Tauri stops with an error, because it looks for the identity's name in the certificate and `-` isn't there. Tauri signs, notarizes and staples during `tauri build`.

Windows (so SmartScreen stops warning):

- An OV or EV code-signing certificate from a certificate authority, or Azure Artifact Signing (a monthly Azure subscription; formerly Trusted Signing). Either way the signing runs from `bundle > windows > signCommand` in `tauri.windows.conf.json` (a command with `%1` where the file goes), with its credentials as secrets on the Windows build step. Certificates bought before June 2023 can use `certificateThumbprint` instead.

Tauri's guides: <https://v2.tauri.app/distribute/sign/macos/> and <https://v2.tauri.app/distribute/sign/windows/>.

## Smoke test on Windows

Run on a Windows 10 or 11 PC with the release's installers or the `boleiro-windows` artifact. Each step names what to look at.

1. Install with `Boleiro_<version>_x64-setup.exe` (per user, no admin). SmartScreen warns (unsigned); click More info → Run anyway. If WebView2 is missing (old Windows 10), the installer downloads it.
2. Launch Boleiro from the Start menu. The window has the game's own header instead of Windows' title bar: drag it by the header, and check minimise, maximise and close. On Windows 11 the paper is slightly translucent (Mica); on Windows 10 the desktop must not show through.
3. New game → pick a club → Começar carreira → Jogar rodada → Começar a rodada; let the round reach full time. The round's sounds play (crowd, whistles, goals).
4. Press F1–F9 and F5 in the hub: each opens a game screen; F5 must not reload the app and F3 must not open a find bar. Ctrl+R, Ctrl+P, Ctrl+F and Alt+← must do nothing, in the hub and mid-round. In Opções → Créditos, click a sound's or a logo's name: its page opens in the default browser.
5. Switch Opções → Tema between claro and escuro and drag the window's corner to grow it fast in each: the new area shows the theme's paper colour, never a white or cream band.
6. Ctrl+S to save. In Explorer open `%APPDATA%\com.lucasnsaraujo.boleiro\saves\`: each slot is a folder holding `index.json` plus `game.<n>.json`, `session.<n>.json`, `world.<n>.json` and one `country-<id>.<n>.json` per country, and every file except `index.json` starts with `{"packed":1`.
7. Play another round and save again: only the changed shards get a new number, the old ones are gone, and `index.json` points at the new ones.
8. Close the window, launch again, click Continuar: the game opens on the same day with the same results.
9. Uninstall from Settings → Apps. The saves stay in `%APPDATA%\com.lucasnsaraujo.boleiro\`; delete that folder (and `%LOCALAPPDATA%\com.lucasnsaraujo.boleiro\`, WebView2's data) for a clean machine.

Repeat steps 1–3 with the `.msi` if it's the installer you plan to hand out.

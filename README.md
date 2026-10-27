# quest-log-spike

Throwaway test repo for Quest Log automation: spike **A0**
([lilmuckers/quest-log-actions#1](https://github.com/lilmuckers/quest-log-actions/issues/1)) plus a
real Web Push from end to end. Safe to delete once the findings are written back into
`plans/README.md` (D7, D12, D13). The secrets here are dummies or spike-only keys.

| Piece | What it tests |
|---|---|
| `.github/workflows/quest.yml` | The real stub on `lilmuckers/quest-log-actions@main`: validate, check run, PR comment |
| `.github/workflows/a0-probe.yml` | D12 secrets via `toJSON(secrets)` into a composite action, masking, the stub's token permissions, D7 core download timing, and a `quest-status` artifact |
| `site/` on [Pages](https://lilmuckers.github.io/quest-log-spike/) | Subscribe a device, register it in `spike/notify.json`, log arrivals; [`artifacts.html`](https://lilmuckers.github.io/quest-log-spike/artifacts.html) tests the D13 browser download under the app's CSP |
| `.github/workflows/send-push.yml` | Sends a push to every registered device with the notify module's settings (aes128gcm, VAPID, TTL 12h) |

Secrets: `QUEST_FOO` and `OTHER_BAR` (dummies), `QUEST_VAPID_PRIVATE_KEY` (spike-only; its public
half is `site/vapid.json`).

## Device test (by hand)

On each of **Android Chrome**, **desktop Chrome**, **Firefox** and **iOS Safari**:

1. Open <https://lilmuckers.github.io/quest-log-spike/>.
   - iPhone/iPad: Share → **Add to Home Screen**, then open **Quest Spike** from the home screen.
     Push only works there.
2. Check the **VAPID key check** line is ✅.
3. **Allow notifications and subscribe.** Then **Show a local test notification**: it should
   appear (this needs no server).
4. Paste a fine-grained token (this repo only, **Contents: read and write**) and **Save device
   to repo**. Or copy the device JSON and send it over.
5. Actions → **Send push** → Run workflow. Optionally set `only` to the device id.
6. Record for each device:
   - did it arrive, and the delay shown in **Received** (screen on, and again with the phone
     locked or the browser closed)
   - does tapping it open the page with "Opened from a notification click"
   - the push service host in the job summary
7. Expiry: **Unsubscribe** on one device, run **Send push** again, and check the summary shows
   404/410 and `expiredDevices` lists it.

## Other checks

- **Fork PR (D12):** from another account, fork and open a PR. The A0 probe should report no
  secrets and the stub should still validate, with annotations instead of a check run.
- **Artifact download (D13):** open `artifacts.html`, paste a token with Actions read, run the
  test. It records whether the zip download works under the app's CSP, and the redirect host.

## Results

| Check | Result |
|---|---|
| D12 secrets reach a composite action | |
| D12 values masked | |
| D12 same-repo PR | |
| D12 fork PR | |
| Stub token: checks / contents / pull-requests write | |
| D7 pointer + asset download from runner | |
| D13 artifact download from browser | |
| Push: Android Chrome | |
| Push: desktop Chrome | |
| Push: Firefox | |
| Push: iOS home screen | |
| 404/410 on an unsubscribed device | |

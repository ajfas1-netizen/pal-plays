# PAL Plays

A phone logger for Martin County PAL's Director of Strategic Growth, and a weekly dashboard for the executive director.

- `log/`: the phone app. Start a play, tap as things happen, end the play. Works with no signal and saves when the phone reconnects.
- `dashboard/`: the weekly view. Shows plays by day, Power Hour on every workday, numbers against targets, where the chain from touches to pledges breaks, and year one pace.
- `apps-script/Code.gs`: the data service. It runs in Google Apps Script and is the only thing that reads or writes the Google Sheet.
- `shared/config.js`: the data service URL. It isn't secret.
- `test/`: an end-to-end check against mocked Google services. Run `node test/run.js` with Playwright installed.

## How access works

Each screen opens from a private link that carries a key after `#k=`. The key never reaches GitHub and isn't in this repo. Without a valid key, the screens show only "Open this from the private link AJ sent you." The Google Sheet isn't shared with anyone.

The app sends no email and no notifications, and runs no scheduled jobs.

## Changing things

- **Add or retire a play:** in the Google Sheet, Play List tab. No code change.
- **Change the screens:** edit `log/` or `dashboard/` and push. GitHub Pages updates within about a minute.
- **Change the data service:** paste the new `Code.gs` into Apps Script, then Deploy, Manage deployments, edit, New version. The URL stays the same.

Setup steps are in [SETUP.md](SETUP.md).

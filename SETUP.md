# One-time setup

About 15 minutes. Do the Google steps signed in to the account that should own the data.

## 1. Google Apps Script

1. Go to script.google.com, click **New project**, and name it **PAL Plays**.
2. Delete what's in the editor and paste in `apps-script/Code.gs`. Click **Save**.
3. In the function menu at the top, choose **setup** and click **Run**. Approve the permissions: Review permissions, pick your account, Advanced, Go to PAL Plays, Allow.
   This creates a Google Sheet called **PAL Strategic Growth Data** in your Drive. Don't share it.
4. Click **Deploy**, then **New deployment**. Click the gear and choose **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy**.
5. Choose **showLinks** in the function menu and click **Run**. The execution log shows three lines:
   - **Data service URL**: use the Web app URL from Deploy, Manage deployments. It ends in `/exec`. Paste it into `shared/config.js`. A URL ending in `/dev` only works for you.
   - **Megan (logger)**: send to Megan only.
   - **Noel (dashboard)**: send to Noel only. Bookmark it yourself too.

## 2. GitHub Pages

In the repo on GitHub: **Settings**, **Pages**, Source **Deploy from a branch**, Branch **main**, folder **/ (root)**, **Save**. The site is live at `https://ajfas1-netizen.github.io/pal-plays/` within a minute or two.

## 3. Phones

- **Megan:** open the link on her phone. iPhone: Safari, Share, Add to Home Screen. Android: Chrome menu, Add to Home screen. It opens full screen like an app from then on.
- **Noel:** bookmark the dashboard link. Enter Megan's starting balance (incremental dollars since May 1, from GiveButter) at the bottom and click Save targets.

## If a link is ever shared by mistake

Run **resetLinks** in Apps Script. Both old links stop working, and the log shows new ones. Megan re-adds hers to her home screen.

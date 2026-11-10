// The only script on the landing page. Before the landing page existed, the app lived at "/" and its
// pages were links like "/#/subscriptions". Send those (and only those) to the app, so old bookmarks and
// shared links keep working. The demo flag lives in localStorage on the same origin, so it carries over.
if (/^#\//.test(window.location.hash)) {
  window.location.replace(`/app.html${window.location.hash}`);
}

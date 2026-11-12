// The only script on /app.html. The app used to live at /app (app.html) and the landing page at "/". Now there is one page, at "/":
// the app opens on the Welcome page when the browser has no data. Old links, bookmarks and "/app?demo=1" land on "/" with the
// same query and "#/…" part, so they keep working.
window.location.replace(`/${window.location.search}${window.location.hash}`);

// Google Apps Script — watches the Bookings sheet and tells the website to
// email the guest at two moments:
//   - when Status is changed to "confirmed"  -> "you're approved, pay via
//     Swish/faktura/PayPal" email
//   - when Betald (paid) gets checked        -> "payment received, all
//     set" email
//
// SETUP (one-time):
// 1. Open the Google Sheet → Extensions → Apps Script.
// 2. Delete whatever's in the editor and paste this whole file in.
// 3. Update WEBHOOK_URL below if your domain isn't www.smtc.se.
// 4. Replace WEBHOOK_SECRET below with the same value as the
//    CONFIRM_WEBHOOK_SECRET environment variable in Vercel.
// 5. Save (the disk icon / Cmd+S).
// 6. In the left sidebar, click the clock icon ("Triggers").
// 7. Click "+ Add Trigger" (bottom right), and set:
//      Function to run:        onBookingSheetEdit
//      Event source:           From spreadsheet
//      Event type:             On edit
//    Save.
// 8. Google will ask you to authorize the script the first time — this is
//    normal (it needs permission to make a web request to the site when a
//    row changes). Review and allow it.
//
// Make sure column M in the sheet is called "Betald" and has an actual
// checkbox on it (select the column's data range → Insert → Checkbox, or
// Data → Data validation → Checkbox) so ticking it is a single click.

var WEBHOOK_URL = "https://www.smtc.se/api/confirm";
var WEBHOOK_SECRET = "REPLACE_WITH_CONFIRM_WEBHOOK_SECRET_VALUE"; // must match the CONFIRM_WEBHOOK_SECRET env var in Vercel
var SHEET_NAME = "Bookings";
var STATUS_COLUMN = 2; // column B
var PAID_COLUMN = 13; // column M

function onBookingSheetEdit(e) {
  if (!e || !e.range) return;

  var sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;

  var col = e.range.getColumn();
  var row = e.range.getRow();
  if (row < 2) return; // header row, ignore

  if (col === STATUS_COLUMN) {
    var newStatus = (e.value || "").toString().trim().toLowerCase();
    var oldStatus = (e.oldValue || "").toString().trim().toLowerCase();
    // Only fire on the transition *into* confirmed, not every edit of an
    // already-confirmed row.
    if (newStatus === "confirmed" && oldStatus !== "confirmed") {
      callWebhook(row, "confirmed");
    }
    return;
  }

  if (col === PAID_COLUMN) {
    var newPaid = e.value === true || e.value === "TRUE";
    var oldPaid = e.oldValue === true || e.oldValue === "TRUE";
    // Only fire on the transition *into* paid, not on every edit.
    if (newPaid && !oldPaid) {
      callWebhook(row, "paid");
    }
    return;
  }
}

function callWebhook(row, event) {
  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: "post",
    contentType: "application/json",
    headers: { "X-Webhook-Secret": WEBHOOK_SECRET },
    payload: JSON.stringify({ row: row, event: event }),
    muteHttpExceptions: true,
  });
}

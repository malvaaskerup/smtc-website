// Shared helper: talks to a Google Sheet used as the "booking database" and
// simple admin system. Fredric opens the sheet, sees new rows with
// status "pending", and edits the Status cell to "confirmed" (or
// "cancelled" to release the dates again). No extra admin UI needed.
//
// Required environment variables (set in Vercel → Project → Settings →
// Environment Variables):
//   GOOGLE_SERVICE_ACCOUNT_EMAIL   e.g. smtc-booking@your-project.iam.gserviceaccount.com
//   GOOGLE_PRIVATE_KEY             the service account's private key (keep the \n's, see SETUP.md)
//   GOOGLE_SHEET_ID                the long id from the sheet's URL
//   GOOGLE_SHEET_NAME (optional)   defaults to "Bookings"

const { google } = require("googleapis");

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEET_NAME || "Bookings";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !key || !SHEET_ID) {
    throw new Error(
      "Missing Google Sheets config (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY / GOOGLE_SHEET_ID)."
    );
  }
  return new google.auth.JWT(email, null, key, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);
}

async function getSheetsClient() {
  const auth = getAuth();
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

// Row layout (header row in the sheet, row 1):
// Timestamp | Status | Package | Startdatum | Slutdatum | Nätter | Namn | E-post | Telefon | Meddelande | Pris | ID
async function getAllBookings() {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:L`,
  });
  const rows = res.data.values || [];
  return rows.map((r, i) => ({
    row: i + 2,
    timestamp: r[0] || "",
    status: r[1] || "",
    package: r[2] || "",
    startDate: r[3] || "",
    endDate: r[4] || "",
    nights: r[5] || "",
    name: r[6] || "",
    email: r[7] || "",
    phone: r[8] || "",
    message: r[9] || "",
    price: r[10] || "",
    id: r[11] || "",
  }));
}

async function appendBooking(booking) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!A2:L`,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [
        [
          booking.timestamp,
          booking.status,
          booking.package,
          booking.startDate,
          booking.endDate,
          booking.nights,
          booking.name,
          booking.email,
          booking.phone,
          booking.message,
          booking.price,
          booking.id,
        ],
      ],
    },
  });
}

module.exports = { getAllBookings, appendBooking };

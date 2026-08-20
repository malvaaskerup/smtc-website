// POST /api/book
// Validates a booking request, double-checks the dates are still free
// (in case two people were looking at the calendar at once), saves it to
// the Google Sheet as "pending", and emails Fredric via Resend.
const { getAllBookings, appendBooking } = require("./_sheets");

const PACKAGES = {
  one: { label: "Dygnet (1 dygn)", nights: 1, price: "2.495 kr" },
  two: { label: "Tvådygnare (2 dygn)", nights: 2, price: "4.995 kr" },
  three: { label: "Tredygnare (3 dygn)", nights: 3, price: "6.995 kr" },
  four: { label: "Fyrdygnare (4 dygn)", nights: 4, price: "8.995 kr" },
};

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function sendNotificationEmail(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  const from =
    process.env.BOOKING_FROM_EMAIL || "SMTC bokning <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.warn("RESEND_API_KEY or NOTIFY_EMAIL missing — skipping email.");
    return;
  }

  const html = `
    <h2>Ny bokningsförfrågan – SMTC</h2>
    <p><strong>Paket:</strong> ${booking.package}</p>
    <p><strong>Datum:</strong> ${booking.startDate} till ${booking.endDate}</p>
    <p><strong>Pris:</strong> ${booking.price}</p>
    <p><strong>Namn:</strong> ${booking.name}</p>
    <p><strong>E-post:</strong> ${booking.email}</p>
    <p><strong>Telefon:</strong> ${booking.phone || "–"}</p>
    <p><strong>Meddelande:</strong><br>${(booking.message || "–").replace(/\n/g, "<br>")}</p>
    <p>Status: <strong>väntar på bekräftelse</strong>. Bekräfta genom att ändra
    status till "confirmed" i bokningsarket.</p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Ny bokningsförfrågan – ${booking.package}`,
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error:", await res.text());
  }
}

// Sent to the person who booked, confirming their *request* arrived — not
// that Fredric has approved it yet (that still only happens when he changes
// the Status cell in the sheet). Keeps them from wondering if the form
// actually worked.
async function sendGuestReceipt(booking) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.BOOKING_FROM_EMAIL || "SMTC bokning <onboarding@resend.dev>";

  if (!apiKey || !booking.email) {
    console.warn("RESEND_API_KEY or booking email missing — skipping guest receipt.");
    return;
  }

  const html = `
    <p>Hej ${booking.name}!</p>
    <p>Tack för din bokningsförfrågan hos SMTC Ekeberg. Vi har tagit emot
    den och dina datum är preliminärbokade:</p>
    <p><strong>Paket:</strong> ${booking.package}<br>
    <strong>Datum:</strong> ${booking.startDate} till ${booking.endDate}<br>
    <strong>Pris:</strong> ${booking.price}</p>
    <p>Vi återkommer och bekräftar din bokning så snart som möjligt. Hör av
    dig om du har några frågor under tiden.</p>
    <p><strong>Betalning:</strong><br>
    Betalning sker med faktura eller Företagsswish, innan ankomst — om
    inget annat överenskommits. Moms med 6% ingår för privatpersoner, men
    läggs på över totalsumman för företag.<br>
    För betalningar från utlandet går det bra med PayPal (sök på Fredric
    Askerup, eller användarnamnet fredricaskerup).<br>
    Vi hör av oss med betalningsuppgifter/faktura när bokningen är
    bekräftad.</p>
    <p>Hälsningar,<br>SMTC Ekeberg<br><br>
    Fredric Askerup, Lic Medicinsk tränare, vid Stenebys Medicinska Träningscentrum (SMTC).<br>
    <a href="tel:+46739133177">+46 73 913 31 77</a><br>
    <a href="mailto:fredricaskerup@gmail.com">fredricaskerup@gmail.com</a><br>
    <a href="https://www.google.com/maps/place/Ekeberg/@58.9294654,12.1894925,15z/data=!3m1!4b1!4m6!3m5!1s0x46448d0027628527:0x1288809db24e27fd!8m2!3d58.9294658!4d12.1997708!16s%2Fg%2F11njn0t886?entry=ttu&g_ep=EgoyMDI2MDcyOS4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
    Taxviken Ekeberg 1, 66694 Dals Långed, Sverige</a><br>
    <a href="https://www.smtc.se/">smtc.se</a>
    </p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: booking.email,
      subject: "Din bokningsförfrågan hos SMTC Ekeberg är mottagen",
      html,
    }),
  });

  if (!res.ok) {
    console.error("Resend error (guest receipt):", await res.text());
  }
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { packageKey, startDate, name, email, phone, message } =
      req.body || {};

    const pkg = PACKAGES[packageKey];
    if (!pkg || !startDate || !name || !email) {
      res.status(400).json({
        error: "Fyll i alla obligatoriska fält.",
        code: "missing_fields",
      });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      res.status(400).json({ error: "Ogiltigt datum.", code: "invalid_date" });
      return;
    }

    const endDate = addDays(startDate, pkg.nights);

    const existing = await getAllBookings();
    const clash = existing.some((b) => {
      if ((b.status || "").toLowerCase() === "cancelled") return false;
      if (!b.startDate || !b.endDate) return false;
      return overlaps(startDate, endDate, b.startDate, b.endDate);
    });
    if (clash) {
      res.status(409).json({
        error: "Valda datum är tyvärr redan bokade. Välj andra datum.",
        code: "date_conflict",
      });
      return;
    }

    const booking = {
      timestamp: new Date().toISOString(),
      status: "pending",
      package: pkg.label,
      startDate,
      endDate,
      nights: pkg.nights,
      name,
      email,
      phone: phone || "",
      message: message || "",
      price: pkg.price,
      id: `${Date.now()}`,
    };

    await appendBooking(booking);
    // Neither of these should ever block the booking itself — the request
    // is already saved at this point. Run them, but don't let a Resend
    // hiccup turn a successful booking into a 500 for the guest.
    await Promise.all([
      sendNotificationEmail(booking).catch((err) =>
        console.error("Failed to email Fredric:", err)
      ),
      sendGuestReceipt(booking).catch((err) =>
        console.error("Failed to email guest receipt:", err)
      ),
    ]);

    res.status(200).json({ ok: true, startDate, endDate });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Något gick fel. Försök igen eller maila oss direkt.",
      code: "server_error",
    });
  }
};

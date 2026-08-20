// POST /api/confirm
//
// This is NOT called by the website — it's called by a small Google Apps
// Script trigger bound to the booking sheet (see
// apps-script-confirm-trigger.js), which fires whenever Fredric edits the
// Status or Betald (paid) column. Two separate emails go out at two
// separate moments:
//
//   1. Status changes to "confirmed"  ->  "you're approved, here's how to
//      pay" email, with the Swish/invoice/PayPal details.
//   2. Betald gets checked (paid)     ->  "payment received, you're all
//      set" email — no payment instructions repeated, since they've
//      already paid.
//
// Splitting it this way (rather than one email once both are true) is
// deliberate: the guest needs the payment instructions *before* they can
// pay, and the "fully confirmed" receipt only makes sense *after* Fredric
// has actually seen the payment land.
//
// Protected by a shared secret (CONFIRM_WEBHOOK_SECRET) so random people
// can't hit this URL and spam guests — the Apps Script sends the same
// secret in a header on every call.

const { getAllBookings } = require("./_sheets");

function hasValidSecret(req) {
  const expected = process.env.CONFIRM_WEBHOOK_SECRET;
  const provided =
    req.headers["x-webhook-secret"] || (req.body && req.body.secret);
  return Boolean(expected) && provided === expected;
}

async function sendEmail(booking, subject, html) {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.BOOKING_FROM_EMAIL || "SMTC bokning <onboarding@resend.dev>";

  if (!apiKey || !booking.email) {
    console.warn("RESEND_API_KEY or booking email missing — skipping email.");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: booking.email, subject, html }),
  });

  if (!res.ok) {
    console.error(`Resend error (${subject}):`, await res.text());
  }
}

// Sent when Fredric changes Status to "confirmed". Tells the guest they're
// approved and how to pay.
async function sendApprovedEmail(booking) {
  const html = `
    <p>Hej ${booking.name}!</p>
    <p>Din bokning hos SMTC Ekeberg är <strong>bekräftad</strong> från vår
    sida:</p>
    <p><strong>Paket:</strong> ${booking.package}<br>
    <strong>Datum:</strong> ${booking.startDate} till ${booking.endDate}<br>
    <strong>Pris:</strong> ${booking.price}</p>
    <p><strong>Betalning:</strong><br>
    Faktura eller Företagsswish, innan ankomst — om inget annat
    överenskommits. Moms med 6% ingår för privatpersoner, men läggs på
    över totalsumman för företag.<br><br>
    <strong>Swish till Fredric Askerup:</strong> <a href="tel:+46739133177">+46 73 913 31 77</a><br><br>
    För betalningar från utlandet går det bra med PayPal (sök på Fredric
    Askerup, eller användarnamnet fredricaskerup).</p>
    <p>Så snart betalningen är registrerad hos oss skickar vi en sista
    bekräftelse — sen är allt klart!</p>
    <p>Hälsningar,<br>SMTC Ekeberg<br><br>
    Fredric Askerup, Lic Medicinsk tränare, vid Stenebys Medicinska Träningscentrum (SMTC).<br>
    <a href="tel:+46739133177">+46 73 913 31 77</a><br>
    <a href="mailto:fredricaskerup@gmail.com">fredricaskerup@gmail.com</a><br>
    <a href="https://www.google.com/maps/place/Ekeberg/@58.9294654,12.1894925,15z/data=!3m1!4b1!4m6!3m5!1s0x46448d0027628527:0x1288809db24e27fd!8m2!3d58.9294658!4d12.1997708!16s%2Fg%2F11njn0t886?entry=ttu&g_ep=EgoyMDI2MDcyOS4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
    Taxviken Ekeberg 1, 66694 Dals Långed, Sverige</a><br>
    <a href="https://www.smtc.se/">smtc.se</a>
    </p>
  `;
  await sendEmail(
    booking,
    "Din bokning hos SMTC Ekeberg är bekräftad — så betalar du",
    html
  );
}

// Sent when Fredric ticks "Betald" (after Status is already "confirmed").
// Just a receipt — no payment instructions, since they've already paid.
async function sendPaidEmail(booking) {
  const html = `
    <p>Hej ${booking.name}!</p>
    <p>Tack — vi har registrerat din betalning. Din bokning hos SMTC
    Ekeberg är nu <strong>helt klar</strong>:</p>
    <p><strong>Paket:</strong> ${booking.package}<br>
    <strong>Datum:</strong> ${booking.startDate} till ${booking.endDate}<br>
    <strong>Pris:</strong> ${booking.price}</p>
    <p>Välkommen till SMTC Ekeberg! Hör av dig om du har några frågor
    innan din vistelse.</p>
    <p>Hälsningar,<br>SMTC Ekeberg<br><br>
    Fredric Askerup, Lic Medicinsk tränare, vid Stenebys Medicinska Träningscentrum (SMTC).<br>
    <a href="tel:+46739133177">+46 73 913 31 77</a><br>
    <a href="mailto:fredricaskerup@gmail.com">fredricaskerup@gmail.com</a><br>
    <a href="https://www.google.com/maps/place/Ekeberg/@58.9294654,12.1894925,15z/data=!3m1!4b1!4m6!3m5!1s0x46448d0027628527:0x1288809db24e27fd!8m2!3d58.9294658!4d12.1997708!16s%2Fg%2F11njn0t886?entry=ttu&g_ep=EgoyMDI2MDcyOS4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noopener noreferrer">
    Taxviken Ekeberg 1, 66694 Dals Långed, Sverige</a><br>
    <a href="https://www.smtc.se/">smtc.se</a>
    </p>
  `;
  await sendEmail(
    booking,
    "Betalning mottagen — din bokning hos SMTC Ekeberg är klar",
    html
  );
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!hasValidSecret(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const row = Number(req.body && req.body.row);
    const event = req.body && req.body.event; // "confirmed" | "paid"
    if (!row || !["confirmed", "paid"].includes(event)) {
      res.status(400).json({ error: "Missing/invalid row or event" });
      return;
    }

    const bookings = await getAllBookings();
    const booking = bookings.find((b) => b.row === row);
    if (!booking) {
      res.status(404).json({ error: "Row not found" });
      return;
    }

    const status = (booking.status || "").toLowerCase();

    if (event === "confirmed") {
      if (status !== "confirmed") {
        res.status(200).json({ ok: true, skipped: "status no longer confirmed" });
        return;
      }
      await sendApprovedEmail(booking);
    } else {
      // event === "paid"
      if (status !== "confirmed" || !booking.paid) {
        res.status(200).json({ ok: true, skipped: "not confirmed+paid" });
        return;
      }
      await sendPaidEmail(booking);
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
};

// GET /api/availability
// Returns the date ranges that are already pending or confirmed, so the
// calendar on prices.html can grey them out. "end" is exclusive
// (checkout day), matching how the calendar highlights nights.
const { getAllBookings } = require("./_sheets");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const bookings = await getAllBookings();
    const blocked = bookings
      .filter((b) => (b.status || "").toLowerCase() !== "cancelled")
      .filter((b) => b.startDate && b.endDate)
      .map((b) => ({ start: b.startDate, end: b.endDate }));

    res.status(200).json({ blocked });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not load availability" });
  }
};

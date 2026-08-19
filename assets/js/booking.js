// Simple booking calendar for prices.html.
// Vanilla JS, no dependencies — matches the rest of the site.
//
// Flow: pick a package -> pick a check-in date in the calendar (nights are
// highlighted automatically) -> fill in contact details -> submit.
// On submit this POSTs to /api/book, a Vercel serverless function that
// checks the dates are still free, saves the request as "pending" in a
// Google Sheet, and emails Fredric. The booking is "prebooked" the moment
// it's saved (it blocks those dates for everyone else) until Fredric
// changes its status to "confirmed" (or "cancelled") in the sheet.

(function () {
  var PACKAGE_NIGHTS = { one: 1, two: 2, three: 3, four: 4 };

  var form = document.getElementById("booking-form");
  if (!form) return; // booking widget isn't on this page

  var packageSelect = document.getElementById("package");
  var calGrid = document.getElementById("cal-grid");
  var monthLabel = document.getElementById("cal-month-label");
  var prevBtn = document.getElementById("cal-prev");
  var nextBtn = document.getElementById("cal-next");
  var summaryEl = document.getElementById("booking-summary");
  var statusEl = document.getElementById("booking-status");
  var submitBtn = document.getElementById("booking-submit");

  var today = new Date();
  today.setHours(0, 0, 0, 0);

  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // 0-based

  var selectedStart = null; // "YYYY-MM-DD"
  var blockedRanges = []; // [{start, end}], end is exclusive (checkout day)

  // Single-letter headers (M T O T F L S), full names kept as a tooltip.
  // Columns are Monday-first to match the business's own week (index 0 =
  // Monday .. index 6 = Sunday).
  var WEEKDAYS = [
    { short: "M", full: "Måndag" },
    { short: "T", full: "Tisdag" },
    { short: "O", full: "Onsdag" },
    { short: "T", full: "Torsdag" },
    { short: "F", full: "Fredag" },
    { short: "L", full: "Lördag" },
    { short: "S", full: "Söndag" },
  ];

  // SMTC only takes check-ins Wednesday–Sunday (see prices.html), so the
  // Monday/Tuesday columns (index 0, 1) are always left blank rather than
  // shown as disabled dates. Adjust here if that ever changes.
  var CLOSED_COLUMNS = [0, 1];

  var MONTHS = [
    "Januari", "Februari", "Mars", "April", "Maj", "Juni",
    "Juli", "Augusti", "September", "Oktober", "November", "December",
  ];

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function toISO(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function fromISO(str) {
    var parts = str.split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function addDays(date, days) {
    var d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function currentNights() {
    return PACKAGE_NIGHTS[packageSelect.value] || 0;
  }

  function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }

  function isBlocked(dateISO) {
    return blockedRanges.some(function (r) {
      return dateISO >= r.start && dateISO < r.end;
    });
  }

  function isRangeFree(startISO, nights) {
    var end = addDays(fromISO(startISO), nights);
    var endISO = toISO(end);
    return !blockedRanges.some(function (r) {
      return rangesOverlap(startISO, endISO, r.start, r.end);
    });
  }

  function isSelectableStart(date) {
    var day = date.getDay(); // 0 Sun .. 6 Sat
    if (day === 1 || day === 2) return false; // Mon/Tue — not offered
    if (date < today) return false;

    var nights = currentNights();
    if (!nights) return true; // no package chosen yet — just show open days

    // No restriction here on whether the stay itself runs through Mon/Tue
    // — the only rule that matters is that new check-ins aren't offered
    // those two days, which is already handled above. A guest can still
    // book, say, a Saturday-start 4-night stay; the calendar just won't
    // show a colored cell for the 1-2 nights that land on the hidden
    // Mon/Tue columns (the check-in/checkout text below the calendar
    // always states the correct full dates regardless).
    return isRangeFree(toISO(date), nights);
  }

  function renderWeekdayHeader() {
    var row = document.getElementById("cal-weekdays");
    row.innerHTML = "";
    WEEKDAYS.forEach(function (w) {
      var th = document.createElement("th");
      th.textContent = w.short;
      th.title = w.full;
      row.appendChild(th);
    });
  }

  function renderCalendar() {
    calGrid.innerHTML = "";
    monthLabel.textContent = MONTHS[viewMonth] + " " + viewYear;

    var firstOfMonth = new Date(viewYear, viewMonth, 1);
    var startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var totalCells = startOffset + daysInMonth;
    var totalRows = Math.ceil(totalCells / 7);

    var nights = currentNights();
    var rangeStartISO = selectedStart;
    var rangeEndISO =
      selectedStart && nights ? toISO(addDays(fromISO(selectedStart), nights)) : null;

    for (var row = 0; row < totalRows; row++) {
      var tr = document.createElement("tr");

      for (var col = 0; col < 7; col++) {
        var cellIndex = row * 7 + col;
        var dayNum = cellIndex - startOffset + 1;
        var td = document.createElement("td");

        var inMonth = dayNum >= 1 && dayNum <= daysInMonth;
        var isClosedColumn = CLOSED_COLUMNS.indexOf(col) !== -1;

        if (!inMonth || isClosedColumn) {
          td.className = "cal-day--empty";
          tr.appendChild(td);
          continue;
        }

        var date = new Date(viewYear, viewMonth, dayNum);
        var iso = toISO(date);

        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cal-day";
        btn.textContent = String(dayNum);
        btn.dataset.date = iso;

        var selectable = isSelectableStart(date);
        var blocked = isBlocked(iso);
        // Exclusive of the checkout date (iso < rangeEndISO): checkout
        // isn't an occupied night, and now that isSelectableStart keeps
        // every stay within Wed–Sun, the nights themselves are always
        // fully visible — so this reliably highlights exactly `nights`
        // cells, matching the chosen package.
        var inSelectedRange =
          rangeStartISO && rangeEndISO && iso >= rangeStartISO && iso < rangeEndISO;

        if (blocked) btn.classList.add("cal-day--blocked");
        if (!selectable) btn.disabled = true;
        if (inSelectedRange) td.classList.add("cal-day--in-range");
        if (iso === rangeStartISO) btn.classList.add("cal-day--selected");

        btn.addEventListener("click", function () {
          if (!currentNights()) {
            statusEl.textContent = "Välj ett paket först.";
            return;
          }
          selectedStart = this.dataset.date;
          renderCalendar();
          renderSummary();
        });

        td.appendChild(btn);
        tr.appendChild(td);
      }

      calGrid.appendChild(tr);
    }
  }

  function formatDate(date) {
    return date.toLocaleDateString("sv-SE", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function renderSummary() {
    var nights = currentNights();
    if (!selectedStart || !nights) {
      summaryEl.hidden = true;
      return;
    }
    var start = fromISO(selectedStart);
    var end = addDays(start, nights);
    var opt = packageSelect.options[packageSelect.selectedIndex];
    var price = opt ? opt.dataset.price : "";
    var label = opt ? opt.textContent.split(" – ")[0] : "";

    summaryEl.hidden = false;
    summaryEl.textContent =
      label + ": incheck " + formatDate(start) + " kl 14, utcheck " +
      formatDate(end) + " kl 12" + (price ? " — " + price : "");
  }

  function loadAvailability() {
    fetch("/api/availability")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        blockedRanges = (data && data.blocked) || [];
        renderCalendar();
      })
      .catch(function () {
        // If this fails the calendar still works — the server re-checks
        // for clashes when the form is submitted either way.
      });
  }

  prevBtn.addEventListener("click", function () {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    renderCalendar();
  });

  nextBtn.addEventListener("click", function () {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderCalendar();
  });

  packageSelect.addEventListener("change", function () {
    selectedStart = null;
    renderCalendar();
    renderSummary();
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusEl.textContent = "";

    if (!packageSelect.value) {
      statusEl.textContent = "Välj ett paket.";
      return;
    }
    if (!selectedStart) {
      statusEl.textContent = "Välj ett incheckningsdatum i kalendern.";
      return;
    }

    var name = document.getElementById("b-name").value.trim();
    var email = document.getElementById("b-email").value.trim();
    var phone = document.getElementById("b-phone").value.trim();
    var message = document.getElementById("b-message").value.trim();

    if (!name || !email) {
      statusEl.textContent = "Fyll i namn och e-post.";
      return;
    }

    submitBtn.disabled = true;
    statusEl.textContent = "Skickar...";

    fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        packageKey: packageSelect.value,
        startDate: selectedStart,
        name: name,
        email: email,
        phone: phone,
        message: message,
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        submitBtn.disabled = false;
        if (!result.ok) {
          statusEl.textContent = (result.data && result.data.error) || "Något gick fel. Försök igen.";
          return;
        }
        statusEl.textContent =
          "Tack! Din bokningsförfrågan är mottagen och preliminärbokad. Vi bekräftar den så snart som möjligt.";
        form.reset();
        selectedStart = null;
        summaryEl.hidden = true;
        loadAvailability(); // refresh blocked dates so no one else can double-book
      })
      .catch(function () {
        submitBtn.disabled = false;
        statusEl.textContent = "Kunde inte skicka. Kontrollera din uppkoppling och försök igen.";
      });
  });

  renderWeekdayHeader();
  renderCalendar();
  loadAvailability();
})();

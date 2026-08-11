// we make sure the JavaScript file loads after our HTML by using a function test if the HTML is loaded

function docReady(fn) {
  // see if DOM is already available
  if (document.readyState === "complete" || document.readyState === "interactive") {
      // call on next available tick
      setTimeout(fn, 1);
  } else {
      document.addEventListener("DOMContentLoaded", fn);
  }
}

// Turns a Sanity Portable Text array into the plain HTML this site already
// uses inside .content — <p>, <h2>, <h3>, <p class="quote">, <a>, <strong>,
// <em>. No build step here, so this is a small hand-written serializer
// instead of an npm package.
function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return "";

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderSpan(child, markDefs) {
    var text = escapeHtml(child.text || "").replace(/\n/g, "<br>");
    (child.marks || []).forEach(function (mark) {
      if (mark === "strong") {
        text = "<strong>" + text + "</strong>";
      } else if (mark === "em") {
        text = "<em>" + text + "</em>";
      } else {
        var def = (markDefs || []).filter(function (d) {
          return d._key === mark;
        })[0];
        if (def && def._type === "link" && def.href) {
          text = '<a href="' + escapeHtml(def.href) + '">' + text + "</a>";
        }
      }
    });
    return text;
  }

  return blocks
    .map(function (block) {
      if (block._type !== "block") return "";
      var inner = (block.children || [])
        .map(function (child) {
          return renderSpan(child, block.markDefs);
        })
        .join("");

      switch (block.style) {
        case "h2":
          return "<h2>" + inner + "</h2>";
        case "h3":
          return "<h3>" + inner + "</h3>";
        case "blockquote":
          return '<p class="quote">' + inner + "</p>";
        default:
          return "<p>" + inner + "</p>";
      }
    })
    .join("\n");
}

docReady(function () {

	// ----- Language switch + Sanity content -----

	var langButtons = document.querySelectorAll(".lang-option");
	var contentEl = document.querySelector(".content");
	var pageId = document.body.getAttribute("data-page");
	var pageData = null; // filled in once the Sanity fetch resolves

	function applyStoredLangToButtons() {
		var storedLang = localStorage.getItem("smtc-lang") || "swe";
		langButtons.forEach(function (btn) {
			btn.classList.toggle("lang-active", btn.dataset.lang === storedLang);
		});
		return storedLang;
	}

	function renderContent(lang) {
		if (!pageData || !contentEl) return;
		var blocks =
			lang === "eng" && pageData.contentEn && pageData.contentEn.length
				? pageData.contentEn
				: pageData.content;
		if (blocks && blocks.length) {
			contentEl.innerHTML = portableTextToHtml(blocks);
		}
		// if neither is present yet, the fallback HTML already in the page stays as-is
	}

	langButtons.forEach(function (button) {
		button.addEventListener("click", function () {
			langButtons.forEach(function (btn) {
				btn.classList.remove("lang-active");
			});
			button.classList.add("lang-active");

			var lang = button.dataset.lang; // "swe" or "eng"
			localStorage.setItem("smtc-lang", lang);
			renderContent(lang);
		});
	});

	var initialLang = applyStoredLangToButtons();

	// Only pages with a .content block and a data-page id fetch from Sanity —
	// harmless no-op everywhere else.
	if (contentEl && pageId && window.SanityClient) {
    var client = SanityClient.createClient({
			projectId: "36u8ecaa",
			dataset: "production",
			apiVersion: "2024-01-01",
			useCdn: true,
		});

		client
			.fetch('*[_type == "page" && pageId == $pageId][0]', { pageId: pageId })
			.then(function (data) {
				if (!data) return; // no Sanity content published yet — keep the page's own HTML
				pageData = data;
				renderContent(initialLang);
			});
	}

});
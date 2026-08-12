function docReady(fn) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
      setTimeout(fn, 1);
  } else {
      document.addEventListener("DOMContentLoaded", fn);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Turns a Sanity Portable Text array into the plain HTML this site already
// uses inside .content — <p>, <h2>, <h3>, <p class="quote">, <a>, <strong>,
// <em>. No build step here, so this is a small hand-written serializer
// instead of an npm package.
function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return "";

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

// Adds an invisible break opportunity after every "/" inside the given
// container's text, so long slash-joined words (like
// "sjukdomsförebyggande/motverkande") can wrap at the slash instead of the
// whole word jumping to the next line.
function addSoftBreaksAfterSlashes(container) {
  if (!container) return;
  var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  var node;
  while ((node = walker.nextNode())) {
    if (node.nodeValue.indexOf("/") !== -1) {
      node.nodeValue = node.nodeValue.replace(/\//g, "/\u200B");
    }
  }
}

docReady(function () {

	// ----- Lightbox: clicking any image inside .gallery or .page-gallery -----
	// opens an enlarged version in an overlay on top of the page.
	// Click the overlay, click the image again, or press Escape to close.
	// Uses event delegation (listening on document) so it also works on
	// .page-gallery images that get added later by the Sanity fetch below.

	var lightbox = document.createElement("div");
	lightbox.className = "lightbox";
	var lightboxImg = document.createElement("img");
	lightbox.appendChild(lightboxImg);
	document.body.appendChild(lightbox);

	function openLightbox(src, alt) {
		lightboxImg.src = src;
		lightboxImg.alt = alt || "";
		lightbox.classList.add("is-open");
	}

	function closeLightbox() {
		lightbox.classList.remove("is-open");
		lightboxImg.src = "";
	}

	document.addEventListener("click", function (e) {
		var img = e.target.closest(".gallery img, .page-gallery img");
		if (img) {
			openLightbox(img.src, img.alt);
		}
	});

	lightbox.addEventListener("click", closeLightbox);

	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") {
			closeLightbox();
		}
	});

	// ----- Language switch + Sanity content + Gallery -----

	var langButtons = document.querySelectorAll(".lang-option");
	var contentEl = document.querySelector(".content");
	var galleryEl = document.querySelector(".page-gallery");
	var pageId = document.body.getAttribute("data-page");
	var pageData = null; // filled in once the Sanity fetch resolves

	// Apply the slash soft-break fix once up front, to whatever's on the
	// page already (the fallback HTML, and .menu-body which never changes).
	document.querySelectorAll(".content, .menu-body").forEach(addSoftBreaksAfterSlashes);

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
			addSoftBreaksAfterSlashes(contentEl); // re-apply, since innerHTML just got replaced
		}
		// if neither is present yet, the fallback HTML already in the page stays as-is
	}

	function renderGallery(items) {
		if (!galleryEl || !items || !items.length) return;
		galleryEl.innerHTML = items
			.map(function (item) {
				var caption = item.caption
					? "<figcaption>" + escapeHtml(item.caption) + "</figcaption>"
					: "<figcaption></figcaption>";
				return (
					'<figure><img src="' +
					escapeHtml(item.imageUrl) +
					'" alt="">' +
					caption +
					"</figure>"
				);
			})
			.join("\n");
		// if no items come back yet, the hand-written <figure> tags already in the page stay as-is
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

	if (window.SanityClient) {
		var client = SanityClient.createClient({
			projectId: "36u8ecaa",
			dataset: "production",
			apiVersion: "2024-01-01",
			useCdn: true,
		});

		// Page content — only runs on pages with a .content block and a data-page id
		if (contentEl && pageId) {
			client
				.fetch('*[_type == "page" && pageId == $pageId][0]', { pageId: pageId })
				.then(function (data) {
					if (!data) return; // no Sanity content published yet — keep the page's own HTML
					pageData = data;
					renderContent(initialLang);
				});
		}

		// Gallery images — only runs on bookings.html, where .page-gallery exists
		if (galleryEl) {
			client
				.fetch(
					'*[_type == "galleryImage"] | order(order asc){caption, "imageUrl": image.asset->url}'
				)
				.then(function (items) {
					renderGallery(items);
				});
		}
	}

});
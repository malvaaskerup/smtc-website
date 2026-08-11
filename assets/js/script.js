


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



docReady(function() {

	// functions
	// go
	// here

	// Swaps which of the SWE/ENG footer buttons shows as underlined
	// on click. This is visual only for now — it doesn't change any
	// page text yet, since the actual English translations don't
	// exist. Harmless no-op on any page without a .lang-switch in
	// the footer.
	var langButtons = document.querySelectorAll(".lang-option");

	langButtons.forEach(function (button) {
		button.addEventListener("click", function () {
			langButtons.forEach(function (btn) {
				btn.classList.remove("lang-active");
			});
			button.classList.add("lang-active");
		});
	});

	// Adds an invisible break opportunity after every "/" inside
	// .content and .menu-body text, so long slash-joined words
	// (like "sjukdomsförebyggande/motverkande") can wrap at the
	// slash instead of the whole word jumping to the next line.
	document.querySelectorAll(".content, .menu-body").forEach(function (container) {
		var walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		var node;
		while ((node = walker.nextNode())) {
			if (node.nodeValue.indexOf("/") !== -1) {
				node.nodeValue = node.nodeValue.replace(/\//g, "/\u200B");
			}
		}
	});

});




// Lightbox: clicking any image inside .gallery or .page-gallery
	// opens an enlarged version in an overlay on top of the page.
	// Click the overlay, click the image again, or press Escape to close.
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

	document.querySelectorAll(".gallery img, .page-gallery img").forEach(function (img) {
		img.addEventListener("click", function () {
			openLightbox(img.src, img.alt);
		});
	});

	lightbox.addEventListener("click", closeLightbox);

	document.addEventListener("keydown", function (e) {
		if (e.key === "Escape") {
			closeLightbox();
		}
	});
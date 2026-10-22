(() => {
  "use strict";
  const entry = new URL("/inquiry/", location.origin);
  for (const [key, value] of new URLSearchParams(location.search)) {
    if (/^(ref|utm_[a-z_]+|gclid|fbclid|msclkid|n_[a-z_]+|NaPm)$/.test(key) && value.length <= 2048) {
      entry.searchParams.set(key, value);
    }
  }
  document.addEventListener("click", event => {
    const target = event.target.closest('a[href="#quote"], [data-inquiry-entry], [data-home-quote], .persistent-quote-button, .business-quote-button, .quote-focus-button');
    if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const destination = new URL(entry);
    const selection = target.closest("[data-inquiry-model]");
    if (selection) {
      for (const [name, key] of [["brand", "inquiryBrand"], ["model", "inquiryModel"], ["product", "inquiryProduct"], ["term", "inquiryTerm"], ["mileage", "inquiryMileage"]]) {
        if (selection.dataset[key]) destination.searchParams.set(name, selection.dataset[key]);
      }
      destination.searchParams.set("deposit", "0");
      destination.searchParams.set("prepayment", "0");
    }
    location.assign(destination.href);
  }, true);
  document.querySelectorAll('[data-inquiry-entry], a[href="#quote"]').forEach(link => { link.href = entry.href; });
})();

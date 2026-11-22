(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const entry = new URL("/inquiry/", location.origin);
  entry.searchParams.set("product", "RENTAL");
  if (params.getAll("ref").length > 1) entry.searchParams.set("ref", "");
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    if (/^(ref|utm_[a-z_]+|gclid|fbclid|msclkid|n_[a-z_]+|NaPm)$/.test(key) && values.length === 1 && values[0].length <= 2048) {
      entry.searchParams.set(key, values[0]);
    }
  }
  function destinationFor(target) {
    const destination = new URL(entry);
    if (target.hasAttribute("data-inquiry-catalog")) {
      destination.pathname = "/inquiry/steps.html";
      return destination;
    }
    const selection = target.closest("[data-inquiry-model]");
    if (selection) {
      for (const [name, key] of [["brand", "inquiryBrand"], ["model", "inquiryModel"], ["term", "inquiryTerm"], ["mileage", "inquiryMileage"]]) {
        if (selection.dataset[key]) destination.searchParams.set(name, selection.dataset[key]);
      }
      destination.searchParams.set("deposit", "0");
      destination.searchParams.set("prepayment", "0");
    }
    return destination;
  }
  const triggers = 'a[href="#quote"], [data-inquiry-entry], [data-home-quote], .persistent-quote-button, .business-quote-button, .quote-focus-button';
  document.querySelectorAll(triggers).forEach(target => {
    if (target.matches('a')) {
      target.href = destinationFor(target).href;
      target.setAttribute("data-inquiry-entry", "");
    }
  });
  document.addEventListener("click", event => {
    const target = event.target.closest(triggers);
    if (!target || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(destinationFor(target).href);
  }, true);
})();

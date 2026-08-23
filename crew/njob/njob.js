const year = document.querySelector("#currentYear");

if (year) {
  year.textContent = String(new Date().getFullYear());
}

if (window.lucide) {
  window.lucide.createIcons({
    attrs: {
      "stroke-width": 2,
    },
  });
}

const faqItems = document.querySelectorAll(".faq-list details");

faqItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;

    faqItems.forEach((otherItem) => {
      if (otherItem !== item) otherItem.open = false;
    });
  });
});

const heroSection = document.querySelector(".campaign-hero");
const mobileApply = document.querySelector(".mobile-apply");

if (heroSection && mobileApply && "IntersectionObserver" in window) {
  const applyObserver = new IntersectionObserver(([entry]) => {
    mobileApply.classList.toggle("is-hidden", entry.isIntersecting);
  });

  applyObserver.observe(heroSection);
}

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealTargets = document.querySelectorAll(
  [
    ".overview-copy",
    ".crew-overview .hero-benefits",
    ".crew-overview .hero-earning",
    ".hero-bubble",
    ".center-title",
    ".worry-list li",
    ".answer-copy",
    ".answer-visual",
    ".activity-grid article",
    ".support-list article",
    ".steps-list li",
    ".reward-copy",
    ".reward-visual",
    ".faq-list details",
    ".final-cta-inner",
  ].join(","),
);

if (!reduceMotion && revealTargets.length > 0 && "IntersectionObserver" in window) {
  document.body.classList.add("reveal-ready");

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  revealTargets.forEach((target, index) => {
    target.classList.add("scroll-reveal");
    target.style.setProperty("--reveal-delay", `${(index % 4) * 70}ms`);
    revealObserver.observe(target);
  });
}

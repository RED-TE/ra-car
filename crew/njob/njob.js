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
const carBuildSection = document.querySelector(".car-build-section");

if (carBuildSection) {
  const progressBar = carBuildSection.querySelector("[data-build-progress]");
  const progressLabel = carBuildSection.querySelector("[data-build-label]");
  const completionText = carBuildSection.querySelector("[data-build-complete]");
  const buildSteps = [...carBuildSection.querySelectorAll(".car-build-steps li")];
  const flowStages = [...carBuildSection.querySelectorAll("[data-flow-stage]")];
  const labels = ["추천 링크 전달", "휴대폰 문의 접수", "RE:CAR 상담·계약", "차량 출고·보상"];

  const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);

  const renderBuild = (progress) => {
    if (progressBar) progressBar.style.width = `${Math.round(progress * 100)}%`;

    const activeStep = Math.min(labels.length - 1, Math.floor(progress * labels.length));
    buildSteps.forEach((step, index) => step.classList.toggle("is-active", index <= activeStep));
    flowStages.forEach((stage, index) => {
      stage.classList.toggle("is-active", index <= activeStep);
      stage.classList.toggle("is-current", index === activeStep);
    });
    if (progressLabel) progressLabel.textContent = labels[activeStep];
    if (completionText) completionText.classList.toggle("is-visible", progress >= 0.9);
    carBuildSection.style.setProperty("--build-progress", String(progress));
  };

  if (reduceMotion) {
    renderBuild(1);
  } else {
    let buildFrame = 0;

    const updateBuild = () => {
      buildFrame = 0;
      const rect = carBuildSection.getBoundingClientRect();
      const travel = Math.max(carBuildSection.offsetHeight - window.innerHeight, 1);
      renderBuild(clamp(-rect.top / travel));
    };

    const requestBuildUpdate = () => {
      if (buildFrame) return;
      buildFrame = window.requestAnimationFrame(updateBuild);
    };

    window.addEventListener("scroll", requestBuildUpdate, { passive: true });
    window.addEventListener("resize", requestBuildUpdate);
    updateBuild();
  }
}

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

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
  const bodyPart = carBuildSection.querySelector(".car-part-body");
  const roofPart = carBuildSection.querySelector(".car-part-roof");
  const rearWheelPart = carBuildSection.querySelector(".car-part-wheel-rear");
  const frontWheelPart = carBuildSection.querySelector(".car-part-wheel-front");
  const detailsPart = carBuildSection.querySelector(".car-part-details");
  const completeCar = carBuildSection.querySelector(".car-complete");
  const progressBar = carBuildSection.querySelector("[data-build-progress]");
  const progressLabel = carBuildSection.querySelector("[data-build-label]");
  const completionText = carBuildSection.querySelector("[data-build-complete]");
  const buildSteps = [...carBuildSection.querySelectorAll(".car-build-steps li")];
  const labels = ["추천 링크 전달", "상담·견적 비교", "심사·계약 진행", "출고 완료·보상 반영"];

  const clamp = (value, min = 0, max = 1) => Math.min(Math.max(value, min), max);
  const phase = (progress, start, end) => clamp((progress - start) / (end - start));
  const setPiece = (element, progress, fromX, fromY, fromRotate, fromScale = 0.92) => {
    if (!element) return;

    const inverse = 1 - progress;
    element.style.opacity = String(progress);
    element.style.transform = `translate3d(${fromX * inverse}px, ${fromY * inverse}px, 0) rotate(${fromRotate * inverse}deg) scale(${fromScale + (1 - fromScale) * progress})`;
  };

  const renderBuild = (progress) => {
    const bodyProgress = phase(progress, 0, 0.27);
    const roofProgress = phase(progress, 0.16, 0.43);
    const rearWheelProgress = phase(progress, 0.3, 0.56);
    const frontWheelProgress = phase(progress, 0.39, 0.65);
    const detailsProgress = phase(progress, 0.55, 0.8);
    const completeProgress = phase(progress, 0.72, 0.84);

    setPiece(bodyPart, bodyProgress, -170, 76, -4, 0.9);
    setPiece(roofPart, roofProgress, 18, -145, 3, 0.92);
    setPiece(rearWheelPart, rearWheelProgress, -120, 125, -70, 0.72);
    setPiece(frontWheelPart, frontWheelProgress, 130, 125, 70, 0.72);
    setPiece(detailsPart, detailsProgress, 165, -12, 3, 0.94);

    [bodyPart, roofPart, rearWheelPart, frontWheelPart, detailsPart].forEach((part) => {
      if (!part) return;
      part.style.opacity = String(Number(part.style.opacity) * (1 - completeProgress));
    });

    if (completeCar) {
      completeCar.style.opacity = String(completeProgress);
      completeCar.style.transform = `translate3d(0, ${10 * (1 - completeProgress)}px, 0) scale(${0.985 + 0.015 * completeProgress})`;
    }

    if (progressBar) progressBar.style.width = `${Math.round(progress * 100)}%`;

    const activeStep = Math.min(labels.length - 1, Math.floor(progress * labels.length));
    buildSteps.forEach((step, index) => step.classList.toggle("is-active", index <= activeStep));
    if (progressLabel) progressLabel.textContent = labels[activeStep];
    if (completionText) completionText.classList.toggle("is-visible", progress >= 0.9);
    carBuildSection.style.setProperty("--build-progress", String(progress));
  };

  if (reduceMotion) {
    renderBuild(1);
  } else {
    document.body.classList.add("car-build-ready");
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

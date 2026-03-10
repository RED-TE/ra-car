// Mobile Menu
const openBtn = document.getElementById('openMenu');
const closeBtn = document.getElementById('closeMenu');
const menu = document.getElementById('mobileMenu');

openBtn?.addEventListener('click', () => {
  menu.setAttribute('aria-hidden', 'false');
});

closeBtn?.addEventListener('click', () => {
  menu.setAttribute('aria-hidden', 'true');
});

menu?.addEventListener('click', (e) => {
  if (e.target === menu) {
    menu.setAttribute('aria-hidden', 'true');
  }
});

// ===== Spotlight carousel =====
const spotCard = document.querySelector('.spot-card');
const slides = Array.from(document.querySelectorAll('.spot-slide'));
const leftBtn = document.querySelector('.spot-arrow.left');
const rightBtn = document.querySelector('.spot-arrow.right');
const dots = document.querySelectorAll('.spot-dot');
let currentIdx = 0;
window._spotIdx = 0;

function updateSlide(idx) {
    currentIdx = (idx + slides.length) % slides.length;
    window._spotIdx = currentIdx;
    window._lastIdx = currentIdx;
    
    slides.forEach((slide, i) => {
        slide.style.display = i === currentIdx ? 'flex' : 'none';
    });
    
    const bg = slides[currentIdx].dataset.bg;
    if(bg && spotCard) {
        spotCard.style.backgroundImage = `url('${bg}')`;
        spotCard.style.backgroundSize = 'cover';
        spotCard.style.backgroundPosition = 'center';
    }

    // dot 인디케이터 업데이트
    dots.forEach((d, i) => d.classList.toggle('active', i === currentIdx));
}

if (leftBtn && rightBtn) {
    leftBtn.addEventListener('click', () => updateSlide(currentIdx - 1));
    rightBtn.addEventListener('click', () => updateSlide(currentIdx + 1));
}

// dot 클릭
dots.forEach((dot, i) => {
    dot.addEventListener('click', () => updateSlide(i));
});

// 초기 로드
window.addEventListener('load', () => {
    updateSlide(0);

    // 자동 슬라이드 (3.5초)
    let autoTimer = setInterval(() => updateSlide(currentIdx + 1), 3500);

    // 수동 조작 시 타이머 리셋
    [leftBtn, rightBtn, ...dots].forEach(el => {
        el?.addEventListener('click', () => {
            clearInterval(autoTimer);
            autoTimer = setInterval(() => updateSlide(currentIdx + 1), 3500);
        });
    });
});

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      menu?.setAttribute('aria-hidden', 'true');
    }
  });
});

// Scroll appearance animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -80px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.svc-card, .spot-card, .trust-inner, .faq-list').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
  observer.observe(el);
});

// Header scroll effect
const header = document.querySelector('.header');
if (header) {
  window.addEventListener('scroll', () => {
    header.classList.toggle('header--visible', window.scrollY > 60);
  });
}
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

// Spotlight carousel
const spotCard = document.querySelector('.spot-card');
const slides = Array.from(document.querySelectorAll('.spot-slide'));
const leftBtn = document.querySelector('.spot-arrow.left');
const rightBtn = document.querySelector('.spot-arrow.right');
let currentIdx = 0;

function updateSlide(idx) {
    // 인덱스 순환 계산
    currentIdx = (idx + slides.length) % slides.length;
    
    // 슬라이드 표시/숨김 처리
    slides.forEach((slide, i) => {
        slide.style.display = i === currentIdx ? 'flex' : 'none';
    });
    
    // [중요] 배경 이미지 교체 로직 (Photo Connection 복구)
    const bg = slides[currentIdx].dataset.bg;
    if(bg && spotCard) {
        spotCard.style.backgroundImage = `url('${bg}')`;
    }
}

if (leftBtn && rightBtn) {
    leftBtn.addEventListener('click', () => updateSlide(currentIdx - 1));
    rightBtn.addEventListener('click', () => updateSlide(currentIdx + 1));
}

// 초기 로드 시 첫 번째 슬라이드 및 배경 실행
window.addEventListener('load', () => updateSlide(0));


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

// Scroll animations
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.svc-card, .spot-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(30px)';
  el.style.transition = 'opacity 0.6s, transform 0.6s';
  observer.observe(el);
});

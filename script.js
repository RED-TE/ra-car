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

// Close menu when clicking outside
menu?.addEventListener('click', (e) => {
  if (e.target === menu) {
    menu.setAttribute('aria-hidden', 'true');
  }
});

// Spotlight carousel
const spotCard = document.querySelector('.spot-card');
const arrows = document.querySelectorAll('.spot-arrow');

let currentSlide = 0;
const slides = [
  {
    title: '1 : 1 맞춤 어드바이저',
    desc: '나의 상황에 딱 맞춰주는 최고의 전문가<br/>상품추천, 맞춤견적, 계약 검토까지'
  },
  {
    title: '합리적인 가격',
    desc: '투명한 견적과 최저가 보장<br/>숨은 비용 없이 명확하게'
  },
  {
    title: '빠른 배송',
    desc: '전국 어디든 빠른 차량 배송<br/>원하는 시간, 원하는 장소로'
  }
];

arrows.forEach(arrow => {
  arrow.addEventListener('click', () => {
    const dir = parseInt(arrow.dataset.dir);
    currentSlide = (currentSlide + dir + slides.length) % slides.length;
    updateSlide();
  });
});

function updateSlide() {
  const slide = slides[currentSlide];
  const copy = spotCard.querySelector('.spot-copy');
  
  copy.querySelector('h3').textContent = slide.title;
  copy.querySelector('p').innerHTML = slide.desc;
}

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
      // Close mobile menu if open
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

document.addEventListener("DOMContentLoaded", () => {
  'use strict';

  /* ---------- Feature detection / preferences ---------- */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  /* ---------- Helpers ---------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  /* ---------- 1. Optional lock screen (unchanged, guarded) ---------- */
  const lockScreen = document.getElementById('lockScreen');
  if (lockScreen) {
    let lockStartY = 0;
    lockScreen.addEventListener('touchstart', e => { lockStartY = e.touches[0].clientY; }, { passive: true });
    lockScreen.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - lockStartY;
      if (dy < -50) lockScreen.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    lockScreen.addEventListener('touchend', e => {
      const dy = e.changedTouches[0].clientY - lockStartY;
      if (dy < -120) {
        lockScreen.classList.add('unlocked');
        setTimeout(() => { lockScreen.style.display = 'none'; }, 800);
      } else {
        lockScreen.style.transform = '';
      }
    });
  }

  /* ---------- 2. Notification center (unchanged, guarded) ---------- */
  const statusBar = $('.status-bar');
  const notifCenter = document.getElementById('notifCenter');
  if (statusBar && notifCenter) {
    statusBar.addEventListener('click', () => notifCenter.classList.toggle('open'));
  }

  /* ---------- 3. Custom cursor (rAF-throttled, theme-aware) ---------- */
  const cursor = document.getElementById('cursor');
  const cursorTrail = document.getElementById('cursor-trail');
  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let trail   = { x: pointer.x, y: pointer.y };
  let cursorRafId = null;

  function getThemeColor() {
    // Read the live --cyan so cursor/particles follow the theme
    const v = getComputedStyle(document.documentElement).getPropertyValue('--cyan').trim();
    return v || '#00d4ff';
  }
  let themeColor = getThemeColor();

  function startCursorLoop() {
    if (reduceMotion || !cursor) return;
    const tick = () => {
      if (cursor) {
        cursor.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;
      }
      if (cursorTrail) {
        trail.x += (pointer.x - trail.x) * 0.12;
        trail.y += (pointer.y - trail.y) * 0.12;
        cursorTrail.style.transform = `translate(${trail.x}px, ${trail.y}px) translate(-50%, -50%)`;
      }
      cursorRafId = requestAnimationFrame(tick);
    };
    cursorRafId = requestAnimationFrame(tick);
  }
  startCursorLoop();

  // Use pointermove (covers mouse, pen, and touch-drag on supported devices)
  document.addEventListener('pointermove', e => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true });

  // If the theme changes, update cursor color (CSS vars already do it,
  // but particle + any inline color need re-read)
  function refreshThemeColor() {
    themeColor = getThemeColor();
    // Force cursor/trail to repaint with the new var
    if (cursor) cursor.style.background = '';
    if (cursorTrail) cursorTrail.style.borderColor = '';
  }

  /* ---------- 4. Particle background (DPR-aware, adaptive) ---------- */
  const canvas = document.getElementById('particleCanvas');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let W = 0, H = 0, DPR = 1;
  let particles = [];
  const pointerParticle = { x: -9999, y: -9999, active: false };

  // Adaptive count: fewer particles on small screens
  function particleCount() {
    if (isTouch || window.innerWidth < 600) return 45;
    if (window.innerWidth < 1000) return 70;
    return 100;
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    DPR = clamp(window.devicePixelRatio || 1, 1, 2); // cap at 2 for perf
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.r = Math.random() * 1.5 + 0.5;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.a = Math.random() * 0.5 + 0.2;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;
      this.a = 0.3 + Math.sin(Date.now() / 2000 + this.x) * 0.2;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(themeColor, this.a);
      ctx.fill();
    }
  }

  function hexToRgba(hex, a) {
    // Accept #rrggbb or #rgb; fall back to cyan
    let h = (hex || '#00d4ff').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return `rgba(0,212,255,${a})`;
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  function rebuildParticles() {
    particles = [];
    const n = particleCount();
    for (let i = 0; i < n; i++) particles.push(new Particle());
  }

  function drawLines() {
    const linkDist = 120;
    const linkDistSq = linkDist * linkDist;
    for (let i = 0; i < particles.length; i++) {
      const pi = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const pj = particles[j];
        const dx = pi.x - pj.x, dy = pi.y - pj.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < linkDistSq) {
          const alpha = (1 - Math.sqrt(dSq) / linkDist) * 0.06;
          ctx.beginPath();
          ctx.moveTo(pi.x, pi.y);
          ctx.lineTo(pj.x, pj.y);
          ctx.strokeStyle = hexToRgba(themeColor, alpha);
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
      if (pointerParticle.active) {
        const dx = pi.x - pointerParticle.x, dy = pi.y - pointerParticle.y;
        const dSq = dx * dx + dy * dy;
        const mouseDist = 150, mouseDistSq = mouseDist * mouseDist;
        if (dSq < mouseDistSq) {
          const alpha = (1 - Math.sqrt(dSq) / mouseDist) * 0.1;
          ctx.beginPath();
          ctx.moveTo(pi.x, pi.y);
          ctx.lineTo(pointerParticle.x, pointerParticle.y);
          ctx.strokeStyle = hexToRgba(themeColor, alpha);
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  let particleRafId = null;
  let particleFrame = 0;

  function animateParticles() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) { p.update(); p.draw(); }
    // Skip line pass every other frame on low-end devices for perf
    particleFrame++;
    if (!(isTouch && particleFrame % 2)) drawLines();
    particleRafId = requestAnimationFrame(animateParticles);
  }

  function startParticles() {
    if (!canvas || !ctx || reduceMotion) return;
    resizeCanvas();
    rebuildParticles();
    // Pointer tracking for the "connect to cursor" lines
    document.addEventListener('pointermove', e => {
      pointerParticle.x = e.clientX;
      pointerParticle.y = e.clientY;
      pointerParticle.active = true;
    }, { passive: true });
    document.addEventListener('pointerleave', () => { pointerParticle.active = false; }, { passive: true });
    if (particleRafId) cancelAnimationFrame(particleRafId);
    animateParticles();
  }
  startParticles();

  /* ---------- 5. Clock ---------- */
  const clockEl = document.getElementById('clock');
  function updateClock() {
    if (!clockEl) return;
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }
  setInterval(updateClock, 1000);
  updateClock();

  /* ---------- 6. Scroll reveal (with above-the-fold fallback) ---------- */
  const revealEls = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    const revObs = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          revObs.unobserve(e.target);
        }
      }
    }, { threshold: 0.1, rootMargin: '0px 0px -10% 0px' });
    revealEls.forEach(el => revObs.observe(el));
    // Fallback: if anything is already above the fold and observer hasn't
    // fired within 200ms (some browsers), force-reveal it.
    setTimeout(() => {
      revealEls.forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) el.classList.add('in');
      });
    }, 200);
  } else {
    revealEls.forEach(el => el.classList.add('in'));
  }

  /* ---------- 7. App windows (open/close/drag, touch-ready) ---------- */
  const overlay = document.getElementById('overlay');
  const windows = {
    about: document.getElementById('win-about'),
    projects: document.getElementById('win-projects'),
    skills: document.getElementById('win-skills'),
    contact: document.getElementById('win-contact'),
    settings: document.getElementById('win-settings')
  };
  let openWin = null;

  function getBounds() {
    return {
      left: 10,
      top: 10,
      width: window.innerWidth - 20,
      height: window.innerHeight - 20
    };
  }

  function clampIntoBounds(win) {
    if (!win) return;
    const b = getBounds();
    const rect = win.getBoundingClientRect();
    const x = clamp(rect.left, b.left, b.left + Math.max(0, b.width - rect.width));
    const y = clamp(rect.top, b.top, b.top + Math.max(0, b.height - rect.height));
    win.style.transform = 'none';
    win.style.left = x + 'px';
    win.style.top = y + 'px';
  }

  function openWindow(name) {
    const win = windows[name];

    if (!win || !overlay) {
      console.error('Popup or overlay not found:', name);
      return;
    }

    // Close the previously open popup.
    if (openWin && openWin !== win) {
      openWin.classList.remove('open');
    }

    openWin = win;
    win.style.left = '';
    win.style.top = '';
    win.style.transform = '';

    // Show the popup and background overlay.
    win.classList.add('open');
    overlay.classList.add('open');

    // Sync dock & nav tabs active status
    $$('.dock-item').forEach(d => d.classList.toggle('active', d.dataset.app === name));
    $$('.nav-tabs a').forEach(t => {
      const match = (name === 'projects' && t.dataset.tab === 'work') || t.dataset.tab === name;
      t.classList.toggle('active', match);
    });

    // Animate the skill bars whenever Skills opens.
    if (name === 'skills') {
      const bars = $$('.skill-fill', win);

      bars.forEach(bar => {
        bar.style.width = '0%';
      });

      setTimeout(() => {
        bars.forEach(bar => {
          const w = bar.dataset.w || '80';
          bar.style.width = w + '%';
        });
      }, 120);
    }
  }

  function closeWindow() {
    if (openWin) {
      openWin.classList.remove('open');
      openWin.style.left = '';
      openWin.style.top = '';
      openWin.style.transform = '';
    }

    if (overlay) {
      overlay.classList.remove('open');
    }

    openWin = null;

    // Reset dock & nav tabs active state to home
    $$('.dock-item').forEach(d => d.classList.toggle('active', d.dataset.app === 'home'));
    $$('.nav-tabs a').forEach(t => t.classList.toggle('active', t.dataset.tab === 'home'));
  }

  // Close buttons & overlay listeners
  $$('.win-close, .win-min').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeWindow();
    });
  });

  if (overlay) {
    overlay.addEventListener('click', closeWindow);
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && openWin) {
      closeWindow();
    }
  });

  const backBtn = $('.back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (openWin) {
        closeWindow();
      }
    });
  }

  // Additional triggers to open popups
  $$('.project-card').forEach(card => {
    card.addEventListener('click', () => openWindow('projects'));
  });

  $$('.software-item').forEach(item => {
    item.addEventListener('click', () => openWindow('skills'));
  });

  const avatarEl = $('.avatar');
  if (avatarEl) {
    avatarEl.style.cursor = 'pointer';
    avatarEl.addEventListener('click', () => openWindow('about'));
  }

  const newPostBtn = $('.new-post');
  if (newPostBtn) {
    newPostBtn.addEventListener('click', () => openWindow('contact'));
  }

  /* ---------- 8. Draggable windows — Pointer Events (mouse+touch+pen) ---------- */
  $$('.app-window').forEach(win => {
    const header = win.querySelector('.win-header');
    if (!header) return;
    let dragging = false;
    let offsetX = 0, offsetY = 0;
    let pointerId = null;

    header.style.touchAction = 'none'; // prevent scroll while dragging header

    header.addEventListener('pointerdown', e => {
      if (e.button !== undefined && e.button !== 0) return; // left click / touch / pen
      if (e.target.closest('.win-btn')) return;
      dragging = true;
      pointerId = e.pointerId;
      header.setPointerCapture?.(pointerId);
      const rect = win.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      // Lock in explicit left/top before clearing transform
      win.style.transform = 'none';
      win.style.left = rect.left + 'px';
      win.style.top  = rect.top  + 'px';
      win.classList.add('dragging');
      e.preventDefault();
    });

    header.addEventListener('pointermove', e => {
      if (!dragging || e.pointerId !== pointerId) return;
      const b = getBounds();
      const x = clamp(e.clientX - offsetX, b.left, b.left + Math.max(0, b.width  - win.offsetWidth));
      const y = clamp(e.clientY - offsetY, b.top,  b.top  + Math.max(0, b.height - win.offsetHeight));
      win.style.left = x + 'px';
      win.style.top  = y + 'px';
    });

    const endDrag = e => {
      if (!dragging || (e && e.pointerId !== pointerId)) return;
      dragging = false;
      win.classList.remove('dragging');
      if (pointerId != null) {
        try { header.releasePointerCapture?.(pointerId); } catch (_) {}
      }
      pointerId = null;
    };
    header.addEventListener('pointerup', endDrag);
    header.addEventListener('pointercancel', endDrag);
    header.addEventListener('lostpointercapture', endDrag);
  });

  // Re-clamp any open window on resize / orientation change
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      rebuildParticles();
      if (openWin) clampIntoBounds(openWin);
    }, 150);
  });

  /* ---------- 9. 3D tilt on project cards (skip on touch / reduced motion) ---------- */
  if (!isTouch && !reduceMotion) {
    $$('.project-card').forEach(card => {
      let rafId = null;
      card.addEventListener('pointermove', e => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          const rotateX = (y - rect.height / 2) / 10;
          const rotateY = (rect.width / 2 - x) / 10;
          card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.02)`;
        });
      });
      card.addEventListener('pointerleave', () => {
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale(1)';
      });
    });
  }

  /* ---------- 10. Dock active state & window opening ---------- */
  const dockItems = $$('.dock-item');
  dockItems.forEach(item => {
    item.addEventListener('click', () => {
      const app = item.dataset.app;
      if (app === 'home') {
        closeWindow();
      } else if (app && windows[app]) {
        openWindow(app);
      }
    });
  });

  /* ---------- 11. Theme switcher (works for both switcher + settings dots) ---------- */
  const themeDots = $$('.theme-dot');
  function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    themeDots.forEach(d => d.classList.toggle('active', d.dataset.theme === theme));
    localStorage.setItem('portfolio-theme', theme);
    refreshThemeColor();
  }
  themeDots.forEach(dot => {
    dot.addEventListener('click', () => applyTheme(dot.dataset.theme));
  });
  const savedTheme = localStorage.getItem('portfolio-theme');
  if (savedTheme) applyTheme(savedTheme);

  /* ---------- 12. Hamburger = Toggle Dock Menu ---------- */
  const hamburger = document.getElementById('hamburger');
  const navTabs = $('.nav-tabs');
  const mainDock = document.getElementById('mainDock');

  if (hamburger && mainDock) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click from bubbling to document
      hamburger.classList.toggle('active');
      mainDock.classList.toggle('open');
      // Also toggle nav-tabs if you're using them on mobile
      if (navTabs) navTabs.classList.toggle('open'); 
    });
  }

  // Close the dock when clicking outside of it
  document.addEventListener('click', (e) => {
    if (mainDock && mainDock.classList.contains('open') && !mainDock.contains(e.target) && !hamburger.contains(e.target)) {
      mainDock.classList.remove('open');
      hamburger.classList.remove('active');
      if (navTabs) navTabs.classList.remove('open');
    }
  });

  // Optional: Close dock automatically when a dock item is clicked
  $$('.dock-item').forEach(item => {
    item.addEventListener('click', () => {
      if (mainDock) mainDock.classList.remove('open');
      if (hamburger) hamburger.classList.remove('active');
    });
  });

  /* ---------- 13. Nav tabs now open the matching window ---------- */
  const tabMap = {
    home:    null,        // close all
    about:   'about',
    work:    'projects',  // "Work" maps to projects window
    contact: 'contact',
  };
  $$('.nav-tabs a').forEach(tab => {
    tab.addEventListener('click', e => {
      e.preventDefault();
      $$('.nav-tabs a').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const key = tab.dataset.tab;
      const target = tabMap[key];
      if (target && windows[target]) {
        openWindow(target);
      } else {
        closeWindow();
      }
    });
  });

  /* ---------- 14. Form submit (inline onsubmit + listener, both safe) ---------- */
  window.handleSubmit = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    const form = e && e.target ? e.target : document.querySelector('.contact-form');
    if (!form) return;
    const btn = form.querySelector('.fsub');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = 'Sent! ✓';
    btn.style.background = 'var(--cyan-deep)';
    setTimeout(() => {
      btn.textContent = original || 'Send →';
      btn.style.background = '';
      btn.disabled = false;
      form.reset();
    }, 2500);
  };
  const contactForm = document.querySelector('.contact-form');
  if (contactForm) contactForm.addEventListener('submit', window.handleSubmit);

  /* ---------- 15. Cleanup ---------- */
  window.addEventListener('pagehide', () => {
    if (cursorRafId) cancelAnimationFrame(cursorRafId);
    if (particleRafId) cancelAnimationFrame(particleRafId);
  });
});

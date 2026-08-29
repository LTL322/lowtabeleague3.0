
(function () {
  const AFK_DELAY = 5 * 60 * 1000;
  let afkTimer = null;
  let afkTriggered = false;
  let afkOverlay = null;
  let afkAudio = null;

  function ensureAfkOverlay() {
    if (afkOverlay) return afkOverlay;
    afkOverlay = document.createElement('div');
    afkOverlay.id = 'ltl-afk-flashbang';
    afkOverlay.innerHTML = `
      <div class="ltl-afk-message" role="alert" aria-live="assertive">
        <div class="ltl-afk-title">ЧО ФЛЕШКУ СЛОВИЛ?</div>
        <div class="ltl-afk-subtitle">ВЫЙДИ ИЗ АФК</div>
        <div class="ltl-afk-hint">Пошевели мышкой, чтобы вернуться</div>
      </div>`;
    document.body.appendChild(afkOverlay);
    return afkOverlay;
  }

  function playAfkSound() {
    try {
      if (!afkAudio) {
        afkAudio = new Audio('./cs-go-flashbang.mp3');
        afkAudio.preload = 'auto';
      }
      afkAudio.currentTime = 0;
      const promise = afkAudio.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    } catch (_) {}
  }

  function triggerAfk() {
    if (afkTriggered || document.hidden) return;
    afkTriggered = true;
    ensureAfkOverlay().classList.add('active');
    playAfkSound();
  }

  function resetAfk() {
    afkTriggered = false;
    if (afkOverlay) afkOverlay.classList.remove('active');
    if (afkAudio) {
      try { afkAudio.pause(); afkAudio.currentTime = 0; } catch (_) {}
    }
    clearTimeout(afkTimer);
    if (!document.hidden) afkTimer = setTimeout(triggerAfk, AFK_DELAY);
  }

  function armAfk() {
    clearTimeout(afkTimer);
    if (!document.hidden) afkTimer = setTimeout(triggerAfk, AFK_DELAY);
  }

  // Любое движение мыши мгновенно снимает AFK-экран и запускает новый отсчёт.
  let moveThrottle = 0;
  document.addEventListener('mousemove', function () {
    const now = Date.now();
    if (now - moveThrottle < 100) return;
    moveThrottle = now;
    if (afkTriggered) resetAfk();
    else armAfk();
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      clearTimeout(afkTimer);
    } else {
      resetAfk();
    }
  });

  window.addEventListener('focus', armAfk);
  window.addEventListener('blur', () => clearTimeout(afkTimer));

  // Если пользователь уже взаимодействовал со страницей, браузер разрешит звук.
  document.addEventListener('click', armAfk, { passive: true });
  document.addEventListener('keydown', armAfk, { passive: true });
  document.addEventListener('touchstart', armAfk, { passive: true });

  // Начинаем отсчёт после загрузки.
  setTimeout(armAfk, 1000);
})();

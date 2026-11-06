(() => {
  const anchor = document.createElement('a');
  anchor.href = '/bitcoin';
  anchor.textContent = '₿ Bitcoin-Berichte';
  anchor.className = 'quiet';
  (document.querySelector('.topbar-actions') || document.querySelector('header') || document.body).append(anchor);
})();

// Apply the device preference before the first paint; no account data is stored.
(()=>{let theme='dark';try{const saved=localStorage.getItem('jarvis.theme');if(['light','dark'].includes(saved))theme=saved;}catch{}document.documentElement.dataset.theme=theme;})();

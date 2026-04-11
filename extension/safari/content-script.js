const script = document.createElement('script');
script.src = chrome.runtime.getURL('polyfill.js');
document.documentElement.appendChild(script);
script.onload = () => script.remove();

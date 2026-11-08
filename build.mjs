// Builds the locked page Darh receives.
// Usage: node build.mjs "<answer>"
// Reads private_source.html (the readable page), encrypts its content and script
// with a key derived from the answer, and writes ../darh_cheer_station.html.
// The answer itself is never written to the output.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, 'private_source.html');
const OUTPUT = join(here, '..', 'darh_cheer_station.html');
const QUESTION = 'What is your middle name?';
const ITERATIONS = 250000;

const answer = process.argv[2];
if (!answer) {
  console.error('Usage: node build.mjs "<answer>"');
  process.exit(1);
}
// Must match normalize() in the page.
const normalize = s => s.trim().toLowerCase().replace(/\s+/g, ' ');

const src = readFileSync(SOURCE, 'utf8');
function between(start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error('Could not find ' + start + ' in source');
  return src.slice(a + start.length, b);
}
const style = between('<style>', '</style>');
const wrapHtml = between('<div class="wrap">', '\n</div>\n\n<script>');
const script = between('<script>', '</script>');

const { subtle } = globalThis.crypto;
const enc = new TextEncoder();
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const baseKey = await subtle.importKey('raw', enc.encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey(
  { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
  baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
);
const payload = enc.encode(JSON.stringify({ html: wrapHtml, js: script }));
const cipher = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, payload));
const b64 = bytes => Buffer.from(bytes).toString('base64');

const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Darh's Sunshine Corner</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>${style}
  /* Lock screen */
  .lock{
    min-height:calc(100vh - 88px);
    display:flex;align-items:center;justify-content:center;
  }
  .lock-card{
    background:var(--card);border-radius:22px;box-shadow:var(--shadow);
    padding:32px 24px;max-width:400px;width:100%;text-align:center;
  }
  .lock-card h1{font-size:28px;margin:6px 0 4px;}
  .lock-card p{color:var(--ink-soft);font-size:15px;line-height:1.5;margin:0 0 18px;}
  .lock-card label{display:block;font-family:'Fredoka',sans-serif;font-size:17px;margin-bottom:10px;}
  .lock-card input{
    width:100%;padding:12px 14px;border-radius:12px;border:2px solid #EADFEA;
    font-family:'Nunito',sans-serif;font-size:16px;color:var(--ink);background:#FFF7F0;
    text-align:center;
  }
  .lock-card input:focus{outline:none;border-color:var(--lavender);}
  .lock-card .btn{margin-top:14px;width:100%;padding:12px;font-size:16px;}
  .lock-card .btn:disabled{opacity:.6;cursor:wait;}
  .lock-msg{min-height:22px;margin-top:12px;font-size:14px;color:#C2416B;}
  .shake{animation:shake .4s ease;}
  @keyframes shake{
    0%,100%{transform:translateX(0);}
    20%,60%{transform:translateX(-8px);}
    40%,80%{transform:translateX(8px);}
  }
</style>
</head>
<body>
<canvas id="confetti"></canvas>
<div class="wrap" id="app">
  <div class="lock">
    <form class="lock-card" id="lockForm" autocomplete="off">
      <span class="sun">🌻</span>
      <h1>Darh's Sunshine Corner</h1>
      <p>This little corner is for one person only. Answer the question to come in.</p>
      <label for="answer">${QUESTION}</label>
      <input id="answer" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" required>
      <button class="btn" id="unlockBtn" type="submit">Unlock 💛</button>
      <div class="lock-msg" id="lockMsg"></div>
    </form>
  </div>
</div>

<script>
const LOCKED = {
  salt:"${b64(salt)}",
  iv:"${b64(iv)}",
  iterations:${ITERATIONS},
  data:"${b64(cipher)}"
};
(function(){
  const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const normalize = s => s.trim().toLowerCase().replace(/\\s+/g, ' ');
  const form = document.getElementById('lockForm');
  const input = document.getElementById('answer');
  const btn = document.getElementById('unlockBtn');
  const msg = document.getElementById('lockMsg');
  input.focus();

  if(!(window.crypto && crypto.subtle)){
    msg.textContent = "This browser can't open the corner. Try opening the link in Chrome or Safari.";
    btn.disabled = true;
    return;
  }

  async function unlock(answer){
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(normalize(answer)), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      {name:'PBKDF2', salt:fromB64(LOCKED.salt), iterations:LOCKED.iterations, hash:'SHA-256'},
      base, {name:'AES-GCM', length:256}, false, ['decrypt']
    );
    const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:fromB64(LOCKED.iv)}, key, fromB64(LOCKED.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  form.addEventListener('submit', async e=>{
    e.preventDefault();
    btn.disabled = true;
    msg.textContent = '';
    try{
      const page = await unlock(input.value);
      document.getElementById('app').innerHTML = page.html;
      window.scrollTo(0,0);
      new Function(page.js)();
    }catch(err){
      btn.disabled = false;
      msg.textContent = "Hmm, that's not it. Only Darh knows this one 😉";
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      input.select();
    }
  });
})();
</script>
</body>
</html>
`;

writeFileSync(OUTPUT, out);
console.log('Wrote ' + OUTPUT);

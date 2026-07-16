import nipplejs from "nipplejs";

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });
// audio element for imposter win sound (added in HTML)
const impostorWin = document.getElementById('impostorWin');

let DPR = Math.max(1, window.devicePixelRatio || 1);

function resize(){
  const w = innerWidth;
  const h = innerHeight;
  canvas.width = Math.floor(w * DPR);
  canvas.height = Math.floor(h * DPR);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
addEventListener('resize', resize, {passive:true});
resize();

/* Constants */
const WORLD = { w: canvas.width / DPR, h: canvas.height / DPR };
const CREW_RADIUS = 18;
const IMPO_RADIUS = 22;
const MAX_SPEED = 280; // px/sec for crewmate (increased)
const IMPO_SPEED = 130; // px/sec
const FRICTION = 120; // px/sec^2

/* Entities */
const crewmate = {
  x: WORLD.w*0.25,
  y: WORLD.h*0.5,
  vx: 0,
  vy: 0,
  color: '#4bd0e8'
};
const imposter = {
  x: WORLD.w*0.75,
  y: WORLD.h*0.5,
  vx: 0,
  vy: 0,
  color: '#e85d4b',
  state: 'chase' // reserved for expansion
};

let last = performance.now();
let running = false; // start paused until Play is pressed
let caught = false;
let elapsed = 0;

// imposter skin image (provided asset)
const imposterImg = new Image();
imposterImg.src = "/a/5d4f3929-060d-40f6-a938-482d00781749";

/* Simple start menu wiring (creates DOM controls for Play + color picker) */
(function setupMenu(){
  // colors excluding red
  const COLORS = ['#48b0ff','#00bcd4','#0f9d58','#ffb86b','#6ee7b7','#f472b6','#ffd166','#a78bfa'];
  let selected = crewmate.color || COLORS[0];
  let deathSelected = crewmate.color || COLORS[0];

  // ensure menu exists in DOM (index.html includes #menu and #deathPanel)
  const menu = document.getElementById('menu');
  const colorsEl = document.getElementById('colors');
  const startBtn = document.getElementById('startBtn');

  const deathPanel = document.getElementById('deathPanel');
  const deathColorsEl = document.getElementById('deathColors');
  const playAgainBtn = document.getElementById('playAgainBtn');

  // menu music element (added in index.html)
  const menuMusic = document.getElementById('menuMusic');
  if(menuMusic){
    menuMusic.loop = true;
    menuMusic.volume = 0.45;
  }

  // gameplay music (plays quietly while game is active)
  const gameMusic = document.getElementById('gameMusic');
  if(gameMusic){
    gameMusic.loop = true;
    // start muted until gameplay starts; volume will be set when starting
    gameMusic.volume = 0.0;
  }
  // expose gameplay music globally so other scopes can pause/play it reliably
  window.gameMusic = gameMusic;

  // populate color pills for main menu
  COLORS.forEach(c=>{
    const d = document.createElement('div');
    d.className = 'color-pill' + (c === selected ? ' selected' : '');
    d.style.background = c;
    d.setAttribute('role','button');
    d.addEventListener('click', ()=>{
      selected = c;
      for(const kid of colorsEl.children) kid.classList.remove('selected');
      d.classList.add('selected');
    });
    colorsEl.appendChild(d);
  });

  // populate color pills for death panel
  COLORS.forEach(c=>{
    const d = document.createElement('div');
    d.className = 'color-pill' + (c === deathSelected ? ' selected' : '');
    d.style.background = c;
    d.setAttribute('role','button');
    d.addEventListener('click', ()=>{
      deathSelected = c;
      for(const kid of deathColorsEl.children) kid.classList.remove('selected');
      d.classList.add('selected');
    });
    deathColorsEl.appendChild(d);
  });

  // shared respawn function
  function respawnWithColor(col){
    crewmate.color = col;
    // Respawn positions and velocities
    crewmate.x = WORLD.w*0.2 + Math.random()*WORLD.w*0.2;
    crewmate.y = WORLD.h*0.2 + Math.random()*WORLD.h*0.6;
    crewmate.vx = crewmate.vy = 0;
    imposter.x = WORLD.w*0.8 - Math.random()*WORLD.w*0.2;
    imposter.y = WORLD.h*0.2 + Math.random()*WORLD.h*0.6;
    imposter.vx = imposter.vy = 0;
    caught = false;
    elapsed = 0;
    running = true;
    document.getElementById('status').textContent = 'Alive';
    document.getElementById('status').style.color = '#e85d4b';
    // hide death panel if open
    if(deathPanel) deathPanel.style.display = 'none';
    // stop menu music when gameplay begins
    if(menuMusic && !menuMusic.paused){
      try{ menuMusic.pause(); menuMusic.currentTime = 0; }catch(e){}
    }
    // start gameplay music quietly
    if(gameMusic){
      try{
        gameMusic.volume = 0.15;
        gameMusic.currentTime = 0;
        gameMusic.play().catch(()=>{});
      }catch(e){}
    }
  }

  // Start button behavior
  startBtn.addEventListener('click', ()=>{
    crewmate.color = selected;
    // hide menu and start game
    menu.style.display = 'none';
    running = true;
    // stop menu music
    if(menuMusic && !menuMusic.paused){
      try{ menuMusic.pause(); menuMusic.currentTime = 0; }catch(e){}
    }
    // play gameplay music at a low volume
    if(gameMusic){
      try{
        gameMusic.volume = 0.15;
        gameMusic.currentTime = 0;
        gameMusic.play().catch(()=>{});
      }catch(e){}
    }
  });

  // Play Again behavior on death panel
  playAgainBtn.addEventListener('click', ()=>{
    respawnWithColor(deathSelected);
    // also hide main menu in case it was visible
    if(menu) menu.style.display = 'none';
    // stop menu music as gameplay starts
    if(menuMusic && !menuMusic.paused){
      try{ menuMusic.pause(); menuMusic.currentTime = 0; }catch(e){}
    }
    // ensure gameplay music is playing quietly
    if(gameMusic){
      try{
        gameMusic.volume = 0.15;
        gameMusic.currentTime = 0;
        gameMusic.play().catch(()=>{});
      }catch(e){}
    }
  });

  // If menu is visible on load, attempt to play music (will require a user gesture on some browsers)
  if(menu && menu.style.display !== 'none' && menuMusic){
    // try-catch to avoid autoplay exceptions
    try{ menuMusic.play().catch(()=>{}); }catch(e){}
  }

  // When menu is shown again (for example after game over), try to play music and pause gameplay music
  const observer = new MutationObserver(()=>{
    if(menu && menu.style.display !== 'none' && menuMusic){
      try{ menuMusic.play().catch(()=>{}); }catch(e){}
    }
    // if menu becomes visible, pause gameplay music
    if(menu && menu.style.display !== 'none' && gameMusic){
      try{ gameMusic.pause(); gameMusic.currentTime = 0; }catch(e){}
    }
  });
  if(menu) observer.observe(menu, { attributes: true, attributeFilter: ['style'] });

  // expose respawn for pointerdown handler to reuse (keeps behavior consistent)
  window.__respawnWithColor = respawnWithColor;
})();

/* TASKS: eight tasks spread around the map */
const TASK_COUNT = 4;
const TASK_NEED = 2.0; // seconds hold required
const tasks = generateTasks(TASK_COUNT);

function generateTasks(n){
  const out = [];
  const margin = 48;
  for(let i=0;i<n;i++){
    const angle = (i / n) * Math.PI * 2 + (Math.random()-0.5)*0.3;
    const radius = Math.min(WORLD.w, WORLD.h) * 0.35 + (Math.random()-0.5)*40;
    const cx = WORLD.w/2 + Math.cos(angle)*radius;
    const cy = WORLD.h/2 + Math.sin(angle)*radius;
    out.push({ x: clamp(cx, margin, WORLD.w-margin), y: clamp(cy, margin, WORLD.h-margin), r: 12, done:false, progress:0, needs: TASK_NEED });
  }
  return out;
}

/* Input */
const keys = { up:0, down:0, left:0, right:0, action:0 };
window.addEventListener('keydown', e=>{
  if(e.key === 'w' || e.key === 'ArrowUp') keys.up=1;
  if(e.key === 's' || e.key === 'ArrowDown') keys.down=1;
  if(e.key === 'a' || e.key === 'ArrowLeft') keys.left=1;
  if(e.key === 'd' || e.key === 'ArrowRight') keys.right=1;
  if(e.key === ' ') keys.action = 1; // Space for hold action
});
window.addEventListener('keyup', e=>{
  if(e.key === 'w' || e.key === 'ArrowUp') keys.up=0;
  if(e.key === 's' || e.key === 'ArrowDown') keys.down=0;
  if(e.key === 'a' || e.key === 'ArrowLeft') keys.left=0;
  if(e.key === 'd' || e.key === 'ArrowRight') keys.right=0;
  if(e.key === ' ') keys.action = 0;
});

/* Nipple joystick for mobile */
let joy = { x:0,y:0 };
// mobile action button: map touches to space/action input
const mobileActionBtn = document.getElementById('action');
if(mobileActionBtn){
  // touch events
  mobileActionBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); keys.action = 1; }, {passive:false});
  mobileActionBtn.addEventListener('touchend',   (e)=>{ e.preventDefault(); keys.action = 0; }, {passive:false});
  // pointer/mouse fallback
  mobileActionBtn.addEventListener('pointerdown', (e)=>{ e.preventDefault(); keys.action = 1; });
  mobileActionBtn.addEventListener('pointerup',   (e)=>{ e.preventDefault(); keys.action = 0; });
  mobileActionBtn.addEventListener('pointercancel',(e)=>{ keys.action = 0; });
}

// setup nipple joystick only on small viewports
if(window.matchMedia && window.matchMedia('(max-width:899px)').matches){
  const zone = document.getElementById('joystick');
  const manager = nipplejs.create({ zone, mode:'static', position:{left:'60px', bottom:'60px'}, color:'#ffffff22', size:110 });
  manager.on('move', (evt, data)=>{
    if(!data || !data.vector) return;
    joy.x = data.vector.x;
    joy.y = -data.vector.y; // invert to match coordinate system
  });
  manager.on('end', ()=>{ joy.x=0; joy.y=0; });
}

/* Utility */
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function update(dt){
  if(caught || !running) return;

  elapsed += dt;

  // Input vector
  let ix = (keys.right - keys.left) || 0;
  let iy = (keys.down - keys.up) || 0;
  // Prefer joystick when active
  if(Math.abs(joy.x) > 0.01 || Math.abs(joy.y) > 0.01){
    ix = joy.x;
    iy = joy.y;
  }

  // Normalize input
  let im = Math.hypot(ix, iy);
  if(im > 1){
    ix /= im; iy /= im;
  }

  // Acceleration towards input
  const ACC = 700;
  crewmate.vx += ix * ACC * dt;
  crewmate.vy += iy * ACC * dt;

  // Apply friction / damping to prevent perpetual sliding when no input
  const speed = Math.hypot(crewmate.vx, crewmate.vy);
  if (speed > 0) {
    // detect whether player is providing input; if not, apply stronger damping so we stop quickly
    const hasInput = Math.abs(ix) > 0.001 || Math.abs(iy) > 0.001;
    const dec = (hasInput ? FRICTION : FRICTION * 4) * dt;
    const nsp = Math.max(0, speed - dec);

    // snap to zero when very slow to eliminate micro-sliding
    if (nsp < 10) {
      crewmate.vx = 0;
      crewmate.vy = 0;
    } else {
      crewmate.vx *= nsp / (speed || 1);
      crewmate.vy *= nsp / (speed || 1);
    }
  }

  // Clamp speed
  const cspeed = Math.hypot(crewmate.vx, crewmate.vy);
  if(cspeed > MAX_SPEED){
    crewmate.vx = (crewmate.vx / cspeed) * MAX_SPEED;
    crewmate.vy = (crewmate.vy / cspeed) * MAX_SPEED;
  }

  crewmate.x += crewmate.vx * dt;
  crewmate.y += crewmate.vy * dt;

  // World bounds (wrap edges for fast paced play)
  if(crewmate.x < -CREW_RADIUS) crewmate.x = WORLD.w + CREW_RADIUS;
  if(crewmate.x > WORLD.w + CREW_RADIUS) crewmate.x = -CREW_RADIUS;
  if(crewmate.y < -CREW_RADIUS) crewmate.y = WORLD.h + CREW_RADIUS;
  if(crewmate.y > WORLD.h + CREW_RADIUS) crewmate.y = -CREW_RADIUS;

  // TASK: handle hold-to-complete using Space (keys.action)
  if(keys.action){
    // search for nearby unfinished task
    for(const t of tasks){
      if(t.done) continue;
      const dx = crewmate.x - t.x;
      const dy = crewmate.y - t.y;
      const d = Math.hypot(dx, dy);
      if(d < CREW_RADIUS + t.r + 8){
        t.progress = (t.progress || 0) + dt;
        if(t.progress >= t.needs){
          t.done = true;
          t.progress = t.needs;
        }
        break; // only progress one task at a time
      }
    }
  } else {
    // decay progress if released
    for(const t of tasks){
      if(!t.done && t.progress){
        t.progress = Math.max(0, t.progress - dt*1.2);
      }
    }
  }

  // Imposter AI: simple pursuit with smoothing and obstacle-free world
  const dx = crewmate.x - imposter.x;
  const dy = crewmate.y - imposter.y;
  const dist = Math.hypot(dx, dy);
  let tx = 0, ty = 0;
  if(dist > 0.5){
    tx = dx / dist;
    ty = dy / dist;
  }
  // If far, run; if close, slightly slower (for tension)
  const targetSpeed = dist > 200 ? IMPO_SPEED * 1.25 : IMPO_SPEED;
  // Smooth velocity towards target vector
  const steerStrength = 8.0; // higher => quicker turn
  imposter.vx += (tx * targetSpeed - imposter.vx) * clamp(steerStrength * dt, 0, 1);
  imposter.vy += (ty * targetSpeed - imposter.vy) * clamp(steerStrength * dt, 0, 1);

  imposter.x += imposter.vx * dt;
  imposter.y += imposter.vy * dt;

  // Wrap imposter too
  if(imposter.x < -IMPO_RADIUS) imposter.x = WORLD.w + IMPO_RADIUS;
  if(imposter.x > WORLD.w + IMPO_RADIUS) imposter.x = -IMPO_RADIUS;
  if(imposter.y < -IMPO_RADIUS) imposter.y = WORLD.h + IMPO_RADIUS;
  if(imposter.y > WORLD.h + IMPO_RADIUS) imposter.y = -IMPO_RADIUS;

  // Check capture (imposter is the only one who can win by catching)
  if(dist < CREW_RADIUS + IMPO_RADIUS - 2){
    caught = true;
    document.getElementById('status').textContent = 'Caught';
    document.getElementById('status').style.color = '#ffd166';
    setTimeout(()=>{ running = false; }, 50);
    // show death panel if present and pause game
    const dp = document.getElementById('deathPanel');
    if(dp){
      // ensure the death panel shows and is on top
      dp.style.display = 'flex';
    }
    // pause gameplay music on death (use exposed global) and play imposter win sound
    if(window.gameMusic){
      try{ window.gameMusic.pause(); window.gameMusic.currentTime = 0; }catch(e){}
    }
    if(impostorWin){
      try{ impostorWin.currentTime = 0; impostorWin.play().catch(()=>{}); }catch(e){}
    }
  }
}

function draw(){
  // Background
  ctx.fillStyle = '#071218';
  ctx.fillRect(0,0,WORLD.w,WORLD.h);

  // Simple starfield
  drawGrid();

  // draw tasks
  for(const t of tasks){
    ctx.beginPath();
    ctx.fillStyle = t.done ? '#22c55e' : '#ffd166';
    ctx.globalAlpha = t.done ? 0.9 : 0.95;
    ctx.arc(t.x, t.y, t.r, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // progress ring
    if(!t.done && t.progress){
      const pct = Math.min(1, t.progress / t.needs);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,255,255,0.95)';
      ctx.lineWidth = 3;
      ctx.arc(t.x, t.y, t.r + 8, -Math.PI/2, -Math.PI/2 + Math.PI*2*pct);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.ceil((t.needs - t.progress)*10)/10}s`, t.x, t.y+4);
    }
  }

  // Draw others
  drawShadow(crewmate.x, crewmate.y, CREW_RADIUS);
  drawCharacter(crewmate.x, crewmate.y, CREW_RADIUS, crewmate.color, false);

  drawShadow(imposter.x, imposter.y, IMPO_RADIUS);
  drawCharacter(imposter.x, imposter.y, IMPO_RADIUS, imposter.color, true);

  // Tasks remaining UI
  const remaining = tasks.filter(t=>!t.done).length;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = "14px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Tasks: ${remaining}`, 8, 20);

  // Timer
  const mins = Math.floor(elapsed/60).toString().padStart(2,'0');
  const secs = Math.floor(elapsed%60).toString().padStart(2,'0');
  document.getElementById('timer').textContent = `${mins}:${secs}`;
}

function drawGrid(){
  // subtle dynamic grid to give depth
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  const spacing = 48;
  const offset = (performance.now()/60) % spacing;
  for(let x = -spacing; x < WORLD.w+spacing; x += spacing){
    ctx.beginPath();
    ctx.moveTo(x+offset, 0);
    ctx.lineTo(x+offset, WORLD.h);
    ctx.stroke();
  }
  for(let y = -spacing; y < WORLD.h+spacing; y += spacing){
    ctx.beginPath();
    ctx.moveTo(0, y+offset);
    ctx.lineTo(WORLD.w, y+offset);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShadow(x,y,r){
  ctx.save();
  ctx.beginPath();
  const g = ctx.createRadialGradient(x, y + r*0.6, r*0.2, x, y + r*0.6, r*1.6);
  g.addColorStop(0, 'rgba(0,0,0,0.45)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.ellipse(x, y + r*0.6, r*1.1, r*0.5, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawCharacter(x,y,r,color,isImposter){
  ctx.save();

  // If imposter and skin image loaded, draw the image scaled to character bounds
  if(isImposter && imposterImg && imposterImg.complete && imposterImg.naturalWidth){
    // compute desired image size (maintain aspect, fit into character box)
    const imgW = imposterImg.naturalWidth;
    const imgH = imposterImg.naturalHeight;
    // target box size (w x h)
    const targetW = r * 1.8;
    const targetH = r * 2.0;
    // maintain aspect ratio
    const scale = Math.min(targetW / imgW, targetH / imgH);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    // draw centered on (x,y)
    ctx.drawImage(imposterImg, x - drawW/2, y - drawH/2, drawW, drawH);
    ctx.restore();
    return;
  }

  // fallback procedural draw (same as before) with color tint
  ctx.translate(x,y);
  // body ellipse
  ctx.fillStyle = color;
  roundRect(ctx, -r*0.8, -r, r*1.6, r*1.6, r*0.4);
  ctx.fill();

  // visor
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  const w = r*0.8, h = r*0.5, ox = r*0.15, oy = -r*0.1;
  ctx.ellipse(ox, oy, w, h, 0, 0, Math.PI*2);
  ctx.fill();

  // mouth (imposter has tiny fang)
  if(isImposter){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.moveTo(r*0.1, r*0.1);
    ctx.lineTo(r*0.25, r*0.05);
    ctx.lineTo(r*0.1, r*0.0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Main loop */
function frame(now){
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* Touch to respawn after caught */
canvas.addEventListener('pointerdown', (e)=>{
  if(!caught) return;
  // If custom respawn helper exists (created by menu setup), use it so Play Again and pointer behave same
  if(window.__respawnWithColor){
    // use current crewmate color when tapping to respawn
    window.__respawnWithColor(crewmate.color || '#4bd0e8');
    // also hide death panel if visible
    const dp = document.getElementById('deathPanel');
    if(dp) dp.style.display = 'none';
    return;
  }
  // fallback respawn behavior (original)
  crewmate.x = WORLD.w*0.2 + Math.random()*WORLD.w*0.2;
  crewmate.y = WORLD.h*0.2 + Math.random()*WORLD.h*0.6;
  crewmate.vx = crewmate.vy = 0;
  imposter.x = WORLD.w*0.8 - Math.random()*WORLD.w*0.2;
  imposter.y = WORLD.h*0.2 + Math.random()*WORLD.h*0.6;
  imposter.vx = imposter.vy = 0;
  caught = false;
  elapsed = 0;
  running = true;
  document.getElementById('status').textContent = 'Alive';
  document.getElementById('status').style.color = '#e85d4b';
});

/* Prevent context menu on long press */
window.addEventListener('contextmenu', e=>e.preventDefault());
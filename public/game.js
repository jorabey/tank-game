// =========================================================
// 1. SOZLAMALAR
// =========================================================

if (typeof io === "undefined") {
  alert("XATO: socket.io topilmadi!");
}

const socket = io();

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const minimapCanvas = document.getElementById("minimapCanvas");
const minimapCtx = minimapCanvas.getContext("2d");

const WORLD_SIZE = 5000;
let camera = { x: 0, y: 0 };
let myId = null;
let me = null;
let players = {};
let bullets = [];
let particles = [];
let obstacles = [];
let gameActive = false;
let hasPassword = false;

// Inputlar
const keys = { w: false, a: false, s: false, d: false };
const joystick = { active: false, dx: 0, dy: 0, id: null };
const fireBtn = { active: false, id: null };
let mouse = { x: 0, y: 0, down: false };
let lastMobileAngle = 0;

// Timers
let respawnInterval = null;
let randomSearchInterval = null;
let waitTime = 20;
let selectedColor = null;

// Ranglar
const TANK_COLORS = [
  "#4b5320",
  "#556b2f",
  "#6b8e23",
  "#8b4513",
  "#a0522d",
  "#2f4f4f",
  "#708090",
];

// =========================================================
// 2. UI VA DIZAYN
// =========================================================

const customStyles = document.createElement("style");
customStyles.textContent = `
    /* Input Fix */
    input, textarea { -webkit-user-select: text !important; user-select: text !important; pointer-events: auto !important; }
    
    #toastContainer { z-index: 9999 !important; top: 20px !important; }

    /* Rang tanlagich */
    .color-option { width: 30px; height: 30px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.2s; }
    .color-option:hover { transform: scale(1.1); }
    .color-option.selected { border-color: white; box-shadow: 0 0 10px white; transform: scale(1.2); }
    
    #createColor, #joinColor, #randomColor { display: none !important; }

    /* UI Elementlar */
    #joystickZone { background: rgba(255,255,255,0.1) !important; border: 2px solid rgba(255,255,255,0.3) !important; }
    #joystickKnob { background: rgba(255,255,255,0.8) !important; }
    #fireBtn { width: 100px !important; height: 100px !important; right: 30px !important; bottom: 30px !important; background: rgba(255,0,0,0.3) !important; border: 4px solid rgba(255,100,100,0.6) !important; }
    #fireBtn:active { background: rgba(255,0,0,0.6) !important; }

    #killFeed { top: 100px !important; left: 50% !important; transform: translateX(-50%); width: 300px; pointer-events: none; z-index: 80; align-items: center !important; }
    #gameHUD .absolute.bottom-4.right-4 { top: 80px !important; left: 10px !important; bottom: auto !important; right: auto !important; border: 2px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.8); z-index: 40; }

    /* Exit Modal */
    #exitModal { background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); z-index: 10000; pointer-events: auto !important; }
    #exitModal button { pointer-events: auto !important; cursor: pointer; }
    
    .red-alert-border { box-shadow: inset 0 0 50px 20px red; animation: pulseAlert 0.5s infinite; }
    @keyframes pulseAlert { 0% { box-shadow: inset 0 0 50px 20px rgba(255,0,0,0.5); } 50% { box-shadow: inset 0 0 100px 40px rgba(255,0,0,0.8); } 100% { box-shadow: inset 0 0 50px 20px rgba(255,0,0,0.5); } }
`;
document.head.appendChild(customStyles);

// HTML Elementlarni Inyeksiya qilish
document.addEventListener("DOMContentLoaded", () => {
  const uiLayer = document.getElementById("uiLayer");

  // 1. RANDOM MENU
  const randomMenu = document.createElement("div");
  randomMenu.id = "randomMenu";
  randomMenu.className =
    "hidden pointer-events-auto absolute inset-0 flex items-center justify-center bg-gray-900/95 z-50";
  randomMenu.innerHTML = `
        <div class="bg-gray-800 p-6 rounded-xl w-full max-w-sm border border-gray-700 mx-4">
            <h2 class="text-xl font-bold mb-4 text-purple-400">Random O'yin</h2>
            <p class="text-gray-400 text-sm mb-4">Maksimum 3 ta bot qo'shiladi.</p>
            
            <input type="text" id="randomNick" placeholder="Nickname" class="w-full p-3 mb-3 bg-gray-700 text-white rounded outline-none">
            <input type="color" id="randomColor" value="#3b82f6" class="w-full h-10 mb-6 rounded cursor-pointer">
            
            <div class="flex gap-3">
                <button onclick="showScreen('mainMenu')" class="flex-1 py-3 bg-gray-600 text-white rounded font-bold">Orqaga</button>
                <button onclick="confirmRandomSearch()" class="flex-1 py-3 bg-purple-600 text-white rounded font-bold">Qidirish</button>
            </div>
        </div>
    `;
  uiLayer.appendChild(randomMenu);

  // 2. Waiting Screen
  const waitingScreen = document.createElement("div");
  waitingScreen.id = "waitingScreen";
  waitingScreen.className =
    "hidden pointer-events-auto absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50";
  waitingScreen.innerHTML = `
        <div class="text-4xl text-white font-bold mb-4 animate-pulse">Qidirilmoqda...</div>
        <div class="text-xl text-gray-300 mb-8">Kutilmoqda: <span id="waitPlayerCount" class="text-green-400">1</span></div>
        <div class="w-64 h-2 bg-gray-700 rounded-full mb-4 overflow-hidden">
            <div id="waitProgress" class="h-full bg-purple-500 w-0 transition-all duration-1000"></div>
        </div>
        <div id="waitTimer" class="text-2xl text-yellow-400 font-mono">20</div>
        <button onclick="cancelRandomSearch()" class="mt-8 px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded">Bekor qilish</button>
    `;
  uiLayer.appendChild(waitingScreen);

  // 3. Exit Modal
  const exitModal = document.createElement("div");
  exitModal.id = "exitModal";
  exitModal.className =
    "hidden absolute inset-0 flex items-center justify-center";
  exitModal.innerHTML = `
        <div class="bg-gray-800 p-6 rounded-xl border border-gray-600 text-center shadow-2xl relative z-50">
            <h3 class="text-2xl text-white font-bold mb-4">O'yindan chiqasizmi?</h3>
            <div class="flex gap-4 justify-center">
                <button id="btnExitNo" class="px-6 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-bold cursor-pointer">Yo'q</button>
                <button id="btnExitYes" class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold cursor-pointer">Ha</button>
            </div>
        </div>
    `;
  uiLayer.appendChild(exitModal);

  // Modal tugmalarini JS orqali bog'lash (onclick ba'zan ishlamaydi)
  document.getElementById("btnExitNo").onclick = closeExitModal;
  document.getElementById("btnExitYes").onclick = confirmExitGame;

  // 4. Random Button on Main Menu
  const mainMenu = document.getElementById("mainMenu");
  if (mainMenu) {
    const btnContainer = mainMenu.querySelector("div.flex-col");
    if (btnContainer && !document.getElementById("btnRandomMenu")) {
      const randomBtn = document.createElement("button");
      randomBtn.id = "btnRandomMenu";
      randomBtn.className =
        "py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-lg text-lg mt-2";
      randomBtn.innerHTML = '<i class="fas fa-random mr-2"></i> RANDOM O\'YIN';
      randomBtn.onclick = () => {
        selectedColor = null;
        showScreen("randomMenu");
      };
      btnContainer.appendChild(randomBtn);
    }

    const onlineDiv = document.createElement("div");
    onlineDiv.className =
      "absolute top-4 right-4 bg-gray-800/80 px-4 py-2 rounded-full text-sm text-green-400 font-bold border border-green-500 shadow-lg";
    onlineDiv.innerHTML =
      '<i class="fas fa-globe"></i> Onlayn: <span id="onlineCountVal">1</span>';
    mainMenu.appendChild(onlineDiv);
  }

  // 5. Fullscreen Button
  const hudTop = document.querySelector(
    "#gameHUD .absolute.top-0 .flex.justify-between div:first-child"
  );
  if (hudTop) {
    const fsBtn = document.createElement("button");
    fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fsBtn.className =
      "ml-2 w-6 h-6 bg-gray-700 rounded flex items-center justify-center text-white text-xs hover:bg-gray-600 pointer-events-auto";
    fsBtn.onclick = toggleFullScreen;
    hudTop.appendChild(fsBtn);
  }

  createColorPicker("createColor");
  createColorPicker("joinColor");
  createColorPicker("randomColor");

  document.querySelectorAll("input").forEach((input) => {
    input.addEventListener(
      "touchstart",
      (e) => {
        e.stopPropagation();
      },
      { passive: false }
    );
  });
});

function createColorPicker(containerId) {
  const input = document.getElementById(containerId);
  if (!input) return;
  const container = input.parentElement;
  const pickerDiv = document.createElement("div");
  pickerDiv.className = "flex gap-2 justify-center mb-4 flex-wrap";

  TANK_COLORS.forEach((color) => {
    const circle = document.createElement("div");
    circle.className = "color-option";
    circle.style.backgroundColor = color;
    circle.onclick = () => {
      container
        .querySelectorAll(".color-option")
        .forEach((c) => c.classList.remove("selected"));
      circle.classList.add("selected");
      selectedColor = color;
    };
    pickerDiv.appendChild(circle);
  });
  input.insertAdjacentElement("beforebegin", pickerDiv);
}

function showScreen(screenId) {
  const screens = [
    "mainMenu",
    "createMenu",
    "joinMenu",
    "randomMenu",
    "gameHUD",
    "gameOverScreen",
    "waitingScreen",
  ];
  screens.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  const target = document.getElementById(screenId);
  if (target) target.classList.remove("hidden");
}

function getFinalColor() {
  return (
    selectedColor || TANK_COLORS[Math.floor(Math.random() * TANK_COLORS.length)]
  );
}

// Global window funksiyalari
window.showScreen = showScreen;
window.closeExitModal = function () {
  document.getElementById("exitModal").classList.add("hidden");
};
window.confirmExitGame = function () {
  window.closeExitModal();
  socket.emit("leave_game");
  location.reload();
};
window.toggleFullScreen = function () {
  if (!document.fullscreenElement) {
    document.documentElement
      .requestFullscreen()
      .catch((err) => console.log(err));
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
};

// --- RANDOM O'YIN ---
window.confirmRandomSearch = function () {
  const nick = document.getElementById("randomNick").value.trim();
  if (!nick) return showToast("Nickname yozing!", "error");

  showScreen("waitingScreen");
  waitTime = 20;
  document.getElementById("waitTimer").innerText = waitTime;
  document.getElementById("waitProgress").style.width = "0%";

  socket.emit("find_random_game", { nick: nick, color: getFinalColor() });

  if (randomSearchInterval) clearInterval(randomSearchInterval);
  randomSearchInterval = setInterval(() => {
    waitTime--;
    document.getElementById("waitTimer").innerText = waitTime;
    document.getElementById("waitProgress").style.width = `${
      (20 - waitTime) * 5
    }%`;
    if (waitTime <= 0) clearInterval(randomSearchInterval);
  }, 1000);
};

window.cancelRandomSearch = function () {
  if (randomSearchInterval) clearInterval(randomSearchInterval);
  socket.emit("leave_random_queue");
  showScreen("mainMenu");
};

// --- XARITA ---
function generateObstacles() {
  obstacles = [];
  const count = 150;
  for (let i = 0; i < count; i++) {
    const x = ((i * 1234567) % (WORLD_SIZE - 200)) + 100;
    const y = ((i * 7654321) % (WORLD_SIZE - 200)) + 100;
    const seed = i % 10;
    let type, radius, width, height;

    if (seed < 3) {
      type = "wall";
      width = 60;
      height = 60;
      radius = 40;
    } else {
      type = "bush";
      radius = seed % 2 === 0 ? 50 : 30;
    }
    obstacles.push({ x, y, type, radius, width, height });
  }
}

// Tugmalarni bog'lash
const btnShowCreate = document.getElementById("btnShowCreate");
if (btnShowCreate)
  btnShowCreate.onclick = () => {
    selectedColor = null;
    showScreen("createMenu");
  };

const btnShowJoin = document.getElementById("btnShowJoin");
if (btnShowJoin)
  btnShowJoin.onclick = () => {
    selectedColor = null;
    showScreen("joinMenu");
  };

const btnBackFromCreate = document.getElementById("btnBackFromCreate");
if (btnBackFromCreate) btnBackFromCreate.onclick = () => showScreen("mainMenu");

const btnBackFromJoin = document.getElementById("btnBackFromJoin");
if (btnBackFromJoin) btnBackFromJoin.onclick = () => showScreen("mainMenu");

// Create Game
const btnStartGame = document.getElementById("btnStartGame");
if (btnStartGame)
  btnStartGame.onclick = () => {
    const nick = document.getElementById("createNick").value.trim();
    if (!nick) return showToast("Nickname yozing!", "error");

    // Validatsiya
    let maxP = parseInt(document.getElementById("createMaxPlayers").value);
    let time = parseFloat(document.getElementById("createTime").value);

    if (maxP < 2) maxP = 2;
    if (maxP > 10) maxP = 10;
    if (time < 0.5) time = 0.5;
    if (time > 60) time = 60;

    const pass = document.getElementById("createPass").value;
    hasPassword = !!pass;

    socket.emit("create_game", {
      nick: nick,
      maxPlayers: maxP,
      time: time,
      pass: pass,
      color: getFinalColor(),
    });
  };

// Join Game
const btnJoinGame = document.getElementById("btnJoinGame");
if (btnJoinGame)
  btnJoinGame.onclick = () => {
    const id = document.getElementById("joinId").value.trim();
    const nick = document.getElementById("joinNick").value.trim();
    if (!id || !nick) return showToast("ID va Nickname kerak!", "error");
    const pass = document.getElementById("joinPass").value;
    hasPassword = !!pass;
    socket.emit("join_game", {
      gameId: id,
      nick: nick,
      pass: pass,
      color: getFinalColor(),
    });
  };

// Exit Button (Modalni ochish)
const btnExit = document.getElementById("btnExit");
if (btnExit)
  btnExit.onclick = () => {
    document.getElementById("exitModal").classList.remove("hidden");
  };

const btnCopyId = document.getElementById("btnCopyId");
if (btnCopyId)
  btnCopyId.onclick = () => {
    const txt = document
      .getElementById("displayGameId")
      .innerText.replace(/\s/g, "");
    navigator.clipboard.writeText(txt);
    showToast("ID nusxalandi!", "success");
  };

function showToast(msg, type) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `px-4 py-2 rounded-lg text-white font-bold text-sm shadow-lg mb-2 transition-all transform translate-y-0 ${
    type === "error" ? "bg-red-600" : "bg-blue-600"
  }`;
  el.innerText = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// --- SOCKET EVENTS ---

socket.on("toast", (data) => showToast(data.msg, data.type));
socket.on("online_count", (count) => {
  const el = document.getElementById("onlineCountVal");
  if (el) el.innerText = count;
});
socket.on("queue_update", (data) => {
  const el = document.getElementById("waitPlayerCount");
  if (el) el.innerText = data.current;
});

socket.on("disconnect", () => {
  if (gameActive) {
    alert("Server bilan aloqa uzildi!");
    location.reload();
  }
});

socket.on("game_started", (data) => {
  if (randomSearchInterval) clearInterval(randomSearchInterval);
  myId = data.playerId;
  const dispId = document.getElementById("displayGameId");
  const icon = hasPassword
    ? '<i class="fas fa-lock text-red-400 ml-1"></i>'
    : '<i class="fas fa-lock-open text-green-400 ml-1"></i>';
  if (dispId) dispId.innerHTML = data.gameId + " " + icon;

  generateObstacles();
  showScreen("gameHUD");
  gameActive = true;

  if (
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    window.innerWidth < 1000
  ) {
    document.getElementById("joystickZone").style.display = "block";
    document.getElementById("fireBtn").style.display = "flex";
  }
  resize();
  gameLoop();
});

socket.on("update_state", (data) => {
  if (!gameActive) return;
  players = data.players;
  bullets = data.bullets;
  me = players[myId];

  if (!me) {
    alert("Siz o'yindan chiqarildingiz!");
    location.reload();
    return;
  }

  const timeLeft = data.timeLeft;
  const totalSecs = Math.ceil(timeLeft / 1000);
  const min = Math.floor(totalSecs / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSecs % 60).toString().padStart(2, "0");
  document.getElementById("gameTimer").innerText = `${min}:${sec}`;

  const uiLayer = document.getElementById("uiLayer");
  if (timeLeft < 6000 && timeLeft > 0) {
    uiLayer.classList.add("red-alert-border");
    let alertNum = document.getElementById("alertCountdown");
    if (!alertNum) {
      alertNum = document.createElement("div");
      alertNum.id = "alertCountdown";
      alertNum.style.position = "absolute";
      alertNum.style.top = "30%";
      alertNum.style.left = "50%";
      alertNum.style.transform = "translate(-50%, -50%)";
      alertNum.style.fontSize = "120px";
      alertNum.style.fontWeight = "bold";
      alertNum.style.color = "#ef4444";
      alertNum.style.zIndex = "100";
      alertNum.style.textShadow = "0 0 20px black";
      document.getElementById("uiLayer").appendChild(alertNum);
    }
    alertNum.innerText = totalSecs;
  } else {
    uiLayer.classList.remove("red-alert-border");
    const alertNum = document.getElementById("alertCountdown");
    if (alertNum) alertNum.remove();
  }

  updateHUD();
});

socket.on("hit_effect", (data) => {
  createExplosion(data.x, data.y);
  if (data.targetId === myId) {
    const overlay = document.getElementById("damageOverlay");
    overlay.style.opacity = "0.6";
    setTimeout(() => (overlay.style.opacity = "0"), 100);
  }
});

socket.on("kill_feed", (data) => {
  const feed = document.getElementById("killFeed");
  const item = document.createElement("div");
  item.className =
    "text-white bg-gray-900/80 px-4 py-2 rounded-full text-sm mb-2 font-bold border border-gray-600 shadow-md flex items-center gap-2";
  item.innerHTML = `<span style="color:#60a5fa">${data.killer}</span> <i class="fas fa-skull-crossbones text-gray-400"></i> <span style="color:#f87171">${data.victim}</span>`;
  feed.prepend(item);
  setTimeout(() => {
    item.style.transition = "opacity 0.5s";
    item.style.opacity = "0";
    setTimeout(() => item.remove(), 500);
  }, 3000);
  if (feed.children.length > 3) feed.lastChild.remove();
});

socket.on("game_over", (finalPlayers) => {
  gameActive = false;
  showScreen("gameOverScreen");
  const sorted = Object.values(finalPlayers).sort((a, b) => b.xp - a.xp);
  const winnerId = sorted[0]?.id;
  const titleEl = document.querySelector("#gameOverScreen h2");

  if (myId === winnerId) {
    titleEl.innerText = "🎉 G'OLIB! 🎉";
    titleEl.className =
      "text-5xl font-black text-green-500 mb-4 animate-bounce text-center";
  } else {
    titleEl.innerText = "O'yin Tugadi";
    titleEl.className = "text-4xl font-black text-yellow-500 mb-4 text-center";
  }

  const tbody = document.getElementById("leaderboardBody");
  tbody.innerHTML = "";
  sorted.forEach((p, i) => {
    tbody.innerHTML += `
            <tr class="border-b border-gray-700 hover:bg-gray-700/30">
                <td class="p-3">${i + 1}</td>
                <td class="p-3 font-bold ${
                  p.id === myId ? "text-blue-400" : "text-white"
                }">${p.nick}</td>
                <td class="p-3 text-center text-green-400 font-mono">${
                  p.kills
                }</td>
                <td class="p-3 text-center text-red-400 font-mono">${
                  p.deaths
                }</td>
                <td class="p-3 text-right text-yellow-400 font-mono font-bold">${Math.floor(
                  p.xp
                )}</td>
            </tr>`;
  });

  let t = 15;
  const timerEl = document.getElementById("autoExitTimer");
  if (window.endGameInterval) clearInterval(window.endGameInterval);
  window.endGameInterval = setInterval(() => {
    t--;
    if (timerEl) timerEl.innerText = t;
    if (t <= 0) {
      clearInterval(window.endGameInterval);
      location.reload();
    }
  }, 1000);
});

// =========================================================
// 4. MANTIQ VA CHIZISH
// =========================================================

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);

function gameLoop() {
  if (!gameActive) return;
  updateInput();
  render();
  requestAnimationFrame(gameLoop);
}

function checkCollision(x, y) {
  const tankRadius = 25;
  for (const pid in players) {
    if (pid === myId) continue;
    const p = players[pid];
    if (p.isDead) continue;
    const dx = x - p.x;
    const dy = y - p.y;
    if (Math.sqrt(dx * dx + dy * dy) < tankRadius * 2) return true;
  }
  for (const obs of obstacles) {
    if (obs.type === "wall") {
      const halfW = obs.width / 2;
      const halfH = obs.height / 2;
      const circleDistanceX = Math.abs(x - obs.x);
      const circleDistanceY = Math.abs(y - obs.y);
      if (circleDistanceX > halfW + tankRadius) continue;
      if (circleDistanceY > halfH + tankRadius) continue;
      if (circleDistanceX <= halfW) return true;
      if (circleDistanceY <= halfH) return true;
      const cornerDistance_sq =
        (circleDistanceX - halfW) ** 2 + (circleDistanceY - halfH) ** 2;
      if (cornerDistance_sq <= tankRadius ** 2) return true;
    } else if (obs.type === "rock") {
      const dx = x - obs.x;
      const dy = y - obs.y;
      if (Math.sqrt(dx * dx + dy * dy) < tankRadius + obs.radius) return true;
    }
  }
  return false;
}

// O'qning to'siqqa urilishini vizual tekshirish
function checkBulletWallCollision(bx, by) {
  for (const obs of obstacles) {
    if (obs.type === "bush") continue;
    if (obs.type === "wall") {
      const halfW = obs.width / 2;
      const halfH = obs.height / 2;
      if (
        bx >= obs.x - halfW &&
        bx <= obs.x + halfW &&
        by >= obs.y - halfH &&
        by <= obs.y + halfH
      )
        return true;
    } else if (obs.type === "rock") {
      const dx = bx - obs.x;
      const dy = by - obs.y;
      if (dx * dx + dy * dy < obs.radius * obs.radius) return true;
    }
  }
  return false;
}

function updateInput() {
  if (!me || me.isDead) return;

  let dx = 0,
    dy = 0;
  if (keys.w) dy = -1;
  if (keys.s) dy = 1;
  if (keys.a) dx = -1;
  if (keys.d) dx = 1;

  if (joystick.active) {
    dx = joystick.dx;
    dy = joystick.dy;
  }

  const speed = 8;
  if (dx !== 0 || dy !== 0) {
    const nextX = me.x + dx * speed;
    const nextY = me.y + dy * speed;
    if (!checkCollision(nextX, nextY)) {
      me.x = nextX;
      me.y = nextY;
    } else {
      if (!checkCollision(nextX, me.y)) me.x = nextX;
      else if (!checkCollision(me.x, nextY)) me.y = nextY;
    }
    me.angle = Math.atan2(dy, dx);
  }

  let turretAngle = me.angle;
  if (joystick.active) {
    lastMobileAngle = me.angle;
    turretAngle = me.angle;
  } else if (dx !== 0 || dy !== 0) {
    turretAngle = me.angle;
  } else {
    if (
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
      window.innerWidth < 1000
    ) {
      turretAngle = lastMobileAngle;
    } else {
      const screenX = me.x - camera.x;
      const screenY = me.y - camera.y;
      turretAngle = Math.atan2(mouse.y - screenY, mouse.x - screenX);
    }
  }

  socket.emit("input_update", {
    x: me.x,
    y: me.y,
    angle: me.angle,
    turretAngle: turretAngle,
  });

  const now = Date.now();
  if (
    (mouse.down || fireBtn.active) &&
    (!me.lastShot || now - me.lastShot > 800)
  ) {
    me.lastShot = now;
    socket.emit("shoot", { x: me.x, y: me.y, angle: turretAngle });
    camera.x += Math.cos(turretAngle + Math.PI) * 5;
    camera.y += Math.sin(turretAngle + Math.PI) * 5;
  }
}

function render() {
  if (me) {
    camera.x = me.x - canvas.width / 2;
    camera.y = me.y - canvas.height / 2;
    camera.x = Math.max(0, Math.min(WORLD_SIZE - canvas.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_SIZE - canvas.height, camera.y));
  }

  ctx.fillStyle = "#5d5b4e";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawGrid();
  drawObstacles();

  ctx.fillStyle = "#fbbf24";
  ctx.shadowBlur = 10;
  ctx.shadowColor = "orange";

  bullets.forEach((b, index) => {
    // O'q to'siqqa urilsa, uni chizmaymiz va portlash effektini ko'rsatamiz
    if (checkBulletWallCollision(b.x, b.y)) {
      createExplosion(b.x, b.y);
      bullets.splice(index, 1);
      return;
    }
    ctx.beginPath();
    ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;

  for (const pid in players) {
    const p = players[pid];
    if (p.isDead) continue;
    drawPlayer(p);
  }

  particles.forEach((p, i) => {
    p.life -= 0.05;
    p.x += p.vx;
    p.y += p.vy;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (p.life <= 0) particles.splice(i, 1);
  });

  ctx.strokeStyle = "red";
  ctx.lineWidth = 10;
  ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
  ctx.restore();

  drawMinimap();
  drawIndicators();
}

function drawGrid() {
  const size = 200;
  const startX = Math.floor(camera.x / size) * size;
  const startY = Math.floor(camera.y / size) * size;
  ctx.fillStyle = "#4a5d3f";
  for (let x = startX; x < camera.x + canvas.width + size; x += 50) {
    for (let y = startY; y < camera.y + canvas.height + size; y += 50) {
      if ((x + y) % 7 === 0) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

function drawObstacles() {
  obstacles.forEach((obs) => {
    if (
      obs.x < camera.x - 100 ||
      obs.x > camera.x + canvas.width + 100 ||
      obs.y < camera.y - 100 ||
      obs.y > camera.y + canvas.height + 100
    )
      return;

    if (obs.type === "wall") {
      ctx.fillStyle = "#7f8c8d";
      ctx.fillRect(
        obs.x - obs.width / 2,
        obs.y - obs.height / 2,
        obs.width,
        obs.height
      );
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 3;
      ctx.strokeRect(
        obs.x - obs.width / 2,
        obs.y - obs.height / 2,
        obs.width,
        obs.height
      );
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(
        obs.x + obs.width / 2,
        obs.y - obs.height / 2 + 10,
        10,
        obs.height
      );
    } else if (obs.type === "bush") {
      ctx.fillStyle = "rgba(34, 139, 34, 0.8)";
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#006400";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(obs.x, obs.y, obs.radius - 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}

function drawPlayer(p) {
  ctx.save();
  ctx.translate(p.x, p.y);

  ctx.fillStyle = "white";
  ctx.font = "bold 14px Arial";
  ctx.textAlign = "center";
  ctx.fillText(p.nick, 0, -55);

  ctx.fillStyle = "#333";
  ctx.fillRect(-25, -45, 50, 6);
  ctx.fillStyle = p.hp > 50 ? "#22c55e" : "red";
  ctx.fillRect(-25, -45, 50 * (p.hp / 100), 6);

  ctx.rotate(p.angle);

  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(-28, -25, 10, 50);
  ctx.fillRect(18, -25, 10, 50);

  ctx.fillStyle = "#333";
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(-28, -20 + i * 10, 10, 2);
    ctx.fillRect(18, -20 + i * 10, 10, 2);
  }

  ctx.fillStyle = p.color;
  ctx.fillRect(-20, -22, 40, 44);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(-15, -15, 30, 30);

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(-20, -22, 40, 44);

  ctx.rotate(p.turretAngle - p.angle);

  ctx.fillStyle = "#2d3748";
  ctx.fillRect(10, -5, 35, 10);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(10, -5, 35, 10);
  ctx.fillStyle = "#1a202c";
  ctx.fillRect(42, -6, 5, 12);

  ctx.fillStyle = p.color;
  ctx.filter = "brightness(90%)";
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.filter = "none";

  ctx.strokeStyle = "#1a202c";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMinimap() {
  minimapCtx.clearRect(0, 0, 150, 150);
  const scale = 150 / WORLD_SIZE;
  minimapCtx.fillStyle = "#555";
  obstacles.forEach((obs) => {
    if (obs.type === "wall") {
      minimapCtx.fillRect(obs.x * scale - 2, obs.y * scale - 2, 4, 4);
    }
  });
  for (const pid in players) {
    const p = players[pid];
    if (p.isDead) continue;
    minimapCtx.fillStyle = pid === myId ? "#3b82f6" : "red";
    minimapCtx.beginPath();
    minimapCtx.arc(p.x * scale, p.y * scale, 3, 0, Math.PI * 2);
    minimapCtx.fill();
  }
}

function drawIndicators() {
  if (!me || me.isDead) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  for (const pid in players) {
    if (pid === myId || players[pid].isDead) continue;
    const p = players[pid];
    const dx = p.x - me.x;
    const dy = p.y - me.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > Math.min(canvas.width, canvas.height) / 2 && dist < 1500) {
      const angle = Math.atan2(dy, dx);
      const r = Math.min(canvas.width, canvas.height) / 2 - 50;
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      ctx.lineTo(
        cx + Math.cos(angle - 0.1) * (r - 20),
        cy + Math.sin(angle - 0.1) * (r - 20)
      );
      ctx.lineTo(
        cx + Math.cos(angle + 0.1) * (r - 20),
        cy + Math.sin(angle + 0.1) * (r - 20)
      );
      ctx.fill();
    }
  }
}

function updateHUD() {
  if (me) {
    const hpEl = document.getElementById("statHP");
    const xpEl = document.getElementById("statXP");
    const kdEl = document.getElementById("statKD");
    if (hpEl) hpEl.innerText = Math.max(0, me.hp);
    if (xpEl) xpEl.innerText = Math.floor(me.xp);
    if (kdEl) kdEl.innerText = `${me.kills}/${me.deaths}`;

    const respawnScreen = document.getElementById("respawnScreen");
    const respTimer = document.getElementById("respawnTimer");

    if (me.isDead) {
      if (respawnScreen) {
        respawnScreen.classList.remove("hidden");
        if (!respawnInterval) {
          let count = 5;
          if (respTimer) respTimer.innerText = count;
          respawnInterval = setInterval(() => {
            count--;
            if (respTimer) respTimer.innerText = count;
            if (count <= 0) {
              clearInterval(respawnInterval);
              respawnInterval = null;
            }
          }, 1000);
        }
      }
    } else {
      if (respawnScreen) respawnScreen.classList.add("hidden");
      if (respawnInterval) {
        clearInterval(respawnInterval);
        respawnInterval = null;
      }
    }
  }
  const list = document.getElementById("playerList");
  if (list) {
    list.innerHTML = "";
    const sortedPlayers = Object.values(players).sort((a, b) => b.xp - a.xp);
    sortedPlayers.forEach((p) => {
      const li = document.createElement("li");
      li.className = "flex justify-between";
      li.innerHTML = `<span class="${
        p.id === myId ? "text-blue-400 font-bold" : ""
      }">${p.nick}</span> <span class="text-yellow-500">${Math.floor(
        p.xp
      )}</span>`;
      list.appendChild(li);
    });
  }
}

function createExplosion(x, y) {
  for (let i = 0; i < 15; i++) {
    particles.push({
      x: x,
      y: y,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      life: 1.0,
      color: `hsl(${Math.random() * 60 + 10}, 100%, 50%)`,
      size: Math.random() * 5 + 2,
    });
  }
}

// =========================================================
// 5. INPUT HANDLERS
// =========================================================

window.addEventListener("keydown", (e) => {
  if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});
window.addEventListener("keyup", (e) => {
  if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
window.addEventListener("mousedown", () => (mouse.down = true));
window.addEventListener("mouseup", () => (mouse.down = false));

const joyZone = document.getElementById("joystickZone");
const joyKnob = document.getElementById("joystickKnob");
const fireBtnEl = document.getElementById("fireBtn");
const joyCenter = { x: 70, y: 70 };

document.body.addEventListener(
  "touchmove",
  function (e) {
    if (!gameActive) return;
    if (
      e.target === joyZone ||
      joyZone.contains(e.target) ||
      e.target === fireBtnEl ||
      fireBtnEl.contains(e.target)
    ) {
      e.preventDefault();
    }
  },
  { passive: false }
);

function handleTouch(e) {
  if (!gameActive) return;
  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const t = touches[i];
    const target = t.target;
    if (
      joystick.id === null &&
      (target === joyZone || joyZone.contains(target))
    ) {
      e.preventDefault();
      joystick.id = t.identifier;
      updateJoystick(t);
    } else if (joystick.id === t.identifier) {
      e.preventDefault();
      updateJoystick(t);
    }
    if (
      fireBtn.id === null &&
      (target === fireBtnEl || fireBtnEl.contains(target))
    ) {
      e.preventDefault();
      fireBtn.id = t.identifier;
      fireBtn.active = true;
      fireBtnEl.style.transform = "scale(0.9)";
    }
  }
}

function updateJoystick(t) {
  const rect = joyZone.getBoundingClientRect();
  const x = t.clientX - rect.left;
  const y = t.clientY - rect.top;
  let dx = x - joyCenter.x;
  let dy = y - joyCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const maxDist = 40;
  if (dist > maxDist) {
    const angle = Math.atan2(dy, dx);
    dx = Math.cos(angle) * maxDist;
    dy = Math.sin(angle) * maxDist;
  }
  joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  joystick.active = true;
  joystick.dx = dx / maxDist;
  joystick.dy = dy / maxDist;
}

function endTouch(e) {
  const touches = e.changedTouches;
  for (let i = 0; i < touches.length; i++) {
    const t = touches[i];
    if (joystick.id === t.identifier) {
      joystick.id = null;
      joystick.active = false;
      joystick.dx = 0;
      joystick.dy = 0;
      joyKnob.style.transform = `translate(-50%, -50%)`;
    }
    if (fireBtn.id === t.identifier) {
      fireBtn.id = null;
      fireBtn.active = false;
      fireBtnEl.style.transform = "scale(1)";
    }
  }
}

window.addEventListener("touchstart", handleTouch, { passive: false });
window.addEventListener("touchmove", handleTouch, { passive: false });
window.addEventListener("touchend", endTouch);
window.addEventListener("touchcancel", endTouch);

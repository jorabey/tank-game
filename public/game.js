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

// Timers va Holat
let respawnInterval = null;
let selectedColor = null;
let lastPingTime = 0;

// Ovozli Chat
let localStream = null;
let mediaRecorder = null;
let audioContext = new (window.AudioContext || window.webkitAudioContext)();
let nextStartTime = 0;

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
    input, textarea { -webkit-user-select: text !important; user-select: text !important; pointer-events: auto !important; }
    #toastContainer { z-index: 9999 !important; top: 20px !important; }

    .color-option { width: 30px; height: 30px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: transform 0.2s; }
    .color-option:hover { transform: scale(1.1); }
    .color-option.selected { border-color: white; box-shadow: 0 0 10px white; transform: scale(1.2); }
    
    #createColor, #joinColor, #randomColor { display: none !important; }

    #joystickZone { background: rgba(255,255,255,0.1) !important; border: 2px solid rgba(255,255,255,0.3) !important; }
    #joystickKnob { background: rgba(255,255,255,0.8) !important; }
    #fireBtn { width: 100px !important; height: 100px !important; right: 30px !important; bottom: 30px !important; background: rgba(255,0,0,0.3) !important; border: 4px solid rgba(255,100,100,0.6) !important; }
    #fireBtn:active { background: rgba(255,0,0,0.6) !important; }

    #killFeed { top: 100px !important; left: 50% !important; transform: translateX(-50%); width: 300px; pointer-events: none; z-index: 80; align-items: center !important; }
    #gameHUD .absolute.bottom-4.right-4 { top: 80px !important; left: 10px !important; bottom: auto !important; right: auto !important; border: 2px solid rgba(255,255,255,0.3); background: rgba(0,0,0,0.8); z-index: 40; }

    #exitModal, #helpModal { background: rgba(0,0,0,0.85); backdrop-filter: blur(5px); z-index: 10000; pointer-events: auto !important; }
    #exitModal button, #helpModal button, #helpModal a { pointer-events: auto !important; cursor: pointer; }
    
    .control-btn { width: 40px; height: 40px; background: rgba(0,0,0,0.6); border: 1px solid #555; border-radius: 50%; color: white; display: flex; justify-content: center; align-items: center; pointer-events: auto; cursor: pointer; transition: 0.2s; }
    .control-btn.active { background: #22c55e; border-color: #22c55e; }
    .control-btn:hover { transform: scale(1.1); }

    #chatModal { background: rgba(0,0,0,0.5); z-index: 9500; }

    .red-alert-border { box-shadow: inset 0 0 50px 20px red; animation: pulseAlert 0.5s infinite; }
    @keyframes pulseAlert { 0% { box-shadow: inset 0 0 50px 20px rgba(255,0,0,0.5); } 50% { box-shadow: inset 0 0 100px 40px rgba(255,0,0,0.8); } 100% { box-shadow: inset 0 0 50px 20px rgba(255,0,0,0.5); } }
`;
document.head.appendChild(customStyles);

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
            <input type="text" id="randomNick" placeholder="Nickname" class="w-full p-3 mb-3 bg-gray-700 text-white rounded outline-none">
            <input type="color" id="randomColor" value="#3b82f6" class="w-full h-10 mb-6 rounded cursor-pointer">
            <div class="flex gap-3">
                <button id="btnBackRandom" class="flex-1 py-3 bg-gray-600 text-white rounded font-bold">Orqaga</button>
                <button id="btnStartRandom" class="flex-1 py-3 bg-purple-600 text-white rounded font-bold">Boshlash</button>
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

  // 4. Help Modal
  const helpModal = document.createElement("div");
  helpModal.id = "helpModal";
  helpModal.className =
    "hidden absolute inset-0 flex items-center justify-center";
  helpModal.innerHTML = `
        <div class="bg-gray-900 p-8 rounded-2xl border-2 border-blue-500 text-center shadow-2xl relative z-50 max-w-sm w-full mx-4">
            <h2 class="text-3xl text-blue-400 font-black mb-2 uppercase tracking-wider">Muallif</h2>
            <p class="text-white text-xl mb-6 font-bold">Sattorov Jo'rabek</p>
            
            <div class="space-y-4 mb-8">
                <a href="https://instagram.com/jorabey.dev" target="_blank" class="block w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg text-white font-bold hover:opacity-90 transform hover:scale-105 transition no-underline">
                    <i class="fab fa-instagram mr-2"></i> Instagram
                </a>
                <a href="https://t.me/jorabeyDev" target="_blank" class="block w-full py-3 bg-blue-500 rounded-lg text-white font-bold hover:bg-blue-600 transform hover:scale-105 transition no-underline">
                    <i class="fab fa-telegram mr-2"></i> Telegram
                </a>
            </div>
            
            <button id="btnCloseHelp" class="text-gray-400 hover:text-white underline">Yopish</button>
        </div>
    `;
  uiLayer.appendChild(helpModal);

  // 5. Chat Input
  const chatModal = document.createElement("div");
  chatModal.id = "chatModal";
  chatModal.className =
    "hidden absolute inset-0 flex items-end justify-center pb-20 pointer-events-auto";
  chatModal.innerHTML = `
        <div class="bg-gray-800 p-2 rounded-lg flex gap-2 w-full max-w-md mx-4 border border-gray-600 shadow-xl">
            <input type="text" id="chatInput" class="flex-1 bg-gray-700 text-white px-3 py-2 rounded outline-none" placeholder="Xabar yozing..." maxlength="50">
            <button id="btnSendChat" class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold"><i class="fas fa-paper-plane"></i></button>
            <button id="btnCloseChat" class="bg-red-600 hover:bg-red-500 text-white px-3 py-2 rounded"><i class="fas fa-times"></i></button>
        </div>
    `;
  uiLayer.appendChild(chatModal);

  // 6. Main Menu Buttons
  const mainMenu = document.getElementById("mainMenu");
  if (mainMenu) {
    const btnContainer = mainMenu.querySelector("div.flex-col");
    if (btnContainer && !document.getElementById("btnRandomMenu")) {
      const randomBtn = document.createElement("button");
      randomBtn.id = "btnRandomMenu";
      randomBtn.className =
        "py-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold shadow-lg text-lg mt-2";
      randomBtn.innerHTML = '<i class="fas fa-random mr-2"></i> RANDOM O\'YIN';
      btnContainer.appendChild(randomBtn);

      const helpBtn = document.createElement("button");
      helpBtn.id = "btnHelp";
      helpBtn.className =
        "mt-4 text-gray-400 hover:text-white underline text-sm";
      helpBtn.innerHTML =
        '<i class="fas fa-question-circle"></i> Help & Credits';
      mainMenu.appendChild(helpBtn);
    }

    let credit = document.getElementById("creditFooter");
    if (!credit) {
      credit = document.createElement("div");
      credit.id = "creditFooter";
      credit.className = "absolute bottom-2 text-gray-500 text-xs";
      credit.innerHTML = "By Sattorov Jo'rabek";
      mainMenu.appendChild(credit);
    }

    const onlineDiv = document.createElement("div");
    onlineDiv.className =
      "absolute top-4 right-4 bg-gray-800/80 px-4 py-2 rounded-full text-sm text-green-400 font-bold border border-green-500 shadow-lg";
    onlineDiv.innerHTML =
      '<i class="fas fa-globe"></i> Onlayn: <span id="onlineCountVal">1</span>';
    mainMenu.appendChild(onlineDiv);
  }

  // 7. HUD
  const hudTop = document.querySelector("#gameHUD .absolute.top-0");
  if (hudTop) {
    const pingDiv = document.createElement("div");
    pingDiv.className =
      "absolute top-12 left-2 text-green-400 font-mono text-xs bg-gray-900/50 px-2 py-1 rounded";
    pingDiv.innerHTML = 'Ping: <span id="pingVal">0</span>ms';
    hudTop.appendChild(pingDiv);

    const controlsDiv = document.createElement("div");
    controlsDiv.className =
      "absolute top-20 left-2 flex flex-col gap-2 pointer-events-auto";
    controlsDiv.innerHTML = `
            <button id="btnMic" class="control-btn"><i class="fas fa-microphone-slash"></i></button>
            <button id="btnSpeaker" class="control-btn active"><i class="fas fa-volume-up"></i></button>
            <button id="btnChat" class="control-btn bg-blue-600/60 border-blue-500"><i class="fas fa-comment-dots"></i></button>
        `;
    hudTop.appendChild(controlsDiv);

    const leftBox = hudTop.querySelector(
      ".flex.justify-between div:first-child"
    );
    const fsBtn = document.createElement("button");
    fsBtn.id = "btnFullscreen";
    fsBtn.innerHTML = '<i class="fas fa-expand"></i>';
    fsBtn.className =
      "ml-2 w-6 h-6 bg-gray-700 rounded flex items-center justify-center text-white text-xs hover:bg-gray-600 pointer-events-auto";
    leftBox.appendChild(fsBtn);
  }

  createColorPicker("createColor");
  createColorPicker("joinColor");
  createColorPicker("randomColor");

  // TUGMALARNI ULASHNI BOSHLASH
  attachEventListeners();

  // Mobile Input Fix
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

// --- FUNKSIYALAR ---

function generateObstacles() {
  obstacles = [];
  const count = 200;
  for (let i = 0; i < count; i++) {
    const x = ((i * 1234567) % (WORLD_SIZE - 200)) + 100;
    const y = ((i * 7654321) % (WORLD_SIZE - 200)) + 100;
    const seed = i % 10;
    let type, radius, width, height;
    if (seed < 3) {
      type = "wall";
      width = 80;
      height = 80;
      radius = 50;
    } else {
      type = "bush";
      radius = seed % 2 === 0 ? 60 : 40;
    }
    obstacles.push({ x, y, type, radius, width, height });
  }
}

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
    circle.ontouchend = (e) => {
      e.preventDefault();
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

// Barcha oynalarni yashirib, keraklisini ochish
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

  // Modallarni ham yopish
  ["exitModal", "helpModal", "chatModal"].forEach((id) => {
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

function safeFullScreen() {
  try {
    const doc = window.document;
    const docEl = doc.documentElement;
    const requestFullScreen =
      docEl.requestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.webkitRequestFullScreen ||
      docEl.msRequestFullscreen;

    if (
      !doc.fullscreenElement &&
      !doc.mozFullScreenElement &&
      !doc.webkitFullscreenElement &&
      !doc.msFullscreenElement
    ) {
      if (requestFullScreen) requestFullScreen.call(docEl).catch(() => {});
    }
  } catch (e) {}
}

// --- TUGMALARNI ULASH FUNKSIYASI ---
function attachEventListeners() {
  const attachBtn = (id, callback) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.onclick = (e) => {
      e.preventDefault();
      callback();
    };
    el.ontouchend = (e) => {
      e.preventDefault();
      callback();
    };
  };

  attachBtn("btnShowCreate", () => {
    selectedColor = null;
    showScreen("createMenu");
  });
  attachBtn("btnShowJoin", () => {
    selectedColor = null;
    showScreen("joinMenu");
  });
  attachBtn("btnRandomMenu", () => {
    selectedColor = null;
    showScreen("randomMenu");
  });

  attachBtn("btnBackFromCreate", () => showScreen("mainMenu"));
  attachBtn("btnBackFromJoin", () => showScreen("mainMenu"));
  attachBtn("btnBackRandom", () => showScreen("mainMenu"));

  attachBtn("btnStartGame", () => {
    const nick = document.getElementById("createNick").value.trim();
    if (!nick) return showToast("Nickname yozing!", "error");
    safeFullScreen();
    const maxP = document.getElementById("createMaxPlayers").value;
    const time = document.getElementById("createTime").value;
    const pass = document.getElementById("createPass").value;
    hasPassword = !!pass;
    socket.emit("create_game", {
      nick,
      maxPlayers: maxP,
      time,
      pass,
      color: getFinalColor(),
    });
  });

  attachBtn("btnJoinGame", () => {
    const id = document.getElementById("joinId").value.trim();
    const nick = document.getElementById("joinNick").value.trim();
    if (!id || !nick) return showToast("ID va Nickname kerak!", "error");
    safeFullScreen();
    const pass = document.getElementById("joinPass").value;
    hasPassword = !!pass;
    socket.emit("join_game", {
      gameId: id,
      nick,
      pass,
      color: getFinalColor(),
    });
  });

  attachBtn("btnStartRandom", () => {
    const nick = document.getElementById("randomNick").value.trim();
    if (!nick) return showToast("Nickname yozing!", "error");
    safeFullScreen();
    showToast("Random o'yin qidirilmoqda...", "info");
    socket.emit("find_random_game", { nick: nick, color: getFinalColor() });
  });

  attachBtn("btnExit", () =>
    document.getElementById("exitModal").classList.remove("hidden")
  );
  attachBtn("btnExitNo", () =>
    document.getElementById("exitModal").classList.add("hidden")
  );
  attachBtn("btnExitYes", () => {
    document.getElementById("exitModal").classList.add("hidden");
    socket.emit("leave_game");
    location.reload();
  });

  attachBtn("btnHelp", () =>
    document.getElementById("helpModal").classList.remove("hidden")
  );
  attachBtn("btnCloseHelp", () =>
    document.getElementById("helpModal").classList.add("hidden")
  );

  attachBtn("btnCopyId", () => {
    const txt = document
      .getElementById("displayGameId")
      .innerText.replace(/\s/g, "");
    navigator.clipboard.writeText(txt);
    showToast("ID nusxalandi!", "success");
  });

  attachBtn("btnChat", () => toggleChat(true));
  attachBtn("btnCloseChat", () => toggleChat(false));
  attachBtn("btnSendChat", sendChat);

  attachBtn("btnMic", toggleMic);
  attachBtn("btnSpeaker", toggleSpeaker);
  attachBtn("btnFullscreen", safeFullScreen);
}

// --- CHAT SYSTEM ---
function toggleChat(show) {
  const modal = document.getElementById("chatModal");
  if (show) {
    modal.classList.remove("hidden");
    setTimeout(() => document.getElementById("chatInput").focus(), 100);
  } else {
    modal.classList.add("hidden");
    document.getElementById("chatInput").blur();
  }
}

function sendChat() {
  const input = document.getElementById("chatInput");
  const msg = input.value.trim();
  if (msg) {
    socket.emit("send_chat", msg);
  }
  input.value = "";
  toggleChat(false);
}

function displayChatMessage(sender, msg) {
  const feed = document.getElementById("killFeed");
  if (!feed) return;
  const item = document.createElement("div");
  item.className =
    "text-white bg-blue-900/90 px-4 py-2 rounded-lg text-sm mb-2 border border-blue-500 shadow-md flex flex-col items-start w-full animate-pulse";
  item.innerHTML = `<span class="text-yellow-400 font-bold text-xs">${sender}:</span><span class="text-white">${msg}</span>`;
  feed.prepend(item);
  setTimeout(() => item.remove(), 15000);
  if (feed.children.length > 5) feed.lastChild.remove();
}

socket.on("receive_chat", (data) => {
  displayChatMessage(data.sender, data.msg);
});

// --- VOICE CHAT ---
let micOn = false;
let speakerOn = true;

function toggleMic() {
  micOn = !micOn;
  const btn = document.getElementById("btnMic");
  btn.className = `control-btn ${micOn ? "active" : ""}`;
  btn.innerHTML = micOn
    ? '<i class="fas fa-microphone"></i>'
    : '<i class="fas fa-microphone-slash"></i>';
  if (micOn) startVoice();
  else stopVoice();
}

function toggleSpeaker() {
  speakerOn = !speakerOn;
  const btn = document.getElementById("btnSpeaker");
  btn.className = `control-btn ${speakerOn ? "active" : ""}`;
  btn.innerHTML = speakerOn
    ? '<i class="fas fa-volume-up"></i>'
    : '<i class="fas fa-volume-mute"></i>';
  if (speakerOn) {
    if (audioContext.state === "suspended") audioContext.resume();
  } else {
    audioContext.suspend();
  }
}

async function startVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(localStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0 && gameActive) {
        e.data.arrayBuffer().then((buffer) => {
          socket.emit("voice_data", buffer);
        });
      }
    };
    mediaRecorder.start(250);
    showToast("Mikrofon yoqildi", "success");
  } catch (err) {
    micOn = false;
    document.getElementById("btnMic").className = "control-btn";
    document.getElementById("btnMic").innerHTML =
      '<i class="fas fa-microphone-slash"></i>';
    showToast("Mikrofon xatosi: " + err.message, "error");
  }
}

function stopVoice() {
  if (mediaRecorder) mediaRecorder.stop();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
}

socket.on("voice_data", async (arrayBuffer) => {
  if (!speakerOn || !gameActive) return;
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    if (nextStartTime < audioContext.currentTime)
      nextStartTime = audioContext.currentTime;
    source.start(nextStartTime);
    nextStartTime += audioBuffer.duration;
  } catch (e) {}
});

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

socket.on("disconnect", () => {
  if (gameActive) {
    showToast("Server bilan aloqa uzildi!", "error");
    setTimeout(() => location.reload(), 2000);
  }
});

socket.on("game_started", (data) => {
  myId = data.playerId;
  const dispId = document.getElementById("displayGameId");
  const icon = hasPassword
    ? '<i class="fas fa-lock text-red-400 ml-1"></i>'
    : '<i class="fas fa-lock-open text-green-400 ml-1"></i>';
  if (dispId) dispId.innerHTML = data.gameId + " " + icon;

  generateObstacles();
  showScreen("gameHUD");
  gameActive = true;

  if (audioContext.state === "suspended") audioContext.resume();

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
  } else {
    uiLayer.classList.remove("red-alert-border");
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
  setTimeout(() => item.remove(), 3000);
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
  const interval = setInterval(() => {
    t--;
    if (timerEl) timerEl.innerText = t;
    if (t <= 0) {
      clearInterval(interval);
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
    }
  }
  return false;
}

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
  ctx.strokeStyle = "rgba(0,0,0,0.1)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = startX; x < camera.x + canvas.width + size; x += 100) {
    ctx.moveTo(x, camera.y);
    ctx.lineTo(x, camera.y + canvas.height + size);
  }
  for (let y = startY; y < camera.y + canvas.height + size; y += 100) {
    ctx.moveTo(camera.x, y);
    ctx.lineTo(camera.x + canvas.width + size, y);
  }
  ctx.stroke();
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
// 5. INPUT HANDLERS (TUZATILGAN)
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

// Ping
setInterval(() => {
  if (gameActive) {
    lastPingTime = Date.now();
    socket.emit("ping_check", () => {
      const latency = Date.now() - lastPingTime;
      const el = document.getElementById("pingVal");
      if (el) {
        el.innerText = latency;
        el.style.color =
          latency > 200 ? "red" : latency > 100 ? "yellow" : "lime";
      }
    });
  }
}, 2000);

const joyZone = document.getElementById("joystickZone");
const joyKnob = document.getElementById("joystickKnob");
const fireBtnEl = document.getElementById("fireBtn");
const joyCenter = { x: 70, y: 70 };

// Click eventlari touchmove bilan bloklanmasligi uchun
document.body.addEventListener(
  "touchmove",
  function (e) {
    // Faqat o'yin vaqtida va control zonalarida bloklaymiz
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

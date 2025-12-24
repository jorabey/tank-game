const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

app.use(express.static(path.join(__dirname, "public")));

// =========================================================
// 1. SOZLAMALAR VA STATE
// =========================================================

const WORLD_SIZE = 5000;
const TIMEOUT_MS = 15000; // 15 soniya timeout
const MAX_PLAYERS_LIMIT = 10;
const MIN_PLAYERS_LIMIT = 2;
const MAX_BOTS_IN_RANDOM = 3; // Random o'yinda maksimum botlar
const RANDOM_GAME_DURATION = 15; // 15 daqiqa
const RANDOM_WAIT_TIME = 20000; // 20 soniya kutish

let games = {};
// randomQueue: { socketId, nick, color }
let randomQueue = [];
let randomQueueTimeout = null;

// To'siqlar (Server va Clientda bir xil bo'lishi shart)
function generateObstacles() {
  let obstacles = [];
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
  return obstacles;
}
const OBSTACLES = generateObstacles();

// =========================================================
// 2. SOCKET EVENTLARI
// =========================================================

io.on("connection", (socket) => {
  // Umumiy onlaynni yuborish
  io.emit("online_count", io.engine.clientsCount);

  // 1. O'YIN YARATISH
  socket.on("create_game", (data) => {
    // Validatsiya
    let maxP = parseInt(data.maxPlayers);
    let duration = parseFloat(data.time);

    if (maxP < MIN_PLAYERS_LIMIT) maxP = MIN_PLAYERS_LIMIT;
    if (maxP > MAX_PLAYERS_LIMIT) maxP = MAX_PLAYERS_LIMIT;

    if (duration < 0.5) duration = 0.5; // Min 30 soniya
    if (duration > 60) duration = 60; // Max 60 daqiqa

    const gameId = Math.random().toString(36).substr(2, 6).toUpperCase();
    createGameSession(gameId, maxP, duration, data.pass, socket.id);
    joinGameLogic(socket, gameId, data.nick, data.color);
  });

  // 2. O'YINGA QO'SHILISH
  socket.on("join_game", (data) => {
    const gameId = data.gameId.toUpperCase();
    const game = games[gameId];

    if (!game) {
      socket.emit("toast", { msg: "O'yin topilmadi!", type: "error" });
      return;
    }
    if (game.settings.password && game.settings.password !== data.pass) {
      socket.emit("toast", { msg: "Parol noto'g'ri!", type: "error" });
      return;
    }

    const playerCount = Object.keys(game.players).length;

    // Joy bormi?
    if (playerCount >= game.settings.maxPlayers) {
      // Agar joy yo'q bo'lsa, lekin BOTLAR bo'lsa -> Botni haydaymiz
      const botId = Object.keys(game.players).find(
        (id) => game.players[id].isBot
      );

      if (botId) {
        // Botni o'chiramiz
        delete game.players[botId];
        // Odamni kiritamiz (quyi qismda)
      } else {
        socket.emit("toast", { msg: "O'yin to'lgan!", type: "error" });
        return;
      }
    }

    joinGameLogic(socket, gameId, data.nick, data.color);
  });

  // 3. RANDOM O'YIN (QUEUE)
  socket.on("find_random_game", (data) => {
    if (randomQueue.find((p) => p.socketId === socket.id)) return;

    // Nick va Rangni saqlaymiz
    randomQueue.push({
      socketId: socket.id,
      nick: data.nick || "Player",
      color: data.color || "#4b5320",
    });

    socket.join("random_queue");
    io.to("random_queue").emit("queue_update", { current: randomQueue.length });

    // Taymerni boshlash
    if (randomQueue.length === 1) {
      randomQueueTimeout = setTimeout(() => {
        startRandomGameNow();
      }, RANDOM_WAIT_TIME);
    }

    // Agar 20 ta to'lsa
    if (randomQueue.length >= MAX_PLAYERS_LIMIT * 2) {
      // Aslida 20 ta dedingiz
      clearTimeout(randomQueueTimeout);
      startRandomGameNow();
    }
  });

  socket.on("leave_random_queue", () => {
    randomQueue = randomQueue.filter((p) => p.socketId !== socket.id);
    socket.leave("random_queue");
    io.to("random_queue").emit("queue_update", { current: randomQueue.length });

    if (randomQueue.length === 0 && randomQueueTimeout) {
      clearTimeout(randomQueueTimeout);
      randomQueueTimeout = null;
    }
  });

  // 4. O'YIN JARAYONI
  socket.on("input_update", (data) => {
    const player = getPlayer(socket.id);
    if (!player || player.isDead) return;

    player.x = data.x;
    player.y = data.y;
    player.angle = data.angle;
    player.turretAngle = data.turretAngle;
    player.lastSeen = Date.now();

    // Chegaradan chiqib ketmaslik
    player.x = Math.max(50, Math.min(WORLD_SIZE - 50, player.x));
    player.y = Math.max(50, Math.min(WORLD_SIZE - 50, player.y));
  });

  socket.on("shoot", (data) => {
    const player = getPlayer(socket.id);
    if (!player || player.isDead) return;

    const game = games[player.gameId];
    if (game) {
      game.bullets.push({
        x: data.x,
        y: data.y,
        vx: Math.cos(data.angle) * 20,
        vy: Math.sin(data.angle) * 20,
        owner: player.id,
        life: 80,
      });
      player.lastSeen = Date.now();
    }
  });

  // 5. CHIQISH
  socket.on("leave_game", () => {
    removePlayer(socket.id);
  });

  socket.on("disconnect", () => {
    removePlayer(socket.id);
    randomQueue = randomQueue.filter((p) => p.socketId !== socket.id);
    io.emit("online_count", io.engine.clientsCount);
  });
});

// =========================================================
// 3. LOGIKA VA FUNKSIYALAR
// =========================================================

function createGameSession(gameId, maxPlayers, time, pass, hostId) {
  games[gameId] = {
    id: gameId,
    host: hostId,
    settings: {
      maxPlayers: maxPlayers,
      endTime: Date.now() + time * 60 * 1000,
      password: pass,
    },
    players: {},
    bullets: [],
    status: "active",
  };
}

function joinGameLogic(socket, gameId, nick, color) {
  const game = games[gameId];

  game.players[socket.id] = {
    id: socket.id,
    gameId: gameId,
    nick: nick,
    color: color,
    x: Math.random() * (WORLD_SIZE - 200) + 100,
    y: Math.random() * (WORLD_SIZE - 200) + 100,
    hp: 100,
    xp: 0,
    kills: 0,
    deaths: 0,
    angle: 0,
    turretAngle: 0,
    isDead: false,
    lastSeen: Date.now(),
    isBot: false,
  };

  socket.join(gameId);
  socket.emit("game_started", {
    gameId: gameId,
    playerId: socket.id,
    endTime: game.settings.endTime,
    players: game.players,
  });

  io.to(gameId).emit("toast", { msg: `${nick} qo'shildi`, type: "info" });
}

function startRandomGameNow() {
  // Random ID (R- bilan boshlanadi)
  const gameId = "R-" + Math.random().toString(36).substr(2, 4).toUpperCase();

  // Random o'yin uchun max 10 ta joy (Botlar bilan to'ldirish uchun joy kerak)
  // Lekin agar queue da 20 ta odam bo'lsa, 2 ta alohida o'yin ochish kerak aslida.
  // Hozircha bitta xonaga 10 ta sig'diramiz, qolgani keyingi xonaga.

  // Queue dan birinchi 10 tasini olamiz
  const playersToJoin = randomQueue.splice(0, MAX_PLAYERS_LIMIT);

  // 15 daqiqa
  createGameSession(gameId, MAX_PLAYERS_LIMIT, RANDOM_GAME_DURATION, "", null);
  const game = games[gameId];

  // Odamlarni qo'shish
  let humanCount = 0;
  playersToJoin.forEach((p) => {
    const socket = io.sockets.sockets.get(p.socketId);
    if (socket) {
      joinGameLogic(socket, gameId, p.nick, p.color);
      socket.leave("random_queue");
      humanCount++;
    }
  });

  // BOTLARNI QO'SHISH (MANTIQ)
  // "Maksimum 3 tagacha bot kiritilsin"
  // "Agar 10 tasi ham odam bo'lsa bot bo'lmaydi"
  // "Agar 7 odam bo'lsa, 3 bot (Jami 10)"
  // "Agar 2 odam bo'lsa, 3 bot (Jami 5)" -> Demak, botlar soni min(3, 10 - humanCount)

  let botsToAdd = Math.min(MAX_BOTS_IN_RANDOM, MAX_PLAYERS_LIMIT - humanCount);

  for (let i = 0; i < botsToAdd; i++) {
    const botId = "bot_" + Math.random().toString(36).substr(2, 8);
    game.players[botId] = {
      id: botId,
      gameId: gameId,
      nick: "BOT-" + (i + 1),
      color: "#2f4f4f",
      x: Math.random() * (WORLD_SIZE - 200) + 100,
      y: Math.random() * (WORLD_SIZE - 200) + 100,
      hp: 100,
      xp: 0,
      kills: 0,
      deaths: 0,
      angle: Math.random() * Math.PI * 2,
      turretAngle: 0,
      isDead: false,
      isBot: true,
      targetId: null,
    };
  }

  // Agar queue da yana odam qolgan bo'lsa, taymerni qayta yoqamiz
  if (randomQueue.length > 0) {
    clearTimeout(randomQueueTimeout);
    randomQueueTimeout = setTimeout(
      () => startRandomGameNow(),
      RANDOM_WAIT_TIME
    );
  } else {
    randomQueueTimeout = null;
  }
}

function getPlayer(socketId) {
  for (const gameId in games) {
    if (games[gameId].players[socketId]) {
      return games[gameId].players[socketId];
    }
  }
  return null;
}

function removePlayer(socketId) {
  const player = getPlayer(socketId);
  if (player) {
    const game = games[player.gameId];
    delete game.players[socketId];
    io.to(player.gameId).emit("toast", {
      msg: `${player.nick} chiqib ketdi`,
      type: "info",
    });

    const realPlayers = Object.values(game.players).filter(
      (p) => !p.isBot
    ).length;
    if (realPlayers === 0) {
      delete games[player.gameId];
    }
  }
}

function checkBulletWallCollision(bx, by) {
  for (const obs of OBSTACLES) {
    if (obs.type === "bush") continue;

    if (obs.type === "wall") {
      const halfW = obs.width / 2;
      const halfH = obs.height / 2;
      if (
        bx >= obs.x - halfW &&
        bx <= obs.x + halfW &&
        by >= obs.y - halfH &&
        by <= obs.y + halfH
      ) {
        return true;
      }
    } else if (obs.type === "rock") {
      const dx = bx - obs.x;
      const dy = by - obs.y;
      if (dx * dx + dy * dy < obs.radius * obs.radius) return true;
    }
  }
  return false;
}

// =========================================================
// 4. O'YIN SIKLI (OPTIMIZATSIYA: 30 FPS)
// =========================================================

// Oldin 16ms edi, endi 33ms (taxminan 30 FPS).
// Bu server yuklamasini 2 barobar kamaytiradi.
setInterval(() => {
  const now = Date.now();

  for (const gameId in games) {
    const game = games[gameId];

    // --- BOT MANTIG'I ---
    Object.values(game.players)
      .filter((p) => p.isBot && !p.isDead)
      .forEach((bot) => {
        if (
          !bot.targetId ||
          !game.players[bot.targetId] ||
          game.players[bot.targetId].isDead
        ) {
          let minDist = Infinity;
          let target = null;
          for (const pid in game.players) {
            if (pid !== bot.id && !game.players[pid].isDead) {
              const p = game.players[pid];
              const dist = Math.sqrt((p.x - bot.x) ** 2 + (p.y - bot.y) ** 2);
              if (dist < minDist) {
                minDist = dist;
                target = pid;
              }
            }
          }
          bot.targetId = target;
        }

        if (bot.targetId) {
          const target = game.players[bot.targetId];
          const dx = target.x - bot.x;
          const dy = target.y - bot.y;
          const angle = Math.atan2(dy, dx);

          bot.angle = angle;
          bot.turretAngle = angle;

          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 300) {
            bot.x += Math.cos(angle) * 3;
            bot.y += Math.sin(angle) * 3;
          }

          // Random otish (30 FPS da 0.04 ehtimol)
          if (Math.random() < 0.04) {
            game.bullets.push({
              x: bot.x,
              y: bot.y,
              vx: Math.cos(angle) * 20,
              vy: Math.sin(angle) * 20,
              owner: bot.id,
              life: 80,
            });
          }
        } else {
          bot.angle += 0.05;
        }
      });

    // --- O'QLAR ---
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life--;

      if (checkBulletWallCollision(b.x, b.y)) {
        io.to(gameId).emit("hit_effect", { x: b.x, y: b.y, targetId: null });
        game.bullets.splice(i, 1);
        continue;
      }

      for (const pid in game.players) {
        const p = game.players[pid];
        if (b.owner !== pid && !p.isDead) {
          const dx = p.x - b.x;
          const dy = p.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 35) {
            let damage = 10;
            p.hp -= damage;
            if (game.players[b.owner]) game.players[b.owner].xp += damage;

            game.bullets.splice(i, 1);
            io.to(gameId).emit("hit_effect", { x: b.x, y: b.y, targetId: pid });

            if (p.hp <= 0) {
              p.isDead = true;
              p.deaths++;
              p.deadUntil = now + 5000;

              if (game.players[b.owner]) {
                game.players[b.owner].kills++;
                game.players[b.owner].xp += 100;
                io.to(gameId).emit("kill_feed", {
                  killer: game.players[b.owner].nick,
                  victim: p.nick,
                });
              }
            }
            break;
          }
        }
      }
      if (b.life <= 0) game.bullets.splice(i, 1);
    }

    // --- TIMEOUT & RESPAWN ---
    const deadIds = [];
    for (const pid in game.players) {
      const p = game.players[pid];
      if (!p.isBot && now - p.lastSeen > TIMEOUT_MS) {
        deadIds.push(pid);
        continue;
      }
      if (p.isDead && now > p.deadUntil) {
        p.isDead = false;
        p.hp = 100;
        p.x = Math.random() * (WORLD_SIZE - 200) + 100;
        p.y = Math.random() * (WORLD_SIZE - 200) + 100;
      }
    }
    deadIds.forEach((id) => removePlayer(id));

    // --- GAME OVER CHECK ---
    if (now > game.settings.endTime && game.status === "active") {
      game.status = "ended";
      io.to(gameId).emit("game_over", game.players);
      setTimeout(() => {
        delete games[gameId];
      }, 15000);
    }

    // --- UPDATE ---
    if (game.status === "active") {
      io.to(gameId).emit("update_state", {
        players: game.players,
        bullets: game.bullets,
        timeLeft: Math.max(0, game.settings.endTime - now),
      });
    }
  }
}, 33); // ~30 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

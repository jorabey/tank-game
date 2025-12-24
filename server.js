const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.use(express.static(path.join(__dirname, "public")));

// =========================================================
// 1. SOZLAMALAR
// =========================================================

const WORLD_SIZE = 5000;
const TIMEOUT_MS = 60000;
const MAX_PLAYERS_LIMIT = 10;
const MIN_PLAYERS_LIMIT = 2;
const RANDOM_GAME_DURATION = 15;

let games = {};

// To'siqlar
function generateObstacles() {
  let obstacles = [];
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
  return obstacles;
}
const OBSTACLES = generateObstacles();

// =========================================================
// 2. SOCKET EVENTLARI
// =========================================================

io.on("connection", (socket) => {
  io.emit("online_count", io.engine.clientsCount);

  socket.on("ping_check", (callback) => {
    if (typeof callback === "function") callback();
  });

  // --- CHAT (MESSENGER) ---
  socket.on("send_chat", (msg) => {
    const player = getPlayer(socket.id);
    if (player) {
      // Xonadagi barchaga (o'ziga ham) yuborish
      io.to(player.gameId).emit("receive_chat", {
        sender: player.nick,
        msg: msg,
      });
    }
  });

  // --- OVOZLI CHAT (RELAY) ---
  socket.on("voice_data", (buffer) => {
    const player = getPlayer(socket.id);
    if (player) {
      // O'zidan boshqa hammaga yuborish
      socket.to(player.gameId).emit("voice_data", buffer);
    }
  });

  // 1. O'YIN YARATISH
  socket.on("create_game", (data) => {
    let maxP = parseInt(data.maxPlayers);
    let duration = parseFloat(data.time);
    if (maxP < MIN_PLAYERS_LIMIT) maxP = MIN_PLAYERS_LIMIT;
    if (maxP > MAX_PLAYERS_LIMIT) maxP = MAX_PLAYERS_LIMIT;
    if (duration < 0.5) duration = 0.5;
    if (duration > 60) duration = 60;

    const gameId = Math.random().toString(36).substr(2, 6).toUpperCase();
    createGameSession(gameId, maxP, duration, data.pass, false);
    joinGameLogic(socket, gameId, data.nick, data.color);
  });

  // 2. O'YINGA QO'SHILISH
  socket.on("join_game", (data) => {
    const gameId = data.gameId.toUpperCase();
    const game = games[gameId];

    if (!game)
      return socket.emit("toast", { msg: "O'yin topilmadi!", type: "error" });
    if (game.settings.password && game.settings.password !== data.pass) {
      return socket.emit("toast", { msg: "Parol noto'g'ri!", type: "error" });
    }
    if (Object.keys(game.players).length >= game.settings.maxPlayers) {
      return socket.emit("toast", { msg: "O'yin to'lgan!", type: "error" });
    }

    // NOM BANDLIGINI TEKSHIRISH
    const nameTaken = Object.values(game.players).some(
      (p) => p.nick === data.nick
    );
    if (nameTaken) {
      return socket.emit("toast", {
        msg: "Bu nom band! Boshqasini tanlang.",
        type: "error",
      });
    }

    joinGameLogic(socket, gameId, data.nick, data.color);
  });

  // 3. RANDOM O'YIN
  socket.on("find_random_game", (data) => {
    let targetGameId = null;
    for (const id in games) {
      const g = games[id];
      // Joy bor, random, nom band emasligini tekshiramiz
      if (
        g.settings.isRandom &&
        Object.keys(g.players).length < g.settings.maxPlayers &&
        g.status === "active"
      ) {
        const nameTaken = Object.values(g.players).some(
          (p) => p.nick === data.nick
        );
        if (!nameTaken) {
          targetGameId = id;
          break;
        }
      }
    }

    if (!targetGameId) {
      targetGameId =
        "R-" + Math.random().toString(36).substr(2, 4).toUpperCase();
      createGameSession(
        targetGameId,
        MAX_PLAYERS_LIMIT,
        RANDOM_GAME_DURATION,
        "",
        true
      );
    }

    joinGameLogic(
      socket,
      targetGameId,
      data.nick || "Player",
      data.color || "#4b5320"
    );
  });

  // 4. HARAKAT
  socket.on("input_update", (data) => {
    const player = getPlayer(socket.id);
    if (!player || player.isDead) return;
    player.x = data.x;
    player.y = data.y;
    player.angle = data.angle;
    player.turretAngle = data.turretAngle;
    player.lastSeen = Date.now();
    player.x = Math.max(50, Math.min(WORLD_SIZE - 50, player.x));
    player.y = Math.max(50, Math.min(WORLD_SIZE - 50, player.y));
  });

  // 5. OTISH (3-4 TA O'Q)
  socket.on("shoot", (data) => {
    const player = getPlayer(socket.id);
    if (!player || player.isDead) return;

    const now = Date.now();
    if (now - player.lastShotTime < 800) return;
    player.lastShotTime = now;

    const game = games[player.gameId];
    if (game) {
      // 3 ta o'q (Spread)
      const offsets = [-0.1, 0, 0.1];
      offsets.forEach((offset) => {
        game.bullets.push({
          x: data.x,
          y: data.y,
          vx: Math.cos(data.angle + offset) * 20,
          vy: Math.sin(data.angle + offset) * 20,
          owner: player.id,
          life: 80,
        });
      });
      player.lastSeen = now;
    }
  });

  socket.on("leave_game", () => removePlayer(socket.id));
  socket.on("disconnect", () => {
    removePlayer(socket.id);
    io.emit("online_count", io.engine.clientsCount);
  });
});

// =========================================================
// 3. LOGIKA
// =========================================================

function createGameSession(gameId, maxPlayers, time, pass, isRandom) {
  games[gameId] = {
    id: gameId,
    settings: {
      maxPlayers,
      endTime: Date.now() + time * 60 * 1000,
      password: pass,
      isRandom,
    },
    players: {},
    bullets: [],
    status: "active",
  };
}

function joinGameLogic(socket, gameId, nick, color) {
  const game = games[gameId];
  if (!game) return;

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
    lastShotTime: 0,
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

function getPlayer(socketId) {
  for (const gameId in games) {
    if (games[gameId].players[socketId]) return games[gameId].players[socketId];
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
    if (Object.keys(game.players).length === 0) delete games[player.gameId];
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
      )
        return true;
    }
  }
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const gameId in games) {
    const game = games[gameId];

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
            p.hp -= 10;
            if (game.players[b.owner]) game.players[b.owner].xp += 10;
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

    const deadIds = [];
    for (const pid in game.players) {
      const p = game.players[pid];
      if (now - p.lastSeen > TIMEOUT_MS) {
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

    if (now > game.settings.endTime && game.status === "active") {
      game.status = "ended";
      io.to(gameId).emit("game_over", game.players);
      setTimeout(() => {
        delete games[gameId];
      }, 15000);
    }

    if (game.status === "active") {
      io.to(gameId).emit("update_state", {
        players: game.players,
        bullets: game.bullets,
        timeLeft: Math.max(0, game.settings.endTime - now),
      });
    }
  }
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

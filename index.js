const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Simple room management
const rooms = new Map();
const playerRooms = new Map();

io.on('connection', (socket) => {
  console.log('Conectado:', socket.id);

  // Crear sala
  socket.on('create-room', ({ gameType, playerName, maxPlayers }) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const room = {
      code,
      gameType,
      players: [{ id: socket.id, name: playerName, score: 0, isHost: true }],
      maxPlayers: maxPlayers || 4,
      state: 'waiting',
      gameState: null,
    };

    rooms.set(code, room);
    playerRooms.set(socket.id, code);
    socket.join(code);

    console.log(`Sala creada: ${code} por ${playerName}`);
    socket.emit('room-created', { roomCode: code, players: room.players });
    io.to(code).emit('room-created', { roomCode: code, players: room.players });
  });

  // Unirse a sala
  socket.on('join-room', ({ roomCode, playerName }) => {
    console.log(`${playerName} intenta unirse a sala: ${roomCode}`);
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) {
      console.log(`Sala ${roomCode} no encontrada`);
      socket.emit('room-error', { message: 'Sala no encontrada' });
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      console.log(`Sala ${roomCode} llena (${room.players.length}/${room.maxPlayers})`);
      socket.emit('room-error', { message: 'Sala llena' });
      return;
    }

    room.players.push({ id: socket.id, name: playerName, score: 0, isHost: false });
    playerRooms.set(socket.id, roomCode.toUpperCase());
    socket.join(roomCode.toUpperCase());

    console.log(`${playerName} unido a sala ${roomCode}`);
    // Confirmación directa al jugador que se une
    socket.emit('room-joined', {
      roomCode: room.code,
      player: room.players[room.players.length - 1],
      players: room.players,
    });
    // Aviso a todos los jugadores de la sala (incluyendo el nuevo)
    io.to(roomCode.toUpperCase()).emit('player-joined', {
      player: room.players[room.players.length - 1],
      players: room.players,
    });
  });

  // Comenzar juego
  socket.on('start-game', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    room.state = 'playing';
    room.gameState = { currentPlayer: 0, round: 0 };

    io.to(roomCode).emit('game-started', {
      gameState: room.gameState,
      currentPlayer: room.players[0].id,
    });
  });

  // Lanzar dados
  socket.on('roll-dice', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) return;

    const dice = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1);
    io.to(roomId).emit('dice-rolled', { dice, playerId: socket.id });
  });

  // Desconexión
  socket.on('disconnect', () => {
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        io.to(roomId).emit('player-disconnected', {
          playerId: socket.id,
          players: room.players,
        });
      }
      playerRooms.delete(socket.id);
    }
    console.log('Desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`🎲 Servidor Dados de Salón en ${HOST}:${PORT}`);
  console.log(`🌐 Conéctate desde Tailscale: ws://<tu-ip-tailscale>:${PORT}`);
});

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const multer = require('multer');

const { openDatabase } = require('./src/database');
const { ServerTimer } = require('./src/timer');
const { createState, attachSocketHandlers } = require('./src/socket');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const BRASOES_DIR = path.join(ROOT, 'public', 'assets', 'brasoes');

fs.mkdirSync(BRASOES_DIR, { recursive: true });

const db = openDatabase();
const timerEngine = new ServerTimer();
let runtime = createState(timerEngine);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(ROOT, 'public')));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BRASOES_DIR),
  filename: (req, file, cb) => {
    const equipeId = req.body.equipeId || 'x';
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `equipe-${equipeId}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = /\.(png|svg|jpg|jpeg|webp)$/i.test(file.originalname);
    cb(ok ? null : new Error('Formato inválido'), ok);
  },
});

app.get('/', (_req, res) => res.redirect('/controle'));
app.get('/controle', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'controle', 'index.html'));
});
app.get('/overlay', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'overlays', 'principal', 'index.html'));
});
app.get('/tela', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'telas', 'abertura', 'index.html'));
});
app.get('/intervalo', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'telas', 'intervalo', 'index.html'));
});
app.get('/placar', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'placar', 'index.html'));
});
app.get('/previa', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'previa', 'index.html'));
});
app.get('/cronometro', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'overlays', 'cronometro', 'index.html'));
});
app.get('/resultados', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'overlays', 'principal', 'resultados.html'));
});
app.get('/apuracao', (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'overlays', 'principal', 'apuracao.html'));
});

app.post('/api/brasao', upload.single('brasao'), (req, res) => {
  try {
    const equipeId = Number(req.body.equipeId);
    if (!equipeId || !req.file) {
      return res.status(400).json({ ok: false, message: 'equipeId e arquivo são obrigatórios' });
    }
    const relative = `/assets/brasoes/${req.file.filename}`;
    db.prepare('UPDATE equipes SET brasao_path = ? WHERE id = ?').run(relative, equipeId);
    io.emit('system:state', require('./src/socket').buildFullState(db, runtime));
    res.json({ ok: true, brasao_path: relative });
  } catch (err) {
    res.status(500).json({ ok: false, message: err.message });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: Date.now() });
});

attachSocketHandlers(
  io,
  db,
  timerEngine,
  () => runtime,
  (next) => {
    runtime = next;
  }
);

server.listen(PORT, () => {
  console.log(`XXII Gincana Cultural — transmissão em http://localhost:${PORT}`);
  console.log(`Painel:     http://localhost:${PORT}/controle`);
  console.log(`Overlay:    http://localhost:${PORT}/overlay`);
  console.log(`Tela:       http://localhost:${PORT}/tela`);
  console.log(`Intervalo:  http://localhost:${PORT}/intervalo`);
  console.log(`Placar:     http://localhost:${PORT}/placar`);
  console.log(`Cronômetro: http://localhost:${PORT}/cronometro`);
  console.log(`Resultados: http://localhost:${PORT}/resultados`);
  console.log(`Apuração:   http://localhost:${PORT}/apuracao`);
});

const {
  getEquipes,
  getProvas,
  getJurados,
  logHistorico,
  recalcularTotais,
} = require('./database');
const {
  confirmarResultado,
  desfazerUltimoResultado,
  aplicarAjuste,
  aplicarPenalidadeTransicao,
  desempate,
  notasDaProva,
  salvarNota,
  bloquearNotas,
  revelarNota,
  totalNotasEquipe,
} = require('./scoring');
const { createBackup, listBackups, restoreBackup } = require('./backup');
const { validateNota, validateRankings } = require('./validation');

function createState(timerEngine) {
  return {
    timerEngine,
    air: {
      mode: 'idle', // idle | abertura | intervalo | cronometro | resultado | apuracao | placar | limpo
      visible: false,
      preview: false,
    },
    intervalo: { visible: false, sensitivity: 1.2 },
    abertura: { visible: false, dia: '' },
    resultado: {
      visible: false,
      provaId: null,
      titulo: '',
      subtitulo: 'Resultado oficial',
      rankings: [],
      revelados: 0,
      confirmed: false,
    },
    apuracao: {
      visible: false,
      provaId: null,
      equipeId: null,
      reveladas: [],
      showWinner: false,
    },
    placar: { visible: true, compact: true },
    timer: timerEngine.snapshot(),
    locked: false,
  };
}

function buildFullState(db, runtime) {
  const equipes = getEquipes(db);
  const provas = getProvas(db);
  const jurados = getJurados(db);
  if (runtime.timerEngine) {
    runtime.timer = runtime.timerEngine.snapshot();
  }
  const { timerEngine, ...publicRuntime } = runtime;
  return {
    ...publicRuntime,
    equipes,
    provas,
    jurados,
    desempate: desempate(db),
    serverTime: Date.now(),
  };
}

function attachSocketHandlers(io, db, timerEngine, getRuntime, setRuntime) {
  io.on('connection', (socket) => {
    socket.emit('system:state', buildFullState(db, getRuntime()));

    socket.on('system:get-state', () => {
      socket.emit('system:state', buildFullState(db, getRuntime()));
    });

    socket.on('overlay:clear', () => {
      const rt = getRuntime();
      if (rt.locked) return;
      rt.air = { mode: 'limpo', visible: false, preview: false };
      rt.intervalo.visible = false;
      rt.abertura.visible = false;
      rt.resultado.visible = false;
      rt.apuracao.visible = false;
      setRuntime(rt);
      logHistorico(db, 'overlay:clear', 'sistema', {});
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('overlay:show', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      const mode = payload.mode || 'idle';
      const preview = !!payload.preview;
      rt.air = { mode, visible: !preview, preview };
      rt.abertura.visible = mode === 'abertura' && !preview;
      rt.intervalo.visible = mode === 'intervalo' && !preview;
      if (mode === 'abertura' && payload.dia != null) rt.abertura.dia = payload.dia;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('overlay:hide', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      const mode = payload.mode;
      if (!mode || mode === 'abertura') rt.abertura.visible = false;
      if (!mode || mode === 'intervalo') rt.intervalo.visible = false;
      if (!mode || mode === 'resultado') rt.resultado.visible = false;
      if (!mode || mode === 'apuracao') rt.apuracao.visible = false;
      if (!mode) rt.air.visible = false;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('intervalo:show', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      rt.intervalo.visible = true;
      if (payload.sensitivity != null) rt.intervalo.sensitivity = Number(payload.sensitivity);
      rt.air = { mode: 'intervalo', visible: true, preview: false };
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('intervalo:hide', () => {
      const rt = getRuntime();
      rt.intervalo.visible = false;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('intervalo:sensitivity', (payload = {}) => {
      const rt = getRuntime();
      rt.intervalo.sensitivity = Number(payload.sensitivity) || 1.2;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('timer:start', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      rt.timer = timerEngine.start(payload);
      rt.air = { mode: 'cronometro', visible: true, preview: false };
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('timer:pause', () => {
      const rt = getRuntime();
      rt.timer = timerEngine.pause();
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('timer:resume', () => {
      const rt = getRuntime();
      rt.timer = timerEngine.resume();
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('timer:reset', (payload = {}) => {
      const rt = getRuntime();
      timerEngine.reset(payload.totalSeconds != null ? Number(payload.totalSeconds) : 900);
      if (payload.mode) timerEngine.mode = payload.mode;
      if (payload.label != null) timerEngine.label = payload.label;
      rt.timer = timerEngine.snapshot();
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('timer:adjust', (payload = {}) => {
      const rt = getRuntime();
      rt.timer = timerEngine.adjust(Number(payload.seconds) || 0);
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('timer:finish', () => {
      const rt = getRuntime();
      rt.timer = timerEngine.finish();
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('result:preview', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      rt.resultado = {
        visible: false,
        provaId: payload.provaId || null,
        titulo: payload.titulo || '',
        subtitulo: payload.subtitulo || 'Resultado oficial',
        rankings: payload.rankings || [],
        revelados: 0,
        confirmed: false,
      };
      rt.air = { mode: 'resultado', visible: false, preview: true };
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('result:show', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      if (payload.rankings) {
        rt.resultado.rankings = payload.rankings;
        rt.resultado.titulo = payload.titulo || rt.resultado.titulo;
        rt.resultado.subtitulo = payload.subtitulo || rt.resultado.subtitulo;
        rt.resultado.provaId = payload.provaId || rt.resultado.provaId;
        rt.resultado.revelados = 0;
        rt.resultado.confirmed = false;
      }
      rt.resultado.visible = true;
      rt.air = { mode: 'resultado', visible: true, preview: false };
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('result:reveal-next', () => {
      const rt = getRuntime();
      if (rt.locked) return;
      const max = (rt.resultado.rankings || []).length;
      if (rt.resultado.revelados < max) {
        rt.resultado.revelados += 1;
        setRuntime(rt);
        io.emit('system:state', buildFullState(db, rt));
      }
    });

    socket.on('result:reveal-all', () => {
      const rt = getRuntime();
      rt.resultado.revelados = (rt.resultado.rankings || []).length;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('result:confirm', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      const provaId = payload.provaId || rt.resultado.provaId;
      const rankings = payload.rankings || rt.resultado.rankings;
      const equipeIds = getEquipes(db).map((e) => e.id);
      const check = validateRankings(rankings, equipeIds);
      if (!check.ok || !provaId) {
        socket.emit('system:error', { message: check.message || 'Dados inválidos' });
        return;
      }
      confirmarResultado(db, { provaId, rankings });
      createBackup(db, 'resultado');
      rt.resultado.confirmed = true;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('score:undo', () => {
      const rt = getRuntime();
      if (rt.locked) return;
      const result = desfazerUltimoResultado(db);
      createBackup(db, 'undo');
      socket.emit('system:info', { message: result.ok ? 'Resultado desfeito' : result.message });
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('score:ajuste', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      aplicarAjuste(db, payload);
      createBackup(db, 'ajuste');
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('score:penalidade-transicao', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      aplicarPenalidadeTransicao(db, payload);
      createBackup(db, 'penalidade');
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('equipe:update', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      const { id, nome, cor, brasao_path } = payload;
      if (!id) return;
      const eq = db.prepare('SELECT * FROM equipes WHERE id = ?').get(id);
      if (!eq) return;
      db.prepare('UPDATE equipes SET nome = ?, cor = ?, brasao_path = ? WHERE id = ?').run(
        nome != null ? nome : eq.nome,
        cor != null ? cor : eq.cor,
        brasao_path !== undefined ? brasao_path : eq.brasao_path,
        id
      );
      logHistorico(db, 'equipe:update', 'equipes', payload);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('apuracao:load', (payload = {}) => {
      const rt = getRuntime();
      const provaId = payload.provaId;
      const notas = notasDaProva(db, provaId);
      rt.apuracao = {
        visible: !!payload.show,
        provaId,
        equipeId: payload.equipeId || (getEquipes(db)[0] && getEquipes(db)[0].id),
        reveladas: notas.filter((n) => n.revelada).map((n) => n.id),
        showWinner: false,
        notas,
      };
      if (payload.show) rt.air = { mode: 'apuracao', visible: true, preview: false };
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, { ...rt, apuracaoNotas: notas }));
    });

    socket.on('apuracao:salvar-nota', (payload = {}) => {
      const check = validateNota(payload.nota);
      if (!check.ok) {
        socket.emit('system:error', { message: check.message });
        return;
      }
      const result = salvarNota(db, { ...payload, nota: check.value });
      createBackup(db, 'nota');
      const rt = getRuntime();
      rt.apuracao.notas = result.notas;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('apuracao:bloquear', (payload = {}) => {
      const notas = bloquearNotas(db, payload.provaId, payload.bloqueada !== false);
      const rt = getRuntime();
      rt.apuracao.notas = notas;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('apuracao:revelar', (payload = {}) => {
      const rt = getRuntime();
      if (rt.locked) return;
      const result = revelarNota(db, payload.notaId);
      rt.apuracao.notas = result.notas;
      rt.apuracao.reveladas = result.notas.filter((n) => n.revelada).map((n) => n.id);
      rt.apuracao.visible = true;
      rt.air = { mode: 'apuracao', visible: true, preview: false };
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('apuracao:equipe', (payload = {}) => {
      const rt = getRuntime();
      rt.apuracao.equipeId = payload.equipeId;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('apuracao:winner', (payload = {}) => {
      const rt = getRuntime();
      rt.apuracao.showWinner = !!payload.show;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('apuracao:confirmar-totais', (payload = {}) => {
      const rt = getRuntime();
      const provaId = payload.provaId || rt.apuracao.provaId;
      const equipes = getEquipes(db);
      const rankings = equipes
        .map((e) => ({
          equipeId: e.id,
          total: totalNotasEquipe(db, provaId, e.id),
        }))
        .sort((a, b) => b.total - a.total)
        .map((r, i) => ({ equipeId: r.equipeId, posicao: i + 1 }));

      confirmarResultado(db, { provaId, rankings });
      createBackup(db, 'apuracao');
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('system:lock', (payload = {}) => {
      const rt = getRuntime();
      rt.locked = !!payload.locked;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });

    socket.on('backup:create', () => {
      const info = createBackup(db, 'manual');
      socket.emit('system:info', { message: `Backup criado: ${info.filename}` });
      io.emit('backup:list', listBackups());
    });

    socket.on('backup:list', () => {
      socket.emit('backup:list', listBackups());
    });

    socket.on('backup:restore', (payload = {}) => {
      const result = restoreBackup(db, payload.filename);
      recalcularTotais(db);
      const rt = getRuntime();
      socket.emit('system:info', {
        message: result.ok ? `Restaurado: ${payload.filename}` : result.message,
      });
      io.emit('system:state', buildFullState(db, rt));
      io.emit('backup:list', listBackups());
    });

    socket.on('placar:toggle', (payload = {}) => {
      const rt = getRuntime();
      if (payload.visible != null) rt.placar.visible = !!payload.visible;
      if (payload.compact != null) rt.placar.compact = !!payload.compact;
      setRuntime(rt);
      io.emit('system:state', buildFullState(db, rt));
    });
  });

  // Broadcast timer ticks
  setInterval(() => {
    const rt = getRuntime();
    const snap = timerEngine.snapshot();
    const changed =
      snap.remainingSeconds !== rt.timer.remainingSeconds || snap.running !== rt.timer.running;
    if (changed) {
      rt.timer = snap;
      setRuntime(rt);
      io.emit('timer:tick', snap);
      if (snap.alertLevel === 'ended' && snap.remainingSeconds === 0) {
        io.emit('system:state', buildFullState(db, rt));
      }
    }
  }, 250);

  // Periodic backup during event
  setInterval(() => {
    try {
      createBackup(db, 'periodico');
    } catch (_) {
      /* ignore */
    }
  }, 5 * 60 * 1000);
}

module.exports = { createState, buildFullState, attachSocketHandlers };

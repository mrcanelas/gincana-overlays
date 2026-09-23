const fs = require('fs');
const path = require('path');
const { getEquipes, getProvas, getJurados, DB_PATH } = require('./database');

const BACKUP_DIR = path.join(__dirname, '..', 'database', 'backups');

function ensureBackupDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function exportState(db) {
  return {
    exportedAt: new Date().toISOString(),
    equipes: getEquipes(db),
    provas: getProvas(db),
    jurados: getJurados(db),
    notas: db.prepare('SELECT * FROM notas').all(),
    resultados: db.prepare('SELECT * FROM resultados').all(),
    ajustes: db.prepare('SELECT * FROM ajustes_pontuacao').all(),
    configuracoes: db.prepare('SELECT * FROM configuracoes').all(),
    historico: db.prepare('SELECT * FROM historico_transmissao ORDER BY id DESC LIMIT 200').all(),
  };
}

function createBackup(db, reason = 'manual') {
  ensureBackupDir();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${stamp}-${reason}.json`;
  const filepath = path.join(BACKUP_DIR, filename);
  const data = exportState(db);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');

  try {
    fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `gincana-${stamp}.json`));
  } catch (_) {
    /* ignore */
  }

  return { filename, filepath, exportedAt: data.exportedAt };
}

function listBackups() {
  ensureBackupDir();
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((filename) => {
      const filepath = path.join(BACKUP_DIR, filename);
      const stat = fs.statSync(filepath);
      return { filename, filepath, size: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

function restoreBackup(db, filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return { ok: false, message: 'Backup não encontrado' };
  }

  // Safety backup of current state first
  createBackup(db, 'pre-restore');

  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM notas;
      DELETE FROM resultados;
      DELETE FROM ajustes_pontuacao;
      DELETE FROM historico_transmissao;
      DELETE FROM jurados;
      DELETE FROM provas;
      DELETE FROM equipes;
      DELETE FROM configuracoes;
    `);

    const insEq = db.prepare(
      'INSERT INTO equipes (id, nome, cor, brasao_path, pontuacao_total) VALUES (@id, @nome, @cor, @brasao_path, @pontuacao_total)'
    );
    for (const e of data.equipes || []) insEq.run(e);

    const insPr = db.prepare(
      `INSERT INTO provas (id, nome, categoria, ordem, status, valor_maximo, tempo_segundos, tipo)
       VALUES (@id, @nome, @categoria, @ordem, @status, @valor_maximo, @tempo_segundos, @tipo)`
    );
    for (const p of data.provas || []) insPr.run(p);

    const insJ = db.prepare(
      'INSERT INTO jurados (id, nome, ordem_apuracao, ativo) VALUES (@id, @nome, @ordem_apuracao, @ativo)'
    );
    for (const j of data.jurados || []) insJ.run(j);

    const insN = db.prepare(
      `INSERT INTO notas (id, prova_id, jurado_id, equipe_id, nota, revelada, bloqueada)
       VALUES (@id, @prova_id, @jurado_id, @equipe_id, @nota, @revelada, @bloqueada)`
    );
    for (const n of data.notas || []) insN.run(n);

    const insR = db.prepare(
      `INSERT INTO resultados (id, prova_id, equipe_id, pontos, posicao, confirmado)
       VALUES (@id, @prova_id, @equipe_id, @pontos, @posicao, @confirmado)`
    );
    for (const r of data.resultados || []) insR.run(r);

    const insA = db.prepare(
      `INSERT INTO ajustes_pontuacao (id, equipe_id, tipo, valor, motivo, data_hora)
       VALUES (@id, @equipe_id, @tipo, @valor, @motivo, @data_hora)`
    );
    for (const a of data.ajustes || []) insA.run(a);

    const insC = db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (@chave, @valor)');
    for (const c of data.configuracoes || []) insC.run(c);
  });

  tx();
  return { ok: true, filename };
}

module.exports = { createBackup, listBackups, restoreBackup, exportState, BACKUP_DIR };

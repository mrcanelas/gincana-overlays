const { getEquipes, recalcularTotais, logHistorico } = require('./database');

const PONTOS_1 = 10;
const PONTOS_2 = 8;

function pontosPorPosicao(posicao) {
  if (posicao === 1) return PONTOS_1;
  if (posicao === 2) return PONTOS_2;
  return 0;
}

function confirmarResultado(db, { provaId, rankings }) {
  // rankings: [{ equipeId, posicao }]
  const del = db.prepare('DELETE FROM resultados WHERE prova_id = ?');
  const insert = db.prepare(
    `INSERT INTO resultados (prova_id, equipe_id, pontos, posicao, confirmado)
     VALUES (?, ?, ?, ?, 1)`
  );

  const tx = db.transaction(() => {
    del.run(provaId);
    for (const row of rankings) {
      insert.run(provaId, row.equipeId, pontosPorPosicao(row.posicao), row.posicao);
    }
    db.prepare(`UPDATE provas SET status = 'concluida' WHERE id = ?`).run(provaId);
    logHistorico(db, 'result:confirm', 'resultados', { provaId, rankings });
  });
  tx();
  return recalcularTotais(db);
}

function desfazerUltimoResultado(db) {
  const last = db
    .prepare(
      `SELECT * FROM historico_transmissao WHERE acao = 'result:confirm' ORDER BY id DESC LIMIT 1`
    )
    .get();
  if (!last) return { ok: false, message: 'Nenhum resultado para desfazer', equipes: getEquipes(db) };

  const dados = JSON.parse(last.dados || '{}');
  const provaId = dados.provaId;
  if (!provaId) return { ok: false, message: 'Histórico inválido', equipes: getEquipes(db) };

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM resultados WHERE prova_id = ?').run(provaId);
    db.prepare(`UPDATE provas SET status = 'pendente' WHERE id = ?`).run(provaId);
    logHistorico(db, 'score:undo', 'resultados', { provaId });
  });
  tx();
  return { ok: true, provaId, equipes: recalcularTotais(db) };
}

function aplicarAjuste(db, { equipeId, tipo, valor, motivo }) {
  db.prepare(
    `INSERT INTO ajustes_pontuacao (equipe_id, tipo, valor, motivo, data_hora)
     VALUES (?, ?, ?, ?, ?)`
  ).run(equipeId, tipo, valor, motivo || null, new Date().toISOString());
  logHistorico(db, 'score:ajuste', 'placar', { equipeId, tipo, valor, motivo });
  return recalcularTotais(db);
}

function aplicarPenalidadeTransicao(db, { equipeId, minutosExcedentes, provaId }) {
  const cfg = db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'penalidade_transicao'`).get();
  const taxa = cfg ? Number(cfg.valor) : 0.6;
  const valor = -(taxa * minutosExcedentes);
  return aplicarAjuste(db, {
    equipeId,
    tipo: 'penalidade_transicao',
    valor,
    motivo: `Transição excedida ${minutosExcedentes} min na prova ${provaId || '?'} (−${taxa}/min)`,
  });
}

function desempate(db) {
  const cfg = db.prepare(`SELECT valor FROM configuracoes WHERE chave = 'desempate_provas'`).get();
  const nomes = cfg ? JSON.parse(cfg.valor) : [];
  const equipes = getEquipes(db);
  if (equipes.length < 2) return { empate: false, equipes };

  const sorted = [...equipes].sort((a, b) => b.pontuacao_total - a.pontuacao_total);
  if (sorted[0].pontuacao_total !== sorted[1].pontuacao_total) {
    return { empate: false, campeã: sorted[0], equipes: sorted };
  }

  for (const nome of nomes) {
    const prova = db.prepare('SELECT id FROM provas WHERE nome = ?').get(nome);
    if (!prova) continue;
    const r1 = db
      .prepare('SELECT pontos FROM resultados WHERE prova_id = ? AND equipe_id = ? AND confirmado = 1')
      .get(prova.id, sorted[0].id);
    const r2 = db
      .prepare('SELECT pontos FROM resultados WHERE prova_id = ? AND equipe_id = ? AND confirmado = 1')
      .get(prova.id, sorted[1].id);
    const p1 = r1 ? r1.pontos : 0;
    const p2 = r2 ? r2.pontos : 0;
    if (p1 !== p2) {
      const campeã = p1 > p2 ? sorted[0] : sorted[1];
      return { empate: true, resolvidoPor: nome, campeã, equipes: sorted };
    }
  }
  return { empate: true, resolvidoPor: null, campeã: null, equipes: sorted };
}

function notasDaProva(db, provaId) {
  return db
    .prepare(
      `SELECT n.*, j.nome AS jurado_nome, e.nome AS equipe_nome, e.brasao_path, e.cor
       FROM notas n
       JOIN jurados j ON j.id = n.jurado_id
       JOIN equipes e ON e.id = n.equipe_id
       WHERE n.prova_id = ?
       ORDER BY j.ordem_apuracao, e.id`
    )
    .all(provaId);
}

function salvarNota(db, { provaId, juradoId, equipeId, nota }) {
  const existing = db
    .prepare(
      'SELECT id, bloqueada FROM notas WHERE prova_id = ? AND jurado_id = ? AND equipe_id = ?'
    )
    .get(provaId, juradoId, equipeId);
  if (existing && existing.bloqueada) {
    return { ok: false, message: 'Nota bloqueada' };
  }
  if (existing) {
    db.prepare('UPDATE notas SET nota = ?, revelada = 0 WHERE id = ?').run(nota, existing.id);
  } else {
    db.prepare(
      'INSERT INTO notas (prova_id, jurado_id, equipe_id, nota, revelada, bloqueada) VALUES (?, ?, ?, ?, 0, 0)'
    ).run(provaId, juradoId, equipeId, nota);
  }
  logHistorico(db, 'nota:salvar', 'apuracao', { provaId, juradoId, equipeId, nota });
  return { ok: true, notas: notasDaProva(db, provaId) };
}

function bloquearNotas(db, provaId, bloqueada = true) {
  db.prepare('UPDATE notas SET bloqueada = ? WHERE prova_id = ?').run(bloqueada ? 1 : 0, provaId);
  return notasDaProva(db, provaId);
}

function revelarNota(db, notaId) {
  db.prepare('UPDATE notas SET revelada = 1 WHERE id = ?').run(notaId);
  const nota = db.prepare('SELECT * FROM notas WHERE id = ?').get(notaId);
  return { nota, notas: notasDaProva(db, nota.prova_id) };
}

function totalNotasEquipe(db, provaId, equipeId) {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(nota), 0) AS total FROM notas
       WHERE prova_id = ? AND equipe_id = ? AND revelada = 1 AND nota IS NOT NULL`
    )
    .get(provaId, equipeId);
  return row.total;
}

module.exports = {
  PONTOS_1,
  PONTOS_2,
  pontosPorPosicao,
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
};

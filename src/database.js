const fs = require('fs');
const path = require('path');
const { JsonDatabase } = require('./json-db');

const DB_PATH = path.join(__dirname, '..', 'database', 'gincana.json');

function ensureDirs() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'database', 'backups'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, '..', 'public', 'assets', 'brasoes'), { recursive: true });
}

function seed(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM equipes').get().c;
  if (count > 0) return;

  const insertEquipe = db.prepare(
    'INSERT INTO equipes (id, nome, cor, brasao_path, pontuacao_total) VALUES (?, ?, ?, ?, ?)'
  );
  insertEquipe.run(1, 'Equipe A', '#07375a', '/assets/brasoes/placeholder-a.svg', 0);
  insertEquipe.run(2, 'Equipe B', '#b9472e', '/assets/brasoes/placeholder-b.svg', 0);

  const insertProva = db.prepare(
    `INSERT INTO provas (nome, categoria, ordem, status, valor_maximo, tempo_segundos, tipo)
     VALUES (@nome, @categoria, @ordem, 'pendente', 10, @tempo, @tipo)`
  );

  const provas = [
    { nome: 'Futsal', categoria: 'esportiva', ordem: 1, tempo: null, tipo: 'resultado' },
    { nome: 'Voleibol Misto', categoria: 'esportiva', ordem: 2, tempo: null, tipo: 'resultado' },
    { nome: 'Basquetebol', categoria: 'esportiva', ordem: 3, tempo: null, tipo: 'resultado' },
    { nome: 'Xadrez', categoria: 'tabuleiro', ordem: 4, tempo: null, tipo: 'resultado' },
    { nome: 'Dama', categoria: 'tabuleiro', ordem: 5, tempo: null, tipo: 'resultado' },
    { nome: 'EA Sports FC 26', categoria: 'eletronico', ordem: 6, tempo: null, tipo: 'resultado' },
    { nome: 'Clash Royale', categoria: 'eletronico', ordem: 7, tempo: null, tipo: 'resultado' },
    { nome: 'Mobile Legends', categoria: 'eletronico', ordem: 8, tempo: null, tipo: 'resultado' },
    { nome: 'GeoGuessr', categoria: 'eletronico', ordem: 9, tempo: null, tipo: 'resultado' },
    { nome: 'Desafio Lógico-Matemático', categoria: 'conhecimento', ordem: 10, tempo: null, tipo: 'resultado' },
    { nome: 'Brasil que Cuida', categoria: 'solidaria', ordem: 11, tempo: null, tipo: 'resultado' },
    { nome: 'Apresentação das Equipes', categoria: 'cultural', ordem: 12, tempo: 600, tipo: 'jurados' },
    { nome: 'Apresentação do Mascote', categoria: 'cultural', ordem: 13, tempo: 300, tipo: 'jurados' },
    { nome: 'Garoto e Garota CETI JNA', categoria: 'cultural', ordem: 14, tempo: null, tipo: 'jurados' },
    { nome: 'No Ritmo do Brasil', categoria: 'cultural', ordem: 15, tempo: 360, tipo: 'jurados' },
    { nome: 'Sabores do Piauí', categoria: 'cultural', ordem: 16, tempo: null, tipo: 'jurados' },
    { nome: 'Brasil em Cena', categoria: 'cultural', ordem: 17, tempo: null, tipo: 'jurados' },
    { nome: '1ª Prova Surpresa', categoria: 'surpresa', ordem: 18, tempo: null, tipo: 'resultado' },
    { nome: 'Casal Show', categoria: 'cultural', ordem: 19, tempo: 300, tipo: 'jurados' },
    { nome: 'Traços do Brasil', categoria: 'cultural', ordem: 20, tempo: null, tipo: 'jurados' },
    { nome: 'Vozes do Brasil (Lip Sync)', categoria: 'cultural', ordem: 21, tempo: 420, tipo: 'jurados' },
    { nome: 'Arte em Cores', categoria: 'cultural', ordem: 22, tempo: null, tipo: 'jurados' },
    { nome: 'Guardiões do Folclore', categoria: 'cultural', ordem: 23, tempo: 600, tipo: 'jurados' },
    { nome: 'Ritmo na Torcida', categoria: 'cultural', ordem: 24, tempo: 420, tipo: 'jurados' },
    { nome: 'Brasil de Muitos Brasis', categoria: 'conhecimento', ordem: 25, tempo: null, tipo: 'resultado' },
    { nome: '2ª Prova Surpresa', categoria: 'surpresa', ordem: 26, tempo: null, tipo: 'resultado' },
    { nome: 'Brasil e Mundo', categoria: 'cultural', ordem: 27, tempo: null, tipo: 'jurados' },
    { nome: 'Viagem pelo Brasil', categoria: 'cultural', ordem: 28, tempo: 900, tipo: 'jurados' },
    { nome: 'Musical Gospel', categoria: 'cultural', ordem: 29, tempo: 420, tipo: 'jurados' },
    { nome: 'Canta Brasil (Paródia)', categoria: 'cultural', ordem: 30, tempo: null, tipo: 'jurados' },
    { nome: 'Show de Encerramento', categoria: 'cultural', ordem: 31, tempo: 1200, tipo: 'jurados' },
  ];

  const tx = db.transaction(() => {
    for (const p of provas) insertProva.run(p);
    for (let i = 1; i <= 3; i += 1) {
      db.prepare('INSERT INTO jurados (nome, ordem_apuracao, ativo) VALUES (?, ?, 1)').run(
        `Jurado ${i}`,
        i,
        1
      );
    }
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run(
      'desempate_provas',
      JSON.stringify(['No Ritmo do Brasil', 'Brasil que Cuida'])
    );
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run(
      'penalidade_transicao',
      '0.6'
    );
    db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?)').run(
      'transicao_segundos',
      '900'
    );
  });
  tx();
}

function openDatabase() {
  ensureDirs();
  const db = new JsonDatabase(DB_PATH);
  seed(db);
  return db;
}

function logHistorico(db, acao, modulo, dados) {
  db.prepare(
    'INSERT INTO historico_transmissao (acao, modulo, dados, data_hora) VALUES (?, ?, ?, ?)'
  ).run(acao, modulo || null, dados ? JSON.stringify(dados) : null, new Date().toISOString());
}

function getEquipes(db) {
  return db.prepare('SELECT * FROM equipes ORDER BY id').all();
}

function getProvas(db) {
  return db.prepare('SELECT * FROM provas ORDER BY ordem, id').all();
}

function getJurados(db) {
  return db.prepare('SELECT * FROM jurados WHERE ativo = 1 ORDER BY ordem_apuracao, id').all();
}

function recalcularTotais(db) {
  const equipes = getEquipes(db);
  for (const eq of equipes) {
    const resultados = db
      .prepare(
        'SELECT COALESCE(SUM(pontos), 0) AS t FROM resultados WHERE equipe_id = ? AND confirmado = 1'
      )
      .get(eq.id).t;
    const ajustes = db
      .prepare('SELECT COALESCE(SUM(valor), 0) AS t FROM ajustes_pontuacao WHERE equipe_id = ?')
      .get(eq.id).t;
    const total = Number(resultados) + Number(ajustes);
    db.prepare('UPDATE equipes SET pontuacao_total = ? WHERE id = ?').run(total, eq.id);
  }
  return getEquipes(db);
}

module.exports = {
  openDatabase,
  logHistorico,
  getEquipes,
  getProvas,
  getJurados,
  recalcularTotais,
  DB_PATH,
};

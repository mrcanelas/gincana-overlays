const fs = require('fs');
const path = require('path');

/**
 * Persistência local em JSON com API semelhante ao better-sqlite3
 * (evita compilação nativa no Windows).
 */
class JsonDatabase {
  constructor(filepath) {
    this.filepath = filepath;
    this.data = {
      equipes: [],
      provas: [],
      jurados: [],
      notas: [],
      resultados: [],
      ajustes_pontuacao: [],
      configuracoes: [],
      historico_transmissao: [],
      _seq: {
        provas: 1,
        jurados: 1,
        notas: 1,
        resultados: 1,
        ajustes_pontuacao: 1,
        historico_transmissao: 1,
      },
    };
    if (fs.existsSync(filepath)) {
      try {
        this.data = { ...this.data, ...JSON.parse(fs.readFileSync(filepath, 'utf8')) };
      } catch (_) {
        /* keep default */
      }
    }
    this._save();
  }

  pragma() {
    return null;
  }

  _save() {
    fs.mkdirSync(path.dirname(this.filepath), { recursive: true });
    fs.writeFileSync(this.filepath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  _nextId(table) {
    const id = this.data._seq[table] || 1;
    this.data._seq[table] = id + 1;
    return id;
  }

  exec(sql) {
    // Schema is implicit in JSON structure; CREATE/DELETE handled via prepare.
    const deletes = sql.match(/DELETE FROM (\w+)/gi) || [];
    for (const d of deletes) {
      const table = d.split(/\s+/)[2];
      if (this.data[table]) this.data[table] = [];
    }
    this._save();
  }

  prepare(sql) {
    const self = this;
    const normalized = sql.replace(/\s+/g, ' ').trim();

    return {
      run(...params) {
        return self._run(normalized, params);
      },
      get(...params) {
        return self._get(normalized, params);
      },
      all(...params) {
        return self._all(normalized, params);
      },
    };
  }

  transaction(fn) {
    return (...args) => {
      const result = fn(...args);
      this._save();
      return result;
    };
  }

  _bind(sql, params) {
    const named = params.length === 1 && params[0] && typeof params[0] === 'object' && !Array.isArray(params[0]);
    let values = [];
    if (named) {
      const obj = params[0];
      const names = [...sql.matchAll(/@(\w+)/g)].map((m) => m[1]);
      values = names.map((n) => obj[n]);
      // Also support ? with object via positional fallback
    } else {
      values = params;
    }
    return { named, values, obj: named ? params[0] : null };
  }

  _run(sql, params) {
    const upper = sql.toUpperCase();

    if (upper.startsWith('INSERT INTO EQUIPES')) {
      const [id, nome, cor, brasao_path, pontuacao_total] = params;
      this.data.equipes.push({
        id,
        nome,
        cor,
        brasao_path,
        pontuacao_total: pontuacao_total ?? 0,
      });
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO PROVAS')) {
      const b = this._bind(sql, params);
      const row = b.obj
        ? {
            id: this._nextId('provas'),
            nome: b.obj.nome,
            categoria: b.obj.categoria,
            ordem: b.obj.ordem,
            status: 'pendente',
            valor_maximo: 10,
            tempo_segundos: b.obj.tempo ?? b.obj.tempo_segundos ?? null,
            tipo: b.obj.tipo,
          }
        : null;
      if (b.obj && b.obj.id != null) row.id = b.obj.id;
      if (sql.includes('@id') && b.obj) {
        this.data.provas.push({
          id: b.obj.id,
          nome: b.obj.nome,
          categoria: b.obj.categoria,
          ordem: b.obj.ordem,
          status: b.obj.status,
          valor_maximo: b.obj.valor_maximo,
          tempo_segundos: b.obj.tempo_segundos,
          tipo: b.obj.tipo,
        });
      } else if (row) {
        this.data.provas.push(row);
      }
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO JURADOS')) {
      if (params[0] && typeof params[0] === 'object') {
        const o = params[0];
        this.data.jurados.push({
          id: o.id != null ? o.id : this._nextId('jurados'),
          nome: o.nome,
          ordem_apuracao: o.ordem_apuracao,
          ativo: o.ativo,
        });
      } else {
        const [nome, ordem_apuracao, ativo] = params;
        this.data.jurados.push({
          id: this._nextId('jurados'),
          nome,
          ordem_apuracao,
          ativo,
        });
      }
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO CONFIGURACOES')) {
      if (params[0] && typeof params[0] === 'object') {
        const o = params[0];
        this.data.configuracoes = this.data.configuracoes.filter((c) => c.chave !== o.chave);
        this.data.configuracoes.push({ chave: o.chave, valor: o.valor });
      } else {
        const [chave, valor] = params;
        this.data.configuracoes = this.data.configuracoes.filter((c) => c.chave !== chave);
        this.data.configuracoes.push({ chave, valor });
      }
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO HISTORICO_TRANSMISSAO')) {
      const [acao, modulo, dados, data_hora] = params;
      this.data.historico_transmissao.push({
        id: this._nextId('historico_transmissao'),
        acao,
        modulo,
        dados,
        data_hora,
      });
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO RESULTADOS')) {
      if (params[0] && typeof params[0] === 'object' && params[0].id != null) {
        const o = params[0];
        this.data.resultados.push({ ...o });
        if (o.id >= this.data._seq.resultados) this.data._seq.resultados = o.id + 1;
      } else {
        const prova_id = params[0];
        const equipe_id = params[1];
        const pontos = params[2];
        const posicao = params[3];
        const confirmado = params.length >= 5 ? params[4] : 1;
        this.data.resultados.push({
          id: this._nextId('resultados'),
          prova_id,
          equipe_id,
          pontos,
          posicao,
          confirmado,
        });
      }
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO NOTAS')) {
      if (params[0] && typeof params[0] === 'object' && params[0].id != null) {
        const o = params[0];
        this.data.notas.push({ ...o });
        if (o.id >= this.data._seq.notas) this.data._seq.notas = o.id + 1;
      } else {
        // VALUES (?, ?, ?, ?, 0, 0) or full 6 placeholders
        const prova_id = params[0];
        const jurado_id = params[1];
        const equipe_id = params[2];
        const nota = params[3];
        const revelada = params.length >= 6 ? params[4] : 0;
        const bloqueada = params.length >= 6 ? params[5] : 0;
        this.data.notas.push({
          id: this._nextId('notas'),
          prova_id,
          jurado_id,
          equipe_id,
          nota,
          revelada,
          bloqueada,
        });
      }
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('INSERT INTO AJUSTES_PONTUACAO')) {
      if (params[0] && typeof params[0] === 'object' && params[0].id != null) {
        const o = params[0];
        this.data.ajustes_pontuacao.push({ ...o });
        if (o.id >= this.data._seq.ajustes_pontuacao) this.data._seq.ajustes_pontuacao = o.id + 1;
      } else {
        const [equipe_id, tipo, valor, motivo, data_hora] = params;
        this.data.ajustes_pontuacao.push({
          id: this._nextId('ajustes_pontuacao'),
          equipe_id,
          tipo,
          valor,
          motivo,
          data_hora,
        });
      }
      this._save();
      return { changes: 1 };
    }

    if (upper.startsWith('UPDATE EQUIPES SET NOME')) {
      const [nome, cor, brasao_path, id] = params;
      const eq = this.data.equipes.find((e) => e.id === id);
      if (eq) {
        eq.nome = nome;
        eq.cor = cor;
        eq.brasao_path = brasao_path;
        this._save();
      }
      return { changes: eq ? 1 : 0 };
    }

    if (upper.startsWith('UPDATE EQUIPES SET BRASAO_PATH')) {
      const [brasao_path, id] = params;
      const eq = this.data.equipes.find((e) => e.id === id);
      if (eq) {
        eq.brasao_path = brasao_path;
        this._save();
      }
      return { changes: eq ? 1 : 0 };
    }

    if (upper.startsWith('UPDATE EQUIPES SET PONTUACAO_TOTAL')) {
      const [pontuacao_total, id] = params;
      const eq = this.data.equipes.find((e) => e.id === id);
      if (eq) {
        eq.pontuacao_total = pontuacao_total;
        this._save();
      }
      return { changes: eq ? 1 : 0 };
    }

    if (upper.startsWith('UPDATE PROVAS SET STATUS')) {
      let status;
      let id;
      if (/STATUS\s*=\s*\?/.test(upper)) {
        status = params[0];
        id = params[1];
      } else {
        const lit = sql.match(/status\s*=\s*'([^']+)'/i);
        status = lit ? lit[1] : params[0];
        id = lit ? params[0] : params[1];
      }
      const p = this.data.provas.find((x) => x.id === id);
      if (p) {
        p.status = status;
        this._save();
      }
      return { changes: p ? 1 : 0 };
    }

    if (upper.startsWith('UPDATE NOTAS SET NOTA')) {
      const [nota, id] = params;
      const n = this.data.notas.find((x) => x.id === id);
      if (n) {
        n.nota = nota;
        n.revelada = 0;
        this._save();
      }
      return { changes: n ? 1 : 0 };
    }

    if (upper.startsWith('UPDATE NOTAS SET BLOQUEADA')) {
      const [bloqueada, prova_id] = params;
      let changes = 0;
      for (const n of this.data.notas) {
        if (n.prova_id === prova_id) {
          n.bloqueada = bloqueada;
          changes += 1;
        }
      }
      this._save();
      return { changes };
    }

    if (upper.startsWith('UPDATE NOTAS SET REVELADA')) {
      // Supports: SET revelada = 1 WHERE id = ?  OR  SET revelada = ? WHERE id = ?
      let revelada;
      let id;
      if (/REVELADA\s*=\s*\?/.test(upper)) {
        revelada = params[0];
        id = params[1];
      } else {
        const lit = sql.match(/revelada\s*=\s*(\d+)/i);
        revelada = lit ? Number(lit[1]) : 1;
        id = params[0];
      }
      const n = this.data.notas.find((x) => x.id === id);
      if (n) {
        n.revelada = revelada;
        this._save();
      }
      return { changes: n ? 1 : 0 };
    }

    if (upper.startsWith('DELETE FROM RESULTADOS WHERE PROVA_ID')) {
      const [prova_id] = params;
      const before = this.data.resultados.length;
      this.data.resultados = this.data.resultados.filter((r) => r.prova_id !== prova_id);
      this._save();
      return { changes: before - this.data.resultados.length };
    }

    if (upper.startsWith('DELETE FROM')) {
      const table = sql.split(/\s+/)[2];
      if (this.data[table]) this.data[table] = [];
      this._save();
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  _get(sql, params) {
    const upper = sql.toUpperCase();

    if (upper.includes('COUNT(*)') && upper.includes('FROM EQUIPES')) {
      return { c: this.data.equipes.length };
    }

    if (upper.includes('FROM EQUIPES WHERE ID')) {
      return this.data.equipes.find((e) => e.id === params[0]) || undefined;
    }

    if (upper.includes('COALESCE(SUM(PONTOS)') && upper.includes('RESULTADOS')) {
      const equipe_id = params[0];
      const t = this.data.resultados
        .filter((r) => r.equipe_id === equipe_id && r.confirmado === 1)
        .reduce((s, r) => s + Number(r.pontos), 0);
      return { t };
    }

    if (upper.includes('COALESCE(SUM(VALOR)') && upper.includes('AJUSTES')) {
      const equipe_id = params[0];
      const t = this.data.ajustes_pontuacao
        .filter((a) => a.equipe_id === equipe_id)
        .reduce((s, a) => s + Number(a.valor), 0);
      return { t };
    }

    if (upper.includes('FROM HISTORICO_TRANSMISSAO') && upper.includes('RESULT:CONFIRM')) {
      const rows = this.data.historico_transmissao
        .filter((h) => h.acao === 'result:confirm')
        .sort((a, b) => b.id - a.id);
      return rows[0];
    }

    if (upper.includes('FROM CONFIGURACOES WHERE CHAVE')) {
      return this.data.configuracoes.find((c) => c.chave === params[0]);
    }

    if (upper.includes('FROM PROVAS WHERE NOME')) {
      return this.data.provas.find((p) => p.nome === params[0]);
    }

    if (upper.includes('FROM RESULTADOS WHERE PROVA_ID') && upper.includes('EQUIPE_ID')) {
      return this.data.resultados.find(
        (r) => r.prova_id === params[0] && r.equipe_id === params[1] && r.confirmado === 1
      );
    }

    if (upper.includes('FROM NOTAS WHERE PROVA_ID') && upper.includes('JURADO_ID')) {
      return this.data.notas.find(
        (n) => n.prova_id === params[0] && n.jurado_id === params[1] && n.equipe_id === params[2]
      );
    }

    if (upper.includes('FROM NOTAS WHERE ID')) {
      return this.data.notas.find((n) => n.id === params[0]);
    }

    if (upper.includes('COALESCE(SUM(NOTA)') && upper.includes('FROM NOTAS')) {
      const [prova_id, equipe_id] = params;
      const total = this.data.notas
        .filter(
          (n) =>
            n.prova_id === prova_id &&
            n.equipe_id === equipe_id &&
            n.revelada === 1 &&
            n.nota != null
        )
        .reduce((s, n) => s + Number(n.nota), 0);
      return { total };
    }

    return undefined;
  }

  _all(sql, params) {
    const upper = sql.toUpperCase();

    if (upper.includes('FROM EQUIPES ORDER BY ID')) {
      return [...this.data.equipes].sort((a, b) => a.id - b.id);
    }
    if (upper.includes('FROM PROVAS ORDER BY')) {
      return [...this.data.provas].sort((a, b) => a.ordem - b.ordem || a.id - b.id);
    }
    if (upper.includes('FROM JURADOS')) {
      return this.data.jurados
        .filter((j) => j.ativo === 1)
        .sort((a, b) => a.ordem_apuracao - b.ordem_apuracao || a.id - b.id);
    }
    if (upper.includes('FROM NOTAS N') || (upper.includes('JOIN JURADOS') && upper.includes('NOTAS'))) {
      const prova_id = params[0];
      return this.data.notas
        .filter((n) => n.prova_id === prova_id)
        .map((n) => {
          const j = this.data.jurados.find((x) => x.id === n.jurado_id) || {};
          const e = this.data.equipes.find((x) => x.id === n.equipe_id) || {};
          return {
            ...n,
            jurado_nome: j.nome,
            equipe_nome: e.nome,
            brasao_path: e.brasao_path,
            cor: e.cor,
            ordem: j.ordem_apuracao || 0,
          };
        })
        .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.equipe_id - b.equipe_id);
    }
    if (upper.includes('SELECT * FROM NOTAS')) return [...this.data.notas];
    if (upper.includes('SELECT * FROM RESULTADOS')) return [...this.data.resultados];
    if (upper.includes('SELECT * FROM AJUSTES_PONTUACAO') || upper.includes('FROM AJUSTES')) {
      return [...this.data.ajustes_pontuacao];
    }
    if (upper.includes('SELECT * FROM CONFIGURACOES')) return [...this.data.configuracoes];
    if (upper.includes('FROM HISTORICO_TRANSMISSAO')) {
      return [...this.data.historico_transmissao].sort((a, b) => b.id - a.id).slice(0, 200);
    }
    if (upper.includes('SELECT * FROM JURADOS')) return [...this.data.jurados];
    if (upper.includes('SELECT * FROM PROVAS')) return [...this.data.provas];
    if (upper.includes('SELECT * FROM EQUIPES')) return [...this.data.equipes];

    return [];
  }
}

module.exports = { JsonDatabase };

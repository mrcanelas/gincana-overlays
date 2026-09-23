(function () {
  const panel = document.getElementById('panel');
  const modules = document.getElementById('modules');
  const scorebar = document.getElementById('scorebar');
  const toastEl = document.getElementById('toast');
  let mod = 'cenas';
  let state = null;
  let backups = [];

  const client = Gincana.connect();

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  client.socket.on('connect', () => {
    connPill.textContent = 'CONECTADO';
    connPill.classList.add('ok');
  });
  client.socket.on('disconnect', () => {
    connPill.textContent = 'DESCONECTADO';
    connPill.classList.remove('ok');
  });
  client.socket.on('system:info', (p) => toast(p.message || ''));
  client.socket.on('system:error', (p) => toast(p.message || 'Erro'));
  client.socket.on('backup:list', (list) => {
    backups = list || [];
    if (mod === 'backup') render();
  });

  modules.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mod]');
    if (!btn) return;
    mod = btn.dataset.mod;
    [...modules.querySelectorAll('button')].forEach((b) => b.classList.toggle('active', b === btn));
    render();
  });

  btnClear.addEventListener('click', () => {
    if (confirm('Limpar todos os overlays?')) client.emit('overlay:clear');
  });
  btnLock.addEventListener('click', () => {
    const locked = !(state && state.locked);
    client.emit('system:lock', { locked });
  });

  client.onState((s) => {
    state = s;
    updateChrome();
    render();
  });

  function updateChrome() {
    if (!state) return;
    const air = state.air || {};
    airPill.textContent = air.visible ? `NO AR • ${(air.mode || '').toUpperCase()}` : air.preview ? 'PRÉVIA' : 'OCULTO';
    airPill.classList.toggle('on', !!air.visible);
    lockPill.textContent = state.locked ? 'BLOQUEADO' : 'EDITÁVEL';
    lockPill.classList.toggle('on', !!state.locked);
    btnLock.textContent = state.locked ? 'Desbloquear' : 'Bloquear';
    const eqs = state.equipes || [];
    scorebar.innerHTML = eqs
      .map(
        (e) => `<div class="card">${Gincana.brasaoHtml(e, 40)}<div><div>${e.nome}</div><b>${Gincana.fmtPts(e.pontuacao_total)} pts</b></div></div>`
      )
      .join('');
  }

  function eqs() {
    return (state && state.equipes) || [];
  }
  function provas() {
    return (state && state.provas) || [];
  }
  function jurados() {
    return (state && state.jurados) || [];
  }

  function render() {
    if (!state) {
      panel.innerHTML = '<p>Conectando…</p>';
      return;
    }
    const map = {
      cenas: renderCenas,
      timer: renderTimer,
      intervalo: renderIntervalo,
      resultados: renderResultados,
      apuracao: renderApuracao,
      placar: renderPlacar,
      equipes: renderEquipes,
      backup: renderBackup,
    };
    (map[mod] || renderCenas)();
  }

  function renderCenas() {
    panel.innerHTML = `
      <h2>Cenas</h2>
      <label>Dia do evento (opcional na abertura)</label>
      <input id="diaEvento" placeholder="Ex.: 23 de setembro de 2026" value="${(state.abertura && state.abertura.dia) || ''}">
      <div class="row-btns">
        <button class="btn" data-a="abertura">Abrir Abertura</button>
        <button class="btn secondary" data-a="abertura-hide">Ocultar Abertura</button>
        <button class="btn success" data-a="intervalo">Abrir Intervalo</button>
        <button class="btn secondary" data-a="intervalo-hide">Ocultar Intervalo</button>
        <button class="btn warn" data-a="placar-full">Placar tela cheia</button>
        <button class="btn ghost" data-a="placar-bar">Placar tarja</button>
      </div>
      <p class="help">Atalhos: Ctrl+1 Abertura · Ctrl+2 Cronômetro · Ctrl+3 Intervalo · Ctrl+4 Resultados · Ctrl+5 Placar · Esc ocultar · Ctrl+Shift+X limpar</p>
    `;
    panel.querySelector('[data-a="abertura"]').onclick = () => {
      client.emit('overlay:show', { mode: 'abertura', dia: diaEvento.value });
    };
    panel.querySelector('[data-a="abertura-hide"]').onclick = () => client.emit('overlay:hide', { mode: 'abertura' });
    panel.querySelector('[data-a="intervalo"]').onclick = () => client.emit('intervalo:show');
    panel.querySelector('[data-a="intervalo-hide"]').onclick = () => client.emit('intervalo:hide');
    panel.querySelector('[data-a="placar-full"]').onclick = () => {
      client.emit('placar:toggle', { visible: true, compact: false });
      client.emit('overlay:show', { mode: 'placar' });
    };
    panel.querySelector('[data-a="placar-bar"]').onclick = () => client.emit('placar:toggle', { visible: true, compact: true });
  }

  function renderTimer() {
    const t = state.timer || {};
    const cultural = provas().filter((p) => p.tempo_segundos);
    panel.innerHTML = `
      <h2>Cronômetro</h2>
      <div class="timer-display">${t.display || '00:00'}</div>
      <div class="help">${t.running ? 'Em andamento' : 'Pausado'} · ${t.alertLevel || 'normal'} · ${t.mode || ''}</div>
      <div class="grid-2">
        <div>
          <label>Modo</label>
          <select id="timerMode">
            <option value="apresentacao">Apresentação</option>
            <option value="transicao">Transição (15 min)</option>
            <option value="contagem">Contagem início</option>
          </select>
        </div>
        <div>
          <label>Equipe</label>
          <select id="timerEquipe">
            <option value="">—</option>
            ${eqs().map((e) => `<option value="${e.id}">${e.nome}</option>`).join('')}
          </select>
        </div>
      </div>
      <label>Prova (preenche tempo)</label>
      <select id="timerProva">
        <option value="">Manual</option>
        ${cultural.map((p) => `<option value="${p.id}" data-t="${p.tempo_segundos}">${p.nome} (${Math.round(p.tempo_segundos / 60)} min)</option>`).join('')}
      </select>
      <label>Tempo (segundos)</label>
      <input id="timerSecs" type="number" value="${t.totalSeconds || 900}">
      <label>Rótulo</label>
      <input id="timerLabel" value="${t.label || ''}" placeholder="Nome da apresentação">
      <div class="row-btns">
        <button class="btn success" id="tStart">Iniciar</button>
        <button class="btn warn" id="tPause">Pausar</button>
        <button class="btn secondary" id="tResume">Continuar</button>
        <button class="btn ghost" id="tReset">Reiniciar</button>
        <button class="btn" id="tPlus">+30s</button>
        <button class="btn" id="tMinus">−30s</button>
        <button class="btn danger" id="tFinish">Encerrar</button>
      </div>
      <h3>Penalidade de transição</h3>
      <div class="grid-2">
        <div>
          <label>Equipe</label>
          <select id="penEquipe">${eqs().map((e) => `<option value="${e.id}">${e.nome}</option>`).join('')}</select>
        </div>
        <div>
          <label>Minutos excedidos</label>
          <input id="penMin" type="number" min="1" value="1">
        </div>
      </div>
      <div class="row-btns">
        <button class="btn danger" id="btnPen">Aplicar −0,6 pt/min</button>
      </div>
    `;
    if (t.mode) timerMode.value = t.mode;
    if (t.equipeId) timerEquipe.value = t.equipeId;

    timerProva.onchange = () => {
      const opt = timerProva.selectedOptions[0];
      if (opt && opt.dataset.t) {
        timerSecs.value = opt.dataset.t;
        timerLabel.value = opt.textContent.split(' (')[0];
      }
    };
    timerMode.onchange = () => {
      if (timerMode.value === 'transicao') timerSecs.value = 900;
    };

    tStart.onclick = () =>
      client.emit('timer:start', {
        totalSeconds: Number(timerSecs.value) || 900,
        mode: timerMode.value,
        label: timerLabel.value,
        equipeId: timerEquipe.value ? Number(timerEquipe.value) : null,
        provaId: timerProva.value ? Number(timerProva.value) : null,
      });
    tPause.onclick = () => client.emit('timer:pause');
    tResume.onclick = () => client.emit('timer:resume');
    tReset.onclick = () =>
      client.emit('timer:reset', {
        totalSeconds: Number(timerSecs.value) || 900,
        mode: timerMode.value,
        label: timerLabel.value,
      });
    tPlus.onclick = () => client.emit('timer:adjust', { seconds: 30 });
    tMinus.onclick = () => client.emit('timer:adjust', { seconds: -30 });
    tFinish.onclick = () => client.emit('timer:finish');
    btnPen.onclick = () => {
      if (!confirm('Aplicar penalidade de transição?')) return;
      client.emit('score:penalidade-transicao', {
        equipeId: Number(penEquipe.value),
        minutosExcedentes: Number(penMin.value) || 1,
        provaId: timerProva.value ? Number(timerProva.value) : null,
      });
    };
  }

  function renderIntervalo() {
    const sens = (state.intervalo && state.intervalo.sensitivity) || 1.2;
    panel.innerHTML = `
      <h2>Intervalo / DJ visual</h2>
      <p class="help">Tela fiel a intervalo.png. Espectro reage ao microfone do PC (sem música/artista/capa).</p>
      <label>Sensibilidade do espectro (${sens})</label>
      <input id="sens" type="range" min="0.4" max="3" step="0.1" value="${sens}">
      <div class="row-btns">
        <button class="btn success" id="intShow">Colocar no ar</button>
        <button class="btn secondary" id="intHide">Ocultar</button>
      </div>
      <p class="help">No OBS: use a fonte http://localhost:3000/intervalo e permita o microfone na Fonte de Navegador. Desative o áudio da fonte.</p>
    `;
    sens.oninput = () => client.emit('intervalo:sensitivity', { sensitivity: Number(sens.value) });
    intShow.onclick = () => client.emit('intervalo:show', { sensitivity: Number(sens.value) });
    intHide.onclick = () => client.emit('intervalo:hide');
  }

  function renderResultados() {
    const resultaveis = provas().filter((p) => p.tipo === 'resultado');
    const r = state.resultado || {};
    panel.innerHTML = `
      <h2>Resultados</h2>
      <label>Prova</label>
      <select id="resProva">${resultaveis.map((p) => `<option value="${p.id}">${p.nome} (${p.categoria})</option>`).join('')}</select>
      <div class="grid-2" style="margin-top:12px">
        ${eqs()
          .map(
            (e) => `<div>
          <label>${e.nome} — colocação</label>
          <select id="pos${e.id}">
            <option value="1">1º (10 pts)</option>
            <option value="2">2º (8 pts)</option>
          </select>
        </div>`
          )
          .join('')}
      </div>
      <div class="row-btns">
        <button class="btn ghost" id="resPreview">Prévia</button>
        <button class="btn success" id="resShow">No ar</button>
        <button class="btn" id="resNext">Revelar próxima</button>
        <button class="btn secondary" id="resAll">Revelar tudo</button>
        <button class="btn warn" id="resConfirm">Confirmar no placar</button>
        <button class="btn danger" id="resUndo">Desfazer último</button>
      </div>
      <p class="help">Revelados: ${(r.revelados || 0)} / ${(r.rankings || []).length} ${r.confirmed ? '• CONFIRMADO' : ''}</p>
    `;
    if (r.provaId) resProva.value = r.provaId;
    if ((r.rankings || []).length) {
      r.rankings.forEach((row) => {
        const el = document.getElementById('pos' + row.equipeId);
        if (el) el.value = String(row.posicao);
      });
    } else if (eqs().length >= 2) {
      document.getElementById('pos' + eqs()[0].id).value = '1';
      document.getElementById('pos' + eqs()[1].id).value = '2';
    }

    function rankings() {
      return eqs().map((e) => ({
        equipeId: e.id,
        posicao: Number(document.getElementById('pos' + e.id).value),
        pontos: Number(document.getElementById('pos' + e.id).value) === 1 ? 10 : 8,
      }));
    }
    function payload() {
      const prova = provas().find((p) => p.id === Number(resProva.value));
      return {
        provaId: Number(resProva.value),
        titulo: prova ? prova.nome : 'Resultado',
        subtitulo: prova ? prova.categoria : 'Resultado oficial',
        rankings: rankings(),
      };
    }
    resPreview.onclick = () => client.emit('result:preview', payload());
    resShow.onclick = () => client.emit('result:show', payload());
    resNext.onclick = () => client.emit('result:reveal-next');
    resAll.onclick = () => client.emit('result:reveal-all');
    resConfirm.onclick = () => {
      if (!confirm('Confirmar resultado e somar ao placar?')) return;
      client.emit('result:confirm', payload());
    };
    resUndo.onclick = () => {
      if (!confirm('Desfazer o último resultado confirmado?')) return;
      client.emit('score:undo');
    };
  }

  function renderApuracao() {
    const cultural = provas().filter((p) => p.tipo === 'jurados');
    const a = state.apuracao || {};
    const provaId = a.provaId || (cultural[0] && cultural[0].id);
    const notas = a.notas || [];
    panel.innerHTML = `
      <h2>Apuração dos jurados</h2>
      <div class="grid-2">
        <div>
          <label>Prova</label>
          <select id="apProva">${cultural.map((p) => `<option value="${p.id}">${p.nome}</option>`).join('')}</select>
        </div>
        <div>
          <label>Equipe no ar</label>
          <select id="apEquipe">${eqs().map((e) => `<option value="${e.id}">${e.nome}</option>`).join('')}</select>
        </div>
      </div>
      <div class="row-btns">
        <button class="btn ghost" id="apLoad">Carregar notas</button>
        <button class="btn success" id="apShow">No ar</button>
        <button class="btn secondary" id="apHide">Ocultar</button>
        <button class="btn warn" id="apLock">Bloquear notas</button>
        <button class="btn" id="apUnlock">Desbloquear</button>
        <button class="btn danger" id="apWinner">Campeã</button>
        <button class="btn success" id="apConfirm">Confirmar totais no placar</button>
      </div>
      <h3>Lançamento de notas</h3>
      <div id="notaGrid"></div>
      <h3>Revelar</h3>
      <div id="revealList" class="row-btns"></div>
    `;
    if (provaId) apProva.value = provaId;
    if (a.equipeId) apEquipe.value = a.equipeId;

    function load(show) {
      client.emit('apuracao:load', {
        provaId: Number(apProva.value),
        equipeId: Number(apEquipe.value),
        show: !!show,
      });
    }
    apLoad.onclick = () => load(false);
    apShow.onclick = () => load(true);
    apHide.onclick = () => client.emit('overlay:hide', { mode: 'apuracao' });
    apEquipe.onchange = () => client.emit('apuracao:equipe', { equipeId: Number(apEquipe.value) });
    apLock.onclick = () => client.emit('apuracao:bloquear', { provaId: Number(apProva.value), bloqueada: true });
    apUnlock.onclick = () => client.emit('apuracao:bloquear', { provaId: Number(apProva.value), bloqueada: false });
    apWinner.onclick = () => client.emit('apuracao:winner', { show: true });
    apConfirm.onclick = () => {
      if (!confirm('Publicar resultado desta prova no placar (10/8)?')) return;
      client.emit('apuracao:confirmar-totais', { provaId: Number(apProva.value) });
    };

    const grid = document.getElementById('notaGrid');
    grid.innerHTML = `<table class="table"><thead><tr><th>Jurado</th>${eqs()
      .map((e) => `<th>${e.nome}</th>`)
      .join('')}</tr></thead><tbody>${jurados()
      .map((j) => {
        return `<tr><td>${j.nome}</td>${eqs()
          .map((e) => {
            const n = notas.find((x) => x.jurado_id === j.id && x.equipe_id === e.id);
            const val = n && n.nota != null ? String(n.nota) : '';
            const disabled = n && n.bloqueada ? 'disabled' : '';
            return `<td><select data-j="${j.id}" data-e="${e.id}" style="width:90px" ${disabled}>
              <option value="">—</option>
              <option value="10" ${val === '10' || val === '10.0' ? 'selected' : ''}>10</option>
              <option value="8" ${val === '8' || val === '8.0' ? 'selected' : ''}>8</option>
            </select></td>`;
          })
          .join('')}</tr>`;
      })
      .join('')}</tbody></table>
      <div class="row-btns"><button class="btn" id="apSave">Salvar notas</button></div>`;

    apSave.onclick = () => {
      grid.querySelectorAll('select[data-j]').forEach((inp) => {
        if (inp.value === '') return;
        client.emit('apuracao:salvar-nota', {
          provaId: Number(apProva.value),
          juradoId: Number(inp.dataset.j),
          equipeId: Number(inp.dataset.e),
          nota: Number(inp.value),
        });
      });
      toast('Notas enviadas');
    };

    const revealList = document.getElementById('revealList');
    const equipeId = Number(apEquipe.value);
    const pending = notas.filter((n) => n.equipe_id === equipeId && n.nota != null && !n.revelada);
    revealList.innerHTML = pending.length
      ? pending
          .map((n) => {
            const j = jurados().find((x) => x.id === n.jurado_id);
            return `<button class="btn" data-nid="${n.id}">Revelar ${j ? j.nome : n.jurado_id} (${Number(n.nota).toFixed(1)})</button>`;
          })
          .join('')
      : '<span class="help">Nenhuma nota pendente para esta equipe. Carregue/salve notas primeiro.</span>';
    revealList.querySelectorAll('[data-nid]').forEach((btn) => {
      btn.onclick = () => client.emit('apuracao:revelar', { notaId: Number(btn.dataset.nid) });
    });
  }

  function renderPlacar() {
    const p = state.placar || {};
    const d = state.desempate || {};
    panel.innerHTML = `
      <h2>Placar geral</h2>
      <div class="row-btns">
        <button class="btn ${p.visible ? 'secondary' : 'success'}" id="plVis">${p.visible ? 'Ocultar placar' : 'Mostrar placar'}</button>
        <button class="btn ghost" id="plBar">Modo tarja</button>
        <button class="btn" id="plFull">Modo tela cheia</button>
      </div>
      <h3>Situação</h3>
      <ul>
        ${eqs()
          .map((e) => `<li><strong>${e.nome}</strong>: ${Gincana.fmtPts(e.pontuacao_total)} pts</li>`)
          .join('')}
      </ul>
      <p class="help">${
        d.empate
          ? d.campeã
            ? `Empate resolvido por ${d.resolvidoPor}: ${d.campeã.nome}`
            : 'Empate — aguardando critérios de desempate'
          : d.campeã
            ? `Líder: ${d.campeã.nome}`
            : ''
      }</p>
      <h3>Ajuste manual</h3>
      <div class="grid-2">
        <div>
          <label>Equipe</label>
          <select id="ajEquipe">${eqs().map((e) => `<option value="${e.id}">${e.nome}</option>`).join('')}</select>
        </div>
        <div>
          <label>Valor (+/−)</label>
          <input id="ajValor" type="number" step="0.1" value="0">
        </div>
      </div>
      <label>Motivo</label>
      <input id="ajMotivo" placeholder="Ex.: bônus organização">
      <div class="row-btns"><button class="btn warn" id="ajGo">Aplicar ajuste</button></div>
    `;
    plVis.onclick = () => client.emit('placar:toggle', { visible: !p.visible });
    plBar.onclick = () => client.emit('placar:toggle', { visible: true, compact: true });
    plFull.onclick = () => client.emit('placar:toggle', { visible: true, compact: false });
    ajGo.onclick = () => {
      if (!confirm('Aplicar ajuste de pontuação?')) return;
      client.emit('score:ajuste', {
        equipeId: Number(ajEquipe.value),
        tipo: 'manual',
        valor: Number(ajValor.value) || 0,
        motivo: ajMotivo.value,
      });
    };
  }

  function renderEquipes() {
    panel.innerHTML = `<h2>Equipes e brasões</h2>
      ${eqs()
        .map(
          (e) => `<div class="equipe-card" data-id="${e.id}">
        ${Gincana.brasaoHtml(e, 72)}
        <div>
          <label>Nome</label>
          <input class="eq-nome" value="${e.nome}">
          <label>Cor</label>
          <input class="eq-cor" type="color" value="${e.cor || '#07375a'}">
          <label>Brasão (PNG/SVG)</label>
          <input class="eq-file" type="file" accept=".png,.svg,.jpg,.jpeg,.webp">
          <div class="row-btns">
            <button class="btn" data-save>Salvar</button>
          </div>
          <p class="help">${e.brasao_path || 'Sem brasão — use placeholder ou envie arquivo do Corel'}</p>
        </div>
      </div>`
        )
        .join('')}`;

    panel.querySelectorAll('.equipe-card').forEach((card) => {
      const id = Number(card.dataset.id);
      card.querySelector('[data-save]').onclick = async () => {
        const nome = card.querySelector('.eq-nome').value;
        const cor = card.querySelector('.eq-cor').value;
        const fileInput = card.querySelector('.eq-file');
        let brasao_path = undefined;
        if (fileInput.files && fileInput.files[0]) {
          const fd = new FormData();
          fd.append('equipeId', String(id));
          fd.append('brasao', fileInput.files[0]);
          const res = await fetch('/api/brasao', { method: 'POST', body: fd });
          const data = await res.json();
          if (!data.ok) {
            toast(data.message || 'Falha no upload');
            return;
          }
          brasao_path = data.brasao_path;
          toast('Brasão enviado');
        }
        client.emit('equipe:update', { id, nome, cor, brasao_path });
      };
    });
  }

  function renderBackup() {
    client.emit('backup:list');
    panel.innerHTML = `
      <h2>Backup e recuperação</h2>
      <div class="row-btns">
        <button class="btn success" id="bkCreate">Criar backup agora</button>
        <button class="btn ghost" id="bkRefresh">Atualizar lista</button>
      </div>
      <table class="table" style="margin-top:14px">
        <thead><tr><th>Arquivo</th><th>Data</th><th></th></tr></thead>
        <tbody>
          ${(backups || [])
            .map(
              (b) => `<tr>
            <td>${b.filename}</td>
            <td>${b.mtime || ''}</td>
            <td><button class="btn danger" data-restore="${b.filename}">Restaurar</button></td>
          </tr>`
            )
            .join('') || '<tr><td colspan="3">Nenhum backup ainda</td></tr>'}
        </tbody>
      </table>
      <p class="help">Antes de restaurar, o estado atual é salvo automaticamente.</p>
    `;
    bkCreate.onclick = () => client.emit('backup:create');
    bkRefresh.onclick = () => client.emit('backup:list');
    panel.querySelectorAll('[data-restore]').forEach((btn) => {
      btn.onclick = () => {
        if (!confirm(`Restaurar ${btn.dataset.restore}?`)) return;
        client.emit('backup:restore', { filename: btn.dataset.restore });
      };
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      const t = state && state.timer;
      if (t && t.running) client.emit('timer:pause');
      else if (t && !t.running && t.remainingSeconds > 0) client.emit('timer:resume');
      else client.emit('timer:start', { totalSeconds: (t && t.totalSeconds) || 900 });
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      client.emit('result:reveal-next');
    }
    if (e.key === 'Escape') client.emit('overlay:hide', {});
    if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
      e.preventDefault();
      client.emit('overlay:clear');
    }
    if (e.ctrlKey && e.key === '1') client.emit('overlay:show', { mode: 'abertura' });
    if (e.ctrlKey && e.key === '2') {
      mod = 'timer';
      render();
      client.emit('overlay:show', { mode: 'cronometro' });
    }
    if (e.ctrlKey && e.key === '3') client.emit('intervalo:show');
    if (e.ctrlKey && e.key === '4') {
      mod = 'resultados';
      render();
    }
    if (e.ctrlKey && e.key === '5') client.emit('placar:toggle', { visible: true, compact: true });
  });
})();

(function (global) {
  function connect() {
    const socket = io({ transports: ['websocket', 'polling'] });
    let state = null;
    const listeners = new Set();

    socket.on('connect', () => socket.emit('system:get-state'));
    socket.on('system:state', (s) => {
      state = s;
      listeners.forEach((fn) => fn(state));
    });
    socket.on('timer:tick', (timer) => {
      if (!state) return;
      state.timer = timer;
      listeners.forEach((fn) => fn(state));
    });

    return {
      socket,
      onState(fn) {
        listeners.add(fn);
        if (state) fn(state);
        return () => listeners.delete(fn);
      },
      getState() {
        return state;
      },
      emit(event, payload) {
        socket.emit(event, payload);
      },
    };
  }

  function brasaoUrl(equipe) {
    if (equipe && equipe.brasao_path) return equipe.brasao_path;
    return null;
  }

  function brasaoHtml(equipe, size) {
    const s = size || 72;
    const url = brasaoUrl(equipe);
    if (url) {
      return `<img class="brazao" style="width:${s}px;height:${s}px" src="${url}" alt="${equipe.nome || ''}">`;
    }
    const letter = (equipe && equipe.nome ? equipe.nome : '?').trim().charAt(0).toUpperCase();
    return `<div class="brazao placeholder" style="width:${s}px;height:${s}px;border-color:${equipe && equipe.cor ? equipe.cor : 'var(--mostarda)'}">${letter}</div>`;
  }

  function fmtPts(n) {
    const x = Number(n) || 0;
    return Number.isInteger(x) ? String(x) : x.toFixed(1);
  }

  global.Gincana = { connect, brasaoUrl, brasaoHtml, fmtPts };
})(window);

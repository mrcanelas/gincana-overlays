function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function validateNota(nota) {
  const n = Number(nota);
  if (Number.isNaN(n)) return { ok: false, message: 'Nota inválida' };
  if (n < 0 || n > 10) return { ok: false, message: 'Nota deve estar entre 0 e 10' };
  return { ok: true, value: Math.round(n * 10) / 10 };
}

function validateRankings(rankings, equipeIds) {
  if (!Array.isArray(rankings) || rankings.length === 0) {
    return { ok: false, message: 'Rankings vazios' };
  }
  const ids = new Set();
  for (const r of rankings) {
    if (!equipeIds.includes(r.equipeId)) {
      return { ok: false, message: `Equipe inválida: ${r.equipeId}` };
    }
    if (![1, 2].includes(r.posicao)) {
      return { ok: false, message: 'Posição deve ser 1 ou 2' };
    }
    if (ids.has(r.equipeId)) {
      return { ok: false, message: 'Equipe duplicada' };
    }
    ids.add(r.equipeId);
  }
  return { ok: true };
}

module.exports = { clamp, validateNota, validateRankings };

class ServerTimer {
  constructor() {
    this.reset();
  }

  reset(totalSeconds = 900) {
    this.totalSeconds = totalSeconds;
    this.remainingMs = totalSeconds * 1000;
    this.running = false;
    this.startedAt = null;
    this.mode = 'apresentacao';
    this.label = '';
    this.equipeId = null;
    this.provaId = null;
    this.alertLevel = 'normal';
  }

  start(payload = {}) {
    if (payload.totalSeconds != null) {
      this.totalSeconds = Number(payload.totalSeconds);
      this.remainingMs = this.totalSeconds * 1000;
    }
    if (payload.mode) this.mode = payload.mode;
    if (payload.label != null) this.label = payload.label;
    if (payload.equipeId != null) this.equipeId = payload.equipeId;
    if (payload.provaId != null) this.provaId = payload.provaId;
    if (!this.running) {
      this.startedAt = Date.now();
      this.running = true;
    }
    return this.snapshot();
  }

  pause() {
    if (this.running) {
      this.remainingMs = Math.max(0, this._computeRemaining());
      this.running = false;
      this.startedAt = null;
    }
    return this.snapshot();
  }

  resume() {
    if (!this.running && this.remainingMs > 0) {
      this.startedAt = Date.now();
      this.running = true;
    }
    return this.snapshot();
  }

  adjust(deltaSeconds) {
    const current = this.running ? this._computeRemaining() : this.remainingMs;
    this.remainingMs = Math.max(0, current + deltaSeconds * 1000);
    if (this.running) this.startedAt = Date.now();
    return this.snapshot();
  }

  setRemaining(seconds) {
    this.remainingMs = Math.max(0, seconds * 1000);
    if (this.running) this.startedAt = Date.now();
    return this.snapshot();
  }

  finish() {
    this.remainingMs = 0;
    this.running = false;
    this.startedAt = null;
    this.alertLevel = 'ended';
    return this.snapshot();
  }

  _computeRemaining() {
    if (!this.running || !this.startedAt) return this.remainingMs;
    const elapsed = Date.now() - this.startedAt;
    return Math.max(0, this.remainingMs - elapsed);
  }

  _alertFor(seconds) {
    if (seconds <= 0) return 'ended';
    if (seconds <= 10) return 'critical';
    if (seconds <= 60) return 'warning';
    if (seconds <= 300) return 'notice';
    return 'normal';
  }

  snapshot() {
    let remainingMs = this.running ? this._computeRemaining() : this.remainingMs;
    if (this.running && remainingMs <= 0) {
      remainingMs = 0;
      this.remainingMs = 0;
      this.running = false;
      this.startedAt = null;
    }
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    this.alertLevel = this._alertFor(remainingSeconds);
    const mm = String(Math.floor(remainingSeconds / 60)).padStart(2, '0');
    const ss = String(remainingSeconds % 60).padStart(2, '0');
    return {
      totalSeconds: this.totalSeconds,
      remainingSeconds,
      remainingMs,
      display: `${mm}:${ss}`,
      running: this.running,
      mode: this.mode,
      label: this.label,
      equipeId: this.equipeId,
      provaId: this.provaId,
      alertLevel: this.alertLevel,
    };
  }
}

module.exports = { ServerTimer };

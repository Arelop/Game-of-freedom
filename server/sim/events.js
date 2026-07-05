// Журнал событий мира — питает слухи в тавернах и динамические квесты.
export class EventLog {
  constructor() { this.entries = []; }

  push(day, text, data = {}) {
    this.entries.push({ day, text, ...data });
    if (this.entries.length > 200) this.entries.shift();
  }

  recent(n = 5) { return this.entries.slice(-n).reverse(); }

  rumors(n = 3) {
    const pool = this.entries.slice(-25);
    const out = [];
    for (let i = pool.length - 1; i >= 0 && out.length < n; i -= 2) out.push(pool[i]);
    return out;
  }
}

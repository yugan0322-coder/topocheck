/**
 * Slot A/B 的唯一状态源。它不负责 Three.js 渲染，只负责判断 PK 是否激活、
 * 清空槽位和交换引用，避免评分面板与视口各自维护一份过期状态。
 */
export class PKManager {
  constructor({ onStateChange, onSwap } = {}) {
    this.slots = { A: null, B: null };
    this.pkActive = false;
    this.onStateChange = onStateChange;
    this.onSwap = onSwap;
  }

  setSlot(slot, payload) {
    if (slot !== 'A' && slot !== 'B') throw new Error(`未知模型槽位：${slot}`);
    this.slots[slot] = payload || null;
    this.sync();
  }

  clearSlot(slot) {
    this.setSlot(slot, null);
  }

  getSlot(slot) {
    return this.slots[slot] || null;
  }

  swapSlots() {
    if (!this.slots.A || !this.slots.B) return false;
    [this.slots.A, this.slots.B] = [this.slots.B, this.slots.A];
    this.sync();
    this.onSwap?.(this.slots.A, this.slots.B);
    return true;
  }

  sync() {
    this.pkActive = Boolean(this.slots.A?.model && this.slots.B?.model);
    this.onStateChange?.({
      active: this.pkActive,
      slotA: this.slots.A,
      slotB: this.slots.B,
    });
  }
}

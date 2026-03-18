/**
 * BBScoring — 振動回饋
 */
export const Vibration = {
  /** 短振動（操作確認） */
  tap() {
    if (navigator.vibrate) navigator.vibrate(50);
  },

  /** 長振動（重要事件） */
  heavy() {
    if (navigator.vibrate) navigator.vibrate(200);
  },

  /** 雙振動（得分） */
  double() {
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
  },

  /** 錯誤振動 */
  error() {
    if (navigator.vibrate) navigator.vibrate([50, 30, 50, 30, 50]);
  }
};

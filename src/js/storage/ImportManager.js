/**
 * BBScoring — ImportManager 匯入管理
 */
import { showToast } from '../utils/helpers.js';

export class ImportManager {

  /**
   * 從 JSON 檔案匯入比賽
   * @returns {Promise<Object|null>} 匯入的比賽資料
   */
  static importJSON() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) { resolve(null); return; }

        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result);
            if (!this.validate(data)) {
              showToast('檔案格式不正確，請選擇 BBScoring 匯出的 JSON 檔案');
              resolve(null);
              return;
            }
            resolve(data.game);
          } catch {
            showToast('檔案解析失敗，請確認檔案格式');
            resolve(null);
          }
        };
        reader.readAsText(file);
      });

      input.click();
    });
  }

  /** 驗證匯入資料結構 */
  static validate(data) {
    if (!data || typeof data !== 'object') return false;
    if (data.format !== 'BBScoring') return false;
    if (!data.game || !data.game.id || !data.game.info) return false;
    if (!data.game.teams || !data.game.innings) return false;
    return true;
  }
}

/**
 * BBScoring — ExportManager 匯出管理
 */
import { getTimestamp } from '../utils/helpers.js';
import { StatsCalculator } from '../core/StatsCalculator.js';

export class ExportManager {

  /** 匯出比賽為 JSON */
  static exportJSON(game) {
    const data = {
      format: 'BBScoring',
      version: '1.0.0',
      exportedAt: getTimestamp(),
      game
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const name = game.info.name || game.id;
    a.download = `BBScoring_${name}_${game.info.date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 匯出為文字摘要 */
  static exportText(game) {
    let text = `${game.info.name}\n`;
    text += `日期: ${game.info.date} ${game.info.time}\n`;
    text += `場地: ${game.info.venue}\n`;
    text += `比數: ${game.teams.away?.name || '客隊'} ${game.currentState.score.away} - ${game.currentState.score.home} ${game.teams.home?.name || '主隊'}\n\n`;

    // 逐局
    text += '       ';
    for (let i = 1; i <= game.innings.length; i++) text += ` ${String(i).padStart(2)}`;
    text += '   R  H  E\n';

    const awayLine = game.innings.map(inn => String(inn.top.runs).padStart(3)).join('');
    const homeLine = game.innings.map(inn => String(inn.bottom.runs).padStart(3)).join('');
    const awayTotal = `${String(game.currentState.score.away).padStart(3)}`;
    const homeTotal = `${String(game.currentState.score.home).padStart(3)}`;

    text += `${(game.teams.away?.shortName || '客').padEnd(6)} ${awayLine} ${awayTotal}\n`;
    text += `${(game.teams.home?.shortName || '主').padEnd(6)} ${homeLine} ${homeTotal}\n`;

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BBScoring_${game.info.name || game.id}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

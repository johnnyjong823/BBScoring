/**
 * BBScoring — TutorialView 教學頁面
 *
 * Provides step-by-step instructions for using the detailed recording mode.
 */
import { createElement } from '../utils/helpers.js';

export class TutorialView {
  constructor({ container, onBack }) {
    this.container = container;
    this.onBack = onBack;
    this._expandedSection = null;
  }

  render() {
    this.container.innerHTML = '';
    const page = createElement('div', { className: 'tutorial-page' });

    // Header with back button
    const header = createElement('div', { className: 'tutorial-page__header' });
    header.appendChild(createElement('button', {
      className: 'btn btn--icon', innerHTML: '◀',
      onClick: () => this.onBack()
    }));
    header.appendChild(createElement('h3', { textContent: '📖 操作教學' }));
    page.appendChild(header);

    // Body — scrollable content
    const body = createElement('div', { className: 'tutorial-page__body scrollable' });

    // Sections
    const sections = this._getSections();
    sections.forEach((section, idx) => {
      const card = this._renderSection(section, idx);
      body.appendChild(card);
    });

    page.appendChild(body);
    this.container.appendChild(page);
  }

  _renderSection(section, idx) {
    const card = createElement('div', { className: 'tutorial-section' });
    const isExpanded = this._expandedSection === idx;

    // Section header (clickable to expand/collapse)
    const header = createElement('button', {
      className: `tutorial-section__header ${isExpanded ? 'tutorial-section__header--active' : ''}`,
      onClick: () => {
        this._expandedSection = isExpanded ? null : idx;
        this.render();
      }
    });
    header.innerHTML = `
      <span class="tutorial-section__icon">${section.icon}</span>
      <span class="tutorial-section__title">${section.title}</span>
      <span class="tutorial-section__arrow">${isExpanded ? '▾' : '▸'}</span>
    `;
    card.appendChild(header);

    // Section body (collapsible)
    if (isExpanded) {
      const content = createElement('div', { className: 'tutorial-section__content' });
      content.innerHTML = section.content;
      card.appendChild(content);
    }

    return card;
  }

  _getSections() {
    return [
      {
        icon: '🏟️',
        title: '比賽設定流程',
        content: `
          <div class="tutorial-step">
            <h4>1. 建立比賽</h4>
            <p>從首頁點選「<strong>新比賽</strong>」，選擇記錄模式：</p>
            <ul>
              <li><strong>結果記錄</strong> — 只記錄每位打者的最終結果</li>
              <li><strong>詳細記錄</strong> — 逐球記錄投球、打擊、跑壘</li>
            </ul>
          </div>
          <div class="tutorial-step">
            <h4>2. 設定隊伍與打序</h4>
            <p>輸入兩隊隊名、球員姓名與背號，排好先發打序（9人）。</p>
            <p>指定打擊位置（DH 可選）及先發投手。</p>
          </div>
          <div class="tutorial-step">
            <h4>3. 開始比賽</h4>
            <p>設定完成後點「<strong>開始比賽</strong>」，進入即時記錄畫面。</p>
          </div>
        `
      },
      {
        icon: '⚾',
        title: '投球記錄',
        content: `
          <div class="tutorial-step">
            <h4>主選單</h4>
            <p>投球面板分為兩排按鈕：</p>
            <table class="tutorial-table">
              <tr><td class="tutorial-key">好球</td><td>進入好球子選單</td></tr>
              <tr><td class="tutorial-key">壞球</td><td>進入壞球子選單</td></tr>
              <tr><td class="tutorial-key">擊出</td><td>球被打出去，進入打擊結果精靈</td></tr>
            </table>
          </div>
          <div class="tutorial-step">
            <h4>好球子選單</h4>
            <table class="tutorial-table">
              <tr><td class="tutorial-key">揮空</td><td>揮棒落空 → 詢問暴投/捕逸</td></tr>
              <tr><td class="tutorial-key">過半</td><td>被判好球 → 詢問暴投/捕逸</td></tr>
              <tr><td class="tutorial-key">界外</td><td>界外球（2好球時不會變3好球）</td></tr>
            </table>
            <p>好球記到 3 顆 → 自動三振。壘上有人時顯示「盜壘」按鈕。</p>
          </div>
          <div class="tutorial-step">
            <h4>壞球子選單</h4>
            <table class="tutorial-table">
              <tr><td class="tutorial-key">壞球確認</td><td>普通壞球</td></tr>
              <tr><td class="tutorial-key">暴投</td><td>投手暴投，壘上跑者可進壘</td></tr>
              <tr><td class="tutorial-key">捕逸</td><td>捕手接球失誤，跑者可進壘</td></tr>
            </table>
            <p>壞球記到 4 顆 → 自動四壞保送。</p>
          </div>
          <div class="tutorial-step">
            <h4>鍵盤快捷鍵</h4>
            <table class="tutorial-table">
              <tr><td class="tutorial-key">S</td><td>好球</td></tr>
              <tr><td class="tutorial-key">B</td><td>壞球</td></tr>
              <tr><td class="tutorial-key">P</td><td>擊出</td></tr>
              <tr><td class="tutorial-key">1/2/3</td><td>子選單選項</td></tr>
              <tr><td class="tutorial-key">Esc</td><td>返回上一層</td></tr>
            </table>
          </div>
        `
      },
      {
        icon: '🎯',
        title: '特殊投球事件',
        content: `
          <div class="tutorial-step">
            <h4>投球面板下方按鈕</h4>
            <table class="tutorial-table">
              <tr><td class="tutorial-key">觸身</td><td>觸身球 (HBP)：打者上一壘</td></tr>
              <tr><td class="tutorial-key">故意四壞</td><td>故意保送 (IBB)：壞球自動補到 4 顆</td></tr>
              <tr><td class="tutorial-key">投手犯規</td><td>壘上有人 → 跑者各進一壘；壘上無人 → 記一壞球</td></tr>
              <tr><td class="tutorial-key">捕手妨礙</td><td>捕手干擾打者揮棒 → 打者上一壘</td></tr>
              <tr><td class="tutorial-key">妨礙守備</td><td>打者或跑者干擾守備 → 妨礙者出局</td></tr>
              <tr><td class="tutorial-key">妨礙跑壘</td><td>守備員干擾跑者 → 跑者獲進壘 (壘上有人時顯示)</td></tr>
            </table>
          </div>
          <div class="tutorial-step">
            <h4>不死三振</h4>
            <p>當第 3 個好球為揮空且捕手未接住時：</p>
            <ul>
              <li><strong>一壘無人</strong>或<strong>兩出局</strong>：系統自動詢問打者是否上壘</li>
              <li>選「是」→ 打者跑上一壘（投手仍記三振）</li>
              <li>選「否」→ 正常三振出局</li>
            </ul>
          </div>
          <div class="tutorial-step">
            <h4>暴投 / 捕逸 進壘</h4>
            <p>壘上有人時，暴投/捕逸會彈出進壘選單，讓你設定每位跑者前進幾個壘包。</p>
          </div>
        `
      },
      {
        icon: '🏏',
        title: '打擊結果精靈',
        content: `
          <div class="tutorial-step">
            <h4>步驟 1：球質</h4>
            <p>選擇擊球類型：滾地球、平飛球、飛球、小飛球、短打。</p>
          </div>
          <div class="tutorial-step">
            <h4>步驟 2：方向</h4>
            <p>點選球場圖上的落點方向。同一打者不可連續選同位置。</p>
          </div>
          <div class="tutorial-step">
            <h4>步驟 3：結果</h4>
            <p>根據球質自動篩選合理的結果選項：</p>
            <table class="tutorial-table">
              <tr><td class="tutorial-key tutorial-key--hit">安打</td><td>一壘/二壘/三壘安打、全壘打、內野安打、短打安打</td></tr>
              <tr><td class="tutorial-key tutorial-key--out">出局</td><td>滾地/飛球/平飛/界外飛球出局、三振、雙殺、三殺</td></tr>
              <tr><td class="tutorial-key">犧牲</td><td>犧牲短打、犧牲飛球</td></tr>
              <tr><td class="tutorial-key">其他</td><td>野手選擇 (FC)、失誤上壘 (E)</td></tr>
            </table>
            <p><strong>限制：</strong>壘上無人不顯示雙殺/三殺；壘上不足 2 人不顯示三殺。</p>
          </div>
          <div class="tutorial-step">
            <h4>步驟 4：細節（依結果類型）</h4>
            <ul>
              <li><strong>安打：</strong>自動帶入對應壘包</li>
              <li><strong>出局：</strong>設定守備路線（例如 6-4-3 雙殺）</li>
              <li><strong>失誤：</strong>選擇失誤守備員（優先顯示方向相關位置）</li>
              <li><strong>野手選擇：</strong>選擇被封殺的跑者</li>
            </ul>
          </div>
        `
      },
      {
        icon: '🏃',
        title: '跑壘結果 (Phase B)',
        content: `
          <div class="tutorial-step">
            <h4>跑者目的地設定</h4>
            <p>打擊結果確認後，進入<strong>跑壘結果</strong>步驟。系統會根據打擊結果自動預填每位跑者和打者的目的地：</p>
            <ul>
              <li>每位壘上跑者可選：留壘 / 進壘 / 得分 / 出局</li>
              <li>打者的選項根據打擊結果自動卡控：
                <ul>
                  <li><strong>出局型</strong> (GO/FO/K…) → 鎖定「出局」</li>
                  <li><strong>安打型</strong> (1B/2B/3B) → 至少到安打壘，可進更多壘</li>
                  <li><strong>全壘打</strong> → 鎖定「得分」</li>
                  <li><strong>FC/E</strong> → 可選一壘～得分（不可選出局）</li>
                </ul>
              </li>
            </ul>
          </div>
          <div class="tutorial-step">
            <h4>自動計算</h4>
            <p>畫面下方自動顯示：<strong>得分</strong>、<strong>打點</strong>、<strong>出局數</strong>。</p>
            <p>確認無誤後點「下一步」進入備註。</p>
          </div>
        `
      },
      {
        icon: '🔄',
        title: '盜壘',
        content: `
          <div class="tutorial-step">
            <h4>發動盜壘</h4>
            <p>在好球或壞球子選單中，壘上有人時會出現「<strong>盜壘</strong>」按鈕。</p>
          </div>
          <div class="tutorial-step">
            <h4>選擇跑者</h4>
            <p>選擇要盜壘的跑者。<strong>系統會自動驗證：</strong></p>
            <ul>
              <li>不能盜有人佔據的壘包（除非該壘跑者也一起盜）</li>
              <li>選擇一壘跑者盜二壘時，若二壘有人，系統會自動連帶選擇二壘跑者</li>
            </ul>
          </div>
          <div class="tutorial-step">
            <h4>盜壘結果</h4>
            <p>每位盜壘跑者選擇：</p>
            <table class="tutorial-table">
              <tr><td class="tutorial-key tutorial-key--hit">成功</td><td>跑者進到目標壘包</td></tr>
              <tr><td class="tutorial-key tutorial-key--out">失敗 (CS)</td><td>跑者被阻殺，記出局</td></tr>
            </table>
            <p>盜壘成功後可額外選擇「因失誤進壘」。</p>
          </div>
        `
      },
      {
        icon: '📋',
        title: '比賽管理',
        content: `
          <div class="tutorial-step">
            <h4>漢堡選單 ☰</h4>
            <p>點擊左上角「☰」開啟功能選單：</p>
            <table class="tutorial-table">
              <tr><td class="tutorial-key">更換投手</td><td>從球員名單中選擇新投手</td></tr>
              <tr><td class="tutorial-key">替補球員</td><td>替換先發球員</td></tr>
              <tr><td class="tutorial-key">結束比賽</td><td>強制結束比賽</td></tr>
              <tr><td class="tutorial-key">返回首頁</td><td>比賽會自動儲存</td></tr>
            </table>
          </div>
          <div class="tutorial-step">
            <h4>復原 (Undo)</h4>
            <p>畫面上的「↩」按鈕可復原上一步操作，包含投球、打擊結果、盜壘等。</p>
          </div>
          <div class="tutorial-step">
            <h4>半局轉換</h4>
            <p>三出局後系統自動轉換攻守。最後一局下半主隊領先時，得分即 Walk-off 結束比賽。</p>
          </div>
        `
      },
      {
        icon: '📊',
        title: '畫面說明',
        content: `
          <div class="tutorial-step">
            <h4>狀態列</h4>
            <p>頂部顯示：局數、攻守方、好壞球計數（綠點=壞球、紅點=好球）、出局數（紅圈）。</p>
          </div>
          <div class="tutorial-step">
            <h4>計分板</h4>
            <p>顯示兩隊各局得分、總分、安打、失誤。點擊可展開詳細計分板。</p>
          </div>
          <div class="tutorial-step">
            <h4>壘包圖</h4>
            <p>菱形壘包圖即時顯示壘上跑者位置，點擊可查看跑者資訊。</p>
          </div>
          <div class="tutorial-step">
            <h4>打者資訊</h4>
            <p>中央顯示當前打者姓名、背號、打序位置。</p>
          </div>
        `
      }
    ];
  }
}

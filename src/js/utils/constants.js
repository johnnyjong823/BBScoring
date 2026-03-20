/**
 * BBScoring — 常數定義
 */

// 守備位置代碼
export const POSITIONS = {
  P:    { code: '1', name: '投手',     short: 'P'  },
  C:    { code: '2', name: '捕手',     short: 'C'  },
  '1B': { code: '3', name: '一壘手',   short: '1B' },
  '2B': { code: '4', name: '二壘手',   short: '2B' },
  '3B': { code: '5', name: '三壘手',   short: '3B' },
  SS:   { code: '6', name: '游擊手',   short: 'SS' },
  LF:   { code: '7', name: '左外野手', short: 'LF' },
  CF:   { code: '8', name: '中外野手', short: 'CF' },
  RF:   { code: '9', name: '右外野手', short: 'RF' },
  DH:   { code: 'DH', name: '指定打擊', short: 'DH' }
};

export const POSITION_LIST = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

// 投球結果 (詳細物件)
export const PITCH_RESULTS_INFO = {
  S:   { name: '好球',     category: 'STRIKE',  countsAsStrike: true },
  SS:  { name: '揮空',     category: 'STRIKE',  countsAsStrike: true },
  CS:  { name: '被判好球', category: 'STRIKE',  countsAsStrike: true },
  B:   { name: '壞球',     category: 'BALL',    countsAsBall: true },
  F:   { name: '界外球',   category: 'FOUL',    countsAsStrike: true, maxStrike: 2 },
  FB:  { name: '界外觸擊', category: 'FOUL',    countsAsStrike: true },
  IP:  { name: '打出去',   category: 'IN_PLAY' },
  HBP: { name: '觸身球',   category: 'SPECIAL', endAtBat: true, result: 'HBP' },
  IBB: { name: '故意四壞', category: 'SPECIAL', endAtBat: true, result: 'IBB' },
  WP:  { name: '暴投',     category: 'SPECIAL' },
  PB:  { name: '捕逸',     category: 'SPECIAL' },
  BK:  { name: '投手犯規', category: 'SPECIAL' },
  CI:  { name: '捕手妨礙', category: 'SPECIAL', endAtBat: true, result: 'CI' },
  OI:  { name: '妨礙守備', category: 'SPECIAL' },
  OBS: { name: '妨礙跑壘', category: 'SPECIAL' }
};

// 投球結果鍵 (字串常數)
export const PITCH_RESULTS = {
  STRIKE: 'S',
  SWINGING_STRIKE: 'SS',
  CALLED_STRIKE: 'CS',
  BALL: 'B',
  FOUL: 'F',
  FOUL_BUNT: 'FB',
  IN_PLAY: 'IP',
  HBP: 'HBP',
  IBB: 'IBB',
  WP: 'WP',
  PB: 'PB',
  BK: 'BK',
  CI: 'CI',
  OI: 'OI',
  OBS: 'OBS'
};

// 打擊結果 (詳細物件)
export const HIT_RESULTS_INFO = {
  '1B':  { name: '一壘安打',     category: 'HIT',   bases: 1 },
  '2B':  { name: '二壘安打',     category: 'HIT',   bases: 2 },
  '3B':  { name: '三壘安打',     category: 'HIT',   bases: 3 },
  HR:    { name: '全壘打',       category: 'HIT',   bases: 4 },
  IH:    { name: '內野安打',     category: 'HIT',   bases: 1 },
  BH:    { name: '短打安打',     category: 'HIT',   bases: 1 },
  GO:    { name: '滾地出局',     category: 'OUT',   outs: 1 },
  FO:    { name: '飛球出局',     category: 'OUT',   outs: 1 },
  LO:    { name: '平飛出局',     category: 'OUT',   outs: 1 },
  K:     { name: '三振',         category: 'OUT',   outs: 1 },
  KL:    { name: '被看三振',     category: 'OUT',   outs: 1 },
  FF:    { name: '界外飛球出局', category: 'OUT',   outs: 1 },
  IF:    { name: '內野飛球',     category: 'OUT',   outs: 1 },
  DP:    { name: '雙殺',         category: 'OUT',   outs: 2 },
  TP:    { name: '三殺',         category: 'OUT',   outs: 3 },
  TAG:   { name: '觸殺',         category: 'OUT',   outs: 1 },
  SAC:   { name: '犧牲短打',     category: 'SAC',   outs: 1, noAB: true },
  SF:    { name: '犧牲飛球',     category: 'SAC',   outs: 1, noAB: true },
  FC:    { name: '野手選擇',     category: 'OTHER' },
  E:     { name: '失誤上壘',     category: 'ERROR' },
  BB:    { name: '四壞保送',     category: 'WALK',  noAB: true },
  HBP:   { name: '觸身球',       category: 'HBP',   noAB: true },
  IBB:   { name: '故意四壞',     category: 'WALK',  noAB: true },
  INT:   { name: '打擊妨礙',     category: 'OTHER', noAB: true },
  CI:    { name: '捕手妨礙',     category: 'OTHER', noAB: true }
};

// 打擊結果鍵 (字串常數)
export const HIT_RESULTS = {
  SINGLE: '1B',
  DOUBLE: '2B',
  TRIPLE: '3B',
  HOME_RUN: 'HR',
  GROUND_OUT: 'GO',
  FLY_OUT: 'FO',
  LINE_OUT: 'LO',
  POP_OUT: 'IF',
  STRIKEOUT: 'K',
  STRIKEOUT_LOOKING: 'KL',
  DOUBLE_PLAY: 'DP',
  TRIPLE_PLAY: 'TP',
  FIELDERS_CHOICE: 'FC',
  SACRIFICE_FLY: 'SF',
  SACRIFICE_BUNT: 'SAC',
  ERROR: 'E',
  WALK: 'BB',
  HBP: 'HBP',
  IBB: 'IBB'
};

// 球質 (詳細物件)
export const HIT_TYPES_INFO = {
  G:  { name: '滾地球', icon: '━▶' },
  L:  { name: '平飛球', icon: '─▶' },
  F:  { name: '飛球',   icon: '↗' },
  P:  { name: '小飛球', icon: '↑' },
  BU: { name: '短打',   icon: '▸' }
};

// 球質鍵 (字串常數)
export const HIT_TYPES = {
  GROUND: 'G',
  LINE: 'L',
  FLY: 'F',
  POPUP: 'P',
  BUNT: 'BU'
};

// 打擊方向區域 (詳細物件)
export const HIT_ZONES_INFO = {
  IF_1:    { name: '投手前方',       area: 'infield' },
  IF_1B:   { name: '一壘線（內野）', area: 'infield' },
  IF_2B:   { name: '一二壘間',       area: 'infield' },
  IF_SS:   { name: '游擊方向',       area: 'infield' },
  IF_3B:   { name: '三壘線（內野）', area: 'infield' },
  IF_SS2B: { name: '二游間',         area: 'infield' },
  OF_LF:   { name: '左外野',         area: 'outfield' },
  OF_LCF:  { name: '左中外野',       area: 'outfield' },
  OF_CF:   { name: '中外野',         area: 'outfield' },
  OF_RCF:  { name: '右中外野',       area: 'outfield' },
  OF_RF:   { name: '右外野',         area: 'outfield' },
  OF_LFL:  { name: '左外野線',       area: 'outfield' },
  OF_RFL:  { name: '右外野線',       area: 'outfield' },
  FOUL_L:  { name: '左側界外',       area: 'foul' },
  FOUL_R:  { name: '右側界外',       area: 'foul' },
  FOUL_B:  { name: '本壘後方',       area: 'foul' }
};

// 打擊方向鍵 (字串常數)
export const HIT_ZONES = {
  INFIELD: 'IF_1',
  LEFT: 'OF_LF',
  LEFT_CENTER: 'OF_LCF',
  CENTER: 'OF_CF',
  RIGHT_CENTER: 'OF_RCF',
  RIGHT: 'OF_RF'
};

// 比賽狀態
export const GAME_STATUS = {
  NOT_STARTED: 'NOT_STARTED',
  SETUP:       'SETUP',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED:    'FINISHED',
  SUSPENDED:   'SUSPENDED'
};

// 開始模式
export const START_MODE = {
  QUICK:      'QUICK',
  TOURNAMENT: 'TOURNAMENT'
};

// 記錄模式
export const RECORDING_MODE = {
  RESULT_ONLY: 'RESULT_ONLY',
  DETAILED:    'DETAILED'
};

// 聯賽類型
export const TOURNAMENT_TYPE = {
  LEAGUE:     'LEAGUE',
  TOURNAMENT: 'TOURNAMENT',
  FRIENDLY:   'FRIENDLY'
};

// 聯賽狀態
export const TOURNAMENT_STATUS = {
  ACTIVE:    'ACTIVE',
  COMPLETED: 'COMPLETED'
};

// 場次狀態
export const MATCH_STATUS = {
  SCHEDULED:   'SCHEDULED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED:   'COMPLETED'
};

// 半局
export const HALF_INNING = {
  TOP:    'TOP',
  BOTTOM: 'BOTTOM'
};

// 操作類型（Undo/Redo）
export const ACTION_TYPES = {
  RECORD_PITCH:        'RECORD_PITCH',
  RECORD_HIT_RESULT:   'RECORD_HIT_RESULT',
  RECORD_RUNNER_EVENT: 'RECORD_RUNNER_EVENT',
  CHANGE_PITCHER:      'CHANGE_PITCHER',
  SUBSTITUTE_PLAYER:   'SUBSTITUTE_PLAYER',
  MODIFY_PLAY:         'MODIFY_PLAY',
  CHANGE_POSITION:     'CHANGE_POSITION'
};

// 跑壘事件
export const RUNNER_EVENTS = {
  HIT:   'HIT',
  SB:    'SB',
  CS:    'CS',
  WP:    'WP',
  PB:    'PB',
  BK:    'BK',
  ERROR: 'ERROR',
  FC:    'FC',
  PO:    'PO',
  OI:    'OI',
  OBS:   'OBS'
};

// 打擊/投球慣用手
export const HAND = {
  R: '右',
  L: '左',
  S: '左右'
};

// LocalStorage 鍵值
export const STORAGE_KEYS = {
  GAMES:    'bbscoring_games',
  GAME:     'bbscoring_game_',
  TEAMS:    'bbscoring_teams',
  USERS:    'bbscoring_users',
  SETTINGS: 'bbscoring_settings',
  CURRENT:  'bbscoring_current',
  AUTH:     'bbscoring_auth_session'
};

// 預設設定
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  darkMode: true,
  handedness: 'right',
  vibration: true,
  sound: false,
  autoSave: true,
  autoSaveInterval: 300,
  fontSize: 'medium',
  animation: true,
  confirmOnUndo: false,
  showPitchSpeed: false,
  showPitchType: false
};

// 資料版本
export const DATA_VERSION = 2;

// 最大值
export const MAX_UNDO = 50;
export const MAX_PLAYERS = 25;
export const DEBOUNCE_SAVE = 300;

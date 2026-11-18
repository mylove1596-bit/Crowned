/*
 * crowned-rules.js
 * Crowned 的**规则引擎**（点按循环 / 拖拽连涂 / 自动标 X / 冲突检测 / 通关判定）。
 *
 * ⚠️ 为什么要把规则从 play.html 里抽出来：
 *   1) 可测试 —— `Tools/test_web_rules.js` 能用 Node 直接跑断言，
 *      覆盖「通关」「冲突」「撤销」「自动 × 回滚」这些光靠肉眼看不出问题的路径。
 *   2) 可对照 —— 本文件与 App 内 `Crowned/Services/GameEngine.swift` 是**逐条对应**的，
 *      改一边就要改另一边。文件头注释里逐条标出了对应关系。
 *
 * ⚠️ 与 App 的对应关系（改之前先对一遍）：
 *   GameEngine.handleTap          → handleTap
 *   GameEngine.beginDrag          → beginDrag
 *   GameEngine.handleDrag         → handleDrag
 *   GameEngine.applyAutoCross     → applyAutoCross
 *   GameEngine.recomputeAutoCrosses → recomputeAutoCrosses
 *   GameEngine.validateBoard       → validateBoard
 *   GameEngine.undo               → undo
 *   GameEngine.captureSnapshot    → captureSnapshot
 *   GameEngine.maxUndoSteps(200)  → maxUndoSteps
 *   GridModels.CellState          → EMPTY / CROSS / CROWN
 *
 * ⚠️ 本文件**不含任何 DOM 操作**，浏览器与 Node 都能直接跑。
 *   拼盘面的活交给 `crowned-generator.js`（它与 Swift 生成器逐行一致）。
 */
(function (global) {
  'use strict';

  // 与 App 内 `GridModels.CellState` 一一对应
  var EMPTY = 0;
  var CROSS = 1;
  var CROWN = 2;

  /**
   * 创建一个规则引擎实例。
   *
   * @param {object} level  crowned-generator.js 的 generateLevel() 返回值
   *                        { seed, size, regionGrid, solutionCols, queens }
   * @param {object} [options]
   * @param {boolean} [options.autoCrossEnabled=true]  自动标 X 开关
   * @param {number}  [options.maxUndoSteps=200]       撤销步数上限
   */
  function createEngine(level, options) {
    options = options || {};

    var N = level.size;
    var GRID = level.regionGrid;
    var autoCrossEnabled = options.autoCrossEnabled !== false;
    var maxUndoSteps = options.maxUndoSteps || 200;

    /** 每个格子：{ state, isAutoCrossed, hasConflict } */
    var cells = [];
    for (var r = 0; r < N; r++) {
      var row = [];
      for (var c = 0; c < N; c++) {
        row.push({ state: EMPTY, isAutoCrossed: false, hasConflict: false });
      }
      cells.push(row);
    }

    var undoStack = [];
    var elapsedSeconds = 0;
    var isSolved = false;

    // MARK: - 快照与撤销

    function captureSnapshot() {
      var prev = [];
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          prev.push({
            r: r, c: c,
            state: cells[r][c].state,
            isAutoCrossed: cells[r][c].isAutoCrossed
          });
        }
      }
      return { cells: prev, seconds: elapsedSeconds };
    }

    function pushUndo(snapshot) {
      undoStack.push(snapshot);
      if (undoStack.length > maxUndoSteps) undoStack.shift();
    }

    // MARK: - 自动标 X

    /**
     * 放置皇冠时，自动把同行/同列/同色块/八邻域中的**空格**标为 ×
     *
     * ⚠️ 与 App 完全一致：只处理当前是空格的格子 ——
     *    玩家手动标的 × 不会被改写成自动 ×。
     */
    function applyAutoCross(row, col) {
      var regionID = GRID[row][col];
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          if (cells[r][c].state !== EMPTY) continue;
          var sameRow = (r === row);
          var sameCol = (c === col);
          var sameRegion = (GRID[r][c] === regionID);
          var adjacent = Math.abs(r - row) <= 1 && Math.abs(c - col) <= 1 && !(r === row && c === col);
          if (sameRow || sameCol || sameRegion || adjacent) {
            cells[r][c].state = CROSS;
            cells[r][c].isAutoCrossed = true;
          }
        }
      }
    }

    /**
     * 从当前皇冠集合**整体重算** auto-cross 集合。
     *
     * ⚠️ 不用增量回滚的原因（与 App 相同）：`isAutoCrossed` 只是一个 Bool，
     *    无法表达「这个 × 由皇冠 A 和皇冠 B 共同触发」。
     *    移除皇冠 A 时，若皇冠 B 仍约束该格，增量回滚会错误地把它恢复为空格。
     *    整体重算则天然正确。
     */
    function recomputeAutoCrosses() {
      var crowns = [];
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          if (cells[r][c].state === CROWN) crowns.push({ r: r, c: c });
        }
      }

      var constrained = {};
      for (var i = 0; i < crowns.length; i++) {
        var cr = crowns[i].r, cc = crowns[i].c;
        var regionID = GRID[cr][cc];
        for (var rr = 0; rr < N; rr++) {
          for (var c2 = 0; c2 < N; c2++) {
            var sameRow = (rr === cr);
            var sameCol = (c2 === cc);
            var sameRegion = (GRID[rr][c2] === regionID);
            var adjacent = Math.abs(rr - cr) <= 1 && Math.abs(c2 - cc) <= 1 && !(rr === cr && c2 === cc);
            if (sameRow || sameCol || sameRegion || adjacent) constrained[rr * N + c2] = true;
          }
        }
      }

      // 只对「原本就是自动 ×」的格子做调整；玩家手动标的 × 保持不变
      for (var r2 = 0; r2 < N; r2++) {
        for (var c3 = 0; c3 < N; c3++) {
          if (!cells[r2][c3].isAutoCrossed) continue;
          if (constrained[r2 * N + c3]) {
            cells[r2][c3].state = CROSS;
          } else {
            cells[r2][c3].state = EMPTY;
            cells[r2][c3].isAutoCrossed = false;
          }
        }
      }
    }

    // MARK: - 点按与拖拽

    /** 单格点击：状态循环 `.empty → .cross → .crown → .empty` */
    function handleTap(row, col) {
      if (isSolved) return;
      if (!isValid(row, col)) return;

      var snapshot = captureSnapshot();

      if (cells[row][col].state === EMPTY) {
        cells[row][col].state = CROSS;
        cells[row][col].isAutoCrossed = false;
      } else if (cells[row][col].state === CROSS) {
        cells[row][col].state = CROWN;
        cells[row][col].isAutoCrossed = false;
        if (autoCrossEnabled) applyAutoCross(row, col);
      } else {
        cells[row][col].state = EMPTY;
        cells[row][col].isAutoCrossed = false;
        if (autoCrossEnabled) recomputeAutoCrosses();
      }

      pushUndo(snapshot);
      validateBoard();
    }

    /** 拖拽模式 —— 与 App 的 `GameEngine.DragMode` 一一对应 */
    var DRAG_NONE = 'none', DRAG_PAINT = 'paintCross', DRAG_ERASE = 'erase';

    /** 拖拽开始时确定模式 */
    function beginDrag(row, col) {
      if (isSolved) return DRAG_NONE;
      if (!isValid(row, col)) return DRAG_NONE;
      if (cells[row][col].state === EMPTY) return DRAG_PAINT;
      if (cells[row][col].state === CROSS) return DRAG_ERASE;
      return DRAG_NONE;    // 绝不覆盖皇冠
    }

    /** 拖拽滑入新格子 */
    function handleDrag(row, col, mode) {
      if (isSolved || mode === DRAG_NONE) return;
      if (!isValid(row, col)) return;
      if (cells[row][col].state === CROWN) return;   // 皇冠不可被覆盖

      var target = (mode === DRAG_PAINT) ? CROSS : EMPTY;
      if (cells[row][col].state === target) return;

      var snapshot = captureSnapshot();
      cells[row][col].state = target;
      cells[row][col].isAutoCrossed = false;
      pushUndo(snapshot);

      if (autoCrossEnabled && target === EMPTY) recomputeAutoCrosses();
      validateBoard();
    }

    // MARK: - 冲突检测与通关判定

    /** 校验棋盘：更新冲突高亮与通关状态 */
    function validateBoard() {
      var crowns = [];
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          cells[r][c].hasConflict = false;
          if (cells[r][c].state === CROWN) crowns.push({ r: r, c: c });
        }
      }

      var hasConflict = false;
      for (var i = 0; i < crowns.length; i++) {
        for (var j = i + 1; j < crowns.length; j++) {
          var a = crowns[i], b = crowns[j];
          var sameRow = a.r === b.r;
          var sameCol = a.c === b.c;
          var sameRegion = GRID[a.r][a.c] === GRID[b.r][b.c];
          var adjacent = Math.abs(a.r - b.r) <= 1 && Math.abs(a.c - b.c) <= 1;
          if (sameRow || sameCol || sameRegion || adjacent) {
            cells[a.r][a.c].hasConflict = true;
            cells[b.r][b.c].hasConflict = true;
            hasConflict = true;
          }
        }
      }

      // 通关判定：恰好 N 个皇冠且无冲突
      if (crowns.length === N && !hasConflict) {
        isSolved = true;
      }

      return { hasConflict: hasConflict, crownCount: crowns.length, isSolved: isSolved };
    }

    // MARK: - 撤销 / 重置

    function undo() {
      var snapshot = undoStack.pop();
      if (!snapshot) return false;
      for (var i = 0; i < snapshot.cells.length; i++) {
        var ch = snapshot.cells[i];
        cells[ch.r][ch.c].state = ch.state;
        cells[ch.r][ch.c].isAutoCrossed = ch.isAutoCrossed;
      }
      elapsedSeconds = snapshot.seconds;
      isSolved = false;
      validateBoard();
      return true;
    }

    function reset() {
      for (var r = 0; r < N; r++) {
        for (var c = 0; c < N; c++) {
          cells[r][c].state = EMPTY;
          cells[r][c].isAutoCrossed = false;
          cells[r][c].hasConflict = false;
        }
      }
      undoStack.length = 0;
      elapsedSeconds = 0;
      isSolved = false;
      validateBoard();
    }

    function isValid(row, col) {
      return row >= 0 && row < N && col >= 0 && col < N;
    }

    // MARK: - 对外接口

    return {
      EMPTY: EMPTY, CROSS: CROSS, CROWN: CROWN,
      DRAG_NONE: DRAG_NONE, DRAG_PAINT: DRAG_PAINT, DRAG_ERASE: DRAG_ERASE,

      get size() { return N; },
      get regionGrid() { return GRID; },
      get cells() { return cells; },
      get canUndo() { return undoStack.length > 0; },
      get undoDepth() { return undoStack.length; },
      get elapsedSeconds() { return elapsedSeconds; },
      get isSolved() { return isSolved; },

      setElapsedSeconds: function (s) { elapsedSeconds = s; },
      handleTap: handleTap,
      beginDrag: beginDrag,
      handleDrag: handleDrag,
      applyAutoCross: applyAutoCross,
      recomputeAutoCrosses: recomputeAutoCrosses,
      validateBoard: validateBoard,
      undo: undo,
      reset: reset,
      captureSnapshot: captureSnapshot
    };
  }

  /**
   * 构造「同题挑战」链接 —— 与 App 内 `ShareTextBuilder.challengeURL` 同形。
   *
   * ⚠️ size 必须带上：seed 本身不含尺寸，同一个 seed 用不同尺寸会生成不同的盘。
   */
  function challengeURL(seed, size, origin) {
    var base = origin || 'https://mylove1596-bit.github.io';
    return base + '/Crowned/play?seed=' + encodeURIComponent(String(seed)) +
           '&size=' + encodeURIComponent(String(size));
  }

  /**
   * 战报文本 —— 与 App 内 `ShareTextBuilder.battleReport` 同形。
   *
   * ⚠️ 为什么战报里没有「击败 X% 玩家」：
   *    那个百分位是拿玩家**自己的历史成绩**估算出来的，并不是真的击败了多少玩家。
   *    公开分享出去就是虚假宣传，命中 App Store 审核规则 2.3.1（准确元数据）与 4.3（误导性内容）。
   *    因此战报只保留真实数据：用时、连胜、题目本身。
   *
   * ⚠️ `streak` 传 0 或省略 → 不输出连胜那一行（网页端没有连胜概念）。
   */
  function buildReport(level, cells, elapsedSeconds, streak, sizeTitle, origin) {
    var N = level.size;
    var time = Math.floor(elapsedSeconds / 60) + ':' + ('0' + (elapsedSeconds % 60)).slice(-2);
    var url = challengeURL(level.seed, N, origin);

    var lines = [];
    lines.push('Crowned ' + N + '×' + N + ' · ' + (sizeTitle || (N + '×' + N)));
    lines.push('⏱ ' + time);
    if (streak > 0) {
      lines.push('🔥 ' + streak + ' day streak');
    }
    lines.push('');

    // 题目预览：画皇冠（答案）与玩家自己标的 ×，不画自动 ×（那是引擎推出来的）
    //
    // ⚠️ 与 App 一致：`if snapshot.count == n` 的守卫也要有 ——
    //    Swift 那边快照行数不对时会**整块跳过棋盘**，网页版必须同样跳过，
    //    否则两边战报长度对不上（差一个空行）。
    if (cells.length === N) {
      for (var r = 0; r < N; r++) {
        var row = '';
        for (var c = 0; c < N; c++) {
          var cell = cells[r][c];
          if (cell.state === CROWN) row += '👑';
          else if (cell.state === CROSS) row += cell.isAutoCrossed ? '▫️' : '❌';
          else row += '⬜';
        }
        lines.push(row);
      }
      lines.push('');
    }

    lines.push('Try this exact puzzle → ' + url);
    return lines.join('\n');
  }

  global.CrownedRules = {
    createEngine: createEngine,
    buildReport: buildReport,
    challengeURL: challengeURL,
    EMPTY: EMPTY, CROSS: CROSS, CROWN: CROWN
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.CrownedRules;
  }
})(typeof window !== 'undefined' ? window : globalThis);

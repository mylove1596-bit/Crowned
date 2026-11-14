/*
 * crowned-generator.js
 * Crowned 关卡生成器的 JavaScript 移植版。
 *
 * ⚠️ 为什么要移植：
 *   分享链接（/Crowned/play?seed=…&size=…）点开后必须让人看到**那道题本身**，
 *   而不是一段文字描述。Wordle、puzzles-game.com、LinkedIn Queens 三个参照物
 *   都是「点开即玩/即见」，Crowned 的链接点开只能看描述，每一跳都在流失流量。
 *
 * ⚠️ 必须与 Swift 端逐位一致：
 *   本文件是 `Crowned/Services/PuzzleGenerator.swift` 的忠实移植，
 *   两者对同一个 seed + size 必须产出**完全相同**的盘面与答案，
 *   否则网页上显示的题就和 App 里的题对不上，分享闭环直接断裂。
 *   对应关系：
 *     SplitMix64        → SplitMix64
 *     placeCrowns       → placeCrowns
 *     growRegions       → growRegions
 *     countSolutions    → countSolutions
 *     stableHash        → stableHash
 *   验证方式：Tools/verify_web_generator.py 会把两边的输出逐行比对。
 *
 * ⚠️ 为什么用 BigInt 而不是 Number：
 *   SplitMix64 全程按 UInt64 运算，JS 的 Number 是双精度浮点，
 *   种子最高 20 位十进制数早就超出安全整数范围。只有 BigInt 能精确模拟。
 *   代价是生成速度慢一些，但 6×6 / 7×7 的耗时在毫秒级，可以接受。
 *
 * ⚠️ 为什么连唯一解校验器也一起移植：
 *   Swift 端生成失败会带着**连续的 RNG 状态**重试（最多 64 次）。
 *   校验器虽然不消耗 RNG，但它决定了「要不要重来一次」——
 *   如果网页端少跑这一步，两边在极端种子上就会落到不同的盘上。
 *   所以这里原样移植 `countSolutions`。
 */
(function (global) {
  'use strict';

  var MASK64 = (1n << 64n) - 1n;
  var FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
  var FNV_PRIME = 0x100000001b3n;

  // MARK: - 确定性随机数发生器

  /**
   * SplitMix64 —— 与 Swift 端 `SplitMix64` 完全对应。
   *
   * ⚠️ 刻意不使用 Math.random()：网页端必须与 App 端产出同一道题。
   */
  function SplitMix64(seed) {
    this.state = BigInt.asUintN(64, BigInt(seed));
  }

  SplitMix64.prototype.next = function () {
    this.state = BigInt.asUintN(64, this.state + 0x9e3779b97f4a7c15n);
    var z = this.state;
    z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
    z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
    return BigInt.asUintN(64, z ^ (z >> 31n));
  };

  /** 有界随机数（拒绝采样，避免取模偏差） */
  SplitMix64.prototype.nextBounded = function (upperBound) {
    var ub = BigInt(upperBound);
    var limit = MASK64 - (MASK64 % ub) - 1n;
    for (;;) {
      var v = this.next();
      if (v <= limit) return Number(v % ub);
    }
  };

  /** Fisher–Yates 洗牌 */
  SplitMix64.prototype.shuffled = function (array) {
    var a = array.slice();
    if (a.length <= 1) return a;
    for (var i = a.length - 1; i > 0; i--) {
      var j = this.nextBounded(i + 1);
      var tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  };

  SplitMix64.prototype.pick = function (array) {
    return array[this.nextBounded(array.length)];
  };

  // MARK: - 辅助

  /**
   * FNV-1a 64 位稳定哈希。
   *
   * ⚠️ 不可用 JS 内建 hash：每次运行都不同，无法复现每日题。
   */
  function stableHash(text) {
    var bytes = new TextEncoder().encode(text);
    var hash = FNV_OFFSET_BASIS;
    for (var i = 0; i < bytes.length; i++) {
      hash ^= BigInt(bytes[i]);
      hash = BigInt.asUintN(64, hash * FNV_PRIME);
    }
    return hash;
  }

  var ORTHOGONAL = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // MARK: - Step 1：放置皇冠基底

  /**
   * 每行恰好一顶皇冠、列不重复、相邻两行皇冠列距 > 1。
   * 返回 queens[r] = 第 r 行皇冠所在列。
   */
  function placeCrowns(n, rng) {
    var cols = new Array(n).fill(-1);

    function rec(r) {
      if (r === n) return true;
      var candidates = rng.shuffled(Array.from({ length: n }, function (_, i) { return i; }));
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue; // 八邻域不可相邻
        if (cols.slice(0, r).indexOf(c) !== -1) continue;        // 列唯一
        cols[r] = c;
        if (rec(r + 1)) return true;
        cols[r] = -1;
      }
      return false;
    }

    return rec(0) ? cols : null;
  }

  // MARK: - Step 2：带「行列归属约束」的连通色块生长

  /** 计算当前被禁用的行与列 */
  function bannedNeighbours(grid, n, queens, colour) {
    var rowColours = [];
    for (var j = 0; j < n; j++) {
      var v = grid[colour][j];
      if (v !== -1 && v !== colour && rowColours.indexOf(v) === -1) rowColours.push(v);
    }
    var bannedRows = rowColours;

    var colColours = [];
    for (var i = 0; i < n; i++) {
      var c2 = grid[i][queens[colour]];
      if (c2 !== -1 && c2 !== colour && colColours.indexOf(c2) === -1) colColours.push(c2);
    }
    var bannedCols = colColours.map(function (c) { return queens[c]; });

    return { rows: bannedRows, cols: bannedCols };
  }

  /** 某颜色当前所有合法的可扩张邻居格 */
  function colourNeighbourhood(grid, n, queens, colour) {
    var banned = bannedNeighbours(grid, n, queens, colour);
    var result = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (grid[r][c] !== colour) continue;
        for (var d = 0; d < ORTHOGONAL.length; d++) {
          var nr = r + ORTHOGONAL[d][0];
          var nc = c + ORTHOGONAL[d][1];
          if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
          if (grid[nr][nc] !== -1) continue;
          if (banned.rows.indexOf(nr) !== -1) continue;
          if (banned.cols.indexOf(nc) !== -1) continue;
          result.push([nr, nc]);
        }
      }
    }
    return result;
  }

  /** 生长连通色块。返回 null 表示本轮死锁，应重启。 */
  function growRegions(n, queens, rng) {
    var grid = [];
    for (var i = 0; i < n; i++) {
      var row = new Array(n).fill(-1);
      grid.push(row);
    }
    for (var r0 = 0; r0 < n; r0++) grid[r0][queens[r0]] = r0;

    var filled = n;
    var total = n * n;
    var iterations = 0;

    while (filled < total) {
      iterations++;
      if (iterations > 5000) return null; // 死锁保护

      var available = [];
      for (var colour = 0; colour < n; colour++) {
        var hood = colourNeighbourhood(grid, n, queens, colour);
        if (hood.length > 0) available.push({ colour: colour, hood: hood });
      }
      if (available.length === 0) return null; // 全局死锁 → 重启

      var chosen = rng.pick(available);
      var cell = rng.pick(chosen.hood);
      grid[cell[0]][cell[1]] = chosen.colour;
      filled++;
    }

    return grid;
  }

  // MARK: - Step 3：唯一解校验

  /** 枚举解，最多取 limit 个。每个解为「第 r 行皇冠所在列」的数组。 */
  function countSolutions(grid, n, limit) {
    var solutions = [];
    var cols = new Array(n).fill(-1);

    function rec(r, usedCols, usedRegions) {
      if (solutions.length >= limit) return;
      if (r === n) {
        solutions.push(cols.slice());
        return;
      }
      for (var c = 0; c < n; c++) {
        if (usedCols & (1 << c)) continue;               // 列规则
        if (r > 0 && Math.abs(cols[r - 1] - c) <= 1) continue; // 八邻域不可相邻
        var reg = grid[r][c];
        if (usedRegions & (1 << reg)) continue;         // 区域规则
        cols[r] = c;
        rec(r + 1,
            usedCols | (1 << c),
            usedRegions | (1 << reg));
        if (solutions.length >= limit) break;
      }
    }

    rec(0, 0, 0);
    return solutions;
  }

  // MARK: - 公开入口

  /**
   * 生成一道保证唯一解的关卡。返回 null 表示本次未造出。
   *
   * @param {bigint|number|string} seed
   * @param {number} n  6 / 7 / 8 / 9
   * @param {number} [restartLimit=64]
   */
  function generateLevel(seed, n, restartLimit) {
    if (restartLimit === undefined) restartLimit = 64;
    var rng = new SplitMix64(seed);

    for (var attempt = 0; attempt < restartLimit; attempt++) {
      var queens = placeCrowns(n, rng);
      if (!queens) continue;
      var grid = growRegions(n, queens, rng);
      if (!grid) continue;

      var solutions = countSolutions(grid, n, 2);
      if (solutions.length !== 1) continue;

      return {
        seed: BigInt.asUintN(64, BigInt(seed)),
        size: n,
        regionGrid: grid,
        solutionCols: solutions[0],
        queens: queens
      };
    }
    return null;
  }

  /** 每日挑战的种子：与 Swift 端 `dailyLevel(for:calendar:)` 同口径 */
  function dailySeed(dateString) {
    return stableHash(dateString + '|daily');
  }

  global.CrownedPuzzle = {
    SplitMix64: SplitMix64,
    stableHash: stableHash,
    placeCrowns: placeCrowns,
    growRegions: growRegions,
    countSolutions: countSolutions,
    generateLevel: generateLevel,
    dailySeed: dailySeed
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.CrownedPuzzle;
  }
})(typeof window !== 'undefined' ? window : globalThis);

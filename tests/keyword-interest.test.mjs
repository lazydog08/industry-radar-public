import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

function runInterestFixture() {
  const script = `
    import { matchesInterest } from "./src/scoring/keywords.ts";

    console.log(JSON.stringify({
      genshin: matchesInterest("《原神》角色逸闻——「故事的每一笔」 bilibili服下载地址 手机游戏"),
      helix: matchesInterest("《二重螺旋》银星奔流版本PV | 雪国列车启行 全新版本重磅上线 回归福利全面升级 手机游戏"),
      coating: matchesInterest("【战双帕弥什】「长路归航」新增涂装 新增特效涂装 后续动态内容 手机游戏"),
      fantasy: matchesInterest("《异环》安魂曲角色短片丨晚安，我温柔的星光 超自然都市开放世界RPG 全平台公测 biligame 同人·手书"),
      hardware: matchesInterest("一加枪神游戏手柄官宣升级适配一加 15 手机、Ace 6、Turbo 6 等系列机型"),
      tau: matchesInterest("华为发表韬(τ)定律，实现晶体管密度与系统性能突破")
    }));
  `;
  return JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { encoding: "utf8" }));
}

test("filters game PV and character-noise while keeping hardware and hard-tech signals", () => {
  const result = runInterestFixture();

  assert.equal(result.genshin, false);
  assert.equal(result.helix, false);
  assert.equal(result.coating, false);
  assert.equal(result.fantasy, false);
  assert.equal(result.hardware, true);
  assert.equal(result.tau, true);
});

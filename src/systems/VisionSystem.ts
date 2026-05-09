import { Grid } from '../models/Grid';
import { VisionFrame } from '../models/VisionFrame';
import { HeroState, heroGainPower, heroTakeDamage } from '../models/Hero';
import { DragonState, dragonTakeDamage } from '../models/Dragon';
import { BlockType, BLOCK_TYPE_TABLE } from '../config/blockTypes';
import { GridPosition } from '../utils/GridPosition';
import { EventBus } from '../core/EventBus';

export interface EffectDetail {
  position: GridPosition;
  message: string;
  color: number;
}

export class VisionSystem {
  applyFrameEffects(frame: VisionFrame, grid: Grid, heroPos: GridPosition | null): void {
    grid.forEach(cell => {
      if (cell.block) cell.block.shielded = false;
    });
    const positions = frame.getCoveredPositions();
    for (const pos of positions) {
      if (!grid.isInBounds(pos)) continue;
      const block = grid.getBlock(pos);
      if (block) block.shielded = true;
    }
  }

  /** 英雄与框内小鬼交战 */
  fightImpsInFrame(frame: VisionFrame, grid: Grid, hero: HeroState): EffectDetail[] {
    const details: EffectDetail[] = [];
    const positions = frame.getCoveredPositions();
    for (const pos of positions) {
      if (!grid.isInBounds(pos)) continue;
      const block = grid.getBlock(pos);
      if (!block || block.type !== BlockType.IMP) continue;
      block.value -= hero.power;
      details.push({ position: pos, message: `-${hero.power}`, color: 0xff8888 });
      if (block.value <= 0) {
        grid.removeBlock(pos);
        details.push({ position: pos, message: '消灭!', color: 0xff4444 });
      }
    }
    return details;
  }

  /** 魔眼：自毁并伤害玩家 */
  fightEvilEyesInFrame(frame: VisionFrame, grid: Grid, hero: HeroState): EffectDetail[] {
    const details: EffectDetail[] = [];
    const positions = frame.getCoveredPositions();
    for (const pos of positions) {
      if (!grid.isInBounds(pos)) continue;
      const block = grid.getBlock(pos);
      if (!block || block.type !== BlockType.EVIL_EYE) continue;
      const dmg = block.value;
      heroTakeDamage(hero, dmg);
      grid.removeBlock(pos);
      details.push({ position: pos, message: `-${dmg}`, color: 0xff44ff });
    }
    return details;
  }

  /** 应用方块效果到玩家 */
  applyBlockEffectsToHero(
    frame: VisionFrame,
    grid: Grid,
    hero: HeroState,
    dragons: DragonState[],
  ): EffectDetail[] {
    const details: EffectDetail[] = [];
    const positions = frame.getCoveredPositions();

    for (const pos of positions) {
      if (!grid.isInBounds(pos)) continue;
      const block = grid.getBlock(pos);
      if (!block || block.type === BlockType.IMP || block.type === BlockType.EVIL_EYE) continue;
      const def = BLOCK_TYPE_TABLE[block.type];
      if (!def.providesEffect) continue;

      switch (block.type) {
        case BlockType.FOOD:
          heroGainPower(hero, def.effectValue);
          details.push({ position: pos, message: `+${def.effectValue}`, color: 0x44ff44 });
          break;
        case BlockType.TRAINING:
          heroGainPower(hero, Math.max(1, block.value));
          details.push({ position: pos, message: `+${Math.max(1, block.value)}`, color: 0xff8844 });
          break;
        case BlockType.VILLAGE:
          heroGainPower(hero, def.effectValue);
          details.push({ position: pos, message: `+${def.effectValue}`, color: 0x88ccff });
          break;
        case BlockType.SWORD:
          // 剑攻击对应颜色的龙
          const targetId = block.targetDragonId;
          const target = targetId
            ? dragons.find(d => d.id === targetId && d.isAlive)
            : dragons.find(d => d.isAlive);
          if (target) {
            dragonTakeDamage(target, hero.power);
            details.push({ position: pos, message: `-${hero.power}`, color: block.targetColor ?? 0xff4444 });
            if (!target.isAlive) {
              EventBus.emit('dragonDied', { dragonId: target.id });
            }
          }
          break;
      }

      // 资源方块使用后消耗
      if (block.type === BlockType.FOOD || block.type === BlockType.SWORD || block.type === BlockType.TRAINING || block.type === BlockType.VILLAGE) {
        block.value -= 1;
        if (block.value <= 0) {
          grid.removeBlock(pos);
          details.push({ position: pos, message: '耗尽', color: 0x888888 });
        }
      }
    }

    return details;
  }

  isHeroInFrame(frame: VisionFrame, heroPos: GridPosition): boolean {
    return frame.contains(heroPos);
  }
}

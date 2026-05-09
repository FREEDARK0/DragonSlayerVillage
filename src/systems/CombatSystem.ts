import { Grid } from '../models/Grid';
import { HeroState, heroTakeDamage } from '../models/Hero';
import { DragonState, dragonTakeDamage } from '../models/Dragon';
import { GridPosition } from '../utils/GridPosition';
import { BlockType } from '../config/blockTypes';
import { EventBus } from '../core/EventBus';

export interface DamageResult {
  blockDestroyed: boolean;
  position: GridPosition;
  blockType: BlockType | null;
  damage: number;
}

export class CombatSystem {
  damageBlock(grid: Grid, pos: GridPosition, damage: number): DamageResult {
    const block = grid.getBlock(pos);
    if (!block) {
      return { blockDestroyed: false, position: pos, blockType: null, damage: 0 };
    }
    let effectiveDamage = damage;
    if (block.shielded) {
      effectiveDamage = Math.max(1, Math.floor(damage * 0.5));
    }
    block.value -= effectiveDamage;
    const destroyed = block.value <= 0;
    const blockType = block.type;
    if (destroyed) {
      grid.removeBlock(pos);
      EventBus.emit('blockDestroyed', { position: pos, blockType, value: block.value });
    }
    return { blockDestroyed: destroyed, position: pos, blockType, damage: effectiveDamage };
  }

  damageHero(hero: HeroState, damage: number): void {
    heroTakeDamage(hero, damage);
    EventBus.emit('heroDamaged', { damage, remainingPower: hero.power });
    if (!hero.isAlive) {
      EventBus.emit('heroDied', {});
    }
  }

  heroAttackDragon(hero: HeroState, dragon: DragonState): void {
    dragonTakeDamage(dragon, hero.power);
    EventBus.emit('dragonDamaged', { dragonId: dragon.id, damage: hero.power });
    if (!dragon.isAlive) {
      EventBus.emit('dragonDied', { dragonId: dragon.id });
    }
  }
}

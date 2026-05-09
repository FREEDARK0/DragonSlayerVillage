import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer } from '../rendering/GameRenderer';
import { DragonState } from '../models/Dragon';
import { DragonPersonalityType } from '../config/dragonTypes';
import { GAME_CONSTANTS } from '../config/constants';

export class DragonInfoPanel {
  private container: Container;
  private visible = false;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'DragonInfoPanel';
    this.container.visible = false;
    renderer.getLayer(5).addChild(this.container);
  }

  show(dragon: DragonState, x: number, y: number): void {
    this.container.removeChildren();
    this.container.position.set(x, y);
    this.visible = true;
    this.container.visible = true;

    const panelW = 200;
    const panelH = 140;

    // Panel background
    const bg = new Graphics();
    bg.roundRect(0, 0, panelW, panelH, 8);
    bg.fill({ color: 0x1a1a3e, alpha: 0.95 });
    bg.stroke({ width: 1, color: 0x4466aa });
    this.container.addChild(bg);

    // Dragon name
    const nameText = new Text({
      text: dragon.name,
      style: { fontFamily: 'monospace', fontSize: 16, fill: dragon.color, fontWeight: 'bold' },
    });
    nameText.position.set(10, 8);
    this.container.addChild(nameText);

    // Personality
    const personalityNames: Record<string, string> = {
      [DragonPersonalityType.ARROGANT]: '高傲 - 预告攻击位置',
      [DragonPersonalityType.GLUTTONOUS]: '贪食 - 优先吃食物',
      [DragonPersonalityType.DESTRUCTIVE]: '破坏 - 造成足够伤害后离开',
    };
    const persText = new Text({
      text: personalityNames[dragon.personality] || dragon.personality,
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0xaaaaaa },
    });
    persText.position.set(10, 28);
    this.container.addChild(persText);

    // HP bar
    const barBg = new Graphics();
    barBg.roundRect(10, 45, panelW - 20, 14, 3);
    barBg.fill(0x333333);
    this.container.addChild(barBg);

    const hpRatio = dragon.combatPower / dragon.maxCombatPower;
    const hpColor = hpRatio > 0.3 ? 0x44cc44 : 0xcc4444;
    const hpBar = new Graphics();
    hpBar.roundRect(10, 45, (panelW - 20) * hpRatio, 14, 3);
    hpBar.fill(hpColor);
    this.container.addChild(hpBar);

    const hpText = new Text({
      text: `战力: ${dragon.combatPower}/${dragon.maxCombatPower}`,
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0xffffff },
    });
    hpText.position.set(12, 46);
    this.container.addChild(hpText);

    // Attack damage
    const atkText = new Text({
      text: `攻击力: ${dragon.attackDamage}`,
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0xff8888 },
    });
    atkText.position.set(10, 65);
    this.container.addChild(atkText);

    // Announced targets (arrogant)
    if (dragon.announcedTargets && dragon.announcedTargets.length > 0) {
      const annText = new Text({
        text: `预告攻击: ${dragon.announcedTargets.map(p => `[${p.row},${p.col}]`).join(' ')}`,
        style: { fontFamily: 'monospace', fontSize: 10, fill: 0xff4444 },
      });
      annText.position.set(10, 82);
      this.container.addChild(annText);
    }

    // Satiation (gluttonous)
    if (dragon.personality === DragonPersonalityType.GLUTTONOUS) {
      const satText = new Text({
        text: `饱腹度: ${dragon.satiation}/100`,
        style: { fontFamily: 'monospace', fontSize: 10, fill: 0xff8844 },
      });
      satText.position.set(10, 98);
      this.container.addChild(satText);
    }

    // Damage dealt (destructive)
    if (dragon.personality === DragonPersonalityType.DESTRUCTIVE) {
      const dmgText = new Text({
        text: `已造成伤害: ${dragon.damageDealt}/${dragon.damageThreshold}`,
        style: { fontFamily: 'monospace', fontSize: 10, fill: 0xcc44cc },
      });
      dmgText.position.set(10, 98);
      this.container.addChild(dmgText);
    }
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }
}

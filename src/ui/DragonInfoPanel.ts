import { Container, Graphics, Text } from 'pixi.js';
import { GameRenderer, RenderLayer } from '../rendering/GameRenderer';
import { DragonState } from '../models/Dragon';
import { DragonPersonalityType } from '../config/dragonTypes';

export class DragonInfoPanel {
  private container: Container;
  private visible = false;

  constructor(private renderer: GameRenderer) {
    this.container = new Container();
    this.container.label = 'DragonInfoPanel';
    this.container.visible = false;
    renderer.getLayer(RenderLayer.DRAGONS).addChild(this.container);
  }

  show(dragon: DragonState, x: number, y: number): void {
    this.container.removeChildren();
    this.container.position.set(x, y);
    this.visible = true;
    this.container.visible = true;

    const panelW = 200;
    const panelH = 128;
    const bg = new Graphics();
    bg.roundRect(0, 0, panelW, panelH, 8);
    bg.fill({ color: 0x243748, alpha: 0.92 });
    bg.stroke({ width: 1, color: 0xf4d084, alpha: 0.85 });
    this.container.addChild(bg);

    const nameText = new Text({
      text: dragon.name,
      style: { fontFamily: 'monospace', fontSize: 16, fill: dragon.color, fontWeight: 'bold' },
    });
    nameText.position.set(10, 8);
    this.container.addChild(nameText);

    const personalityNames: Record<string, string> = {
      [DragonPersonalityType.ARROGANT]: '高傲 - 追逐强者',
      [DragonPersonalityType.GLUTTONOUS]: '贪食 - 白昼吞龙',
      [DragonPersonalityType.DESTRUCTIVE]: '破坏 - 击破追击',
      [DragonPersonalityType.GOLD]: '黄金 - 随机金矿',
      [DragonPersonalityType.WYVERN]: '亚龙 - 受伤后战斗完离开',
      [DragonPersonalityType.BRUTAL]: '火龙 - 生成龙焰',
    };
    const persText = new Text({
      text: personalityNames[dragon.personality] || dragon.personality,
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0xaaaaaa },
    });
    persText.position.set(10, 30);
    this.container.addChild(persText);

    const barBg = new Graphics();
    barBg.roundRect(10, 48, panelW - 20, 14, 3);
    barBg.fill(0x333333);
    this.container.addChild(barBg);

    const hpRatio = dragon.maxHp > 0 ? dragon.hp / dragon.maxHp : 0;
    const hpBar = new Graphics();
    hpBar.roundRect(10, 48, (panelW - 20) * hpRatio, 14, 3);
    hpBar.fill(hpRatio > 0.3 ? 0x44cc44 : 0xcc4444);
    this.container.addChild(hpBar);

    const hpText = new Text({
      text: `HP: ${dragon.hp}/${dragon.maxHp}`,
      style: { fontFamily: 'monospace', fontSize: 10, fill: 0xffffff },
    });
    hpText.position.set(12, 49);
    this.container.addChild(hpText);

    const atkText = new Text({
      text: `攻击力: ${dragon.attack}`,
      style: { fontFamily: 'monospace', fontSize: 11, fill: 0xff8888 },
    });
    atkText.position.set(10, 68);
    this.container.addChild(atkText);

    if (dragon.personality === DragonPersonalityType.GLUTTONOUS) {
      const count = new Text({
        text: `攻击计数: ${dragon.attackCount}/2`,
        style: { fontFamily: 'monospace', fontSize: 10, fill: 0xff8844 },
      });
      count.position.set(10, 88);
      this.container.addChild(count);
    }

    if (dragon.personality === DragonPersonalityType.WYVERN) {
      const hurtText = new Text({
        text: dragon.hasTakenDamage ? '已受伤：回合后离开' : '尚未受伤',
        style: { fontFamily: 'monospace', fontSize: 10, fill: 0x88dd88 },
      });
      hurtText.position.set(10, 88);
      this.container.addChild(hurtText);
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

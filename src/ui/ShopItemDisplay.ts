import { ShopItem, SpellType } from '../config/blockTypes';

export interface SpellAttackDisplay {
  value: number;
  dynamic: boolean;
}

export function getSpellAttackDisplay(item: ShopItem): SpellAttackDisplay | null {
  if (item.kind !== 'spell') return null;
  const tempAttack = item.tempAttack ?? 0;
  if (item.spellType === SpellType.MISSILE) return { value: 5 + tempAttack, dynamic: false };
  if (item.spellType === SpellType.SHIELD_CRUSH) return { value: 0, dynamic: true };
  return null;
}

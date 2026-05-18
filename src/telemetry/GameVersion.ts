import { GENERATED_DRAGON_DATA, GENERATED_ITEM_DATA, GENERATED_RELIC_DATA } from '../config/generatedData';
import { fnv1a64, stableStringify } from './CoreStateSerializer';

export const GAME_VERSION = '0.1.0';

export function currentDataHash(): string {
  return fnv1a64(stableStringify({
    dragons: GENERATED_DRAGON_DATA,
    items: GENERATED_ITEM_DATA,
    relics: GENERATED_RELIC_DATA,
  }));
}

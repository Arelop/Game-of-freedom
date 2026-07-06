// Активные способности классов на Q / X / R. Открываются с уровнем.
// Механика — на сервере (game.useAbility), клиент показывает кулдауны и эффекты.
export const ABILITIES = {
  warrior: [
    {
      id: 'power_strike', key: 'Q', lvl: 2, cd: 6, mana: 0,
      name: 'Мощный удар', icon: 'ab_power_strike',
      desc: 'Сокрушительный удар по всем врагам вокруг: ×2.5 урона и мощный отброс',
    },
    {
      id: 'war_cry', key: 'X', lvl: 5, cd: 14, mana: 5,
      name: 'Боевой клич', icon: 'ab_war_cry',
      desc: 'Оглушает врагов в радиусе на 1.5 с',
    },
    {
      id: 'whirlwind', key: 'R', lvl: 9, cd: 10, mana: 8,
      name: 'Вихрь стали', icon: 'ab_whirlwind',
      desc: 'Рывок с вращением: урон всем на пути',
    },
  ],
  mage: [
    {
      id: 'flame_wave', key: 'Q', lvl: 2, cd: 5, mana: 6,
      name: 'Огненная волна', icon: 'ab_flame_wave',
      desc: 'Конус пламени перед собой: ×1.5 урона магии',
    },
    {
      id: 'frost_nova', key: 'X', lvl: 5, cd: 12, mana: 10,
      name: 'Ледяная нова', icon: 'ab_frost_nova',
      desc: 'Кольцо мороза: урон и сильное замедление вокруг',
    },
    {
      id: 'blink', key: 'R', lvl: 9, cd: 8, mana: 8,
      name: 'Телепорт', icon: 'ab_blink',
      desc: 'Мгновенный перенос к прицелу (до 140 px)',
    },
  ],
  rogue: [
    {
      id: 'shadow_dash', key: 'Q', lvl: 2, cd: 6, mana: 4,
      name: 'Рывок теней', icon: 'ab_shadow_dash',
      desc: 'Проносишься сквозь врагов, раня всех на пути',
    },
    {
      id: 'smoke_bomb', key: 'X', lvl: 5, cd: 15, mana: 6,
      name: 'Дымовая завеса', icon: 'ab_smoke_bomb',
      desc: 'Невидимость: враги теряют тебя из виду на 3 с',
    },
    {
      id: 'blade_storm', key: 'R', lvl: 9, cd: 12, mana: 8,
      name: 'Град клинков', icon: 'ab_blade_storm',
      desc: 'Веер из 12 клинков во все стороны',
    },
  ],
};

export function abilitiesOf(cls) { return ABILITIES[cls] || ABILITIES.warrior; }

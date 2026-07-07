// Активные способности классов. Открываются с уровнем; какие три висят
// на Q / X / R — решает игрок в Книге способностей (K).
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
    {
      id: 'heroic_charge', key: '★', lvl: 12, cd: 10, mana: 6,
      name: 'Героический рывок', icon: 'ab_heroic_charge',
      desc: 'Бросок к прицелу (130 px): враги на пути получают ×2 урона и стан 0.8 с',
    },
    {
      id: 'unbreakable', key: '★', lvl: 16, cd: 25, mana: 8,
      name: 'Несокрушимость', icon: 'ab_unbreakable',
      desc: 'Каменная кожа: барьер на 6 урона на 6 с',
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
    {
      id: 'meteor', key: '★', lvl: 12, cd: 14, mana: 14,
      name: 'Метеор', icon: 'ab_meteor',
      desc: 'Красная метка у прицела, через миг — падение: ×6 урона магии по области',
    },
    {
      id: 'living_bomb', key: '★', lvl: 16, cd: 12, mana: 10,
      name: 'Живая бомба', icon: 'ab_living_bomb',
      desc: 'Вешает бомбу на врага у прицела: через 2 с — взрыв ×5 урона магии по округе',
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
    {
      id: 'shadowstep', key: '★', lvl: 12, cd: 10, mana: 6,
      name: 'Шаг сквозь тень', icon: 'ab_shadowstep',
      desc: 'Телепорт за спину врага у прицела; следующая атака ×1.5 урона',
    },
    {
      id: 'caltrops', key: '★', lvl: 16, cd: 14, mana: 8,
      name: 'Ковёр шипов', icon: 'ab_caltrops',
      desc: 'Шипы вокруг: враги рядом замедлены и истекают кровью',
    },
  ],
  priest: [
    {
      id: 'holy_wave', key: 'Q', lvl: 2, cd: 8, mana: 10,
      name: 'Волна света', icon: 'ab_holy_wave',
      desc: 'Лечит союзников вокруг на 2 сердца (себя — на 1), опаляет врагов',
    },
    {
      id: 'judgement', key: 'X', lvl: 5, cd: 12, mana: 10,
      name: 'Кара небес', icon: 'ab_judgement',
      desc: 'Столб света у прицела: ×2.5 урона магии и оглушение 1 с',
    },
    {
      id: 'faith_shield', key: 'R', lvl: 9, cd: 25, mana: 18,
      name: 'Щит веры', icon: 'ab_faith_shield',
      desc: 'Барьер на 4 урона всем союзникам рядом (6 с)',
    },
    {
      id: 'consecration', key: '★', lvl: 12, cd: 12, mana: 12,
      name: 'Освящение', icon: 'ab_consecration',
      desc: 'Святой огонь вокруг: врагам ×2 урона магии и поджог, союзникам +1 хп',
    },
    {
      id: 'guardian', key: '★', lvl: 16, cd: 30, mana: 16,
      name: 'Дух-хранитель', icon: 'ab_guardian',
      desc: 'Осеняет отряд: −30% входящего урона на 8 с',
    },
  ],
};

export function abilitiesOf(cls) { return ABILITIES[cls] || ABILITIES.warrior; }
// способность по id (для назначенных слотов)
export function abilityById(cls, id) { return (ABILITIES[cls] || []).find(a => a.id === id) || null; }
// раскладка по умолчанию: первые три
export function defaultLoadout(cls) { return (ABILITIES[cls] || ABILITIES.warrior).slice(0, 3).map(a => a.id); }

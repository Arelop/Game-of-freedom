// Активные способности классов. Открываются с уровнем (лесенка 2..16);
// какие три висят на Q / X / R — решает игрок в Книге способностей (K).
// Механика — на сервере (game.useAbility), клиент показывает кулдауны и эффекты.
export const ABILITIES = {
  warrior: [
    {
      id: 'power_strike', lvl: 2, cd: 6, mana: 0,
      name: 'Мощный удар', icon: 'ab_power_strike',
      desc: 'Сокрушительный удар по всем врагам вокруг: ×2.5 урона и мощный отброс. Ярость усиливает',
    },
    {
      id: 'shield_bash', lvl: 3, cd: 8, mana: 3,
      name: 'Удар щитом', icon: 'ab_shield_bash',
      desc: 'Тычок перед собой: ×1.5 урона и стан 1 с в упор',
    },
    {
      id: 'war_cry', lvl: 5, cd: 14, mana: 5,
      name: 'Боевой клич', icon: 'ab_war_cry',
      desc: 'Оглушает врагов в радиусе на 1.5 с',
    },
    {
      id: 'rally', lvl: 6, cd: 20, mana: 6,
      name: 'Второе дыхание', icon: 'ab_rally',
      desc: 'Стиснуть зубы: +2 сердца и сброс замедления',
    },
    {
      id: 'ember_blade', lvl: 7, cd: 16, mana: 5,
      name: 'Раскалённый клинок', icon: 'ab_ember_blade',
      desc: 'Следующие 6 атак несут ОГОНЬ: +2 урона и поджог (реакции!)',
    },
    {
      id: 'taunt', lvl: 8, cd: 12, mana: 4,
      name: 'Вызов', icon: 'ab_taunt',
      desc: 'Рёв: враги вокруг 3 с атакуют только тебя — работа для танка',
    },
    {
      id: 'whirlwind', lvl: 9, cd: 10, mana: 8,
      name: 'Вихрь стали', icon: 'ab_whirlwind',
      desc: 'Рывок с вращением: урон всем на пути. Ярость усиливает',
    },
    {
      id: 'heroic_charge', lvl: 12, cd: 10, mana: 6,
      name: 'Героический рывок', icon: 'ab_heroic_charge',
      desc: 'Бросок к прицелу (130 px): враги на пути получают ×2 урона и стан 0.8 с. Ярость усиливает',
    },
    {
      id: 'unbreakable', lvl: 16, cd: 25, mana: 8,
      name: 'Несокрушимость', icon: 'ab_unbreakable',
      desc: 'Каменная кожа: барьер на 6 урона на 6 с',
    },
  ],
  mage: [
    {
      id: 'flame_wave', lvl: 2, cd: 5, mana: 6,
      name: 'Огненная волна', icon: 'ab_flame_wave',
      desc: 'Конус пламени перед собой: ×1.5 урона магии',
    },
    {
      id: 'ice_lance', lvl: 3, cd: 5, mana: 4,
      name: 'Ледяное копьё', icon: 'ab_ice_lance',
      desc: 'Пронзающий снаряд: ×2.5 урона магии и метка ЛЬДА (реакции!)',
    },
    {
      id: 'frost_nova', lvl: 5, cd: 12, mana: 10,
      name: 'Ледяная нова', icon: 'ab_frost_nova',
      desc: 'Кольцо мороза: урон, сильное замедление и метка ЛЬДА вокруг',
    },
    {
      id: 'frost_armor', lvl: 6, cd: 18, mana: 6,
      name: 'Ледяная броня', icon: 'ab_frost_armor',
      desc: '60 с: ударившие тебя вблизи враги замерзают (метка ЛЬДА)',
    },
    {
      id: 'ice_wall', lvl: 7, cd: 14, mana: 10,
      name: 'Ледяная стена', icon: 'ab_ice_wall',
      desc: 'Воздвигает стену льда поперёк прицела (5 клеток, 6 с): держит врагов и пули',
    },
    {
      id: 'combust', lvl: 8, cd: 10, mana: 8,
      name: 'Возгорание', icon: 'ab_combust',
      desc: 'Детонирует яд/горение на враге у прицела: ×3 остатка дота разом',
    },
    {
      id: 'blink', lvl: 9, cd: 8, mana: 8,
      name: 'Телепорт', icon: 'ab_blink',
      desc: 'Мгновенный перенос к прицелу (до 140 px)',
    },
    {
      id: 'summon_frost', lvl: 10, cd: 30, mana: 14,
      name: 'Зов элементаля', icon: 'ab_summon_frost',
      desc: 'Ледяной элементаль служит 25 с: его снаряды студят врагов (метка ЛЬДА)',
    },
    {
      id: 'meteor', lvl: 12, cd: 14, mana: 14,
      name: 'Метеор', icon: 'ab_meteor',
      desc: 'Красная метка у прицела, через миг — падение: ×6 урона магии по области',
    },
    {
      id: 'firestorm', lvl: 14, cd: 18, mana: 16,
      name: 'Огненный смерч', icon: 'ab_firestorm',
      desc: 'Вихрь пламени ползёт к прицелу 5 с, сжигая всё на пути (жжёт и своих!)',
    },
    {
      id: 'living_bomb', lvl: 16, cd: 12, mana: 10,
      name: 'Живая бомба', icon: 'ab_living_bomb',
      desc: 'Вешает бомбу на врага у прицела: через 2 с — взрыв ×5 урона магии по округе',
    },
  ],
  rogue: [
    {
      id: 'shadow_dash', lvl: 2, cd: 6, mana: 4,
      name: 'Рывок теней', icon: 'ab_shadow_dash',
      desc: 'Проносишься сквозь врагов, раня всех на пути. Комбо усиливает',
    },
    {
      id: 'flash_powder', lvl: 3, cd: 10, mana: 4,
      name: 'Ослепляющий порошок', icon: 'ab_flash_powder',
      desc: 'Горсть в глаза: стан 1.2 с в конусе перед собой',
    },
    {
      id: 'smoke_bomb', lvl: 5, cd: 15, mana: 6,
      name: 'Дымовая завеса', icon: 'ab_smoke_bomb',
      desc: 'Невидимость: враги теряют тебя из виду на 3 с',
    },
    {
      id: 'poison_blade', lvl: 6, cd: 16, mana: 5,
      name: 'Ядовитый клинок', icon: 'ab_poison_blade',
      desc: '20 с: твои атаки отравляют (дот). Подожги яд — будет ТОКСИН',
    },
    {
      id: 'evasion', lvl: 8, cd: 20, mana: 6,
      name: 'Уклонение', icon: 'ab_evasion',
      desc: '5 с: +40% шанс полностью избежать урона',
    },
    {
      id: 'blade_storm', lvl: 9, cd: 12, mana: 8,
      name: 'Град клинков', icon: 'ab_blade_storm',
      desc: 'Веер из 12 клинков во все стороны. Комбо усиливает',
    },
    {
      id: 'smoke_cloud', lvl: 10, cd: 16, mana: 7,
      name: 'Дымовое облако', icon: 'ab_smoke_cloud',
      desc: 'Облако дыма у прицела (6 с): союзники в нём невидимы, враги слепнут',
    },
    {
      id: 'shadowstep', lvl: 12, cd: 10, mana: 6,
      name: 'Шаг сквозь тень', icon: 'ab_shadowstep',
      desc: 'Телепорт за спину врага у прицела; следующая атака ×1.5 урона',
    },
    {
      id: 'caltrops', lvl: 16, cd: 14, mana: 8,
      name: 'Ковёр шипов', icon: 'ab_caltrops',
      desc: 'Шипы вокруг: враги рядом замедлены и истекают кровью',
    },
  ],
  priest: [
    {
      id: 'holy_wave', lvl: 2, cd: 8, mana: 10,
      name: 'Волна света', icon: 'ab_holy_wave',
      desc: 'Лечит союзников вокруг на 2 сердца (себя — на 1), опаляет врагов',
    },
    {
      id: 'mend', lvl: 3, cd: 6, mana: 6,
      name: 'Свет прикосновения', icon: 'ab_mend',
      desc: 'Лечит самого раненого союзника рядом на 2 (одиночке — себя на 1)',
    },
    {
      id: 'judgement', lvl: 5, cd: 12, mana: 10,
      name: 'Кара небес', icon: 'ab_judgement',
      desc: 'Столб света у прицела: ×2.5 урона магии и оглушение 1 с. Благодать усиливает',
    },
    {
      id: 'radiance', lvl: 6, cd: 15, mana: 8,
      name: 'Сияние', icon: 'ab_radiance',
      desc: '6 с: святой свет жжёт врагов рядом с тобой (1 урона/с)',
    },
    {
      id: 'holy_weapon', lvl: 7, cd: 16, mana: 6,
      name: 'Освящение клинка', icon: 'ab_holy_weapon',
      desc: 'Следующие 6 атак несут СВЕТ: +1 урона, каждое попадание лечит тебя',
    },
    {
      id: 'penance', lvl: 8, cd: 10, mana: 6,
      name: 'Епитимья', icon: 'ab_penance',
      desc: 'Луч к прицелу: врага карает ×2 урона магии, союзника лечит на 2',
    },
    {
      id: 'faith_shield', lvl: 9, cd: 25, mana: 18,
      name: 'Щит веры', icon: 'ab_faith_shield',
      desc: 'Барьер на 4 урона всем союзникам рядом (6 с)',
    },
    {
      id: 'summon_spirit', lvl: 10, cd: 30, mana: 16,
      name: 'Дух-заступник', icon: 'ab_summon_spirit',
      desc: 'Светлый дух служит 25 с: его лучи жгут врагов и лечат союзников',
    },
    {
      id: 'consecration', lvl: 12, cd: 12, mana: 12,
      name: 'Освящение', icon: 'ab_consecration',
      desc: 'Святой огонь вокруг: врагам ×2 урона магии и поджог, союзникам +1 хп. Благодать усиливает',
    },
    {
      id: 'guardian', lvl: 16, cd: 30, mana: 16,
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

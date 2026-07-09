// Деревья талантов в духе WoW Classic: у класса 3 специализации-вкладки,
// таланты с рангами (очко за ранг), ярусы открываются очками В ЭТОЙ ветке:
// ярус 2 — 3 очка, ярус 3 — 6 очков, ярус 4 (капстоуны) — 9 очков.
// effects — числовые бонусы ЗА РАНГ (суммируются в recomputeStats),
// flag — особые механики, обрабатываемые кодом боя.
export const TIER_REQ = { 1: 0, 2: 3, 3: 6, 4: 9 };

export const SPECS = {
  warrior: [
    { id: 'berserk', name: 'Берсерк', color: '#d9574a', desc: 'Ярость, казнь и вихрь стали' },
    { id: 'guard', name: 'Страж', color: '#9badb7', desc: 'Щит, шипы и последний рубеж' },
    { id: 'warlord', name: 'Полководец', color: '#d9a066', desc: 'Манёвр, тактика и воинский клич' },
  ],
  mage: [
    { id: 'pyro', name: 'Пиромант', color: '#df7126', desc: 'Пламя, поджоги и эхо маны' },
    { id: 'cryo', name: 'Криомант', color: '#63c5ff', desc: 'Лёд, мана-щит и абсолютный ноль' },
    { id: 'arcane', name: 'Арканист', color: '#b06ee1', desc: 'Чистая мана и сила архонта' },
  ],
  rogue: [
    { id: 'assassin', name: 'Убийца', color: '#d9574a', desc: 'Яд, засада и смертельные криты' },
    { id: 'marksman', name: 'Стрелок', color: '#99e550', desc: 'Меткость, темп и град стали' },
    { id: 'trickster', name: 'Плут', color: '#fbf236', desc: 'Удача, золото и невидимость' },
  ],
  priest: [
    { id: 'light', name: 'Свет', color: '#fbf236', desc: 'Исцеление, аура и воскрешение' },
    { id: 'wrath', name: 'Кара', color: '#df7126', desc: 'Гнев небес и палящий свет' },
    { id: 'bastion', name: 'Оплот', color: '#5fcde4', desc: 'Барьеры, стойкость и вера' },
  ],
  necromancer: [
    { id: 'bone', name: 'Кости', color: '#e8e0c8', desc: 'Скелеты, легион и костяной голем' },
    { id: 'blight', name: 'Порча', color: '#6abe30', desc: 'Мор, проклятия и распад' },
    { id: 'soul', name: 'Души', color: '#8f6fe0', desc: 'Дренаж, жатва и вампиризм' },
  ],
};

export const TALENTS = {
  warrior: [
    // ═══ БЕРСЕРК ═══
    { id: 'w_grip', spec: 'berserk', tier: 1, ranks: 3, name: 'Крепкая хватка', desc: '+6% урона ближнего боя за ранг', effects: { dmgMelee: 0.06 } },
    { id: 'w_fury', spec: 'berserk', tier: 1, ranks: 1, name: 'Кровавый ритм', desc: 'Убийство врага снижает кулдауны способностей на 1 с', flag: 'killcdr' },
    { id: 'w_arc', spec: 'berserk', tier: 2, ranks: 1, name: 'Широкий замах', desc: 'Дуга удара шире на 40°', effects: { arcBonus: 40 } },
    { id: 'w_blood', spec: 'berserk', tier: 2, ranks: 1, name: 'Кровожадность', desc: 'Убийство в ближнем бою лечит ½ сердца', flag: 'bloodlust' },
    { id: 'w_stunhit', spec: 'berserk', tier: 2, ranks: 1, name: 'Оглушающий удар', desc: '15% шанс оглушить ударом на 0.6 с', flag: 'stunhit' },
    { id: 'w_powerburn', spec: 'berserk', tier: 3, ranks: 1, name: 'Сокрушение', desc: 'Мощный удар: +40% урона', flag: 'ab_power' },
    { id: 'w_execute', spec: 'berserk', tier: 3, ranks: 1, name: 'Палач', desc: '+50% урона по врагам ниже 25% здоровья', flag: 'execute' },
    { id: 'w_ember2', spec: 'berserk', tier: 3, ranks: 1, name: 'Пылающая ярость', desc: 'Раскалённый клинок: 10 атак и +2 ярости за горящий удар', flag: 'ab_ember2' },
    { id: 'w_rage', spec: 'berserk', tier: 4, ranks: 1, name: 'Ярость', desc: 'Ниже 30% здоровья — +40% урона. УЛЬТА (F) «Кровавая жатва»: 8 с буйства — +40% урона мили, +30% скорости, удары лечат', flag: 'rage', ult: 'rage_ult' },
    { id: 'w_whirl', spec: 'berserk', tier: 4, ranks: 1, name: 'Вихрь стали', desc: 'Удары бьют по кругу (360°)', flag: 'whirl' },
    // ═══ СТРАЖ ═══
    { id: 'w_skin', spec: 'guard', tier: 1, ranks: 3, name: 'Стальная кожа', desc: '+1 сердце за ранг', effects: { maxHp: 2 } },
    { id: 'w_vigor', spec: 'guard', tier: 1, ranks: 1, name: 'Несущий щит', desc: 'Удар щитом ещё и вызывает цель на себя (2.5 с)', flag: 'ab_bashtaunt' },
    { id: 'w_tough', spec: 'guard', tier: 2, ranks: 2, name: 'Стойкость', desc: '+3% уворота за ранг', effects: { dodge: 0.03 } },
    { id: 'w_thorns', spec: 'guard', tier: 2, ranks: 1, name: 'Шипастый доспех', desc: 'Враги, ударившие вблизи, теряют 6% своего здоровья (+1)', flag: 'thorns' },
    { id: 'w_bulwark', spec: 'guard', tier: 2, ranks: 1, name: 'Мастер щита', desc: 'Блок щитом гасит удары в вдвое более широком секторе', flag: 'blockwide' },
    { id: 'w_bash2', spec: 'guard', tier: 3, ranks: 1, name: 'Тяжёлый щит', desc: 'Удар щитом: стан 2 с и ×2 урона', flag: 'ab_bash' },
    { id: 'w_fortress', spec: 'guard', tier: 3, ranks: 1, name: 'Общий оплот', desc: 'Несокрушимость даёт половину барьера союзникам рядом', flag: 'ab_unbreak_share' },
    { id: 'w_laststand', spec: 'guard', tier: 3, ranks: 1, name: 'Последний рубеж', desc: 'Смертельный удар оставляет 1 ХП (раз в 60 с)', flag: 'laststand' },
    { id: 'w_citadel', spec: 'guard', tier: 4, ranks: 1, name: 'Живая крепость', desc: '+2 сердца, шипы отражают 12% здоровья врага (+2). УЛЬТА (F) «Железный бастион»: 6 с −60% урона отряду + все враги рядом таунтятся', flag: 'thorns3', effects: { maxHp: 4 }, ult: 'citadel_ult' },
    // ═══ ПОЛКОВОДЕЦ ═══
    { id: 'w_dash', spec: 'warlord', tier: 1, ranks: 3, name: 'Рывок', desc: '−12% кулдауна переката за ранг', effects: { rollCd: 0.12 } },
    { id: 'w_march', spec: 'warlord', tier: 1, ranks: 1, name: 'Знаменосец', desc: 'Боевой клич даёт союзникам +15% скорости на 5 с', flag: 'ab_cryspeed' },
    { id: 'w_ram', spec: 'warlord', tier: 2, ranks: 1, name: 'Таран', desc: 'Перекат сбивает врагов и наносит урон', flag: 'ram' },
    { id: 'w_tactic', spec: 'warlord', tier: 2, ranks: 1, name: 'Тактик', desc: 'Убийство Героическим рывком сбрасывает его кулдаун', flag: 'ab_chargereset' },
    { id: 'w_whirlfar', spec: 'warlord', tier: 3, ranks: 1, name: 'Стальной шторм', desc: 'Вихрь стали летит на 50% дальше', flag: 'ab_whirlfar' },
    { id: 'w_cryheal', spec: 'warlord', tier: 3, ranks: 1, name: 'Вдохновляющий клич', desc: 'Боевой клич лечит союзников на ½ сердца', flag: 'ab_cryheal' },
    { id: 'w_taunt2', spec: 'warlord', tier: 2, ranks: 1, name: 'Громовой вызов', desc: 'Вызов длится 5 с и даёт тебе барьер на 2', flag: 'ab_taunt' },
    { id: 'w_warlord', spec: 'warlord', tier: 4, ranks: 1, name: 'Вождь', desc: 'Клич даёт группе +15% урона на 10 с. УЛЬТА (F) «Знамя войны»: 10 с отряду +25% урона и барьер', flag: 'ab_crydmg', ult: 'warlord_ult' },
    { id: 'w_horn', spec: 'warlord', tier: 4, ranks: 1, name: 'Рог войны', desc: 'Клич укрывает группу барьером на 1 сердце', flag: 'ab_cryarmor' },
  ],
  mage: [
    // ═══ ПИРОМАНТ ═══
    { id: 'm_spark', spec: 'pyro', tier: 1, ranks: 3, name: 'Искра', desc: '+6% урона магии за ранг', effects: { dmgMagic: 0.06 } },
    { id: 'm_ember', spec: 'pyro', tier: 1, ranks: 1, name: 'Тлеющие угли', desc: 'Метеор оставляет горящую землю на 3 с', flag: 'ab_meteorburn' },
    { id: 'm_twin', spec: 'pyro', tier: 2, ranks: 1, name: 'Двойной сгусток', desc: 'Посохи выпускают +1 снаряд', effects: { magicProj: 1 } },
    { id: 'm_ignite', spec: 'pyro', tier: 2, ranks: 1, name: 'Поджог', desc: 'Магия поджигает врагов: 1 урона/с на 3 с', flag: 'ignite' },
    { id: 'm_wavewide', spec: 'pyro', tier: 2, ranks: 1, name: 'Пламенный вал', desc: 'Огненная волна шире и дальше', flag: 'ab_wave' },
    { id: 'm_combust2', spec: 'pyro', tier: 3, ranks: 1, name: 'Цепная детонация', desc: 'Возгорание перекидывает дот на врагов рядом', flag: 'ab_combust' },
    { id: 'm_blinkburn', spec: 'pyro', tier: 3, ranks: 1, name: 'Пылающий след', desc: 'Телепорт оставляет взрыв в точке старта', flag: 'ab_blink' },
    { id: 'm_echo', spec: 'pyro', tier: 3, ranks: 1, name: 'Эхо маны', desc: '20% шанс: способность почти без кулдауна', flag: 'echo' },
    { id: 'm_storm', spec: 'pyro', tier: 4, ranks: 1, name: 'Огненный шторм', desc: 'Ещё +1 снаряд и +15% урона магии. УЛЬТА (F) «Испепеление»: три метеора по прицелу', effects: { magicProj: 1, dmgMagic: 0.15 }, ult: 'storm_ult' },
    // ═══ КРИОМАНТ ═══
    { id: 'm_chill', spec: 'cryo', tier: 1, ranks: 1, name: 'Вечная мерзлота', desc: 'Ледяная стена шире (7 клеток) и стоит 9 с', flag: 'ab_wall2' },
    { id: 'm_frost', spec: 'cryo', tier: 1, ranks: 1, name: 'Ледяная хватка', desc: 'Лёд замедляет сильнее и дольше', flag: 'frostMaster' },
    { id: 'm_barrier', spec: 'cryo', tier: 2, ranks: 1, name: 'Барьер', desc: 'Неуязвимость в перекате дольше', flag: 'barrier' },
    { id: 'm_manashield', spec: 'cryo', tier: 2, ranks: 1, name: 'Ледяная кора', desc: 'Четверть урона уходит в ману (3 маны за 1 урона)', flag: 'manashield' },
    { id: 'm_novadeep', spec: 'cryo', tier: 2, ranks: 1, name: 'Вечная мерзлота', desc: 'Ледяная нова замораживает почти намертво', flag: 'ab_nova' },
    { id: 'm_lance2', spec: 'cryo', tier: 2, ranks: 1, name: 'Пронзающий холод', desc: 'Ледяное копьё: ×1.6 урона и лёд держится дольше', flag: 'ab_lance' },
    { id: 'm_icyveins', spec: 'cryo', tier: 3, ranks: 1, name: 'Ледяные жилы', desc: '−20% кулдауны способностей', flag: 'cdr' },
    { id: 'm_glacier', spec: 'cryo', tier: 3, ranks: 2, name: 'Ледник', desc: '+1 сердце и +1 реген маны за ранг', effects: { maxHp: 2, manaRegen: 1 } },
    { id: 'm_deepfreeze', spec: 'cryo', tier: 4, ranks: 1, name: 'Абсолютный ноль', desc: '+35% урона по замедленным. УЛЬТА (F) «Абсолютный лёд»: заморозка и метка льда всем врагам вокруг', flag: 'deepfreeze', ult: 'freeze_ult' },
    // ═══ АРКАНИСТ ═══
    { id: 'm_medit', spec: 'arcane', tier: 1, ranks: 4, name: 'Медитация', desc: '+1 реген маны за ранг', effects: { manaRegen: 1 } },
    { id: 'm_robes', spec: 'arcane', tier: 1, ranks: 1, name: 'Плетение теней', desc: 'Телепорт ослепляет врагов у точки ухода (1.5 с)', flag: 'ab_blinkfog' },
    { id: 'm_arch', spec: 'arcane', tier: 2, ranks: 1, name: 'Архимаг', desc: '30% шанс не потратить ману', flag: 'arcane' },
    { id: 'm_blood', spec: 'arcane', tier: 2, ranks: 1, name: 'Чародейская кровь', desc: 'Зелья действуют на 50% сильнее', flag: 'alchemy' },
    { id: 'm_focus', spec: 'arcane', tier: 3, ranks: 1, name: 'Сопряжение', desc: 'Возгорание возвращает 6 маны за детонацию', flag: 'ab_combust_mana' },
    { id: 'm_overmind', spec: 'arcane', tier: 3, ranks: 1, name: 'Разум архонта', desc: 'Заряженный выстрел (держать атаку) заряжается на 40% быстрее и даёт чародейский заряд', flag: 'chargefast' },
    { id: 'm_archon', spec: 'arcane', tier: 4, ranks: 1, name: 'Архонт', desc: '+1 снаряд посохам и +10% урона магии. УЛЬТА (F) «Арканный шквал»: 12 сгустков во все стороны + 15 маны', effects: { magicProj: 1, dmgMagic: 0.1 }, ult: 'archon_ult' },
  ],
  rogue: [
    // ═══ УБИЙЦА ═══
    { id: 'r_blade', spec: 'assassin', tier: 1, ranks: 3, name: 'Отточенные клинки', desc: '+5% урона ближ. и дальн. боя за ранг', effects: { dmgMelee: 0.05, dmgRanged: 0.05 } },
    { id: 'r_shadow', spec: 'assassin', tier: 1, ranks: 1, name: 'Тень', desc: 'После переката следующая атака +50% урона', flag: 'shadow' },
    { id: 'r_stab', spec: 'assassin', tier: 2, ranks: 1, name: 'Смертельный укол', desc: 'Криты наносят ×3 вместо ×2', flag: 'deadly' },
    { id: 'r_ambush', spec: 'assassin', tier: 2, ranks: 1, name: 'Засада', desc: '+40% урона по врагам с полным здоровьем', flag: 'ambush' },
    { id: 'r_dashstun', spec: 'assassin', tier: 2, ranks: 1, name: 'Ошеломление', desc: 'Рывок теней оглушает на 1 с', flag: 'ab_dash' },
    { id: 'r_venom', spec: 'assassin', tier: 3, ranks: 1, name: 'Отравленные клинки', desc: 'Атаки отравляют: 1 урона/с на 4 с', flag: 'venom' },
    { id: 'r_poison2', spec: 'assassin', tier: 2, ranks: 1, name: 'Гнилая кровь', desc: 'Ядовитый клинок: дот вдвое злее (2 урона/с)', flag: 'ab_poisonblade' },
    { id: 'r_luck', spec: 'assassin', tier: 3, ranks: 1, name: 'Коварство', desc: 'Ослепляющий порошок: стан 2 с, следующий удар по цели в полтора раза больнее', flag: 'ab_flash2' },
    { id: 'r_execution', spec: 'assassin', tier: 4, ranks: 1, name: 'Казнь', desc: '+8% крита и +15% урона мили. УЛЬТА (F) «Танец смерти»: теневые удары по ВСЕМ врагам вокруг', effects: { critChance: 0.08, dmgMelee: 0.15 }, ult: 'exec_ult' },
    // ═══ СТРЕЛОК ═══
    { id: 'r_aim', spec: 'marksman', tier: 1, ranks: 3, name: 'Меткость', desc: '+6% урона дальнего боя за ранг', effects: { dmgRanged: 0.06 } },
    { id: 'r_hands', spec: 'marksman', tier: 1, ranks: 1, name: 'Ловкие пальцы', desc: 'Град клинков возвращает 1 нож за каждое попадание', flag: 'ab_blades_ammo' },
    { id: 'r_fan', spec: 'marksman', tier: 2, ranks: 2, name: 'Веер ножей', desc: 'Метательные ножи: +1 снаряд за ранг', effects: { knifeProj: 1 } },
    { id: 'r_bladefan', spec: 'marksman', tier: 2, ranks: 1, name: 'Стальной ливень', desc: 'Град клинков: +6 клинков', flag: 'ab_blades' },
    { id: 'r_sniper', spec: 'marksman', tier: 3, ranks: 1, name: 'Из тени', desc: 'Шаг сквозь тень: дальность 220 и удар из тени всегда крит', flag: 'ab_shadowstep2' },
    { id: 'r_rapid', spec: 'marksman', tier: 3, ranks: 1, name: 'Шквал', desc: 'После Уклонения +40% скорости атаки на 4 с', flag: 'ab_evasion_haste' },
    { id: 'r_barrage', spec: 'marksman', tier: 4, ranks: 1, name: 'Град стали', desc: '+1 нож и +10% скорости атаки. УЛЬТА (F) «Шквал стали»: три волны по 12 клинков', effects: { knifeProj: 1, atkSpeed: 0.1 }, ult: 'barrage_ult' },
    // ═══ ПЛУТ ═══
    { id: 'r_step', spec: 'trickster', tier: 1, ranks: 2, name: 'Лёгкая поступь', desc: '+4% скорости за ранг', effects: { speed: 0.04 } },
    { id: 'r_pick', spec: 'trickster', tier: 1, ranks: 1, name: 'Отравленные шипы', desc: 'Ковёр шипов травит (2/с) и живёт вдвое дольше', flag: 'ab_caltrops2' },
    { id: 'r_acro', spec: 'trickster', tier: 2, ranks: 1, name: 'Дымовой трюк', desc: 'Дымовое облако сбрасывает кулдаун переката и лечит на 1', flag: 'ab_smokecloud2' },
    { id: 'r_smokespd', spec: 'trickster', tier: 2, ranks: 1, name: 'Дым и зеркала', desc: 'Завеса дольше (5 с) и даёт +30% скорости', flag: 'ab_smoke' },
    { id: 'r_ghost', spec: 'trickster', tier: 3, ranks: 1, name: 'Призрак', desc: '+4% уворота и −15% кулдауна переката', effects: { dodge: 0.04, rollCd: 0.15 } },
    { id: 'r_slippery', spec: 'trickster', tier: 3, ranks: 1, name: 'Скользкий тип', desc: 'Уклонение даёт ещё и +30% скорости', flag: 'ab_evasion' },
    { id: 'r_gold', spec: 'trickster', tier: 3, ranks: 2, name: 'Деловая хватка', desc: '+10% монет и +2% крита за ранг', effects: { coinMult: 0.1, critChance: 0.02 } },
    { id: 'r_gambler', spec: 'trickster', tier: 4, ranks: 1, name: 'Игрок', desc: '+30% монет, +5% крита, +3% уворота. УЛЬТА (F) «Дым и золото»: невидимость 5 с, сброс кулдаунов, монеты ×2 на 10 с', effects: { coinMult: 0.3, critChance: 0.05, dodge: 0.03 }, ult: 'gambler_ult' },
  ],
  priest: [
    // ═══ СВЕТ: целитель отряда ═══
    { id: 'p_grace', spec: 'light', tier: 1, ranks: 3, name: 'Благодать', desc: '+1 к регену маны за ранг', effects: { manaRegen: 1 } },
    { id: 'p_touch', spec: 'light', tier: 1, ranks: 1, name: 'Тёплый свет', desc: 'Посох света лечит союзников на 2 вместо 1', flag: 'lightheal' },
    { id: 'p_wavebig', spec: 'light', tier: 2, ranks: 1, name: 'Прилив света', desc: 'Волна света лечит на 3 сердца', flag: 'ab_wavebig' },
    { id: 'p_mend2', spec: 'light', tier: 2, ranks: 1, name: 'Тёплые ладони', desc: 'Свет прикосновения лечит на 3 и даёт цели барьер на 1', flag: 'ab_mend' },
    { id: 'p_aura', spec: 'light', tier: 2, ranks: 1, name: 'Аура света', desc: 'Союзники рядом получают +1 хп каждые 6 с', flag: 'aura' },
    { id: 'p_mend', spec: 'light', tier: 3, ranks: 1, name: 'Тёплый ореол', desc: 'Сияние также лечит союзников в круге (1/с)', flag: 'ab_radiance_heal' },
    { id: 'p_echo2', spec: 'light', tier: 3, ranks: 1, name: 'Эхо молитвы', desc: '20% шанс: способность почти без кулдауна', flag: 'echo' },
    { id: 'p_rez', spec: 'light', tier: 4, ranks: 1, name: 'Длань Света', desc: 'Волна света поднимает павшего (раз в 60 с). УЛЬТА (F) «Чудо»: полное исцеление и воскрешение отряда', flag: 'ab_waverez', ult: 'rez_ult' },
    // ═══ КАРА: боевой жрец ═══
    { id: 'p_zeal', spec: 'wrath', tier: 1, ranks: 3, name: 'Рвение', desc: '+6% урона магии за ранг', effects: { dmgMagic: 0.06 } },
    { id: 'p_haste', spec: 'wrath', tier: 1, ranks: 1, name: 'Пылающий дух', desc: 'Дух-заступник стреляет вдвое чаще, его лучи жгут', flag: 'ab_spirit2' },
    { id: 'p_judgewide', spec: 'wrath', tier: 2, ranks: 1, name: 'Широкая кара', desc: 'Столб Кары небес шире в полтора раза', flag: 'ab_judgewide' },
    { id: 'p_searing', spec: 'wrath', tier: 2, ranks: 1, name: 'Палящий свет', desc: 'Магические атаки поджигают: 1 урона/с на 3 с', flag: 'ignite' },
    { id: 'p_fervor', spec: 'wrath', tier: 3, ranks: 1, name: 'Фанатизм', desc: 'Освящение клинка: 10 атак, лечение при ударе +1', flag: 'ab_holyw2' },
    { id: 'p_crit', spec: 'wrath', tier: 3, ranks: 1, name: 'Суд небес', desc: '+6% шанса крита', effects: { critChance: 0.06 } },
    { id: 'p_penance2', spec: 'wrath', tier: 3, ranks: 1, name: 'Раскалённый луч', desc: 'Епитимья бьёт ×1.5 и поджигает врага', flag: 'ab_penance' },
    { id: 'p_storm', spec: 'wrath', tier: 4, ranks: 1, name: 'Гнев небес', desc: '+1 снаряд света и +15% урона магии. УЛЬТА (F) «Гнев Господень»: столбы света по всем врагам вокруг со станом', effects: { magicProj: 1, dmgMagic: 0.15 }, ult: 'wrath_ult' },
    // ═══ ОПЛОТ: защитник ═══
    { id: 'p_body', spec: 'bastion', tier: 1, ranks: 4, name: 'Крепость духа', desc: '+1 сердце за ранг', effects: { maxHp: 2 } },
    { id: 'p_calm', spec: 'bastion', tier: 1, ranks: 1, name: 'Наставление', desc: 'Дух-хранитель: 12 с и на 40% меньше входящего урона', flag: 'ab_guardian2' },
    { id: 'p_shieldbig', spec: 'bastion', tier: 2, ranks: 1, name: 'Твёрдая вера', desc: 'Щит веры держит 6 урона', flag: 'ab_shieldbig' },
    { id: 'p_manawall', spec: 'bastion', tier: 2, ranks: 1, name: 'Стена маны', desc: 'Четверть урона уходит в ману (3 маны за 1)', flag: 'manashield' },
    { id: 'p_vigil', spec: 'bastion', tier: 3, ranks: 1, name: 'Бдение', desc: 'Освящение шире и оставляет святую землю на 4 с (лечит своих)', flag: 'ab_consecrate2' },
    { id: 'p_cdr', spec: 'bastion', tier: 3, ranks: 1, name: 'Собранность', desc: 'Способности перезаряжаются на 20% быстрее', flag: 'cdr' },
    { id: 'p_martyr', spec: 'bastion', tier: 4, ranks: 1, name: 'Несокрушимость', desc: '+2 сердца, смертельный удар оставляет 1 ХП (раз в 60 с). УЛЬТА (F) «Небесный оплот»: 8 с отряду барьер 6 и −40% урона', flag: 'laststand', effects: { maxHp: 4 }, ult: 'martyr_ult' },
  ],
  necromancer: [
    // ═══ КОСТИ: повелитель нежити ═══
    { id: 'n_bone', spec: 'bone', tier: 1, ranks: 3, name: 'Костяная воля', desc: '+6% урона магии за ранг', effects: { dmgMagic: 0.06 } },
    { id: 'n_raise2', spec: 'bone', tier: 1, ranks: 1, name: 'Крепкие кости', desc: 'Скелеты крепче (+6 хп) и служат дольше', flag: 'ab_raise2' },
    { id: 'n_legion', spec: 'bone', tier: 2, ranks: 1, name: 'Легион', desc: 'Поднять скелета зовёт сразу двоих', flag: 'ab_raise_two' },
    { id: 'n_swift', spec: 'bone', tier: 2, ranks: 1, name: 'Резвые мертвецы', desc: 'Твои мертвецы быстрее и бьют чаще', flag: 'minion_haste' },
    { id: 'n_spear2', spec: 'bone', tier: 2, ranks: 1, name: 'Град костей', desc: 'Костяное копьё раскалывается на 3 осколка веером', flag: 'ab_spear2' },
    { id: 'n_command', spec: 'bone', tier: 3, ranks: 1, name: 'Повелитель костей', desc: 'Твои мертвецы наносят +40% урона', flag: 'minion_dmg' },
    { id: 'n_army2', spec: 'bone', tier: 3, ranks: 1, name: 'Нескончаемая орда', desc: 'Армия мёртвых поднимает на 2 скелета больше', flag: 'ab_army2' },
    { id: 'n_bonecdr', spec: 'bone', tier: 3, ranks: 1, name: 'Тёмная воля', desc: 'Способности перезаряжаются на 20% быстрее', flag: 'cdr' },
    { id: 'n_bonelord', spec: 'bone', tier: 4, ranks: 1, name: 'Костяной владыка', desc: 'Мертвецы +2 хп и +20% урона. УЛЬТА (F) «Костяной голем»: огромный голем-страж крушит врагов 20 с', flag: 'minion_lord', ult: 'bonelord_ult' },
    // ═══ ПОРЧА: чумной маг ═══
    { id: 'n_blight', spec: 'blight', tier: 1, ranks: 3, name: 'Гниль', desc: '+6% урона магии за ранг', effects: { dmgMagic: 0.06 } },
    { id: 'n_touch', spec: 'blight', tier: 1, ranks: 1, name: 'Прикосновение смерти', desc: 'Атаки посоха насылают порчу (дот 1/с на 3 с)', flag: 'blighttouch' },
    { id: 'n_plague2', spec: 'blight', tier: 2, ranks: 1, name: 'Заразный мор', desc: 'Мор перекидывается на новых врагов, входящих в облако', flag: 'ab_plague2' },
    { id: 'n_curse2', spec: 'blight', tier: 2, ranks: 1, name: 'Тяжкое проклятие', desc: 'Проклятие немощи сильнее (+40% урона) и длится 9 с', flag: 'ab_curse2' },
    { id: 'n_burst2', spec: 'blight', tier: 2, ranks: 1, name: 'Обильный труп', desc: 'Взрыв трупа шире и оставляет облако чумы', flag: 'ab_burst2' },
    { id: 'n_wither', spec: 'blight', tier: 3, ranks: 1, name: 'Увядание', desc: 'Все твои доты (порча, яд, чума) бьют на +1', flag: 'dotpower' },
    { id: 'n_spread', spec: 'blight', tier: 3, ranks: 1, name: 'Эпидемия', desc: 'Смерть отравленного врага заражает соседей', flag: 'plaguespread' },
    { id: 'n_echo', spec: 'blight', tier: 3, ranks: 1, name: 'Эхо смерти', desc: '20% шанс: способность почти без кулдауна', flag: 'echo' },
    { id: 'n_pestlord', spec: 'blight', tier: 4, ranks: 1, name: 'Владыка чумы', desc: '+15% урона магии, доты +1. УЛЬТА (F) «Чумной вихрь»: огромное расползающееся облако мора', effects: { dmgMagic: 0.15 }, flag: 'dotpower', ult: 'plague_ult' },
    // ═══ ДУШИ: вампир смерти ═══
    { id: 'n_soul', spec: 'soul', tier: 1, ranks: 3, name: 'Сбор душ', desc: '+1 к регену маны за ранг', effects: { manaRegen: 1 } },
    { id: 'n_drain2', spec: 'soul', tier: 1, ranks: 1, name: 'Жадный дренаж', desc: 'Высасывание жизни возвращает весь нанесённый урон', flag: 'ab_drain2' },
    { id: 'n_harvest', spec: 'soul', tier: 2, ranks: 1, name: 'Жатва', desc: 'Убийства рядом дают +2 маны и чаще дарят души', flag: 'soulharvest' },
    { id: 'n_leech', spec: 'soul', tier: 2, ranks: 1, name: 'Пиявка душ', desc: 'Попадания посоха лечат тебя на 1 (не чаще раза в 0.6 с)', flag: 'lifesteal' },
    { id: 'n_soularmor', spec: 'soul', tier: 2, ranks: 1, name: 'Панцирь душ', desc: 'Костяной доспех держит 9 урона и жалит больнее', flag: 'ab_bonearmor2' },
    { id: 'n_soulpower', spec: 'soul', tier: 3, ranks: 1, name: 'Сила душ', desc: 'На каждую душу +5% урона магии (пока души при тебе)', flag: 'soulpower' },
    { id: 'n_ward', spec: 'soul', tier: 3, ranks: 1, name: 'Оберег смерти', desc: 'Смертельный удар оставляет 1 ХП (раз в 60 с)', flag: 'laststand' },
    { id: 'n_soulcrit', spec: 'soul', tier: 3, ranks: 2, name: 'Хладный расчёт', desc: '+5% шанса крита за ранг', effects: { critChance: 0.05 } },
    { id: 'n_reaper', spec: 'soul', tier: 4, ranks: 1, name: 'Жнец', desc: '+2 сердца. УЛЬТА (F) «Жатва душ»: вытягивает души всех врагов вокруг — урон, массовое лечение, полные души', effects: { maxHp: 4 }, ult: 'reaper_ult' },
  ],
};

// ═══ УЛЬТЫ: венец каждой ветки талантов (клавиша F) ═══
// Открывается взятием капстоуна ветки; очков хватает лишь на одну — выбор стиля.
export const ULTS = {
  rage_ult: { id: 'rage_ult', name: 'Кровавая жатва', icon: 'ult_rage', cd: 75, mana: 10, desc: '8 с буйства: +40% урона мили, +30% скорости, удары мили лечат по 1' },
  citadel_ult: { id: 'citadel_ult', name: 'Железный бастион', icon: 'ult_citadel', cd: 75, mana: 10, desc: '6 с: −60% урона тебе и союзникам рядом; враги вокруг таунтятся на тебя' },
  warlord_ult: { id: 'warlord_ult', name: 'Знамя войны', icon: 'ult_warlord', cd: 75, mana: 10, desc: '10 с отряду: +25% всего урона и барьер на 2' },
  storm_ult: { id: 'storm_ult', name: 'Испепеление', icon: 'ult_storm', cd: 75, mana: 20, desc: 'Три метеора по области прицела: ×5 урона магии каждый' },
  freeze_ult: { id: 'freeze_ult', name: 'Абсолютный лёд', icon: 'ult_freeze', cd: 75, mana: 18, desc: 'Все враги вокруг: стан 1.5 с, глубокая заморозка и метка ЛЬДА' },
  archon_ult: { id: 'archon_ult', name: 'Арканный шквал', icon: 'ult_archon', cd: 75, mana: 15, desc: '12 сгустков во все стороны ×3 урона магии; возвращает 15 маны' },
  exec_ult: { id: 'exec_ult', name: 'Танец смерти', icon: 'ult_exec', cd: 75, mana: 12, desc: 'Теневые удары по всем врагам вокруг: ×3 урона мили каждому' },
  barrage_ult: { id: 'barrage_ult', name: 'Шквал стали', icon: 'ult_barrage', cd: 75, mana: 12, desc: 'Три волны по 12 клинков во все стороны' },
  gambler_ult: { id: 'gambler_ult', name: 'Дым и золото', icon: 'ult_gambler', cd: 90, mana: 10, desc: 'Невидимость 5 с, сброс кулдаунов Q/X/R, монеты с убийств ×2 на 10 с' },
  rez_ult: { id: 'rez_ult', name: 'Чудо', icon: 'ult_rez', cd: 90, mana: 25, desc: 'Полное исцеление отряда и воскрешение всех павших рядом' },
  wrath_ult: { id: 'wrath_ult', name: 'Гнев Господень', icon: 'ult_wrath', cd: 75, mana: 20, desc: 'Столбы света бьют всех врагов вокруг: ×2.5 урона магии и стан 1 с' },
  martyr_ult: { id: 'martyr_ult', name: 'Небесный оплот', icon: 'ult_martyr', cd: 90, mana: 20, desc: '8 с отряду: барьер на 6 и −40% входящего урона' },
  bonelord_ult: { id: 'bonelord_ult', name: 'Костяной голем', icon: 'ult_bonelord', cd: 90, mana: 18, desc: 'Призывает огромного костяного голема-стража: крушит врагов и держит удар 20 с' },
  plague_ult: { id: 'plague_ult', name: 'Чумной вихрь', icon: 'ult_plague', cd: 80, mana: 20, desc: 'Огромное облако мора у прицела: расползается, травит и слепит всё живое (кроме своих)' },
  reaper_ult: { id: 'reaper_ult', name: 'Жатва душ', icon: 'ult_reaper', cd: 80, mana: 16, desc: 'Вытягивает души всех врагов вокруг: тяжёлый урон, лечит тебя за каждого и наполняет души' },
};

// ульта героя: по взятому капстоуну (взять можно только один — очков впритык)
export function ultOf(cls, learned) {
  for (const id of learned || []) {
    const t = findTalent(cls, id);
    if (t?.ult) return ULTS[t.ult] || null;
  }
  return null;
}

export function findTalent(cls, id) {
  return (TALENTS[cls] || []).find(t => t.id === id);
}

// сколько рангов таланта изучено (learned хранит id по разу за ранг)
export function talentRank(id, learned) {
  return learned.filter(x => x === id).length;
}

// очки, вложенные в конкретную ветку
export function specPoints(cls, spec, learned) {
  return learned.filter(id => findTalent(cls, id)?.spec === spec).length;
}

// Можно ли изучить (следующий ранг): есть очко, ранги не выкачаны, ярус набран
export function canLearn(cls, id, learned, talentPts) {
  if (talentPts <= 0) return false;
  const t = findTalent(cls, id);
  if (!t) return false;
  if (talentRank(id, learned) >= (t.ranks || 1)) return false;
  return specPoints(cls, t.spec, learned) >= TIER_REQ[t.tier];
}

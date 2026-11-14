// All words the outfit advice uses, in every language we support.
// English is the main language; Russian is for users in Kyrgyzstan, Kazakhstan, Russia...
// To add a language: copy the "ru" block, translate it, and add the code to LANGUAGES.

export const LANGUAGES = ["en", "ru"];

// Clothes from the coldest to the hottest level. The level is chosen in weather.js
// by the coldest "feels like" hour; both languages must have the same number of levels.
const OUTFIT_LEVELS = {
  en: [
    {
      top: "thermal base layer, warm sweater and a heavy winter coat",
      bottom: "thermal leggings under warm trousers",
      shoes: "insulated winter boots",
      accessories: ["warm hat", "scarf", "insulated gloves"],
    },
    {
      top: "sweater and a winter coat",
      bottom: "warm trousers",
      shoes: "warm winter boots",
      accessories: ["hat", "scarf", "gloves"],
    },
    {
      top: "sweater and a warm jacket",
      bottom: "jeans or warm trousers",
      shoes: "closed boots or warm sneakers",
      accessories: ["light hat", "gloves"],
    },
    { top: "long sleeves and a jacket", bottom: "jeans or trousers", shoes: "closed shoes or sneakers", accessories: [] },
    { top: "long sleeves with a light jacket or sweater", bottom: "jeans or trousers", shoes: "sneakers", accessories: [] },
    { top: "T-shirt, maybe a light layer for later", bottom: "light trousers or a skirt", shoes: "sneakers", accessories: [] },
    { top: "light breathable T-shirt", bottom: "shorts or a light skirt", shoes: "sandals or light sneakers", accessories: [] },
  ],
  ru: [
    {
      top: "термобельё, тёплый свитер и толстый зимний пуховик",
      bottom: "термолеггинсы под тёплые брюки",
      shoes: "утеплённые зимние ботинки",
      accessories: ["тёплая шапка", "шарф", "тёплые перчатки"],
    },
    {
      top: "свитер и зимняя куртка",
      bottom: "тёплые брюки",
      shoes: "тёплые зимние ботинки",
      accessories: ["шапка", "шарф", "перчатки"],
    },
    {
      top: "свитер и тёплая куртка",
      bottom: "джинсы или тёплые брюки",
      shoes: "закрытые ботинки или тёплые кроссовки",
      accessories: ["лёгкая шапка", "перчатки"],
    },
    { top: "кофта с длинным рукавом и куртка", bottom: "джинсы или брюки", shoes: "закрытая обувь или кроссовки", accessories: [] },
    { top: "длинный рукав и лёгкая куртка или свитер", bottom: "джинсы или брюки", shoes: "кроссовки", accessories: [] },
    { top: "футболка, на вечер можно лёгкую кофту", bottom: "лёгкие брюки или юбка", shoes: "кроссовки", accessories: [] },
    { top: "лёгкая дышащая футболка", bottom: "шорты или лёгкая юбка", shoes: "сандалии или лёгкие кроссовки", accessories: [] },
  ],
};

// Extra things to take and the warning notes. Notes are functions because they contain numbers and times.
const EXTRAS = {
  en: {
    umbrella: "umbrella",
    hotDayItems: ["sunglasses", "cap or sun hat", "water bottle"],
    snow: (time) => `Snow expected${time ? ` from about ${time}` : ""}: wear boots with a good grip.`,
    rain: (time) => `Rain likely${time ? ` from about ${time}` : ""}: take an umbrella.`,
    heavyRain: "A lot of rain: waterproof shoes and a jacket with a hood are better.",
    storm: "Thunderstorm possible: plan to be indoors when it comes.",
    wind: (gusts) => `Strong wind (gusts up to ${gusts} m/s): a windproof outer layer helps.`,
    swing: (min, max) => `It feels ${min}° at the coldest and ${max}° at the warmest: dress in layers you can take off.`,
    hot: "Hot day: drink water and stay in the shade at midday.",
  },
  ru: {
    umbrella: "зонт",
    hotDayItems: ["солнцезащитные очки", "кепка или панама", "бутылка воды"],
    snow: (time) => `Ожидается снег${time ? ` примерно с ${time}` : ""}: обувь с хорошей подошвой, чтобы не скользить.`,
    rain: (time) => `Вероятен дождь${time ? ` примерно с ${time}` : ""}: возьми зонт.`,
    heavyRain: "Много дождя: лучше непромокаемая обувь и куртка с капюшоном.",
    storm: "Возможна гроза: постарайся в это время быть в помещении.",
    wind: (gusts) => `Сильный ветер (порывы до ${gusts} м/с): поможет верхняя одежда, которая не продувается.`,
    swing: (min, max) => `Ощущается от ${min}° до ${max}°: одевайся слоями, которые можно снять.`,
    hot: "Жаркий день: пей воду и днём держись в тени.",
  },
};

export function outfitLevels(lang) {
  return OUTFIT_LEVELS[lang] ?? OUTFIT_LEVELS.en;
}

export function extras(lang) {
  return EXTRAS[lang] ?? EXTRAS.en;
}

const russianPluralRules = new Intl.PluralRules("ru-RU");

/** Forms are supplied in the required case: «оценка/оценки/оценок» or «оценке/оценкам/оценкам». */
export const formatCount = (count: number, forms: readonly [one: string, few: string, many: string]) => {
  const category = russianPluralRules.select(count);
  const form = category === "one" ? forms[0] : category === "few" ? forms[1] : forms[2];
  return `${count} ${form}`;
};

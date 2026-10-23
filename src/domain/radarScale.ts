export const getVisibleRadarMaximum = (
  series: ReadonlyArray<{ values: readonly number[] }>,
  enabled: ReadonlyMap<number, boolean>,
) => {
  let maximum = 0;
  series.forEach(({ values }, index) => {
    if (enabled.get(index) === false) return;
    values.forEach((value) => {
      if (Number.isFinite(value) && value > maximum) maximum = value;
    });
  });
  return Math.max(maximum, 1);
};

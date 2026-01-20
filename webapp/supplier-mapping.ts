export const suppliersProvidingApis = [
  'RADIOS',
  'RADIOSP',
  'CLE',
  'FARNEL',
  'TMEELEK',
  'TME_AE',
  'TME',
] as const;

type SuppliersToCheck = (typeof suppliersProvidingApis)[number];

export const ApiName: [SuppliersToCheck, string][] = [
  ['RADIOS', 'RS'],
  ['RADIOSP', 'RS'],
  ['CLE', 'Sonepar'],
  ['FARNEL', 'Farnell'],
  ['TMEELEK', 'TME'],
  ['TME_AE', 'TME'],
  ['TME', 'TME'],
] as const;

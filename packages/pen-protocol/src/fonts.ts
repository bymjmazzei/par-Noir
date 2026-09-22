/** Curated fonts shared by full Pen editor and Pen Mini. */
export const PEN_FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Georgia',
  'Times New Roman',
  'Courier New',
  'Verdana',
  'Impact',
  'Comic Sans MS',
  'Trebuchet MS',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Source Serif 4'
] as const;

export type PenFontFamily = (typeof PEN_FONT_FAMILIES)[number];

export const PEN_FONT_SIZES_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72] as const;

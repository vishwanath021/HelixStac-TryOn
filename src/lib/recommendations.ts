export type Recommendable = {
  id: string;
  name: string;
  gender: string;
  faceShapes: string[];
  hairTypes: string[];
  description: string;
};

export function recommendStyles<T extends Recommendable>(styles: T[], face: string, hair: string, limit = 4) {
  return styles
    .map((style) => {
      let score = 0;
      if (style.faceShapes.includes(face)) score += 2;
      if (style.hairTypes.includes(hair)) score += 1;
      return { style, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.style.name.localeCompare(b.style.name))
    .slice(0, limit)
    .map((row) => row.style);
}

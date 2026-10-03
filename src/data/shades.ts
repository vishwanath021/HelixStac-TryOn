export type ShadeDef = {
  id: string;
  name: string;
  hex: string;
  /** Screen-pass strength used to suggest lightening. 0.06 jet black → 0.46 honey blonde. */
  lift: number;
  serviceKeys: string[];
};

export const SHADES: ShadeDef[] = [
  { id: "burgundy", name: "Burgundy", hex: "#6B1D3A", lift: 0.12, serviceKeys: ["colour"] },
  { id: "wine", name: "Wine", hex: "#722F37", lift: 0.14, serviceKeys: ["colour"] },
  { id: "copper", name: "Copper", hex: "#B87333", lift: 0.32, serviceKeys: ["colour", "highlights"] },
  { id: "chocolate-brown", name: "Chocolate Brown", hex: "#5C3317", lift: 0.16, serviceKeys: ["colour"] },
  { id: "ash-brown", name: "Ash Brown", hex: "#6B5344", lift: 0.22, serviceKeys: ["colour"] },
  { id: "caramel", name: "Caramel", hex: "#C68E4E", lift: 0.36, serviceKeys: ["colour", "balayage"] },
  { id: "mahogany", name: "Mahogany", hex: "#7B3F2A", lift: 0.18, serviceKeys: ["colour"] },
  { id: "blue-black", name: "Blue-Black", hex: "#0B0C10", lift: 0.08, serviceKeys: ["colour"] },
  { id: "jet-black", name: "Jet Black", hex: "#111111", lift: 0.06, serviceKeys: ["colour"] },
  { id: "espresso", name: "Espresso", hex: "#3B2414", lift: 0.1, serviceKeys: ["colour"] },
  { id: "chestnut", name: "Chestnut", hex: "#8B5A2B", lift: 0.24, serviceKeys: ["colour"] },
  { id: "auburn", name: "Auburn", hex: "#8D3B2A", lift: 0.26, serviceKeys: ["colour"] },
  { id: "honey-blonde", name: "Honey Blonde", hex: "#E2B657", lift: 0.46, serviceKeys: ["colour", "balayage"] },
  { id: "rose-gold", name: "Rose Gold", hex: "#C98B8B", lift: 0.4, serviceKeys: ["colour", "highlights"] },
  { id: "plum", name: "Plum", hex: "#5C2A4A", lift: 0.16, serviceKeys: ["colour"] },
  { id: "cherry-red", name: "Cherry Red", hex: "#A4161A", lift: 0.28, serviceKeys: ["colour"] },
];

export function shadeById(id: string | null | undefined) {
  return SHADES.find((shade) => shade.id === id) ?? null;
}

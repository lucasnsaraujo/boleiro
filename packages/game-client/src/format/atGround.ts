/** A ground as Portuguese says one plays at it: "no Maracanã", "no MetLife Stadium", "na Allianz Arena". */
export function atGround(name: string): string {
  return `${/\barena\b/i.test(name) ? "na" : "no"} ${name}`;
}

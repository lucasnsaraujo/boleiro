import { logoOf } from "./brandLogos.js";

type Props = { brandId: string; name: string; height: number; maxWidth?: number; className?: string };

/**
 * A sponsor's real logo, sized by height and kept inside `maxWidth`; a brand without one in the data
 * shows its name set in the kit's lettering.
 */
export function BrandLogo({ brandId, name, height, maxWidth, className }: Props) {
  const logo = logoOf(brandId, height);
  if (!logo) {
    return (
      <span className={`logo-name ${className ?? ""}`} style={{ fontSize: Math.max(9, Math.round(height * 0.62)), maxWidth }} title={name}>
        {name}
      </span>
    );
  }
  const scale = maxWidth && logo.width > maxWidth ? maxWidth / logo.width : 1;
  return <img className={`logo ${className ?? ""}`} src={logo.url} alt={name} title={name} width={Math.round(logo.width * scale)} height={Math.round(height * scale)} draggable={false} />;
}

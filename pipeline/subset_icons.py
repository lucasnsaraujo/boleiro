"""Subsets Phosphor 2.1.1's bold and fill icon fonts to the icons Boleiro uses, in packages/design-tokens/icons.

Takes the unpacked @phosphor-icons/web 2.1.1 package (`npm pack @phosphor-icons/web@2.1.1`, then untar) and the
names of the icons to add; every icon the subset already has stays. apps/desktop/ui/styles/phosphorSubset.test.ts
names the icons the screens use that the subset lacks.

    .venv/bin/python pipeline/subset_icons.py /tmp/phosphor/package house shield
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from fontTools import subset

ICONS = Path(__file__).resolve().parent.parent / "packages/design-tokens/icons"
HEADER = """/* Phosphor Icons 2.1.1 (MIT), bold and fill, subset to the icons Boleiro uses. */
@font-face { font-family: 'Phosphor-Bold'; src: url('phosphor-bold.woff2') format('woff2'); font-weight: normal; font-style: normal; font-display: block; }
.ph-bold { font-family: 'Phosphor-Bold' !important; speak: never; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; letter-spacing: 0; -webkit-font-smoothing: antialiased; }
@font-face { font-family: 'Phosphor-Fill'; src: url('phosphor-fill.woff2') format('woff2'); font-weight: normal; font-style: normal; font-display: block; }
.ph-fill { font-family: 'Phosphor-Fill' !important; speak: never; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; letter-spacing: 0; -webkit-font-smoothing: antialiased; }
"""


def codepoints(style: str, weight: str) -> dict[str, int]:
    """Each icon's codepoint in one weight's stylesheet of the full package."""
    return {name: int(hex_, 16) for name, hex_ in re.findall(rf'\.ph-{weight}\.ph-([a-z0-9-]+):before \{{\s*content: "\\([0-9a-f]+)";', style)}


def main(package: Path, added: list[str]) -> None:
    bold = codepoints((package / "src/bold/style.css").read_text(), "bold")
    fill = codepoints((package / "src/fill/style.css").read_text(), "fill")
    kept = re.findall(r"^\.ph-([a-z0-9-]+):before", (ICONS / "phosphor.css").read_text(), re.M)
    names = sorted(set(kept) | set(added))
    unknown = [name for name in names if name not in bold or fill.get(name) != bold[name]]
    if unknown:
        sys.exit(f"not in Phosphor 2.1.1's bold and fill alike: {', '.join(unknown)}")
    for weight in ("Bold", "Fill"):
        options = subset.Options()
        options.flavor = "woff2"
        font = subset.load_font(str(package / f"src/{weight.lower()}/Phosphor-{weight}.woff2"), options)
        subsetter = subset.Subsetter(options)
        subsetter.populate(unicodes=[bold[name] for name in names])
        subsetter.subset(font)
        subset.save_font(font, str(ICONS / f"phosphor-{weight.lower()}.woff2"), options)
    rules = "".join(f'.ph-{name}:before {{ content: "\\{bold[name]:x}"; }}\n' for name in names)
    (ICONS / "phosphor.css").write_text(HEADER + rules)
    print(f"{len(names)} icons, {len(set(names) - set(kept))} new")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]), sys.argv[2:])

"""Loopstack Hermes plugin — registers consolidated public workflows."""

from __future__ import annotations

import re
from pathlib import Path

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---", re.DOTALL)

PUBLIC_SKILLS = (
    "using-loopstack",
    "loop-discover",
    "loop-design",
    "loop-plan",
    "loop-build",
    "loop-launch",
    "loop-operate",
)

LEGACY_SKILL_ALIASES = {
    "loop-idea": "loop-discover",
    "loop-qualify": "loop-discover",
    "loop-storage-design": "loop-design",
    "loop-connection-check": "loop-design",
    "loop-eric-review": "loop-design",
    "loop-storage-setup": "loop-build",
    "loop-implement": "loop-build",
    "loop-qa": "loop-build",
    "loop-deploy": "loop-launch",
    "loop-list": "loop-operate",
    "loop-show": "loop-operate",
    "loop-monitor": "loop-operate",
    "loop-debug": "loop-operate",
    "loop-modify": "loop-operate",
    "loop-improve": "loop-operate",
}


def resolve_skill_name(name: str) -> str:
    """Resolve a persisted v1 worker name to its public v2 workflow."""
    return LEGACY_SKILL_ALIASES.get(name, name)


def _description_from_skill_md(path: Path) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return ""
    match = _FRONTMATTER_RE.match(text)
    if not match:
        return ""
    for line in match.group(1).splitlines():
        if line.startswith("description:"):
            return line.split(":", 1)[1].strip().strip("\"'")
    return ""


def register(ctx) -> None:
    """Register only Loopstack's public workflow surface."""
    skills_root = Path(__file__).resolve().parent / "skills"
    for name in PUBLIC_SKILLS:
        skill_md = skills_root / name / "SKILL.md"
        if not skill_md.is_file():
            raise FileNotFoundError(f"Missing public Loopstack skill: {skill_md}")
        ctx.register_skill(name, skill_md, _description_from_skill_md(skill_md))
    register_alias = getattr(ctx, "register_skill_alias", None)
    if callable(register_alias):
        for legacy_name, public_name in LEGACY_SKILL_ALIASES.items():
            register_alias(legacy_name, public_name)

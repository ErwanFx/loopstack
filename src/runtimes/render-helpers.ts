export function generatedLoopSkillName(loopId: string): string {
  return loopId.length <= 59 ? `${loopId}-loop` : loopId;
}

export function safeDisplayName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

export function renderGeneratedLoopSkill(loopId: string, loopName: string, skills: readonly string[]): string {
  const wrapperName = generatedLoopSkillName(loopId);
  const displayName = safeDisplayName(loopName);
  return `---
name: ${wrapperName}
description: Use when executing a generated business loop through its Loopstack runtime package.
---

# ${displayName} Loop

Run the Loopstack prompt-cycle controller with the declared approvals, checkpoints, tools, and skills: ${skills.join(", ")}.
`;
}

// ✨ 탭이 새 자리에 놓였을 때 어느 그룹에 속할지 정하는 공용 규칙 (드래그·단축키 이동이 함께 씀)

// 💡 새 자리 양옆의 보이는 요소 하나 (탭 또는 그룹 라벨)
export interface GroupSlot {
    groupId: string | null;
    isLabel: boolean;
}

// - 펼쳐진 그룹의 라벨 바로 뒤, 또는 같은 그룹 탭 두 개 사이 → 그 그룹에 편입
// - 자기 그룹의 맨 끝(앞은 같은 그룹 탭, 뒤는 다른 것) → 그대로 유지
// - 그 밖의 자리 → 그룹에서 빠짐 (접힌 그룹에는 편입하지 않음)
export function resolveGroupAt(
    prev: GroupSlot | null,
    next: GroupSlot | null,
    current: string | null,
    isExpanded: (groupId: string) => boolean,
): string | null {
    const prevGroup = prev?.groupId ?? null;
    const nextGroup = next && !next.isLabel ? next.groupId : null;

    if (prev?.isLabel) return prevGroup && isExpanded(prevGroup) ? prevGroup : null;
    if (prevGroup && prevGroup === nextGroup && isExpanded(prevGroup)) return prevGroup;
    if (prevGroup && prevGroup === current) return current;
    return null;
}
